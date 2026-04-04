"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Truck, Shield } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { VersionFooter } from "@/components/ui/VersionFooter";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";

const FEATURE_PILLS = [
  { icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7", label: "Load Board" },
  { icon: "M13 10V3L4 14h7v7l9-11h-7z", label: "QuickPay" },
  { icon: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", label: "Scorecard" },
  { icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z", label: "Self-Service" },
];

const SLIDES = [
  { label: "PARTNER DASHBOARD", text: "Your loads, payments, and performance in one place" },
  { label: "PERFORMANCE SCORECARD", text: "Track your KPIs and climb the tier ladder" },
  { label: "QUICKPAY EXPRESS", text: "Get paid within 24 hours, no paperwork" },
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

export default function CarrierLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState("");
  const [currentSlide, setCurrentSlide] = useState(0);
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

  // Slide rotation
  useEffect(() => {
    const timer = setInterval(() => setCurrentSlide((s) => (s + 1) % SLIDES.length), 5000);
    return () => clearInterval(timer);
  }, []);

  // Daily insight
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const insight = INSIGHTS[dayOfYear % INSIGHTS.length];

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

      {/* LEFT PANEL — Brand (55%), hidden on mobile */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col items-center justify-center"
        style={{ background: "linear-gradient(165deg, #1a1a2e 0%, #1e1e36 50%, #1e1e36 100%)" }}>

        {/* Radial gold glow */}
        <div className="absolute pointer-events-none" style={{
          top: "35%", left: "40%", width: "500px", height: "500px",
          background: "radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)",
          transform: "translate(-50%, -50%)",
          filter: "blur(60px)",
        }} />

        {/* Animated gold route lines */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 600" preserveAspectRatio="none">
          <path d="M50,300 C200,100 400,500 750,250"
            fill="none" stroke="rgba(201,168,76,0.15)" strokeWidth="1.5"
            strokeDasharray="1200" strokeDashoffset="1200"
            className="animate-[drawRoute_4s_ease-in-out_forwards]" />
          <path d="M100,450 C300,200 500,400 700,150"
            fill="none" stroke="rgba(201,168,76,0.12)" strokeWidth="1"
            strokeDasharray="1200" strokeDashoffset="1200"
            style={{ animation: "drawRoute 5s 1s ease-in-out forwards" }} />
          <path d="M0,200 C150,350 350,50 600,300 C700,400 780,200 800,250"
            fill="none" stroke="rgba(201,168,76,0.06)" strokeWidth="1"
            strokeDasharray="1400" strokeDashoffset="1400"
            style={{ animation: "drawRoute 6s 1.5s ease-in-out forwards" }} />
          <circle r="3" fill="#C9A84C" opacity="0.6">
            <animateMotion dur="8s" repeatCount="indefinite"
              path="M50,300 C200,100 400,500 750,250" />
          </circle>
        </svg>

        <div className="relative z-10 flex flex-col items-start w-full max-w-[480px] px-12">
          {/* Logo */}
          <div className="mb-10">
            <Logo size="lg" />
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mb-10">
            {FEATURE_PILLS.map((f) => (
              <div key={f.label} className="flex items-center gap-1.5 border border-[#C9A84C]/20 text-[#C9A84C]/80 bg-[#C9A84C]/[0.05] rounded-lg px-3 py-2 text-xs hover:bg-[#C9A84C]/[0.12] hover:-translate-y-0.5 hover:shadow-[0_0_15px_rgba(201,168,76,0.1)] transition-all duration-200 cursor-default">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon} /></svg>
                {f.label}
              </div>
            ))}
          </div>

          {/* Animated transitioning cards */}
          <div className="relative w-full h-[140px] mb-8">
            <div className="absolute -right-3 -bottom-3 w-full h-full bg-white/[0.02] border border-white/[0.04] rounded-2xl" />
            {SLIDES.map((slide, i) => (
              <div key={i} className="absolute inset-0 bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-opacity duration-[1200ms]"
                style={{ opacity: currentSlide === i ? 1 : 0 }}>
                <div className="text-[#C9A84C] text-xs tracking-[3px] uppercase font-semibold">{slide.label}</div>
                <p className="text-white/90 text-lg font-light leading-relaxed mt-2">{slide.text}</p>
              </div>
            ))}
          </div>

          {/* Dot indicators */}
          <div className="flex items-center gap-2 mb-10">
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => setCurrentSlide(i)}
                className={`rounded-full transition-all duration-500 border-none cursor-pointer ${currentSlide === i ? "w-5 h-2 bg-[#C9A84C] shadow-[0_0_8px_rgba(201,168,76,0.4)]" : "w-2 h-2 bg-[#C9A84C]/25"}`} />
            ))}
          </div>

          {/* Daily insight */}
          <div className="relative pl-4 max-w-[420px]">
            <div className="absolute -left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#C9A84C] to-[#C9A84C]/20 rounded-full" />
            <div className="text-[#C9A84C] text-[10px] tracking-[2px] uppercase font-medium mb-1">{insight.cat}</div>
            <p className="text-[#8aabbd] text-[13px] italic leading-relaxed m-0">{insight.text}</p>
            <p className="text-[#4d6878] text-[11px] mt-1.5 m-0">&mdash; {insight.src}</p>
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

          <h2 className="font-serif text-2xl text-gray-900">Carrier Sign In</h2>
          <p className="text-gray-500 text-sm mt-1.5 mb-8">Access your loads, payments, and performance</p>

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
                className="w-full py-3.5 text-[15px] font-semibold rounded-xl border-none cursor-pointer transition-all duration-200 bg-gradient-to-r from-[#C9A84C] to-[#d4b85e] text-[#1a1a2e] shadow-[0_4px_12px_rgba(201,168,76,0.25)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(201,168,76,0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0">
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
                className="w-full py-3.5 text-[15px] font-semibold rounded-xl border-none cursor-pointer transition-all duration-200 bg-gradient-to-r from-[#C9A84C] to-[#d4b85e] text-[#1a1a2e] shadow-[0_4px_12px_rgba(201,168,76,0.25)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(201,168,76,0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0">
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
