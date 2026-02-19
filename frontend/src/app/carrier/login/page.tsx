"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Truck, DollarSign, FileCheck, MapPin, Shield } from "lucide-react";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";

const FEATURES = [
  { icon: Truck, label: "Load Matching" },
  { icon: DollarSign, label: "Fast Payments" },
  { icon: FileCheck, label: "Compliance Docs" },
  { icon: MapPin, label: "Status Updates" },
];

const INSIGHTS = [
  { cat: "CARRIER TIP", text: "Carriers who update load status within 30 minutes of pickup see 40% more repeat bookings from brokers.", src: "DAT Freight & Analytics" },
  { cat: "INDUSTRY FACT", text: "Owner-operators earn an average of $250,000+ in gross revenue annually. Fuel and maintenance are 55% of costs.", src: "ATRI Operational Costs, 2024" },
  { cat: "DID YOU KNOW", text: "Carriers using digital BOL and POD submission get paid an average of 5 days faster than those using paper.", src: "TriumphPay, 2024" },
  { cat: "SRL PROMISE", text: "No double-brokering. No hidden fees. Fast payment options including QuickPay. Your truck, our word.", src: "Silk Route Logistics" },
  { cat: "PERSPECTIVE", text: "The top 10% of carriers by on-time delivery rate command 8–12% higher rates than industry average.", src: "FreightWaves Intelligence" },
];

export default function CarrierLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const { login, isLoading, error, token, mustChangePassword } = useCarrierAuth();
  const router = useRouter();

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const insight = INSIGHTS[dayOfYear % INSIGHTS.length];

  useEffect(() => {
    if (token && !mustChangePassword) router.replace("/carrier/dashboard");
  }, [token, mustChangePassword, router]);

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
          <div className="text-[28px] font-bold text-white mb-1.5 tracking-tight">Carrier Portal</div>
          <div className="text-sm text-[#7a9bb8] mb-10">Access loads, manage compliance, and track payments</div>

          <div className="grid grid-cols-2 gap-2.5 mb-8">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 px-4 py-3 rounded-lg border transition-all hover:-translate-y-px"
                style={{ background: "rgba(200,150,62,0.07)", borderColor: "rgba(200,150,62,0.14)" }}>
                <f.icon size={16} className="text-[#dbb960]" />
                <span className="text-[12.5px] text-[#c8d4de] font-medium tracking-wide">{f.label}</span>
              </div>
            ))}
          </div>

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
