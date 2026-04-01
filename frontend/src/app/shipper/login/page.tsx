"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Shield } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useAuthStore } from "@/hooks/useAuthStore";

export default function ShipperLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const { login, verifyOtp, tempToken } = useAuthStore();
  const [localError, setLocalError] = useState("");
  const [localLoading, setLocalLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [showPw, setShowPw] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setLocalError("Please enter your email and password."); return; }
    setLocalError("");
    setLocalLoading(true);
    try {
      const result = await login(email, password);
      if (result && typeof result === "object" && "pendingOtp" in result && result.pendingOtp) {
        setPendingEmail(result.email || email);
        setOtpStep(true);
        setSuccessMsg("A verification code has been sent to your email.");
        setLocalLoading(false);
        return;
      }
      window.location.href = "/shipper/dashboard";
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; code?: string };
      let message = axiosErr?.response?.data?.error || "Unable to connect to server. Please try again.";
      if (axiosErr?.code === "ECONNABORTED") message = "Server is starting up — please try again.";
      if (axiosErr?.code === "ERR_NETWORK") message = "Cannot reach server.";
      setLocalError(message);
    }
    setLocalLoading(false);
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 6) { setLocalError("Please enter the verification code."); return; }
    setLocalError("");
    setLocalLoading(true);
    try {
      const result = await verifyOtp(pendingEmail, otp);
      if (result && typeof result === "object" && "passwordExpired" in result && result.passwordExpired) {
        if (tempToken) sessionStorage.setItem("srl_temp_token", tempToken);
        window.location.href = "/auth/force-password-change";
        return;
      }
      window.location.href = "/shipper/dashboard";
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Verification failed. Please try again.";
      setLocalError(message);
    }
    setLocalLoading(false);
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
          <h1 className="text-[32px] font-bold text-white mb-2 tracking-tight">Shipping Dashboard</h1>
          <p className="text-[15px] text-[#7a9bb8] mb-10 leading-relaxed">Track shipments, manage invoices, and ship with confidence</p>

          <div className="flex flex-wrap gap-2.5 mb-16">
            <span className="px-4 py-2 rounded-full text-[12px] font-medium text-[#C9A84C] border border-[#C9A84C]/25 bg-[#C9A84C]/[0.07]">Live Tracking</span>
            <span className="px-4 py-2 rounded-full text-[12px] font-medium text-[#C9A84C] border border-[#C9A84C]/25 bg-[#C9A84C]/[0.07]">Instant Quotes</span>
            <span className="px-4 py-2 rounded-full text-[12px] font-medium text-[#C9A84C] border border-[#C9A84C]/25 bg-[#C9A84C]/[0.07]">Secure Portal</span>
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

          <h2 className="text-xl font-bold text-gray-900 text-center">Shipper Sign In</h2>
          <p className="text-sm text-gray-500 text-center mt-1 mb-8">Access your shipping dashboard</p>

          {/* Alerts */}
          {localError && (
            <div className="mb-5 px-4 py-3 rounded-lg text-[13px] text-center leading-relaxed bg-red-50 border border-red-200 text-red-600">
              {localError}
            </div>
          )}
          {successMsg && !localError && (
            <div className="mb-5 px-4 py-3 rounded-lg text-[13px] text-center leading-relaxed bg-green-50 border border-green-200 text-green-600">
              {successMsg}
            </div>
          )}

          {!otpStep ? (
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-gray-500 uppercase tracking-[1px] mb-1.5">Email Address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com" autoComplete="email"
                  className={inputClass}
                />
              </div>
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-gray-500 uppercase tracking-[1px] mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password" autoComplete="current-password"
                    className={inputClass}
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
              <button type="submit" disabled={localLoading}
                className="w-full py-3 text-[15px] font-semibold rounded-lg border-none cursor-pointer transition-all bg-[#C9A84C] text-white hover:bg-[#b8933f] disabled:opacity-60 disabled:cursor-not-allowed">
                {localLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtp}>
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-gray-500 uppercase tracking-[1px] mb-1.5">Verification Code</label>
                <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 8-digit code" maxLength={8} autoComplete="one-time-code" inputMode="numeric" autoFocus
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={localLoading}
                className="w-full py-3 text-[15px] font-semibold rounded-lg border-none cursor-pointer transition-all bg-[#C9A84C] text-white hover:bg-[#b8933f] disabled:opacity-60 disabled:cursor-not-allowed">
                {localLoading ? "Verifying..." : "Verify"}
              </button>
              <div className="text-center mt-4">
                <button type="button" onClick={() => { setOtpStep(false); setOtp(""); setLocalError(""); setSuccessMsg(""); }}
                  className="text-[13px] text-gray-500 underline hover:text-[#C9A84C] transition-colors bg-transparent border-none cursor-pointer">
                  Back to sign in
                </button>
              </div>
            </form>
          )}

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[12px] text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <Link href="/shipper/register"
            className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-[#C9A84C] rounded-lg border border-[#C9A84C]/30 transition-all hover:bg-[#C9A84C]/5 no-underline">
            <Package size={16} /> Create Shipper Account
          </Link>

          <div className="flex items-center justify-center gap-4 mt-4">
            <Link href="/carrier/login" className="text-xs text-gray-500 hover:text-[#C9A84C] transition-colors no-underline">
              Carrier Login
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
