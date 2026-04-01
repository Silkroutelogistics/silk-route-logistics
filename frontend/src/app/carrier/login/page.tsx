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

  const inputClass = "w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-[#C9A84C] focus:shadow-[0_0_0_3px_rgba(201,168,76,0.1)]";
  const labelClass = "block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5";

  return (
    <div className="flex min-h-screen">
      <style>{`@keyframes drawRoute { to { stroke-dashoffset: 0 } }`}</style>

      {/* LEFT PANEL — Form (40%) */}
      <div className="w-full lg:w-[40%] flex items-center justify-center overflow-y-auto" style={{ backgroundColor: "#faf9f7" }}>
        <div className="w-full max-w-[380px] mx-auto px-8 py-12">
          {/* Logo */}
          <div className="flex justify-center mb-10">
            <Link href="/">
              <Logo size="lg" />
            </Link>
          </div>

          <h2 className="text-2xl font-serif text-gray-900 text-center">Welcome back</h2>
          <p className="text-sm text-gray-500 text-center mt-1.5 mb-8">Carrier Sign In</p>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl text-[13px] text-center leading-relaxed bg-red-50 border border-red-200 text-red-600">
              {error}
            </div>
          )}

          {otpSuccess && !error && (
            <div className="mb-5 px-4 py-3 rounded-xl text-[13px] text-center leading-relaxed bg-green-50 border border-green-200 text-green-600">
              {otpSuccess}
            </div>
          )}

          {!otpStep ? (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className={labelClass}>Email Address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="carrier@company.com" autoComplete="email"
                  className={inputClass}
                  required
                />
              </div>
              <div className="mb-4">
                <label className={labelClass}>Password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password" autoComplete="current-password"
                    className={inputClass}
                    required
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer transition-colors text-sm">
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
                className="w-full py-3.5 text-[15px] font-semibold rounded-xl border-none cursor-pointer transition-all bg-[#1a2d47] text-white hover:bg-[#243a56] disabled:opacity-60 disabled:cursor-not-allowed">
                {isLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit}>
              <div className="mb-4">
                <label className={labelClass}>Verification Code</label>
                <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="Enter 8-digit code" autoComplete="one-time-code" autoFocus
                  className={`${inputClass} text-center tracking-[6px] text-lg font-mono`}
                  required
                />
                <p className="text-[11px] text-gray-400 mt-2 text-center">Check your email for the verification code</p>
              </div>
              <button type="submit" disabled={isLoading || otpCode.length < 6}
                className="w-full py-3.5 text-[15px] font-semibold rounded-xl border-none cursor-pointer transition-all bg-[#1a2d47] text-white hover:bg-[#243a56] disabled:opacity-60 disabled:cursor-not-allowed">
                {isLoading ? "Verifying..." : "Verify Code"}
              </button>
              <button type="button" onClick={() => { setOtpStep(false); setOtpCode(""); setOtpSuccess(""); }}
                className="w-full mt-3 py-2.5 text-[13px] font-medium text-gray-500 bg-transparent border border-gray-200 rounded-xl cursor-pointer hover:border-[#C9A84C] transition-all">
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
            className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-[#C9A84C] rounded-xl border border-[#C9A84C]/30 transition-all hover:bg-[#C9A84C]/5 no-underline">
            <Truck size={16} /> Register as New Carrier
          </Link>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="flex items-center justify-center gap-4">
            <Link href="/shipper/login" className="text-xs font-medium text-[#C9A84C] hover:opacity-80 transition-opacity no-underline">
              Shipper Login
            </Link>
            <span className="text-gray-300">&middot;</span>
            <Link href="/auth/login" className="text-xs font-medium text-[#C9A84C] hover:opacity-80 transition-opacity no-underline">
              Employee Login
            </Link>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-8 text-xs text-gray-400">
            <Shield size={12} className="opacity-50" />
            Protected by 256-bit encryption
          </div>
        </div>
      </div>

      {/* RIGHT PANEL — Brand (60%), hidden on mobile */}
      <div className="hidden lg:flex w-[60%] relative overflow-hidden items-center justify-center"
        style={{ background: "linear-gradient(135deg, #0d1b2a 0%, #1a3050 50%, #0f2440 100%)" }}>

        {/* Animated gold route lines */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 600" preserveAspectRatio="none">
          <path d="M50,300 C200,100 400,500 750,250"
            fill="none" stroke="rgba(201,168,76,0.15)" strokeWidth="2"
            strokeDasharray="1200" strokeDashoffset="1200"
            className="animate-[drawRoute_4s_ease-in-out_forwards]" />
          <path d="M100,450 C300,200 500,400 700,150"
            fill="none" stroke="rgba(201,168,76,0.08)" strokeWidth="1.5"
            strokeDasharray="1200" strokeDashoffset="1200"
            style={{ animation: "drawRoute 5s 1s ease-in-out forwards" }} />
          <path d="M0,200 C150,350 350,50 600,300 C700,400 780,200 800,250"
            fill="none" stroke="rgba(201,168,76,0.06)" strokeWidth="1"
            strokeDasharray="1400" strokeDashoffset="1400"
            style={{ animation: "drawRoute 6s 1.5s ease-in-out forwards" }} />
        </svg>

        {/* Centered content */}
        <div className="relative z-10 flex flex-col items-center text-center px-12 max-w-[540px]">
          <div className="text-[#C9A84C] text-xs tracking-[6px] uppercase font-medium mb-6">
            SILK ROUTE LOGISTICS
          </div>
          <h1 className="text-white text-4xl font-serif leading-tight mb-6">
            Your Fleet. Your Terms.
          </h1>
          <div className="w-10 h-0.5 bg-[#C9A84C] mb-6" />
          <p className="text-[#6a8da8] text-base leading-relaxed max-w-md">
            Full transparency into your loads, scorecard, and payments.
          </p>
        </div>

        {/* Bottom metric badges */}
        <div className="absolute bottom-12 left-0 right-0 flex items-center justify-center gap-3 text-xs text-[#5a7a90]">
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            29-Point Vetting
          </span>
          <span className="text-[#C9A84C]/40">&#9679;</span>
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            AI-Powered Matching
          </span>
          <span className="text-[#C9A84C]/40">&#9679;</span>
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            24hr QuickPay
          </span>
        </div>

        {/* Version footer */}
        <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-[#3a5a70]">
          SRL v2.1 &middot; Kalamazoo, Michigan
        </div>
      </div>
    </div>
  );
}
