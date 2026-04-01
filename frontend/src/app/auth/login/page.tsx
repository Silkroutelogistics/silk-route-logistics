"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useAuthStore } from "@/hooks/useAuthStore";

export default function EmployeeLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [localError, setLocalError] = useState("");
  const [localLoading, setLocalLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [totpSetupStep, setTotpSetupStep] = useState(false);
  const [totpSetupToken, setTotpSetupToken] = useState("");
  const [totpQrCode, setTotpQrCode] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpVerifyStep, setTotpVerifyStep] = useState(false);
  const [totpVerifyToken, setTotpVerifyToken] = useState("");
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();

  const BASE = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:4000" : "https://api.silkroutelogistics.ai";
  const fetchOpts: RequestInit = { credentials: "include" };

  useEffect(() => {
    if (isAuthenticated && user) {
      router.replace("/dashboard/overview");
    }
  }, [isAuthenticated, user, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setLocalError("Please enter your email and password."); return; }
    setLocalError("");
    setLocalLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        ...fetchOpts,
      });
      const data = await res.json();
      if (data.error) { setLocalError(data.error); setLocalLoading(false); return; }
      if (data.pendingOtp) {
        setPendingEmail(email);
        setOtpStep(true);
        setSuccessMsg("A verification code has been sent to your email.");
        setLocalLoading(false);
        return;
      }
      if (data.user) {
        window.location.href = "/dashboard/overview";
      }
    } catch {
      setLocalError("Unable to connect to server. Please try again.");
    }
    setLocalLoading(false);
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 6) { setLocalError("Please enter the verification code."); return; }
    setLocalError("");
    setLocalLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, code: otp }),
        ...fetchOpts,
      });
      const data = await res.json();
      if (data.error) { setLocalError(data.error); setLocalLoading(false); return; }
      if (data.passwordExpired) {
        sessionStorage.setItem("srl_temp_token", data.tempToken);
        window.location.href = "/auth/force-password-change";
        return;
      }
      if (data.require2FASetup) {
        sessionStorage.setItem("srl_2fa_setup_token", data.setupToken);
        setTotpSetupToken(data.setupToken);
        setTotpSetupStep(true);
        setOtpStep(false);
        setLocalLoading(false);
        const fetchQr = async (token: string) => {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const setupRes = await fetch(`${BASE}/api/auth/totp/force-setup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ setupToken: token }),
                credentials: "include",
              });
              if (!setupRes.ok) { console.error("[2FA Setup] HTTP", setupRes.status); continue; }
              const setupData = await setupRes.json();
              const qr = setupData.qrCodeDataURL || setupData.qrCode || setupData.qrCodeDataUrl || "";
              if (qr) {
                setTotpQrCode(qr);
                setTotpSecret(setupData.secret || "");
                return;
              }
              if (setupData.secret) { setTotpSecret(setupData.secret); return; }
            } catch (err) { console.error("[2FA Setup] Fetch error:", err); }
          }
          setLocalError("Could not load QR code. Use the manual key below or refresh the page.");
        };
        fetchQr(data.setupToken);
        return;
      }
      if (data.pendingTotp) {
        setTotpVerifyToken(data.totpToken);
        setTotpVerifyStep(true);
        setOtpStep(false);
        setLocalLoading(false);
        return;
      }
      if (data.user) {
        window.location.href = "/dashboard/overview";
      }
    } catch {
      setLocalError("Unable to connect to server. Please try again.");
    }
    setLocalLoading(false);
  };

  const handleTotpSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.length < 6) { setLocalError("Please enter the 6-digit code from your authenticator app."); return; }
    setLocalError("");
    setLocalLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/totp/force-enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupToken: totpSetupToken, code: totpCode }),
        ...fetchOpts,
      });
      const data = await res.json();
      if (data.error) { setLocalError(data.error); setLocalLoading(false); return; }
      if (data.user) {
        window.location.href = "/dashboard/overview";
      } else {
        setTotpSetupStep(false);
        setOtpStep(false);
        setSuccessMsg("Two-factor authentication enabled! Please log in again.");
        setPassword("");
        setOtp("");
        setTotpCode("");
      }
    } catch {
      setLocalError("Unable to connect to server. Please try again.");
    }
    setLocalLoading(false);
  };

  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.length < 6) { setLocalError("Please enter the 6-digit code from your authenticator app."); return; }
    setLocalError("");
    setLocalLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/totp/login-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totpToken: totpVerifyToken, code: totpCode }),
        ...fetchOpts,
      });
      const data = await res.json();
      if (data.error) { setLocalError(data.error); setLocalLoading(false); return; }
      if (data.user) {
        window.location.href = "/dashboard/overview";
      }
    } catch {
      setLocalError("Unable to connect to server. Please try again.");
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
          <h1 className="text-[32px] font-bold text-white mb-2 tracking-tight">Operations Hub</h1>
          <p className="text-[15px] text-[#7a9bb8] mb-10 leading-relaxed">Manage loads, carriers, and finances in one place</p>

          <div className="flex flex-wrap gap-2.5 mb-16">
            <span className="px-4 py-2 rounded-full text-[12px] font-medium text-[#C9A84C] border border-[#C9A84C]/25 bg-[#C9A84C]/[0.07]">Compass Compliance</span>
            <span className="px-4 py-2 rounded-full text-[12px] font-medium text-[#C9A84C] border border-[#C9A84C]/25 bg-[#C9A84C]/[0.07]">AI-Powered Ops</span>
            <span className="px-4 py-2 rounded-full text-[12px] font-medium text-[#C9A84C] border border-[#C9A84C]/25 bg-[#C9A84C]/[0.07]">Real-Time Tracking</span>
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

          <h2 className="text-xl font-bold text-gray-900 text-center">Employee Sign In</h2>
          <p className="text-sm text-gray-500 text-center mt-1 mb-8">Access the operations dashboard</p>

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

          {totpSetupStep ? (
            <form onSubmit={handleTotpSetup}>
              <div className="mb-4">
                <p className="text-[13px] text-gray-500 mb-4">
                  As an administrator, two-factor authentication is required. Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.).
                </p>
                {totpQrCode && (
                  <div className="flex justify-center mb-4">
                    <img src={totpQrCode} alt="TOTP QR Code" className="rounded-lg" style={{ width: 180, height: 180 }} />
                  </div>
                )}
                {totpSecret && (
                  <div className="mb-4 p-3 rounded-lg text-center bg-gray-50 border border-gray-200">
                    <p className="text-[11px] text-gray-500 mb-1">Manual entry key:</p>
                    <p className="text-[13px] text-[#C9A84C] font-mono tracking-wider select-all">{totpSecret}</p>
                  </div>
                )}
                <label className="block text-[11.5px] font-medium text-gray-500 uppercase tracking-[1px] mb-1.5">Authenticator Code</label>
                <input type="text" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 6-digit code" maxLength={6} inputMode="numeric" autoFocus
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={localLoading}
                className="w-full py-3 text-[15px] font-semibold rounded-lg border-none cursor-pointer transition-all bg-[#C9A84C] text-white hover:bg-[#b8933f] disabled:opacity-60 disabled:cursor-not-allowed">
                {localLoading ? "Enabling 2FA..." : "Enable Two-Factor Authentication"}
              </button>
            </form>
          ) : totpVerifyStep ? (
            <form onSubmit={handleTotpVerify}>
              <div className="mb-4">
                <p className="text-[13px] text-gray-500 mb-4">
                  Enter the 6-digit code from your authenticator app.
                </p>
                <label className="block text-[11.5px] font-medium text-gray-500 uppercase tracking-[1px] mb-1.5">Authenticator Code</label>
                <input type="text" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 6-digit code" maxLength={6} inputMode="numeric" autoFocus
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={localLoading}
                className="w-full py-3 text-[15px] font-semibold rounded-lg border-none cursor-pointer transition-all bg-[#C9A84C] text-white hover:bg-[#b8933f] disabled:opacity-60 disabled:cursor-not-allowed">
                {localLoading ? "Verifying..." : "Verify"}
              </button>
              <div className="text-center mt-4">
                <button type="button" onClick={() => { setTotpVerifyStep(false); setTotpCode(""); setLocalError(""); }}
                  className="text-[13px] text-gray-500 underline hover:text-[#C9A84C] transition-colors bg-transparent border-none cursor-pointer">
                  Back to sign in
                </button>
              </div>
            </form>
          ) : !otpStep ? (
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-gray-500 uppercase tracking-[1px] mb-1.5">Email Address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@silkroutelogistics.ai" autoComplete="email"
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

          <div className="flex items-center justify-center gap-4 mt-6">
            <Link href="/carrier/login" className="text-xs text-gray-500 hover:text-[#C9A84C] transition-colors no-underline">
              Carrier Login
            </Link>
            <span className="text-gray-300">&middot;</span>
            <Link href="/shipper/login" className="text-xs text-gray-500 hover:text-[#C9A84C] transition-colors no-underline">
              Shipper Login
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
