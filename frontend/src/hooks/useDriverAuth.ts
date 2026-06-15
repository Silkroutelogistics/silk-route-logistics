import { create } from "zustand";
import { api } from "@/lib/api";

// v3.8.amz — SRL Driver Academy Sprint T2 driver-session store.
// Phone + PIN auth. The JWT lives in the httpOnly srl_token_driver cookie
// (set by the backend); never in JS. Mirrors useCarrierAuth's shape but
// simpler — no OTP / no password-change flow.

export interface DriverUser {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  status?: string;
}

interface DriverAuthState {
  driver: DriverUser | null;
  carrierName: string | null;
  isLoading: boolean;
  error: string | null;
  login: (phone: string, pin: string) => Promise<boolean>;
  loadDriver: () => Promise<void>;
  logout: () => Promise<void>;
  setError: (e: string | null) => void;
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return e?.response?.data?.error || e?.response?.data?.message || e?.message || fallback;
}

export const useDriverAuth = create<DriverAuthState>((set) => ({
  driver: null,
  carrierName: null,
  isLoading: false,
  error: null,

  login: async (phone, pin) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post("/driver-auth/login", { phone, pin });
      set({ driver: res.data.driver, isLoading: false });
      return true;
    } catch (err) {
      set({ error: extractError(err, "Login failed. Check your phone number and PIN."), isLoading: false });
      return false;
    }
  },

  loadDriver: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get("/driver-auth/me");
      set({ driver: res.data.driver, carrierName: res.data.carrierName ?? null, isLoading: false });
    } catch {
      set({ driver: null, carrierName: null, isLoading: false });
    }
  },

  logout: async () => {
    try {
      await api.post("/driver-auth/logout");
    } catch {
      // best-effort; cookie clears server-side, state clears regardless
    }
    set({ driver: null, carrierName: null });
  },

  setError: (e) => set({ error: e }),
}));
