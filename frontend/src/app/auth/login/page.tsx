"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/hooks/useAuthStore";
import { Logo } from "@/components/ui/Logo";
import { Truck, Shield, Users, BarChart3 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login, isLoading, error } = useAuthStore();
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const onSubmit = async (data: LoginForm) => {
    const result = await login(data.email, data.password);
    if (result && result.pendingOtp) {
      sessionStorage.setItem("otpEmail", result.email);
      window.location.href = "/auth/verify-otp";
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0f172a] overflow-hidden">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-12">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a]" />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-[#C8963E]/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-[#C8963E]/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        </div>

        <div className={`relative z-10 max-w-lg transition-all duration-1000 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="mb-8">
            <Logo size="lg" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">
            Moving America&apos;s Freight,<br />
            <span className="text-[#C8963E]">One Load at a Time</span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-10">
            Asset-based trucking and freight brokerage powered by technology.
            Real-time tracking, automated invoicing, and AI-driven operations from Kalamazoo, Michigan.
          </p>

          {/* Feature cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Truck, label: "Fleet Management", delay: "200ms" },
              { icon: Shield, label: "Secure Payments", delay: "400ms" },
              { icon: Users, label: "Carrier Network", delay: "600ms" },
              { icon: BarChart3, label: "Live Analytics", delay: "800ms" },
            ].map(({ icon: Icon, label, delay }) => (
              <div
                key={label}
                className={`flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                style={{ transitionDelay: delay }}
              >
                <div className="w-9 h-9 rounded-lg bg-[#C8963E]/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4.5 h-4.5 text-[#C8963E]" />
                </div>
                <span className="text-sm text-slate-300">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12">
        <div className={`w-full max-w-md transition-all duration-700 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <Logo size="lg" />
          </div>

          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
              <p className="text-sm text-slate-400 mt-1">Sign in to Silk Route Logistics</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} autoComplete="on" className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                <input
                  {...register("email")}
                  type="email"
                  autoComplete="email"
                  placeholder="you@silkroutelogistics.ai"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-[#C8963E]/50 focus:border-[#C8963E]/50 outline-none transition"
                />
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-slate-300">Password</label>
                  <Link href="/auth/forgot-password" className="text-xs text-[#C8963E] hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <input
                  {...register("password")}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-[#C8963E]/50 focus:border-[#C8963E]/50 outline-none transition"
                />
                {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-[#C8963E] text-[#0D1B2A] font-semibold rounded-xl hover:bg-[#C8963E]/90 disabled:opacity-50 transition-all duration-200 shadow-lg shadow-[#C8963E]/20"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#0D1B2A]/30 border-t-[#0D1B2A] rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            <div className="mt-6 space-y-3">
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#0f172a]/80 px-3 text-slate-500">or</span>
                </div>
              </div>

              <Link
                href="/auth/carrier-login"
                className="flex items-center justify-center gap-2 w-full py-2.5 border-2 border-[#C8963E]/30 text-[#C8963E] font-semibold rounded-xl hover:bg-[#C8963E]/5 transition"
              >
                <Truck className="w-4 h-4" />
                Carrier Login
              </Link>

              <p className="text-sm text-slate-500 text-center pt-2">
                New carrier?{" "}
                <Link href="/onboarding" className="text-[#C8963E] font-medium hover:underline">
                  Register here
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-slate-600 mt-6">
            Silk Route Logistics Inc. &bull; Kalamazoo, MI &bull; silkroutelogistics.ai
          </p>
        </div>
      </div>
    </div>
  );
}
