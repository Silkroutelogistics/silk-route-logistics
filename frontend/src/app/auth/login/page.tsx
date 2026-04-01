"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Users, FileCheck, Zap, Shield } from "lucide-react";
import { useAuthStore } from "@/hooks/useAuthStore";

const FEATURES = [
  { icon: BarChart3, label: "Load Management" },
  { icon: Users, label: "Carrier Network" },
  { icon: FileCheck, label: "Compliance Engine" },
  { icon: Zap, label: "AI-Powered Ops" },
];

const INSIGHTS = [
  { cat: "INDUSTRY FACT", text: "Brokerages that invest in technology see 40% faster load matching and 25% better carrier retention.", src: "FreightWaves Research, 2025" },
  { cat: "SRL VISION", text: "Every load moved is a connection made. Silk Route bridges shippers and carriers with trust, speed, and transparency.", src: "Silk Route Logistics" },
  { cat: "OPERATIONS TIP", text: "Automated check-call systems reduce missed updates by 85% and improve shipper satisfaction scores.", src: "DAT Solutions" },
  { cat: "TEAM INSIGHT", text: "High-performing brokerages empower their teams with real-time data, not just spreadsheets.", src: "Transport Topics" },
  { cat: "MOTIVATION", text: "The Silk Road connected civilizations. We connect commerce. Every load tells a story.", src: "Silk Route Logistics" },
];

const SLIDES = [
  { label: "Command Center", text: "Full visibility into loads,\ncarriers, and financials" },
  { label: "Compass Compliance", text: "26-check carrier vetting\nbuilt for safety first" },
  { label: "Marco Polo AI", text: "Intelligent automation\nfor modern freight brokerage" },
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
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [currentSlide, setCurrentSlide] = useState(0);

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const insight = INSIGHTS[dayOfYear % INSIGHTS.length];

  const BASE = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:4000" : "https://api.silkroutelogistics.ai";
  const fetchOpts: RequestInit = { credentials: "include" };

  useEffect(() => {
    if (isAuthenticated && user) {
      router.replace("/dashboard/overview");
    }
  }, [isAuthenticated, user, router]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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
        // ADMIN/CEO must set up TOTP 2FA — store token and redirect to setup
        sessionStorage.setItem("srl_2fa_setup_token", data.setupToken);
        setTotpSetupToken(data.setupToken);
        setTotpSetupStep(true);
        setOtpStep(false);
        setLocalLoading(false);
        // Fetch QR code for setup (with retry)
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
        // TOTP 2FA verification required
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
        // 2FA enabled but need to log in again
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
      const res = await fetch(`${BASE}/api/auth/totp/verify`, {
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

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      {/* LEFT PANEL */}
      <div className="hidden lg:flex w-[55%] relative overflow-hidden items-center justify-center"
        style={{ background: "linear-gradient(165deg, #1b3a5e 0%, #224870 40%, #285280 70%, #1e4060 100%)" }}>
        <div className="absolute inset-0 pointer-events-none">
          {[{ w: 4, t: "15%", l: "20%", d: 0, dur: 22 }, { w: 3, t: "45%", l: "75%", d: 3, dur: 28 }, { w: 5, t: "70%", l: "35%", d: 7, dur: 25 }, { w: 3, t: "25%", l: "60%", d: 12, dur: 30 }, { w: 4, t: "80%", l: "80%", d: 5, dur: 26 }].map((p, i) => (
            <div key={i} className="absolute rounded-full animate-pulse" style={{ width: p.w, height: p.w, top: p.t, left: p.l, background: "rgba(200,150,62,0.18)", animationDelay: `${p.d}s`, animationDuration: `${p.dur}s` }} />
          ))}
        </div>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 25% 35%, rgba(200,150,62,0.14) 0%, transparent 45%), radial-gradient(ellipse at 70% 70%, rgba(200,150,62,0.10) 0%, transparent 45%), radial-gradient(ellipse at 50% 15%, rgba(120,180,240,0.07) 0%, transparent 40%)" }} />

        <div className="relative z-10 px-[60px] max-w-[520px] w-full">
          <Link href="/" className="block mb-8">
            <img src="/logo-full-alt.png" alt="SRL" className="h-[52px] w-[52px] object-contain rounded-xl bg-white/[0.08] p-1.5 opacity-95" />
          </Link>
          <div className="text-[13px] font-semibold tracking-[4px] uppercase text-[#c8a951] mb-1">SILK ROUTE LOGISTICS</div>
          <div className="text-[28px] font-bold text-white mb-1.5 tracking-tight">Operations Hub</div>
          <div className="text-sm text-[#7a9bb8] mb-10">Manage loads, carriers, and finances in one place</div>

          <div className="grid grid-cols-2 gap-2.5 mb-8">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 px-4 py-3 rounded-lg border transition-all hover:-translate-y-px"
                style={{ background: "rgba(200,150,62,0.07)", borderColor: "rgba(200,150,62,0.14)" }}>
                <f.icon size={16} className="text-[#dbb960]" />
                <span className="text-[12.5px] text-[#c8d4de] font-medium tracking-wide">{f.label}</span>
              </div>
            ))}
          </div>

          {/* Hero Slideshow */}
          <div className="relative w-full h-[170px] rounded-2xl overflow-hidden mb-7"
            style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.35), 0 0 60px rgba(200,150,62,0.06)", border: "1px solid rgba(200,150,62,0.15)" }}>
            {SLIDES.map((slide, i) => (
              <div key={i} className="absolute inset-0 flex items-center justify-center transition-opacity duration-[1200ms]"
                style={{
                  opacity: currentSlide === i ? 1 : 0,
                  background: i === 0
                    ? "linear-gradient(135deg, #1e4468 0%, #275580 30%, #2f6090 60%, #224c72 100%)"
                    : i === 1
                    ? "linear-gradient(160deg, #1b3e60 0%, #234e78 40%, #2a5888 70%, #1f4468 100%)"
                    : "linear-gradient(145deg, #1c4060 0%, #254e78 35%, #2c5a8a 65%, #204668 100%)",
                }}>
                <div className="relative z-10 text-center px-8">
                  <span className="text-[11px] tracking-[3px] uppercase text-[#dbb960] font-semibold">{slide.label}</span>
                  <p className="text-[18px] text-[#f0f4f8] font-light mt-2 leading-relaxed whitespace-pre-line">{slide.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-2 mb-7">
            {SLIDES.map((_, i) => (
              <div key={i} className="h-1.5 rounded-full transition-all duration-400"
                style={{
                  width: currentSlide === i ? 20 : 6,
                  background: currentSlide === i ? "#dbb960" : "rgba(200,150,62,0.25)",
                }} />
            ))}
          </div>

          <p className="text-[13.5px] text-[#7a9ab5] leading-[1.75] mb-10 max-w-[440px]">
            Your operations command center for freight brokerage. Powered by Compass compliance and Marco Polo AI from Kalamazoo, Michigan.
          </p>

          {/* Daily Insight */}
          <div className="rounded-xl p-6 relative overflow-hidden border-l-[3px] border-l-[#dbb960]"
            style={{ background: "linear-gradient(135deg, rgba(200,150,62,0.08) 0%, rgba(200,150,62,0.03) 100%)", backdropFilter: "blur(4px)" }}>
            <div className="text-[9.5px] font-semibold tracking-[2.5px] uppercase text-[#dbb960] mb-2.5">{insight.cat}</div>
            <div className="text-[14.5px] text-[#dce4ec] leading-relaxed italic max-w-[380px]">&ldquo;{insight.text}&rdquo;</div>
            <div className="text-[11px] text-[#5d7a8e] mt-3">&mdash; {insight.src}</div>
          </div>

          {/* Silk Road Line */}
          <svg className="mt-auto pt-10 opacity-20" width="100%" height="24" viewBox="0 0 500 24">
            <path d="M0,12 Q60,4 120,12 Q180,20 240,12 Q300,4 360,12 Q420,20 480,12 L500,12" stroke="#c8a951" strokeWidth="1.5" fill="none" strokeDasharray="8,6"/>
            <circle cx="0" cy="12" r="2.5" fill="#c8a951" opacity="0.6"/>
            <circle cx="250" cy="12" r="2" fill="#c8a951" opacity="0.4"/>
            <circle cx="500" cy="12" r="2.5" fill="#c8a951" opacity="0.6"/>
          </svg>

          <div className="text-[11px] text-[#4d6878] mt-4">&copy; 2026 Silk Route Logistics Inc. &bull; Kalamazoo, MI</div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex items-center justify-center overflow-y-auto"
        style={{ background: "linear-gradient(180deg, #101d2e 0%, #0c1825 100%)", borderLeft: "1px solid rgba(200,150,62,0.06)" }}>
        <div className="w-full max-w-[380px] px-10 lg:px-0">
          <div className="flex flex-col items-center mb-8">
            <img src="/logo.png" alt="Silk Route Logistics" className="h-12 mb-3.5 rounded-lg" />
            <h2 className="text-xl font-semibold text-[#c8a951]">Employee Sign In</h2>
            <p className="text-[13px] text-[#6a8090] mt-1">Access the operations dashboard</p>
          </div>

          {/* Alerts */}
          {localError && (
            <div className="mb-5 px-4 py-3 rounded-lg text-[13px] text-center leading-relaxed"
              style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", color: "#f87171" }}>
              {localError}
            </div>
          )}
          {successMsg && !localError && (
            <div className="mb-5 px-4 py-3 rounded-lg text-[13px] text-center leading-relaxed"
              style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80" }}>
              {successMsg}
            </div>
          )}

          {totpSetupStep ? (
            /* TOTP 2FA Setup — required for ADMIN/CEO first login */
            <form onSubmit={handleTotpSetup}>
              <div className="mb-4">
                <p className="text-[13px] text-[#8899aa] mb-4">
                  As an administrator, two-factor authentication is required. Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.).
                </p>
                {totpQrCode && (
                  <div className="flex justify-center mb-4">
                    <img src={totpQrCode} alt="TOTP QR Code" className="rounded-lg" style={{ width: 180, height: 180 }} />
                  </div>
                )}
                {totpSecret && (
                  <div className="mb-4 p-3 rounded-lg text-center" style={{ background: "#162236", border: "1px solid #243447" }}>
                    <p className="text-[11px] text-[#6a8090] mb-1">Manual entry key:</p>
                    <p className="text-[13px] text-[#c8a951] font-mono tracking-wider select-all">{totpSecret}</p>
                  </div>
                )}
                <label className="block text-[11.5px] font-medium text-[#8899aa] uppercase tracking-[1px] mb-1.5">Authenticator Code</label>
                <input type="text" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 6-digit code" maxLength={6} inputMode="numeric" autoFocus
                  className="w-full px-4 py-3 text-sm rounded-lg text-[#e8edf2] outline-none transition-all placeholder:text-[#4a5e70]"
                  style={{ background: "#162236", border: "1px solid #243447" }}
                  onFocus={(e) => { e.target.style.borderColor = "#c8a951"; e.target.style.boxShadow = "0 0 0 3px rgba(200,150,62,0.1)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#243447"; e.target.style.boxShadow = "none"; }}
                />
              </div>
              <button type="submit" disabled={localLoading}
                className="w-full py-3.5 text-[15px] font-semibold rounded-lg border-none cursor-pointer transition-all hover:-translate-y-px disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #c8a951 0%, #b8963e 100%)", color: "#0D1B2A" }}>
                {localLoading ? "Enabling 2FA..." : "Enable Two-Factor Authentication"}
              </button>
            </form>
          ) : totpVerifyStep ? (
            /* TOTP 2FA Verification — for users with 2FA already enabled */
            <form onSubmit={handleTotpVerify}>
              <div className="mb-4">
                <p className="text-[13px] text-[#8899aa] mb-4">
                  Enter the 6-digit code from your authenticator app.
                </p>
                <label className="block text-[11.5px] font-medium text-[#8899aa] uppercase tracking-[1px] mb-1.5">Authenticator Code</label>
                <input type="text" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 6-digit code" maxLength={6} inputMode="numeric" autoFocus
                  className="w-full px-4 py-3 text-sm rounded-lg text-[#e8edf2] outline-none transition-all placeholder:text-[#4a5e70]"
                  style={{ background: "#162236", border: "1px solid #243447" }}
                  onFocus={(e) => { e.target.style.borderColor = "#c8a951"; e.target.style.boxShadow = "0 0 0 3px rgba(200,150,62,0.1)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#243447"; e.target.style.boxShadow = "none"; }}
                />
              </div>
              <button type="submit" disabled={localLoading}
                className="w-full py-3.5 text-[15px] font-semibold rounded-lg border-none cursor-pointer transition-all hover:-translate-y-px disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #c8a951 0%, #b8963e 100%)", color: "#0D1B2A" }}>
                {localLoading ? "Verifying..." : "Verify"}
              </button>
              <div className="text-center mt-4">
                <button type="button" onClick={() => { setTotpVerifyStep(false); setTotpCode(""); setLocalError(""); }}
                  className="text-[13px] text-[#6a8090] underline hover:text-[#c8a951] transition-colors bg-transparent border-none cursor-pointer">
                  Back to sign in
                </button>
              </div>
            </form>
          ) : !otpStep ? (
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-[#8899aa] uppercase tracking-[1px] mb-1.5">Email Address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@silkroutelogistics.ai" autoComplete="email"
                  className="w-full px-4 py-3 text-sm rounded-lg text-[#e8edf2] outline-none transition-all placeholder:text-[#4a5e70]"
                  style={{ background: "#162236", border: "1px solid #243447" }}
                  onFocus={(e) => { e.target.style.borderColor = "#c8a951"; e.target.style.boxShadow = "0 0 0 3px rgba(200,150,62,0.1)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#243447"; e.target.style.boxShadow = "none"; }}
                />
              </div>
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-[#8899aa] uppercase tracking-[1px] mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password" autoComplete="current-password"
                    className="w-full px-4 py-3 text-sm rounded-lg text-[#e8edf2] outline-none transition-all placeholder:text-[#4a5e70]"
                    style={{ background: "#162236", border: "1px solid #243447" }}
                    onFocus={(e) => { e.target.style.borderColor = "#c8a951"; e.target.style.boxShadow = "0 0 0 3px rgba(200,150,62,0.1)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#243447"; e.target.style.boxShadow = "none"; }}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a5e70] hover:text-[#8899aa] bg-transparent border-none cursor-pointer transition-colors text-sm">
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between mb-6">
                <label className="flex items-center gap-2 text-[13px] text-[#8899aa] cursor-pointer">
                  <input type="checkbox" className="accent-[#c8a951]" style={{ width: 15, height: 15 }} /> Remember me
                </label>
                <span className="text-[13px] text-[#c8a951] font-medium cursor-pointer hover:opacity-80 transition-opacity">Forgot password?</span>
              </div>
              <button type="submit" disabled={localLoading}
                className="w-full py-3.5 text-[15px] font-semibold rounded-lg border-none cursor-pointer transition-all hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
                style={{ background: "linear-gradient(135deg, #c8a951 0%, #b8963e 100%)", color: "#0D1B2A", boxShadow: "0 4px 20px rgba(200,150,62,0.25)" }}>
                {localLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtp}>
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-[#8899aa] uppercase tracking-[1px] mb-1.5">Verification Code</label>
                <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 8-digit code" maxLength={8} autoComplete="one-time-code" inputMode="numeric" autoFocus
                  className="w-full px-4 py-3 text-sm rounded-lg text-[#e8edf2] outline-none transition-all placeholder:text-[#4a5e70]"
                  style={{ background: "#162236", border: "1px solid #243447" }}
                  onFocus={(e) => { e.target.style.borderColor = "#c8a951"; e.target.style.boxShadow = "0 0 0 3px rgba(200,150,62,0.1)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#243447"; e.target.style.boxShadow = "none"; }}
                />
              </div>
              <button type="submit" disabled={localLoading}
                className="w-full py-3.5 text-[15px] font-semibold rounded-lg border-none cursor-pointer transition-all hover:-translate-y-px disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #c8a951 0%, #b8963e 100%)", color: "#0D1B2A" }}>
                {localLoading ? "Verifying..." : "Verify"}
              </button>
              <div className="text-center mt-4">
                <button type="button" onClick={() => { setOtpStep(false); setOtp(""); setLocalError(""); setSuccessMsg(""); }}
                  className="text-[13px] text-[#6a8090] underline hover:text-[#c8a951] transition-colors bg-transparent border-none cursor-pointer">
                  Back to sign in
                </button>
              </div>
            </form>
          )}

          <div className="flex items-center justify-center gap-4 mt-6">
            <Link href="/carrier/login" className="text-xs text-[#6a8090] hover:text-[#c8a951] transition-colors no-underline">
              Carrier Login
            </Link>
            <span className="text-[#243447]">&middot;</span>
            <Link href="/shipper/login" className="text-xs text-[#6a8090] hover:text-[#c8a951] transition-colors no-underline">
              Shipper Login
            </Link>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-7 text-[11px] text-[#3a5060]">
            <Shield size={12} className="opacity-40" />
            256-bit SSL encrypted &bull; Secure data handling
          </div>
        </div>
      </div>
    </div>
  );
}
