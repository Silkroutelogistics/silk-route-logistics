"use client";

import Link from "next/link";
import {
  FileText, MapPin, BarChart3, DollarSign, File, MessageSquare,
  Code, Zap, Leaf, Check, X, ArrowRight,
} from "lucide-react";

const features = [
  { icon: FileText, title: "Instant Freight Quoting & RFQ", desc: "Get competitive truckload and LTL freight rates in under 3 minutes. Compare carrier options, save shipping templates, and book loads with one click.", tag: "Phase 1" },
  { icon: MapPin, title: "Real-Time Shipment Tracking", desc: "GPS-powered freight visibility with live ETAs, geofencing alerts, weather overlays, and at-risk load monitoring across all Midwest lanes.", tag: "Phase 1" },
  { icon: BarChart3, title: "Transportation Analytics & Insights", desc: "Freight spend analysis, on-time delivery performance, carrier scorecards, lane-level intelligence, and custom logistics reporting.", tag: "Phase 1" },
  { icon: DollarSign, title: "Freight Invoicing & Payments", desc: "View freight invoices, download proof of delivery, track payment status, and manage transportation billing from one logistics dashboard.", tag: "Phase 1" },
  { icon: File, title: "Supply Chain Document Vault", desc: "Centralized BOLs, PODs, rate confirmations, freight claims, and customs docs with intelligent search and auto-tagging.", tag: "Phase 2" },
  { icon: MessageSquare, title: "Dedicated Account Rep Messaging", desc: "Direct messaging with your freight broker account executive. Share shipping documents, request load updates, and resolve issues fast.", tag: "Phase 2" },
  { icon: Code, title: "EDI & API Integration", desc: "Connect your TMS or ERP via EDI 204/214/210 or our REST API. Automate freight order entry and shipment status updates.", tag: "Phase 2" },
  { icon: Zap, title: "Predictive Freight Pricing", desc: "AI-powered trucking rate forecasting up to 14 days out. Optimize your shipping windows and lock in the best freight rates.", tag: "Phase 2" },
  { icon: Leaf, title: "Sustainability & Emissions Reports", desc: "Track CO2 emissions per shipment. Generate ESG compliance reports and identify greener freight routing options.", tag: "Phase 2" },
];

const comparison: [string, boolean | string, boolean | string][] = [
  ["Instant Online Quoting", true, false],
  ["Real-Time GPS Tracking", true, "Partial"],
  ["Self-Service Dashboard", true, false],
  ["Document Management", true, "Email Only"],
  ["Spend Analytics", true, false],
  ["Dedicated Rep Chat", true, "Phone Only"],
  ["API/EDI Integration", true, "Enterprise Only"],
  ["Sustainability Reporting", true, false],
  ["$0 Platform Fees", true, "Varies"],
];

export default function ShipperLandingPage() {
  return (
    <div className="bg-[#F8F5ED] min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-[100] bg-[#0D1B2A]/92 backdrop-blur-xl border-b border-[#C9A84C]/15">
        <div className="max-w-[1280px] mx-auto px-8 flex items-center justify-between h-[76px]">
          <Link href="/shipper" className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#C9A84C] to-[#A88535] flex items-center justify-center text-lg font-extrabold text-[#0D1B2A] shadow-[0_2px_12px_rgba(201,168,76,0.3)]">
              SR
            </div>
            <div>
              <div className="font-serif text-[19px] font-bold text-white tracking-[1.5px] leading-none">SILK ROUTE</div>
              <div className="text-[9px] text-[#C9A84C] tracking-[3.5px] uppercase font-medium">LOGISTICS INC.</div>
            </div>
          </Link>
          <div className="flex gap-2">
            <Link href="/shipper/login" className="px-4 py-2 text-gray-300 text-[11px] font-semibold uppercase tracking-[1.5px] rounded hover:text-[#C9A84C] transition-colors">
              Log In
            </Link>
            <Link href="/shipper/register" className="px-4 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-[11px] font-semibold uppercase tracking-[2px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)] hover:shadow-[0_6px_30px_rgba(201,168,76,0.45)] hover:-translate-y-0.5 transition-all">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-[#0D1B2A] min-h-screen flex items-center px-8 relative overflow-hidden">
        <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[150%] bg-[radial-gradient(ellipse,rgba(201,168,76,0.06)_0%,transparent_60%)] pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-[200px] bg-gradient-to-t from-[#0D1B2A] to-transparent pointer-events-none" />
        <div className="max-w-[1280px] mx-auto relative z-10 w-full">
          <div className="max-w-[680px]">
            <div className="text-[11px] font-bold text-[#C9A84C] tracking-[3px] uppercase mb-6">
              Shipper Portal · Freight Brokerage Platform
            </div>
            <h1 className="font-serif text-5xl font-bold text-white leading-[1.15] mb-5">
              Ship Smarter with <span className="text-[#C9A84C]">Full Freight Visibility</span>
            </h1>
            <p className="text-[17px] text-gray-300 leading-[1.7] mb-9 max-w-[540px]">
              Your complete freight brokerage platform with real-time shipment tracking, instant freight quotes, transportation spend analytics, and supply chain document management. Midwest&apos;s trusted logistics partner for shippers who demand transparency.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link href="/shipper/register" className="inline-flex items-center gap-2 px-9 py-4 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-[13px] font-semibold uppercase tracking-[2px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)] hover:shadow-[0_6px_30px_rgba(201,168,76,0.45)] hover:-translate-y-0.5 transition-all">
                <ArrowRight size={16} /> Create Shipper Account
              </Link>
              <Link href="/shipper/login" className="px-9 py-4 border border-white/20 text-white text-[13px] font-semibold uppercase tracking-[2px] rounded hover:text-[#C9A84C] hover:border-[#C9A84C] transition-all">
                Log In to Shipper Portal
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-16 bg-white/[0.03] border border-[#C9A84C]/12 rounded-lg p-10 backdrop-blur-sm">
            <div className="grid grid-cols-4 gap-6">
              {[
                { val: "98%", label: "On-Time Delivery" },
                { val: "24/7", label: "Real-Time Tracking" },
                { val: "< 3 min", label: "Quote Response" },
                { val: "$0", label: "Platform Fees" },
              ].map((s, i) => (
                <div key={i} className="text-center p-5 bg-[#C9A84C]/[0.04] rounded-md border border-[#C9A84C]/[0.08]">
                  <div className="font-serif text-[32px] font-extrabold text-[#C9A84C] leading-none mb-1.5">{s.val}</div>
                  <div className="text-[11px] text-white/50 tracking-[1.5px] uppercase font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-[100px] px-8 max-w-[1280px] mx-auto">
        <div className="text-center mb-14">
          <div className="text-[11px] font-bold text-[#C9A84C] tracking-[3px] uppercase mb-4">Platform Features</div>
          <h2 className="font-serif text-[32px] text-[#0D1B2A] mb-3">Complete Freight Management for Shippers</h2>
          <p className="text-[15px] text-gray-500 max-w-[520px] mx-auto">
            Industry-leading freight management tools modeled after top brokerages like CH Robinson, J.B. Hunt, and Uber Freight — built for your supply chain.
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} className="bg-white rounded-md border border-gray-200 p-7 hover:border-[#C9A84C]/30 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 rounded-md bg-[#0D1B2A] flex items-center justify-center">
                    <Icon size={20} className="text-[#C9A84C]" />
                  </div>
                  <span className={`text-[10px] font-bold tracking-wide px-2.5 py-0.5 rounded-xl ${
                    f.tag === "Phase 1" ? "text-emerald-500 bg-emerald-500/10" : "text-blue-500 bg-blue-500/10"
                  }`}>{f.tag}</span>
                </div>
                <h3 className="text-base font-bold text-[#0D1B2A] mb-2">{f.title}</h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Comparison */}
      <section className="bg-[#0D1B2A] py-[100px] px-8">
        <div className="max-w-[1280px] mx-auto text-center">
          <h2 className="font-serif text-[26px] text-white mb-2">How Our Freight Brokerage Platform Stacks Up</h2>
          <p className="text-[13px] text-gray-400 mb-10">Feature comparison vs. traditional freight brokers and 3PLs</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px] min-w-[600px]">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium border-b border-gray-700">Feature</th>
                  <th className="px-4 py-3 text-[#C9A84C] font-bold border-b border-[#C9A84C]/40">SRL Shipper Portal</th>
                  <th className="px-4 py-3 text-gray-400 font-medium border-b border-gray-700">Typical Broker</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map(([feat, srl, typ], i) => (
                  <tr key={i} className="border-b border-gray-700/30">
                    <td className="text-left px-4 py-3 text-gray-300">{feat}</td>
                    <td className="px-4 py-3 text-center">
                      {srl === true ? <Check size={18} className="text-emerald-500 mx-auto" /> : <span className="text-gray-400">{String(srl)}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {typ === true ? <Check size={18} className="text-emerald-500 mx-auto" /> : typ === false ? <X size={18} className="text-red-500 mx-auto" /> : <span className="text-gray-400 text-xs">{String(typ)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-[100px] px-8 text-center bg-gradient-to-br from-[#0D1B2A] to-[#060F1A] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_20%_50%,rgba(201,168,76,0.06)_0%,transparent_50%),radial-gradient(ellipse_at_80%_50%,rgba(201,168,76,0.04)_0%,transparent_50%)]" />
        <div className="relative z-10">
          <div className="text-[11px] font-bold text-[#C9A84C] tracking-[3px] uppercase mb-4">Get Started</div>
          <h2 className="font-serif text-[30px] text-white mb-3">Ready to Streamline Your Freight Operations?</h2>
          <p className="text-[15px] text-white/60 mb-8 max-w-[460px] mx-auto">
            Create your free shipper account and get your first freight quote in under 5 minutes. No platform fees, no contracts.
          </p>
          <Link href="/shipper/register" className="inline-flex items-center gap-2 px-9 py-4 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-[13px] font-semibold uppercase tracking-[2px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)] hover:shadow-[0_6px_30px_rgba(201,168,76,0.45)] hover:-translate-y-0.5 transition-all">
            <ArrowRight size={16} /> Get Started — Free Shipper Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0D1B2A] px-8 py-10 border-t border-[#C9A84C]/15">
        <div className="max-w-[1280px] mx-auto flex justify-between items-center flex-wrap gap-4">
          <div className="text-xs text-white/45">© 2026 Silk Route Logistics Inc. · Kalamazoo, MI · MC# 01794414 · Licensed &amp; Bonded (BMC-84)</div>
          <div className="text-xs text-white/45">
            <span className="text-[#C9A84C] font-semibold">Where Carriers Come First</span> · Midwest Freight Brokerage · silkroutelogistics.ai
          </div>
        </div>
      </footer>
    </div>
  );
}
