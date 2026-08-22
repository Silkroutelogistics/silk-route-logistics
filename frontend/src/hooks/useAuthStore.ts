import { create } from "zustand";
import { api } from "@/lib/api";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  totpEnabled?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  tempToken: string | null;
  isLoading: boolean;
  error: string | null;
  // Sprint 174 (v3.8.acf) — optional expectedRole tags the call with the
  // initiating portal ("AE" or "SHIPPER"). Backend role gate rejects
  // mismatched roles. Caller pages pass the appropriate value
  // (/auth/login → "AE", /shipper/login → "SHIPPER"). Carrier portal is
  // unaffected — it uses /api/carrier-auth/* via useCarrierAuth.
  login: (email: string, password: string, expectedRole?: "AE" | "SHIPPER") => Promise<{ pendingOtp: true; email: string } | false>;
  verifyOtp: (email: string, code: string, expectedRole?: "AE" | "SHIPPER") => Promise<{ success: true; passwordExpired?: boolean } | false>;
  resendOtp: (email: string) => Promise<boolean>;
  forceChangePassword: (newPassword: string) => Promise<boolean>;
  registerUser: (data: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  clearAuth: () => void;
  loadUser: () => Promise<void>;
  // Legacy getter for code that reads .token — returns null (cookie-based now)
  token: string | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  token: null, // JWT is now in httpOnly cookie — not accessible to JS
  tempToken: null,
  isLoading: false,
  error: null,

  login: async (email, password, expectedRole) => {
    set({ isLoading: true, error: null });
    try {
      const body: Record<string, unknown> = { email, password };
      if (expectedRole) body.expectedRole = expectedRole;
      const { data } = await api.post("/auth/login", body);
      if (data.pendingOtp) {
        set({ isLoading: false });
        return { pendingOtp: true as const, email: data.email };
      }
      // Fallback (cookie set by backend automatically)
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      return false;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; code?: string };
      let message = axiosErr?.response?.data?.error || "Login failed";
      if (axiosErr?.code === "ECONNABORTED") message = "Server is starting up — please try again in a few seconds.";
      if (axiosErr?.code === "ERR_NETWORK") message = "Cannot reach server. Please check your connection or try again shortly.";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  verifyOtp: async (email, code, expectedRole) => {
    set({ isLoading: true, error: null });
    try {
      const body: Record<string, unknown> = { email, code };
      if (expectedRole) body.expectedRole = expectedRole;
      const { data } = await api.post("/auth/verify-otp", body);

      if (data.passwordExpired) {
        set({ tempToken: data.tempToken, isLoading: false });
        return { success: true as const, passwordExpired: true };
      }

      // Cookie set by backend — just update local state
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      return { success: true as const };
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Verification failed";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  resendOtp: async (email) => {
    set({ error: null });
    try {
      await api.post("/auth/resend-otp", { email });
      return true;
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to resend code";
      set({ error: message });
      return false;
    }
  },

  forceChangePassword: async (newPassword) => {
    set({ isLoading: true, error: null });
    try {
      const tempToken = get().tempToken;
      const { data } = await api.post("/auth/force-change-password", { newPassword }, {
        headers: { Authorization: `Bearer ${tempToken}` },
      });

      // New cookie set by backend
      set({ user: data.user, isAuthenticated: true, tempToken: null, isLoading: false });
      return true;
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Password change failed";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  registerUser: async (formData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post("/auth/register", formData);
      // Cookie set by backend
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      window.location.href = data.user?.role === "SHIPPER" ? "/shipper/dashboard" : "/dashboard/overview";
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Registration failed";
      set({ error: message, isLoading: false });
    }
  },

  // v3.8.auj — AWAIT the revocation call before navigating.
  //
  // This previously fired api.post unawaited and then set window.location.href
  // on the very next line. The navigation tore the page down and aborted the
  // in-flight XHR, so the server usually never saw it — token_blacklist had
  // ZERO rows in production across the platform's entire life, and no LOGOUT
  // audit rows existed for sessions that had provably logged out. The token
  // stayed valid until its natural 24h expiry. The `.catch(() => {})` then hid
  // the whole thing.
  //
  // Bounded with Promise.race so a hung or slow backend cannot trap someone on
  // a page they are trying to leave: after 1.5s we navigate anyway and say so.
  // Local state is cleared regardless, so the client always logs out even when
  // the server side could not be reached.
  logout: async () => {
    const currentUser = get().user;
    const dest = currentUser?.role === "SHIPPER" ? "/shipper/login" : currentUser?.role === "CARRIER" ? "/carrier/login" : "/auth/login";

    try {
      await Promise.race([
        api.post("/auth/logout"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("logout revocation timed out after 1500ms")), 1500)),
      ]);
    } catch (err) {
      // Surfaced, not swallowed. If this fires the session is still live
      // server-side until it expires, which is exactly the thing worth knowing.
      console.error("[SRL] Logout: server-side session revocation failed — the token may remain valid until expiry.", err);
    }

    set({ user: null, isAuthenticated: false, tempToken: null });
    window.location.href = dest;
  },

  clearAuth: () => {
    set({ user: null, isAuthenticated: false, tempToken: null });
  },

  loadUser: async () => {
    try {
      const { data } = await api.get("/auth/profile");
      set({ user: data, isAuthenticated: true });
    } catch {
      set({ user: null, isAuthenticated: false });
    }
  },
}));
