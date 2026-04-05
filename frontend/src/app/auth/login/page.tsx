"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { VersionFooter } from "@/components/ui/VersionFooter";
import { useAuthStore } from "@/hooks/useAuthStore";

const FEATURE_PILLS = [
  { icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7", label: "Load Management" },
  { icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z", label: "Carrier Network" },
  { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", label: "Compliance Engine" },
  { icon: "M13 10V3L4 14h7v7l9-11h-7z", label: "AI-Powered Ops" },
];

const SLIDES = [
  { label: "COMMAND CENTER", title: "Command Center", text: "Full visibility into loads, carriers, and financials" },
  { label: "COMPASS COMPLIANCE", title: "Compass Compliance", text: "35-check carrier vetting built for safety first" },
  { label: "MARCO POLO AI", title: "Marco Polo AI", text: "Intelligent automation for modern freight brokerage" },
];

const INSIGHTS = [
  { cat: "INDUSTRY FACT", text: "The US trucking industry moves 72.6% of all freight by weight, generating $940 billion annually.", src: "American Trucking Associations, 2025" },
  { cat: "MOTIVATION", text: "The Silk Road connected civilizations across 4,000 miles. We connect commerce across North America \u2014 one load at a time.", src: "Silk Route Logistics" },
  { cat: "OPERATIONS TIP", text: "Brokerages using automated carrier vetting reduce fraud exposure by 60% and onboard 3x faster.", src: "Transport Topics" },
  { cat: "DID YOU KNOW", text: "The average truck driver covers 100,000+ miles per year \u2014 that\u2019s circling the Earth four times.", src: "FMCSA" },
  { cat: "SRL VISION", text: "Every load moved is a connection made. Trust, transparency, and technology \u2014 the three pillars of modern brokerage.", src: "Silk Route Logistics" },
  { cat: "MARKET INSIGHT", text: "Digital freight brokerages now handle 8% of US truckload volume, up from 2% in 2020.", src: "FreightWaves Research" },
  { cat: "CARRIER FACT", text: "Owner-operators earn 15-20% more revenue with brokers who offer QuickPay and transparent scorecards.", src: "OOIDA Survey, 2025" },
  { cat: "SAFETY FIRST", text: "Carriers with CSA scores below the 75th percentile have 40% fewer roadside inspections.", src: "FMCSA Safety Analysis" },
  { cat: "TECH TREND", text: "AI-powered rate prediction now matches human broker accuracy within 3% \u2014 at 1000x the speed.", src: "McKinsey Transport Report" },
  { cat: "SUPPLY CHAIN", text: "The top 10 freight brokerages in North America collectively move $80 billion in freight annually.", src: "Armstrong & Associates" },
  { cat: "MOTIVATION", text: "In logistics, consistency beats speed. The broker who shows up every day earns the freight.", src: "Industry Wisdom" },
  { cat: "COMPLIANCE", text: "New FMCSA regulations require brokers to verify carrier insurance within 24 hours of booking.", src: "Federal Register, 2025" },
];

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
  const [currentSlide, setCurrentSlide] = useState(0);
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

  // Slide rotation
  useEffect(() => {
    const timer = setInterval(() => setCurrentSlide((s) => (s + 1) % SLIDES.length), 5000);
    return () => clearInterval(timer);
  }, []);

  // Daily insight
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const insight = INSIGHTS[dayOfYear % INSIGHTS.length];

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

  const inputClass = "w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-[#C9A84C] focus:shadow-[0_0_0_3px_rgba(201,168,76,0.1)]";
  const labelClass = "block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5";

  return (
    <div className="flex min-h-screen">
      <style>{`@keyframes drawRoute { to { stroke-dashoffset: 0 } }`}</style>

      {/* LEFT PANEL — Brand (55%), hidden on mobile */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col items-center justify-center"
        style={{ background: "linear-gradient(165deg, #1b3a5e 0%, #224870 40%, #285280 70%, #1e4060 100%)" }}>

        {/* US Map with animated dots */}
        <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice">
          {/* Simplified US outline */}
          <path d="M120,180 L180,140 L240,130 L300,120 L350,115 L400,110 L460,120 L520,130 L580,110 L640,120 L700,130 L720,160 L710,200 L700,240 L690,280 L680,320 L650,340 L600,350 L550,360 L500,370 L450,360 L400,350 L350,340 L300,330 L250,320 L200,300 L160,270 L140,230 Z"
            fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          {/* City dots */}
          {[
            [280,200,"Chicago"],[350,250,"Indianapolis"],[420,280,"Nashville"],
            [500,300,"Atlanta"],[600,250,"Charlotte"],[650,200,"Norfolk"],
            [550,180,"Columbus"],[200,220,"Kalamazoo"],[480,150,"Detroit"],
            [380,320,"Memphis"],[300,300,"St Louis"],[520,350,"Jacksonville"],
            [180,160,"Minneapolis"],[620,320,"Miami"],[450,100,"Buffalo"],
            [680,150,"New York"],[350,180,"Milwaukee"],[240,280,"Kansas City"],
            [150,300,"Dallas"],[100,350,"Houston"],[250,350,"New Orleans"],
          ].map(([x,y,name],i) => (
            <g key={i}>
              <circle cx={Number(x)} cy={Number(y)} r="3" fill="rgba(255,255,255,0.5)" />
              <circle cx={Number(x)} cy={Number(y)} r="5" fill="none" stroke="rgba(201,168,76,0.3)" strokeWidth="1">
                <animate attributeName="r" values="3;8;3" dur={`${3+i%3}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur={`${3+i%3}s`} repeatCount="indefinite" />
              </circle>
            </g>
          ))}
          {/* Animated route lines between cities */}
          <line x1="200" y1="220" x2="280" y2="200" stroke="rgba(201,168,76,0.3)" strokeWidth="1" strokeDasharray="4,4">
            <animate attributeName="stroke-dashoffset" values="0;-8" dur="1s" repeatCount="indefinite" />
          </line>
          <line x1="280" y1="200" x2="350" y2="250" stroke="rgba(201,168,76,0.3)" strokeWidth="1" strokeDasharray="4,4">
            <animate attributeName="stroke-dashoffset" values="0;-8" dur="1.2s" repeatCount="indefinite" />
          </line>
          <line x1="350" y1="250" x2="500" y2="300" stroke="rgba(201,168,76,0.3)" strokeWidth="1" strokeDasharray="4,4">
            <animate attributeName="stroke-dashoffset" values="0;-8" dur="1.5s" repeatCount="indefinite" />
          </line>
          <line x1="500" y1="300" x2="600" y2="250" stroke="rgba(201,168,76,0.25)" strokeWidth="1" strokeDasharray="4,4">
            <animate attributeName="stroke-dashoffset" values="0;-8" dur="1.3s" repeatCount="indefinite" />
          </line>
          {/* Moving truck dot */}
          <circle r="4" fill="#C9A84C" opacity="0.8">
            <animateMotion dur="12s" repeatCount="indefinite"
              path="M200,220 L280,200 L350,250 L420,280 L500,300 L600,250 L650,200" />
          </circle>
          <circle r="4" fill="#C9A84C" opacity="0.6">
            <animateMotion dur="15s" repeatCount="indefinite" begin="3s"
              path="M150,300 L240,280 L300,300 L380,320 L450,360 L520,350" />
          </circle>
        </svg>

        <div className="relative z-10 flex flex-col items-start w-full max-w-[480px] px-12">
          {/* Logo */}
          <div className="mb-8">
            <Logo size="lg" />
          </div>

          {/* Feature pills — 2×2 grid */}
          <div className="grid grid-cols-2 gap-2 mb-8 w-full max-w-[360px]">
            {FEATURE_PILLS.map((f) => (
              <div key={f.label} className="flex items-center justify-center gap-1.5 border border-white/25 text-white bg-white/10 rounded-lg px-3 py-2.5 text-xs font-medium cursor-default">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon} /></svg>
                {f.label}
              </div>
            ))}
          </div>

          {/* Animated transitioning cards — WHITE with dark gold heading */}
          <div className="relative w-full h-[150px] mb-6">
            <div className="absolute -right-2 -bottom-2 w-full h-full bg-white/10 rounded-2xl" />
            {SLIDES.map((slide, i) => (
              <div key={i} className="absolute inset-0 bg-white rounded-2xl p-8 transition-opacity duration-[1200ms]"
                style={{ opacity: currentSlide === i ? 1 : 0, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
                <div className="text-[#8B7428] text-xs tracking-[3px] uppercase font-bold">{slide.label}</div>
                <p className="text-[#1A1714] text-lg font-normal leading-relaxed mt-3">{slide.text}</p>
              </div>
            ))}
          </div>

          {/* Dot indicators */}
          <div className="flex items-center gap-2 mb-8">
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => setCurrentSlide(i)}
                className={`rounded-full transition-all duration-500 border-none cursor-pointer ${currentSlide === i ? "w-5 h-2 bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]" : "w-2 h-2 bg-white/30"}`} />
            ))}
          </div>

          {/* Daily insight — WHITE, readable */}
          <div className="relative pl-5 max-w-[440px]">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#C9A84C] to-[#C9A84C]/30 rounded-full" />
            <div className="text-[#E8D48B] text-[11px] tracking-[2px] uppercase font-semibold mb-2">{insight.cat}</div>
            <p className="text-white text-[16px] italic leading-relaxed m-0">{insight.text}</p>
            <p className="text-white/70 text-[13px] mt-2 m-0">&mdash; {insight.src}</p>
          </div>
        </div>

        {/* Version footer */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
          <VersionFooter className="text-[9px] text-[#2a4a60]" />
        </div>
      </div>

      {/* RIGHT PANEL — Form (45%) */}
      <div className="w-full lg:w-[45%] flex items-center justify-center overflow-y-auto relative" style={{ backgroundColor: "#faf9f7" }}>
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black/5 to-transparent pointer-events-none hidden lg:block" />
        <div className="w-full max-w-[400px] mx-auto px-8 py-12">
          {/* Mobile-only logo */}
          <div className="flex justify-center mb-10 lg:hidden">
            <Link href="/">
              <Logo size="lg" />
            </Link>
          </div>

          <h2 className="font-serif text-2xl text-gray-900">Employee Sign In</h2>
          <p className="text-gray-500 text-sm mt-1.5 mb-8">Access the operations dashboard</p>

          {/* Alerts */}
          {localError && (
            <div className="mb-5 px-4 py-3 rounded-xl text-[13px] text-center leading-relaxed bg-red-50 border border-red-200 text-red-600">
              {localError}
            </div>
          )}
          {successMsg && !localError && (
            <div className="mb-5 px-4 py-3 rounded-xl text-[13px] text-center leading-relaxed bg-green-50 border border-green-200 text-green-600">
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
                  <div className="mb-4 p-3 rounded-xl text-center bg-white border border-gray-200">
                    <p className="text-[11px] text-gray-500 mb-1">Manual entry key:</p>
                    <p className="text-[13px] text-[#C9A84C] font-mono tracking-wider select-all">{totpSecret}</p>
                  </div>
                )}
                <label className={labelClass}>Authenticator Code</label>
                <input type="text" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 6-digit code" maxLength={6} inputMode="numeric" autoFocus
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={localLoading}
                className="w-full py-3.5 text-[15px] font-semibold rounded-xl border-none cursor-pointer transition-all duration-200 bg-gradient-to-r from-[#C9A84C] to-[#d4b85e] text-[#0F1117] shadow-[0_4px_12px_rgba(201,168,76,0.25)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(201,168,76,0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0">
                {localLoading ? "Enabling 2FA..." : "Enable Two-Factor Authentication"}
              </button>
            </form>
          ) : totpVerifyStep ? (
            <form onSubmit={handleTotpVerify}>
              <div className="mb-4">
                <p className="text-[13px] text-gray-500 mb-4">
                  Enter the 6-digit code from your authenticator app.
                </p>
                <label className={labelClass}>Authenticator Code</label>
                <input type="text" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 6-digit code" maxLength={6} inputMode="numeric" autoFocus
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={localLoading}
                className="w-full py-3.5 text-[15px] font-semibold rounded-xl border-none cursor-pointer transition-all duration-200 bg-gradient-to-r from-[#C9A84C] to-[#d4b85e] text-[#0F1117] shadow-[0_4px_12px_rgba(201,168,76,0.25)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(201,168,76,0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0">
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
                <label className={labelClass}>Email Address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@silkroutelogistics.ai" autoComplete="email"
                  className={inputClass}
                />
              </div>
              <div className="mb-4">
                <label className={labelClass}>Password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password" autoComplete="current-password"
                    className={inputClass}
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
              <button type="submit" disabled={localLoading}
                className="w-full py-3.5 text-[15px] font-semibold rounded-xl border-none cursor-pointer transition-all duration-200 bg-gradient-to-r from-[#C9A84C] to-[#d4b85e] text-[#0F1117] shadow-[0_4px_12px_rgba(201,168,76,0.25)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(201,168,76,0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0">
                {localLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtp}>
              <div className="mb-4">
                <label className={labelClass}>Verification Code</label>
                <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 8-digit code" maxLength={8} autoComplete="one-time-code" inputMode="numeric" autoFocus
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={localLoading}
                className="w-full py-3.5 text-[15px] font-semibold rounded-xl border-none cursor-pointer transition-all duration-200 bg-gradient-to-r from-[#C9A84C] to-[#d4b85e] text-[#0F1117] shadow-[0_4px_12px_rgba(201,168,76,0.25)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(201,168,76,0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0">
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

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="flex items-center justify-center gap-4">
            <Link href="/carrier/login" className="text-xs font-medium text-[#C9A84C] hover:opacity-80 transition-opacity no-underline">
              Carrier Login
            </Link>
            <span className="text-gray-300">&middot;</span>
            <Link href="/shipper/login" className="text-xs font-medium text-[#C9A84C] hover:opacity-80 transition-opacity no-underline">
              Shipper Login
            </Link>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-8 text-xs text-gray-400">
            <Shield size={12} className="opacity-50" />
            256-bit SSL encrypted &middot; Secure data handling
          </div>
          <div className="flex justify-center mt-2">
            <VersionFooter />
          </div>
        </div>
      </div>
    </div>
  );
}
