import { create } from "zustand";
import { api } from "@/lib/api";

interface CarrierProfile {
  id: string;
  mcNumber: string | null;
  dotNumber: string | null;
  companyName: string | null;
  tier: string;
  onboardingStatus: string;
  equipmentTypes: string[];
  operatingRegions: string[];
}

interface CarrierUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  company: string | null;
  phone: string | null;
  totpEnabled?: boolean;
  carrierProfile: CarrierProfile | null;
}

interface CarrierAuthState {
  user: CarrierUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  mustChangePassword: boolean;
  pendingOtp: boolean;
  pendingEmail: string | null;
  // Arc 11 — the authenticator step between OTP and a session. The backend has
  // returned pendingTotp from verify-otp for a long time; nothing here read it,
  // which is the bug this fixes.
  pendingTotp: boolean;
  // Short-lived (5m) and purpose-scoped to totp-verification. Held in memory
  // only — it is not a session and must not outlive the tab.
  totpToken: string | null;
  login: (email: string, password: string) => Promise<"otp" | "success" | "password" | false>;
  verifyOtp: (email: string, code: string) => Promise<"totp" | "success" | "password" | false>;
  verifyTotp: (code: string) => Promise<"success" | "password" | false>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  forceChangePassword: (newPassword: string) => Promise<boolean>;
  loadUser: () => Promise<void>;
  logout: () => void;
}

export const useCarrierAuth = create<CarrierAuthState>((set) => ({
  user: null,
  token: null, // JWT is now in httpOnly cookie — not accessible to JS
  isLoading: false,
  error: null,
  mustChangePassword: false,
  pendingOtp: false,
  pendingEmail: null,
  pendingTotp: false,
  totpToken: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null, pendingOtp: false, pendingEmail: null, pendingTotp: false, totpToken: null });
    try {
      const { data } = await api.post("/carrier-auth/login", { email, password });

      // Backend returns pendingOtp → need OTP verification step
      if (data.pendingOtp) {
        set({ isLoading: false, pendingOtp: true, pendingEmail: email });
        return "otp";
      }

      // Cookie set by backend — password change required
      if (data.mustChangePassword) {
        set({ mustChangePassword: true, isLoading: false });
        return "password";
      }

      set({ user: data.user ? { ...data.user, carrierProfile: data.carrier || null } : null, isLoading: false, pendingOtp: false });
      return "success";
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; code?: string };
      let message = axiosErr?.response?.data?.error || "Login failed";
      if (axiosErr?.code === "ECONNABORTED") message = "Server is starting up — please try again.";
      if (axiosErr?.code === "ERR_NETWORK") message = "Cannot reach server.";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  verifyOtp: async (email, code) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post("/carrier-auth/verify-otp", { email, code });

      // THE BRANCH THAT WAS MISSING. When 2FA is armed the backend answers
      // { pendingTotp, totpToken } and deliberately does NOT set the session
      // cookie — the authenticator has not been presented yet. Without this
      // check the code below read data.user (undefined), stored null, and
      // returned "success": the page routed to the dashboard, the layout found
      // no cookie, and bounced straight back to login. An enrolled carrier was
      // in a loop with nothing to read but a redirect.
      if (data.pendingTotp) {
        set({
          isLoading: false,
          pendingOtp: false,
          pendingTotp: true,
          totpToken: data.totpToken,
        });
        return "totp";
      }

      if (data.mustChangePassword) {
        set({ mustChangePassword: true, isLoading: false, pendingOtp: false });
        return "password";
      }

      set({
        user: data.user ? { ...data.user, carrierProfile: data.carrier || null } : null,
        isLoading: false,
        pendingOtp: false,
        pendingEmail: null,
      });
      return "success";
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; code?: string };
      const message = axiosErr?.response?.data?.error || "OTP verification failed";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  verifyTotp: async (code) => {
    const { totpToken } = useCarrierAuth.getState();
    if (!totpToken) {
      // The 5-minute token expired or the tab was reloaded. Say so rather than
      // posting a null token and surfacing a generic 401.
      set({
        error: "That took too long. Sign in again to get a fresh code prompt.",
        pendingTotp: false,
        totpToken: null,
      });
      return false;
    }
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post("/carrier-auth/totp-verify", { totpToken, code });

      if (data.mustChangePassword) {
        set({ mustChangePassword: true, isLoading: false, pendingTotp: false, totpToken: null });
        return "password";
      }

      set({
        user: data.user ? { ...data.user, carrierProfile: data.carrier || null } : null,
        isLoading: false,
        pendingOtp: false,
        pendingEmail: null,
        pendingTotp: false,
        // Spent. Holding it after a session exists is a second credential
        // sitting in memory for no reason.
        totpToken: null,
      });
      return "success";
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
      const message =
        axiosErr?.response?.data?.error || "We could not verify that code. Try the current one.";
      // A 401 here means the temp token itself was rejected, not the digits —
      // sending them back to the code box would loop them. Drop to sign-in.
      const tokenDead = axiosErr?.response?.status === 401 && !totpToken;
      set({
        error: message,
        isLoading: false,
        ...(tokenDead ? { pendingTotp: false, totpToken: null } : {}),
      });
      return false;
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    set({ isLoading: true, error: null });
    try {
      await api.post("/carrier-auth/change-password", { currentPassword, newPassword });
      // New cookie set by backend
      set({ isLoading: false });
      return true;
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Password change failed";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  forceChangePassword: async (newPassword) => {
    set({ isLoading: true, error: null });
    try {
      await api.post("/carrier-auth/force-change-password", { newPassword });
      // New cookie set by backend
      set({ mustChangePassword: false, isLoading: false });
      return true;
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Password change failed";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  loadUser: async () => {
    try {
      // Cookie sent automatically with withCredentials
      const { data } = await api.get("/carrier-auth/me");
      set({ user: data });
    } catch {
      set({ user: null, token: null });
    }
  },

  logout: () => {
    api.post("/carrier-auth/logout").catch(() => {});
    // Arc 11 — clear the half-finished login states too. A stale totpToken
    // surviving a logout is a live credential in memory for a session that no
    // longer exists.
    set({ user: null, token: null, mustChangePassword: false, pendingOtp: false, pendingEmail: null, pendingTotp: false, totpToken: null });
    window.location.href = "/carrier/login";
  },
}));
