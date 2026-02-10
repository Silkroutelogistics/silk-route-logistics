"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/hooks/useAuthStore";
import { Logo } from "@/components/ui/Logo";
import { Truck } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function CarrierLoginPage() {
  const { login, isLoading, error } = useAuthStore();
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    const result = await login(data.email, data.password);
    if (result && result.pendingOtp) {
      sessionStorage.setItem("otpEmail", result.email);
      window.location.href = "/auth/verify-otp";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] px-4">
      <div className="w-full max-w-md bg-white/5 backdrop-blur border border-white/10 rounded-2xl shadow-2xl p-8">
        <div className="flex flex-col items-center mb-6">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <Logo size="lg" />
          </Link>
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-5 h-5 text-[#d4a574]" />
            <h1 className="text-2xl font-bold text-white">Carrier Portal</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">Sign in to manage your loads and fleet</p>
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleSubmit(onSubmit)} autoComplete="on" className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input
              {...register("email")}
              type="email"
              autoComplete="email"
              placeholder="your@email.com"
              className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-[#d4a574]/50 focus:border-[#d4a574]/50 outline-none"
            />
            {errors.email && <p className="text-red-400 text-sm mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <Link href="/auth/forgot-password" className="text-xs text-[#d4a574] hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              {...register("password")}
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-[#d4a574]/50 focus:border-[#d4a574]/50 outline-none"
            />
            {errors.password && <p className="text-red-400 text-sm mt-1">{errors.password.message}</p>}
          </div>

          <button type="submit" disabled={isLoading} className="w-full py-2.5 bg-[#d4a574] text-[#0f172a] font-semibold rounded-lg hover:bg-[#d4a574]/90 disabled:opacity-50 transition">
            {isLoading ? "Signing in..." : "Sign In to Carrier Portal"}
          </button>
        </form>

        <div className="mt-6 space-y-3 text-center">
          <p className="text-sm text-slate-400">
            New to SRL?{" "}
            <Link href="/onboarding" className="text-[#d4a574] font-medium hover:underline">Register as a Carrier</Link>
          </p>
          <p className="text-sm text-slate-500">
            Employee?{" "}
            <Link href="/auth/login" className="text-slate-400 hover:text-white hover:underline transition">Sign in here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
