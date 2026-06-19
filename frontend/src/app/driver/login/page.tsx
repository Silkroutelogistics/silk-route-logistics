"use client";

// v3.8.amz — SRL Driver Academy Sprint T2: driver login (phone + PIN).
// Mobile-first centered card (drivers are on phones). Brand classes mirror
// the carrier login page; cookie auth via the shared api client.

import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";
import { useDriverAuth } from "@/hooks/useDriverAuth";

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function DriverLoginPage() {
  const { login, isLoading, error, setError } = useDriverAuth();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");

  const canSubmit = phone.replace(/\D/g, "").length >= 10 && /^\d{6}$/.test(pin);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const ok = await login(phone, pin);
    if (ok) {
      // Hard nav so the freshly-set cookie is sent on the dashboard load.
      window.location.href = "/driver/dashboard";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#FBF7F0" }}>
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0A2540] mb-4">
            <GraduationCap size={28} className="text-[#C5A572]" />
          </div>
          <h1 className="font-serif text-2xl text-[#0A2540]">SRL Driver Academy</h1>
          <p className="text-sm text-[#6B7685] mt-1">Sign in with your phone number and PIN</p>
        </div>

        <form onSubmit={submit} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">Mobile Phone</label>
            <input
              inputMode="tel"
              autoComplete="off"
              name="driver-academy-phone"
              value={phone}
              onChange={(e) => { setPhone(formatPhone(e.target.value)); if (error) setError(null); }}
              placeholder="(269) 555-0123"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-[#BA7517] focus:shadow-[0_0_0_3px_rgba(197,165,114,0.4)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5">6-Digit PIN</label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              name="driver-academy-pin"
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); if (error) setError(null); }}
              placeholder="••••••"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-900 tracking-[0.4em] outline-none transition-all placeholder:text-gray-400 placeholder:tracking-normal focus:border-[#BA7517] focus:shadow-[0_0_0_3px_rgba(197,165,114,0.4)]"
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded">{error}</div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || isLoading}
            className="w-full py-3.5 text-[15px] font-semibold rounded-xl border-none cursor-pointer transition-all duration-200 bg-[#BA7517] text-[#FBF7F0] shadow-[0_4px_12px_rgba(186,117,23,0.28)] hover:-translate-y-0.5 hover:bg-[#a3650f] hover:shadow-[0_6px_20px_rgba(186,117,23,0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 size={16} className="animate-spin" />}
            Sign In
          </button>

          <p className="text-center text-xs text-gray-400">
            First time here? Use the setup link your carrier sent you by text.
          </p>
        </form>
      </div>
    </div>
  );
}
