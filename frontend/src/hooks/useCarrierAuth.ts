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
  carrierProfile: CarrierProfile | null;
}

interface CarrierAuthState {
  user: CarrierUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<boolean>;
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

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post("/carrier-auth/login", { email, password });

      // Backend now returns pendingOtp (OTP required)
      if (data.pendingOtp) {
        set({ isLoading: false });
        return true;
      }

      // Cookie set by backend
      if (data.mustChangePassword) {
        set({ mustChangePassword: true, isLoading: false });
        return true;
      }

      set({ user: data.user ? { ...data.user, carrierProfile: data.carrier || null } : null, isLoading: false });
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; code?: string };
      let message = axiosErr?.response?.data?.error || "Login failed";
      if (axiosErr?.code === "ECONNABORTED") message = "Server is starting up — please try again.";
      if (axiosErr?.code === "ERR_NETWORK") message = "Cannot reach server.";
      set({ error: message, isLoading: false });
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
    set({ user: null, token: null, mustChangePassword: false });
    window.location.href = "/carrier/login";
  },
}));
