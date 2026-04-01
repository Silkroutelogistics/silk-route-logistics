"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Truck, Shield } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";

export default function CarrierLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState("");
  const { login, verifyOtp, isLoading, error, token, mustChangePassword, pendingOtp, pendingEmail } = useCarrierAuth();
  const router = useRouter();

  useEffect(() => {
    if (token && !mustChangePassword) router.replace("/carrier/dashboard");
  }, [token, mustChangePassword, router]);

  useEffect(() => {
    if (pendingOtp && pendingEmail) {
      setOtpStep(true);
      setOtpSuccess(`Verification code sent to ${pendingEmail}`);
    }
  }, [pendingOtp, pendingEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await login(email, password);
    if (result === "success") {
      window.location.href = "/carrier/dashboard";
    } else if (result === "password") {
      router.push("/auth/force-password-change");
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await verifyOtp(pendingEmail || email, otpCode);
    if (result === "success") {
      window.location.href = "/carrier/dashboard";
    } else if (result === "password") {
      router.push("/auth/force-password-change");
    }
  };

  const inputClass = "w-full px-4 py-3 text-sm rounded-lg bg-white text-gray-900 outline-none transition-all placeholder:text-gray-400 border border-gray-300 focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/20";

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      {/* LEFT PANEL */}
      <div className="hidden lg:flex w-[55%] relative overflow-hidden items-center justify-center"
        style={{ background: "linear-gradient(165deg, #0a1628 0%, #0f2035 40%, #132a45 70%, #0d1b2a 100%)" }}>
        {/* Geometric grid overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(rgba(201,168,76,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.05) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />
        {/* Floating gold squares */}
        <div className="absolute w-[10px] h-[10px] rounded-sm bg-[#C9A84C]/20 border border-[#C9A84C]/30" style={{ top: "14%", left: "22%" }} />
        <div className="absolute w-[8px] h-[8px] rounded-sm bg-[#C9A84C]/20 border border-[#C9A84C]/30" style={{ top: "38%", left: "78%" }} />
        <div className="absolute w-[12px] h-[12px] rounded-sm bg-[#C9A84C]/20 border border-[#C9A84C]/30" style={{ top: "62%", left: "15%" }} />
        <div className="absolute w-[9px] h-[9px] rounded-sm bg-[#C9A84C]/20 border border-[#C9A84C]/30" style={{ top: "75%", left: "68%" }} />
        <div className="absolute w-[11px] h-[11px] rounded-sm bg-[#C9A84C]/20 border border-[#C9A84C]/30" style={{ top: "28%", left: "52%" }} />

        <div className="relative z-10 px-16 max-w-[520px] w-full flex flex-col items-start">
          <Link href="/" className="block mb-10">
            <Logo size="lg" />
          </Link>
          <div className="text-[13px] font-semibold tracking-[4px] uppercase text-[#C9A84C] mb-2">SILK ROUTE LOGISTICS</div>
          <h1 className="text-[32px] font-bold text-white mb-2 tracking-tight">Partner Portal</h1>
          <p className="text-[15px] text-[#7a9bb8] mb-10 leading-relaxed">Your loads, scorecard, and payments — all in one place</p>

          <div className="flex flex-wrap gap-2.5 mb-16">
            <span className="px-4 py-2 rounded-full text-[12px] font-medium text-[#C9A84C] border border-[#C9A84C]/25 bg-[#C9A84C]/[0.07]">QuickPay 24hrs</span>
            <span className="px-4 py-2 rounded-full text-[12px] font-medium text-[#C9A84C] border border-[#C9A84C]/25 bg-[#C9A84C]/[0.07]">Performance Scorecard</span>
            <span className="px-4 py-2 rounded-full text-[12px] font-medium text-[#C9A84C] border border-[#C9A84C]/25 bg-[#C9A84C]/[0.07]">Self-Service Portal</span>
          </div>

          {/* Industry quote */}
          <div className="border-l-[3px] border-l-[#C9A84C] pl-5 max-w-[420px]">
            <p className="text-[13px] text-[#5d7a8e] italic leading-relaxed">
              &ldquo;Brokerages investing in technology see 40% faster load matching and 25% better carrier retention.&rdquo;
            </p>
            <p className="text-[11px] text-[#4d6878] mt-2">&mdash; FreightWaves Research, 2025</p>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex items-center justify-center overflow-y-auto bg-white">
        <div className="w-full max-w-sm mx-auto px-8 lg:px-0 py-12">
          {/* Mobile-only logo */}
          <div className="flex justify-center mb-6 lg:hidden">
            <Logo size="lg" />
          </div>

          <h2 className="text-xl font-bold text-gray-900 text-center">Carrier Sign In</h2>
          <p className="text-sm text-gray-500 text-center mt-1 mb-8">Access your carrier dashboard</p>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg text-[13px] text-center leading-relaxed bg-red-50 border border-red-200 text-red-600">
              {error}
            </div>
          )}

          {otpSuccess && !error && (
            <div className="mb-5 px-4 py-3 rounded-lg text-[13px] text-center leading-relaxed bg-green-50 border border-green-200 text-green-600">
              {otpSuccess}
            </div>
          )}

          {!otpStep ? (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-gray-500 uppercase tracking-[1px] mb-1.5">Email Address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="carrier@company.com" autoComplete="email"
                  className={inputClass}
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-gray-500 uppercase tracking-[1px] mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password" autoComplete="current-password"
                    className={inputClass}
                    required
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer transition-colors text-sm">
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between mb-6">
                <label className="flex items-center gap-2 text-[13px] text-gray-500 cursor-pointer">
                  <input type="checkbox" className="accent-[#C9A84C]" style={{ width: 15, height: 15 }} /> Remember me
                </label>
                <span className="text-[13px] text-[#C9A84C] font-medium cursor-pointer hover:opacity-80 transition-opacity">Forgot password?</span>
              </div>
              <button type="submit" disabled={isLoading}
                className="w-full py-3 text-[15px] font-semibold rounded-lg border-none cursor-pointer transition-all bg-[#C9A84C] text-white hover:bg-[#b8933f] disabled:opacity-60 disabled:cursor-not-allowed">
                {isLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit}>
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-gray-500 uppercase tracking-[1px] mb-1.5">Verification Code</label>
                <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="Enter 8-digit code" autoComplete="one-time-code" autoFocus
                  className={`${inputClass} text-center tracking-[6px] text-lg font-mono`}
                  required
                />
                <p className="text-[11px] text-gray-400 mt-2 text-center">Check your email for the verification code</p>
              </div>
              <button type="submit" disabled={isLoading || otpCode.length < 6}
                className="w-full py-3 text-[15px] font-semibold rounded-lg border-none cursor-pointer transition-all bg-[#C9A84C] text-white hover:bg-[#b8933f] disabled:opacity-60 disabled:cursor-not-allowed">
                {isLoading ? "Verifying..." : "Verify Code"}
              </button>
              <button type="button" onClick={() => { setOtpStep(false); setOtpCode(""); setOtpSuccess(""); }}
                className="w-full mt-3 py-2.5 text-[13px] font-medium text-gray-500 bg-transparent border border-gray-300 rounded-lg cursor-pointer hover:border-[#C9A84C] transition-all">
                Back to Sign In
              </button>
            </form>
          )}

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[12px] text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <Link href="/onboarding"
            className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-[#C9A84C] rounded-lg border border-[#C9A84C]/30 transition-all hover:bg-[#C9A84C]/5 no-underline">
            <Truck size={16} /> Register as New Carrier
          </Link>

          <div className="flex items-center justify-center gap-4 mt-4">
            <Link href="/shipper/login" className="text-xs text-gray-500 hover:text-[#C9A84C] transition-colors no-underline">
              Shipper Login
            </Link>
            <span className="text-gray-300">&middot;</span>
            <Link href="/auth/login" className="text-xs text-gray-500 hover:text-[#C9A84C] transition-colors no-underline">
              Employee Login
            </Link>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-8 text-xs text-gray-400">
            <Shield size={12} className="opacity-50" />
            256-bit SSL encrypted &bull; Secure data handling
          </div>
        </div>
      </div>
    </div>
  );
}
