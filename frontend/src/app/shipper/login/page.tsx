"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, BarChart3, FileText, MapPin, Truck, Shield } from "lucide-react";
import { useAuthStore } from "@/hooks/useAuthStore";

const FEATURES = [
  { icon: Package, label: "Freight Quotes" },
  { icon: BarChart3, label: "Spend Analytics" },
  { icon: FileText, label: "Invoice Management" },
  { icon: MapPin, label: "Live Tracking" },
];

const INSIGHTS = [
  { cat: "INDUSTRY FACT", text: "Shippers who consolidate freight through a single broker save an average of 12–18% on transportation costs annually.", src: "Logistics Management, 2024" },
  { cat: "DID YOU KNOW", text: "Real-time shipment visibility reduces supply chain disruptions by up to 30% and improves on-time delivery by 15%.", src: "Gartner Supply Chain Research" },
  { cat: "SHIPPER TIP", text: "Building consistent volume with fewer carriers leads to better rates, priority capacity, and more reliable service.", src: "DAT Freight & Analytics" },
  { cat: "SRL PROMISE", text: "One point of contact. Total freight visibility. Competitive rates from day one. That's the Silk Route difference.", src: "Silk Route Logistics" },
  { cat: "PERSPECTIVE", text: "Companies with digital freight management reduce administrative costs by 25% and cut billing errors by 60%.", src: "McKinsey & Company" },
];

export default function ShipperLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const { login, isLoading, error } = useAuthStore();
  const [localError, setLocalError] = useState("");
  const [localLoading, setLocalLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const router = useRouter();

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const insight = INSIGHTS[dayOfYear % INSIGHTS.length];

  const BASE = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:4000" : "https://api.silkroutelogistics.ai";

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
      if (data.token) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user || {}));
        window.location.href = "/shipper/dashboard";
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
      });
      const data = await res.json();
      if (data.error) { setLocalError(data.error); setLocalLoading(false); return; }
      if (data.token) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user || {}));
        window.location.href = "/shipper/dashboard";
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
        {/* Animated particles */}
        <div className="absolute inset-0 pointer-events-none">
          {[{ w: 4, t: "15%", l: "20%", d: 0, dur: 22 }, { w: 3, t: "45%", l: "75%", d: 3, dur: 28 }, { w: 5, t: "70%", l: "35%", d: 7, dur: 25 }, { w: 3, t: "25%", l: "60%", d: 12, dur: 30 }].map((p, i) => (
            <div key={i} className="absolute rounded-full animate-pulse" style={{ width: p.w, height: p.w, top: p.t, left: p.l, background: "rgba(200,150,62,0.18)", animationDelay: `${p.d}s`, animationDuration: `${p.dur}s` }} />
          ))}
        </div>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 25% 35%, rgba(200,150,62,0.14) 0%, transparent 45%), radial-gradient(ellipse at 70% 70%, rgba(200,150,62,0.10) 0%, transparent 45%)" }} />

        <div className="relative z-10 px-[60px] max-w-[520px] w-full">
          <Link href="/" className="block mb-8">
            <img src="/logo-full-alt.png" alt="SRL" className="h-[52px] w-[52px] object-contain rounded-xl bg-white/[0.08] p-1.5 opacity-95" />
          </Link>
          <div className="text-[13px] font-semibold tracking-[4px] uppercase text-[#c8a951] mb-1">SILK ROUTE LOGISTICS</div>
          <div className="text-[28px] font-bold text-white mb-1.5 tracking-tight">Shipper Portal</div>
          <div className="text-sm text-[#7a9bb8] mb-10">Manage your freight, track shipments, and optimize spend</div>

          <div className="grid grid-cols-2 gap-2.5 mb-8">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 px-4 py-3 rounded-lg border transition-all hover:-translate-y-px"
                style={{ background: "rgba(200,150,62,0.07)", borderColor: "rgba(200,150,62,0.14)" }}>
                <f.icon size={16} className="text-[#dbb960]" />
                <span className="text-[12.5px] text-[#c8d4de] font-medium tracking-wide">{f.label}</span>
              </div>
            ))}
          </div>

          {/* Daily insight */}
          <div className="rounded-xl p-6 relative overflow-hidden border-l-[3px] border-l-[#dbb960]"
            style={{ background: "linear-gradient(135deg, rgba(200,150,62,0.08) 0%, rgba(200,150,62,0.03) 100%)" }}>
            <div className="text-[9.5px] font-semibold tracking-[2.5px] uppercase text-[#dbb960] mb-2.5">{insight.cat}</div>
            <div className="text-[14.5px] text-[#dce4ec] leading-relaxed italic max-w-[380px]">&ldquo;{insight.text}&rdquo;</div>
            <div className="text-[11px] text-[#5d7a8e] mt-3">&mdash; {insight.src}</div>
          </div>

          <div className="mt-auto pt-10 text-[11px] text-[#4d6878]">&copy; 2026 Silk Route Logistics Inc. &bull; Kalamazoo, MI</div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex items-center justify-center overflow-y-auto"
        style={{ background: "linear-gradient(180deg, #101d2e 0%, #0c1825 100%)", borderLeft: "1px solid rgba(200,150,62,0.06)" }}>
        <div className="w-full max-w-[380px] px-10 lg:px-0">
          <div className="flex flex-col items-center mb-8">
            <img src="/logo.png" alt="Silk Route Logistics" className="h-12 mb-3.5 rounded-lg" />
            <h2 className="text-xl font-semibold text-[#c8a951]">Welcome Back</h2>
            <p className="text-[13px] text-[#6a8090] mt-1">Sign in to your shipper account</p>
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

          {!otpStep ? (
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-[#8899aa] uppercase tracking-[1px] mb-1.5">Email Address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com" autoComplete="email"
                  className="w-full px-4 py-3 text-sm rounded-lg text-[#e8edf2] outline-none transition-all placeholder:text-[#4a5e70]"
                  style={{ background: "#162236", border: "1px solid #243447" }}
                  onFocus={(e) => { e.target.style.borderColor = "#c8a951"; e.target.style.boxShadow = "0 0 0 3px rgba(200,150,62,0.1)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#243447"; e.target.style.boxShadow = "none"; }}
                />
              </div>
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-[#8899aa] uppercase tracking-[1px] mb-1.5">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password" autoComplete="current-password"
                  className="w-full px-4 py-3 text-sm rounded-lg text-[#e8edf2] outline-none transition-all placeholder:text-[#4a5e70]"
                  style={{ background: "#162236", border: "1px solid #243447" }}
                  onFocus={(e) => { e.target.style.borderColor = "#c8a951"; e.target.style.boxShadow = "0 0 0 3px rgba(200,150,62,0.1)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#243447"; e.target.style.boxShadow = "none"; }}
                />
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

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#1f3044]" />
            <span className="text-[12px] text-[#4a5e70]">or</span>
            <div className="flex-1 h-px bg-[#1f3044]" />
          </div>

          <Link href="/shipper/register"
            className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-[#c8a951] rounded-lg border transition-all hover:bg-[rgba(200,150,62,0.05)] no-underline"
            style={{ borderColor: "rgba(200,150,62,0.25)" }}>
            <Package size={16} /> Create Shipper Account
          </Link>

          <Link href="/auth/login"
            className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-[#c8a951] rounded-lg border mt-2 transition-all hover:bg-[rgba(200,150,62,0.05)] no-underline"
            style={{ borderColor: "rgba(200,150,62,0.25)" }}>
            <Truck size={16} /> Employee / Carrier Login
          </Link>

          <div className="flex items-center justify-center gap-1.5 mt-7 text-[11px] text-[#3a5060]">
            <Shield size={12} className="opacity-40" />
            256-bit SSL encrypted &bull; SOC 2 compliant
          </div>
        </div>
      </div>
    </div>
  );
}
