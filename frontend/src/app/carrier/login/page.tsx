"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";

export default function CarrierLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const { login, isLoading, error, token, mustChangePassword } = useCarrierAuth();
  const router = useRouter();

  useEffect(() => {
    if (token && !mustChangePassword) router.replace("/carrier/dashboard");
  }, [token, mustChangePassword, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await login(email, password);
    if (ok) {
      router.push("/carrier/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[#0D1B2A] to-[#0F1E30]">
      {/* Left branding */}
      <div className="hidden lg:flex flex-[0_0_45%] flex-col justify-center px-16">
        <Logo size="lg" />
        <h1 className="text-3xl font-serif text-white mt-6 mb-3">Carrier Portal</h1>
        <p className="text-gray-400 text-sm leading-relaxed max-w-[400px]">
          Access your loads, manage compliance documents, track payments, and update shipment status — all in one place.
        </p>
        <div className="mt-8 space-y-3">
          {[
            "View and accept available loads",
            "Real-time load status updates",
            "Compliance document management",
            "Payment tracking & QuickPay",
          ].map((t, i) => (
            <div key={i} className="flex items-center gap-2.5 text-gray-400 text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]" />
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center bg-white lg:rounded-l-[20px]">
        <div className="w-full max-w-[400px] px-8">
          <div className="lg:hidden mb-8">
            <Logo size="md" />
          </div>
          <h2 className="text-2xl font-serif text-[#0D1B2A] mb-1">Carrier Sign In</h2>
          <p className="text-sm text-gray-500 mb-8">Enter your credentials to access the carrier portal</p>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2.5 mb-5 text-sm text-red-600">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="carrier@company.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-md text-sm focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C]/20"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-md text-sm focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C]/20"
                  required
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-white text-sm font-semibold rounded-md shadow-[0_4px_20px_rgba(201,168,76,0.3)] disabled:opacity-60"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500 mb-2">
              New carrier?{" "}
              <Link href="/onboarding" className="text-[#C9A84C] font-semibold hover:underline">
                Register here
              </Link>
            </p>
            <div className="space-y-0">
              <Link href="/shipper/login" className="text-xs text-gray-400 hover:text-[#C9A84C]">
                Shipper Login
              </Link>
              <span className="text-gray-300 mx-2">&middot;</span>
              <Link href="/auth/login" className="text-xs text-gray-400 hover:text-[#C9A84C]">
                Employee Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
