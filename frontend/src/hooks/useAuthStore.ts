import { create } from "zustand";
import { api } from "@/lib/api";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  tempToken: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<{ pendingOtp: true; email: string } | false>;
  verifyOtp: (email: string, code: string) => Promise<{ success: true; passwordExpired?: boolean } | false>;
  resendOtp: (email: string) => Promise<boolean>;
  forceChangePassword: (newPassword: string) => Promise<boolean>;
  registerUser: (data: Record<string, unknown>) => Promise<void>;
  logout: () => void;
  clearAuth: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: typeof window !== "undefined" ? localStorage.getItem("token") : null,
  tempToken: null,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post("/auth/login", { email, password });
      if (data.pendingOtp) {
        set({ isLoading: false });
        return { pendingOtp: true as const, email: data.email };
      }
      // Fallback (shouldn't happen with OTP flow)
      localStorage.setItem("token", data.token);
      set({ user: data.user, token: data.token, isLoading: false });
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

  verifyOtp: async (email, code) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post("/auth/verify-otp", { email, code });

      if (data.passwordExpired) {
        set({ tempToken: data.tempToken, isLoading: false });
        return { success: true as const, passwordExpired: true };
      }

      localStorage.setItem("token", data.token);
      set({ user: data.user, token: data.token, isLoading: false });
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

      localStorage.setItem("token", data.token);
      set({ user: data.user, token: data.token, tempToken: null, isLoading: false });
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
      localStorage.setItem("token", data.token);
      set({ user: data.user, token: data.token, isLoading: false });
      window.location.href = data.user?.role === "SHIPPER" ? "/shipper/dashboard" : "/dashboard/overview";
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Registration failed";
      set({ error: message, isLoading: false });
    }
  },

  logout: () => {
    const currentUser = get().user;
    localStorage.removeItem("token");
    localStorage.removeItem("carrier_token");
    set({ user: null, token: null, tempToken: null });
    const dest = currentUser?.role === "SHIPPER" ? "/shipper/login" : currentUser?.role === "CARRIER" ? "/carrier/login" : "/auth/login";
    window.location.href = dest;
  },

  clearAuth: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("carrier_token");
    localStorage.removeItem("user");
    set({ user: null, token: null, tempToken: null });
  },

  loadUser: async () => {
    try {
      const { data } = await api.get("/auth/profile");
      set({ user: data });
    } catch {
      localStorage.removeItem("token");
      set({ user: null, token: null });
    }
  },
}));
