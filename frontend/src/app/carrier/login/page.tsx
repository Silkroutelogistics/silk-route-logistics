"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Truck, DollarSign, FileCheck, MapPin, Shield, Zap, Award } from "lucide-react";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";

const FEATURES = [
  { icon: Truck, label: "Available Loads" },
  { icon: MapPin, label: "Real-Time Tracking" },
  { icon: Award, label: "Caravan Rewards" },
  { icon: Zap, label: "Instant Pay" },
];

const INSIGHTS = [
  { cat: "CARRIER TIP", text: "Owner-operators who diversify across 3+ quality brokerages see 23% higher annual revenue.", src: "OOIDA Foundation Survey, 2024" },
  { cat: "CARRIER INSIGHT", text: "Carriers with 95%+ on-time delivery rates earn 12% more per mile through premium load access.", src: "DAT Solutions" },
  { cat: "CARAVAN REWARDS", text: "Carriers in the Caravan Partner Program earn priority loads and reduced Quick Pay fees.", src: "Silk Route Logistics" },
  { cat: "SRL PROMISE", text: "At Silk Route, carriers aren\u2019t a number \u2014 you\u2019re a partner. Fair rates, fast pay, a voice that matters.", src: "Silk Route Logistics" },
  { cat: "MOTIVATION", text: "Every mile you drive is a mile closer to your goals. Keep moving.", src: "Silk Route Logistics" },
];

const SLIDES = [
  { label: "Haul with Confidence", text: "Priority loads, fast payment,\nzero double-brokering" },
  { label: "Caravan Partner Program", text: "Earn rewards, reduced fees,\nand premium load access" },
  { label: "Smart Dispatch", text: "AI-powered load matching\ntailored to your lanes" },
];

export default function CarrierLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const { login, isLoading, error, token, mustChangePassword } = useCarrierAuth();
  const router = useRouter();
  const [currentSlide, setCurrentSlide] = useState(0);

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const insight = INSIGHTS[dayOfYear % INSIGHTS.length];

  useEffect(() => {
    if (token && !mustChangePassword) router.replace("/carrier/dashboard");
  }, [token, mustChangePassword, router]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await login(email, password);
    if (ok) router.push("/carrier/dashboard");
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
          <div className="text-[28px] font-bold text-white mb-1.5 tracking-tight">Carrier Portal</div>
          <div className="text-sm text-[#7a9bb8] mb-10">Your loads, payments, and compliance in one place</div>

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
            Join our carrier network for priority loads, fast payment, and AI-powered dispatch from Kalamazoo, Michigan.
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
            <h2 className="text-xl font-semibold text-[#c8a951]">Carrier Sign In</h2>
            <p className="text-[13px] text-[#6a8090] mt-1">Enter your credentials to access the portal</p>
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg text-[13px] text-center leading-relaxed"
              style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", color: "#f87171" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-[11.5px] font-medium text-[#8899aa] uppercase tracking-[1px] mb-1.5">Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="carrier@company.com" autoComplete="email"
                className="w-full px-4 py-3 text-sm rounded-lg text-[#e8edf2] outline-none transition-all placeholder:text-[#4a5e70]"
                style={{ background: "#162236", border: "1px solid #243447" }}
                onFocus={(e) => { e.target.style.borderColor = "#c8a951"; e.target.style.boxShadow = "0 0 0 3px rgba(200,150,62,0.1)"; }}
                onBlur={(e) => { e.target.style.borderColor = "#243447"; e.target.style.boxShadow = "none"; }}
                required
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
                  required
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
            <button type="submit" disabled={isLoading}
              className="w-full py-3.5 text-[15px] font-semibold rounded-lg border-none cursor-pointer transition-all hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
              style={{ background: "linear-gradient(135deg, #c8a951 0%, #b8963e 100%)", color: "#0D1B2A", boxShadow: "0 4px 20px rgba(200,150,62,0.25)" }}>
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#1f3044]" />
            <span className="text-[12px] text-[#4a5e70]">or</span>
            <div className="flex-1 h-px bg-[#1f3044]" />
          </div>

          <Link href="/onboarding"
            className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-[#c8a951] rounded-lg border transition-all hover:bg-[rgba(200,150,62,0.05)] no-underline"
            style={{ borderColor: "rgba(200,150,62,0.25)" }}>
            <Truck size={16} /> Register as New Carrier
          </Link>

          <div className="flex items-center justify-center gap-4 mt-4">
            <Link href="/shipper/login" className="text-xs text-[#6a8090] hover:text-[#c8a951] transition-colors no-underline">
              Shipper Login
            </Link>
            <span className="text-[#243447]">&middot;</span>
            <Link href="/auth/login" className="text-xs text-[#6a8090] hover:text-[#c8a951] transition-colors no-underline">
              Employee Login
            </Link>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-7 text-[11px] text-[#3a5060]">
            <Shield size={12} className="opacity-40" />
            256-bit SSL encrypted &bull; SOC 2 compliant
          </div>
        </div>
      </div>
    </div>
  );
}
