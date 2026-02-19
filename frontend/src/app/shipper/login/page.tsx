"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";
import { useAuthStore } from "@/hooks/useAuthStore";

export default function ShipperLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoading, error } = useAuthStore();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await login(email, password);
    if (result && result.pendingOtp) {
      sessionStorage.setItem("otpEmail", result.email);
      router.push("/auth/verify-otp");
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[#0D1B2A] to-[#0F1E30]">
      {/* Left branding */}
      <div className="flex-[0_0_45%] flex flex-col justify-center px-[60px] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,rgba(201,168,76,0.06)_0%,transparent_60%)] pointer-events-none" />
        <div className="relative z-10">
          <Link href="/shipper" className="flex items-center gap-3.5 mb-[60px]">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#C9A84C] to-[#A88535] flex items-center justify-center text-lg font-extrabold text-[#0D1B2A] shadow-[0_2px_12px_rgba(201,168,76,0.3)]">
              SR
            </div>
            <div>
              <div className="font-serif text-[19px] font-bold text-white tracking-[1.5px] leading-none">SILK ROUTE</div>
              <div className="text-[9px] text-[#C9A84C] tracking-[3.5px] uppercase font-medium">LOGISTICS INC.</div>
            </div>
          </Link>
          <h1 className="font-serif text-[32px] text-white mb-2.5">Shipper Portal</h1>
          <p className="text-sm text-gray-400 leading-relaxed">
            Track shipments, manage freight quotes, and control your transportation spend — all in one logistics dashboard.
          </p>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center bg-white rounded-l-lg">
        <div className="w-[380px]">
          <h2 className="font-serif text-2xl text-[#0D1B2A] mb-1.5">Welcome back</h2>
          <p className="text-[13px] text-gray-500 mb-8">Sign in to your shipper account</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email or Username</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full py-2.5 pl-10 pr-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] transition-colors"
                  required
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full py-2.5 px-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] transition-colors"
                required
              />
            </div>

            <div className="flex justify-between items-center mb-6">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" className="accent-[#C9A84C]" /> Remember me
              </label>
              <span className="text-xs text-[#C9A84C] cursor-pointer font-medium">Forgot password?</span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-[13px] font-semibold uppercase tracking-[2px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)] hover:shadow-[0_6px_30px_rgba(201,168,76,0.45)] hover:-translate-y-0.5 transition-all disabled:opacity-60"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="text-center mt-6 text-[13px] text-gray-500">
            Don&apos;t have an account?{" "}
            <Link href="/shipper/register" className="text-[#C9A84C] font-semibold hover:underline">Sign Up</Link>
          </div>

          <div className="text-center mt-3">
            <Link href="/auth/login" className="text-xs text-gray-400 hover:text-[#C9A84C] transition-colors">
              Employee / Carrier Login →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
