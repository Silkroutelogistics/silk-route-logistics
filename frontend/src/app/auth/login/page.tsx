"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/hooks/useAuthStore";
import { Logo } from "@/components/ui/Logo";

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

  const onSubmit = (data: LoginForm) => login(data.email, data.password);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border p-8">
        <div className="flex flex-col items-center mb-6">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <Logo size="lg" />
          </Link>
          <h1 className="text-2xl font-bold">Sign In</h1>
          <p className="text-sm text-slate-500 mt-1">Welcome back to Silk Route Logistics</p>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input {...register("email")} type="email" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
            {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input {...register("password")} type="password" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
            {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>}
          </div>

          <button type="submit" disabled={isLoading} className="w-full py-2.5 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light disabled:opacity-50 transition">
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="text-center mt-6 space-y-2">
          <p className="text-sm text-slate-500">
            New carrier?{" "}
            <Link href="/onboarding" className="text-gold font-medium hover:underline">Register here</Link>
          </p>
          <p className="text-sm text-slate-500">
            Employee?{" "}
            <Link href="/dashboard/overview" className="text-gold font-medium hover:underline">Go to Dashboard</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
