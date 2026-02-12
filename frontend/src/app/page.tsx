"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Truck, Snowflake, Car, ShoppingCart,
  Shield, BarChart3, Users, Award, Zap, MapPin, Phone, Mail,
  ChevronRight, Menu, X, CheckCircle2, Star, Briefcase,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useCountUp } from "@/hooks/useCountUp";
import { MarcoPolo } from "@/components/MarcoPolo";

const services = [
  { icon: Truck, title: "Full Truckload (FTL)", desc: "Dedicated dry van capacity across the Midwest and beyond. Real-time tracking, guaranteed pickup, and reliable delivery windows for your supply chain." },
  { icon: Snowflake, title: "Refrigerated (Reefer)", desc: "Temperature-controlled shipping for perishables, frozen foods, pharmaceuticals, and CPG products. Continuous cold-chain monitoring from pickup to delivery." },
  { icon: Car, title: "Auto Transport", desc: "Open and enclosed car hauling solutions for dealerships, auctions, and manufacturers. Single vehicle to full trailer loads across the Midwest." },
  { icon: ShoppingCart, title: "CPG & Retail Distribution", desc: "Consumer packaged goods logistics with retail-ready delivery. Walmart, Meijer, Kroger — we know the Midwest retail lanes." },
];

const differentiators = [
  { icon: MapPin, title: "Built for the Midwest", desc: "Deep lane knowledge across Michigan, Ohio, Indiana, Illinois, Wisconsin, and Minnesota. We know every dock, every route, every seasonal shift." },
  { icon: Users, title: "Small Carrier, Big Results", desc: "We partner with owner-operators and small fleets who treat your freight like their own. Personal accountability on every load." },
  { icon: BarChart3, title: "Tech-Enabled Transparency", desc: "Real-time tracking, instant quotes, performance scorecards, and a carrier portal that gives you visibility from tender to delivery." },
  { icon: Zap, title: "Customized Solutions", desc: "No cookie-cutter logistics. Whether it's a car from Detroit, reefer from Grand Rapids, or CPG to Chicago — we build your plan." },
];

const trustItems = [
  { label: "FMCSA Licensed", icon: Shield },
  { label: "24/7 Support", icon: Phone },
  { label: "Real-Time Tracking", icon: MapPin },
  { label: "Midwest Specialists", icon: Star },
];

const navLinks = [
  { label: "Services", id: "services" },
  { label: "About", id: "about" },
  { label: "Carriers", id: "partners" },
  { label: "Contact", id: "contact" },
];

function StatCard({ value, label }: { value: number; label: string }) {
  const { count, ref } = useCountUp(value);
  return (
    <div ref={ref} className="text-center">
      <p className="text-4xl md:text-5xl font-bold text-gold">{count}+</p>
      <p className="text-sm text-slate-300 mt-1">{label}</p>
    </div>
  );
}

export default function Home() {
  const { token } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  function scrollTo(id: string) {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <main className="min-h-screen bg-white text-charcoal">
      {/* ── Sticky Nav ───────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <nav className="flex items-center justify-between px-6 md:px-12 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Logo size="md" />
            <div className="hidden sm:block">
              <p className="text-lg font-bold leading-tight text-charcoal">Silk Route Logistics</p>
              <p className="text-[11px] text-gray-500 tracking-wide">Kalamazoo, MI</p>
            </div>
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((l) => (
              <button key={l.id} onClick={() => scrollTo(l.id)}
                className="text-sm text-gray-600 hover:text-gold transition font-medium">
                {l.label}
              </button>
            ))}
          </div>

          {/* Desktop auth buttons */}
          <div className="hidden md:flex gap-3">
            {token ? (
              <Link href="/dashboard/overview" className="px-5 py-2.5 rounded-lg bg-gold text-white font-semibold text-sm hover:bg-gold-light transition">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/auth/login" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm transition">
                  <Briefcase className="w-4 h-4" />
                  Employee Login
                </Link>
                <Link href="/auth/carrier-login" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm transition">
                  <Truck className="w-4 h-4" />
                  Carrier Login
                </Link>
                <Link href="/onboarding" className="px-5 py-2.5 rounded-lg bg-gold text-white font-semibold text-sm hover:bg-gold-light transition">
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden p-2 -mr-2" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </nav>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t bg-white px-6 py-4 space-y-3">
            {navLinks.map((l) => (
              <button key={l.id} onClick={() => scrollTo(l.id)}
                className="block w-full text-left py-2 text-sm text-gray-700 hover:text-gold">
                {l.label}
              </button>
            ))}
            <div className="pt-3 border-t space-y-2">
              {token ? (
                <Link href="/dashboard/overview" className="block w-full text-center px-4 py-2.5 rounded-lg bg-gold text-white font-semibold text-sm">
                  Dashboard
                </Link>
              ) : (
                <>
                  <div className="flex gap-3">
                    <Link href="/auth/login" className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm">
                      <Briefcase className="w-4 h-4" />
                      Employee
                    </Link>
                    <Link href="/auth/carrier-login" className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm">
                      <Truck className="w-4 h-4" />
                      Carrier
                    </Link>
                  </div>
                  <Link href="/onboarding" className="block w-full text-center px-4 py-2.5 rounded-lg bg-gold text-white font-semibold text-sm">Get Started</Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ─────────────────────────────────── */}
      <section className="relative overflow-hidden bg-navy">
        {/* North America network map background */}
        <div className="absolute inset-0" style={{
          backgroundImage: "url('/hero-map.svg')",
          backgroundSize: "cover",
          backgroundPosition: "center 40%",
          backgroundRepeat: "no-repeat",
        }} />
        {/* Gradient overlay to keep text readable on left */}
        <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/90 to-navy/40" />

        <div className="relative max-w-7xl mx-auto px-6 md:px-12 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="max-w-3xl">
            <p className="text-gold font-semibold text-sm uppercase tracking-widest mb-4">Midwest Freight Brokerage</p>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.1] mb-6 text-white">
              Your Freight.<br />
              Our Network.<br />
              <span className="text-gold">Zero Compromises.</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl leading-relaxed">
              Midwest&apos;s trusted freight partner — connecting shippers with reliable carriers
              for every load, every lane, every time. Customized solutions for FTL, reefer,
              auto transport, and CPG distribution.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/onboarding" className="inline-flex items-center gap-2 px-8 py-4 bg-gold text-navy font-bold rounded-xl hover:bg-gold-light text-lg transition shadow-lg shadow-gold/20">
                Ship With Us <ChevronRight className="w-5 h-5" />
              </Link>
              <Link href="/onboarding" className="inline-flex items-center gap-2 px-8 py-4 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 text-lg transition">
                Partner As Carrier
              </Link>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="relative border-t border-white/10 bg-white/5">
          <div className="max-w-7xl mx-auto px-6 md:px-12 py-8 grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatCard value={50} label="Carrier Partners" />
            <StatCard value={500} label="Loads Moved" />
            <StatCard value={98} label="On-Time Delivery %" />
            <StatCard value={48} label="States Covered" />
          </div>
        </div>
      </section>

      {/* ── Trust Bar ────────────────────────────── */}
      <section className="border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          <div className="flex flex-wrap justify-center gap-8 md:gap-16">
            {trustItems.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.label} className="flex items-center gap-2 text-sm text-gray-500">
                  <Icon className="w-4 h-4 text-gold" />
                  <span className="font-medium">{t.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Services ─────────────────────────────── */}
      <section id="services" className="max-w-7xl mx-auto px-6 md:px-12 py-24">
        <div className="text-center mb-16">
          <p className="text-gold font-semibold text-sm uppercase tracking-widest mb-3">What We Move</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-charcoal">Freight Solutions for Every Need</h2>
          <p className="text-gray-500 max-w-2xl mx-auto">From dry van to reefer, car hauling to CPG — we match your freight with the right carrier, every time.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6">
          {services.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="p-8 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-gold/40 transition group">
                <div className="w-14 h-14 rounded-2xl bg-gold/10 flex items-center justify-center mb-5 group-hover:bg-gold/20 transition">
                  <Icon className="w-7 h-7 text-gold" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-charcoal">{s.title}</h3>
                <p className="text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Why SRL ──────────────────────────────── */}
      <section id="about" className="bg-warm-gray py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-16">
            <p className="text-gold font-semibold text-sm uppercase tracking-widest mb-3">Why Silk Route</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-charcoal">Not Just Another Broker</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">We&apos;re a Midwest-first brokerage that builds real partnerships with small carriers who deliver big results.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {differentiators.map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.title} className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                  <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-gold" />
                  </div>
                  <h3 className="font-bold mb-2 text-charcoal">{d.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{d.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Carrier Partners ─────────────────────── */}
      <section id="partners" className="max-w-7xl mx-auto px-6 md:px-12 py-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-gold font-semibold text-sm uppercase tracking-widest mb-3">For Carriers</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-charcoal">
              We Don&apos;t Just Hire Carriers.<br />We Build Partnerships.
            </h2>
            <p className="text-gray-500 mb-8 leading-relaxed">
              Owner-operators and small fleets are the backbone of American freight.
              We give you the tools, transparency, and respect you deserve — plus performance
              bonuses that reward great work.
            </p>
            <Link href="/onboarding" className="inline-flex items-center gap-2 px-8 py-4 bg-gold text-navy font-bold rounded-xl hover:bg-gold-light text-lg transition">
              Apply as a Carrier Partner <ChevronRight className="w-5 h-5" />
            </Link>
          </div>
          <div className="space-y-4">
            {[
              { title: "Performance Bonuses", desc: "Platinum carriers earn up to 3% extra on every load" },
              { title: "Quick Pay Available", desc: "Get paid within 24 hours — no waiting 30+ days" },
              { title: "Tier Rewards System", desc: "Climb from Bronze to Platinum with transparent scoring" },
              { title: "Dedicated Support", desc: "A real person who knows your lanes and your name" },
              { title: "Tech-Forward Portal", desc: "Manage loads, documents, invoices, and scorecards in one place" },
            ].map((b) => (
              <div key={b.title} className="flex items-start gap-3 p-4 rounded-xl bg-warm-gray border border-gray-200">
                <CheckCircle2 className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-charcoal">{b.title}</p>
                  <p className="text-sm text-gray-500">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tier System ──────────────────────────── */}
      <section id="tiers" className="bg-navy py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-16">
            <p className="text-gold font-semibold text-sm uppercase tracking-widest mb-3">Carrier Tiers</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">Performance Unlocks Rewards</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">Your scorecard drives your tier. Higher tiers mean better rates, faster payments, and bonus earnings.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: "Platinum", color: "from-slate-200 to-slate-300", textColor: "text-slate-800", score: "98%+", bonus: "3%", perks: "Priority loads, fastest pay, dedicated support" },
              { name: "Gold", color: "from-yellow-300 to-yellow-400", textColor: "text-yellow-900", score: "95-98%", bonus: "1.5%", perks: "Priority loads, fast pay, premium support" },
              { name: "Silver", color: "from-slate-400 to-slate-500", textColor: "text-white", score: "90-95%", bonus: "0%", perks: "Standard load access, standard pay terms" },
              { name: "Bronze", color: "from-amber-500 to-amber-600", textColor: "text-white", score: "<90%", bonus: "0%", perks: "Standard access, coaching to upgrade" },
            ].map((t) => (
              <div key={t.name} className="rounded-2xl border border-white/10 overflow-hidden bg-white/5 backdrop-blur hover:bg-white/10 transition">
                <div className={`bg-gradient-to-r ${t.color} ${t.textColor} p-6 text-center`}>
                  <p className="font-bold text-2xl">{t.name}</p>
                  <p className="text-sm opacity-80 mt-1">Score: {t.score}</p>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Bonus Per Load</p>
                    <p className="text-3xl font-bold text-gold">{t.bonus}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Perks</p>
                    <p className="text-sm text-slate-300 leading-relaxed">{t.perks}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────── */}
      <section className="bg-warm-gray py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-charcoal">Ready to Move Your Freight?</h2>
          <p className="text-gray-500 mb-8 max-w-xl mx-auto">
            Whether you&apos;re a shipper looking for reliable Midwest coverage or a carrier
            ready to grow — we&apos;re here.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/onboarding" className="inline-flex items-center gap-2 px-10 py-4 bg-gold text-navy font-bold rounded-xl hover:bg-gold-light text-lg transition shadow-lg shadow-gold/20">
              Get a Quote <ChevronRight className="w-5 h-5" />
            </Link>
            <Link href="/onboarding" className="inline-flex items-center gap-2 px-10 py-4 border-2 border-charcoal text-charcoal font-bold rounded-xl hover:bg-charcoal hover:text-white text-lg transition">
              Join as Carrier
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────── */}
      <footer id="contact" className="border-t border-gray-200 bg-navy text-white py-16">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Logo size="sm" />
              <span className="font-bold">Silk Route Logistics</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              Midwest&apos;s trusted freight brokerage. Connecting shippers with reliable
              small carriers for customized freight solutions.
            </p>
          </div>
          <div>
            <p className="font-semibold text-sm mb-4">Services</p>
            <div className="space-y-2 text-sm text-slate-400">
              <p>Full Truckload (FTL)</p>
              <p>Refrigerated (Reefer)</p>
              <p>Auto Transport</p>
              <p>CPG & Retail Distribution</p>
            </div>
          </div>
          <div>
            <p className="font-semibold text-sm mb-4">Company</p>
            <div className="space-y-2 text-sm text-slate-400">
              <p>About Us</p>
              <p>Carrier Partners</p>
              <p>Terms of Service</p>
              <p>Privacy Policy</p>
            </div>
          </div>
          <div>
            <p className="font-semibold text-sm mb-4">Contact</p>
            <div className="space-y-3 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gold shrink-0" />
                <span>4000 S Westnedge Ave, Kalamazoo, MI 49008</span>
              </div>
              <a href="tel:+12695550100" className="flex items-center gap-2 hover:text-gold transition">
                <Phone className="w-4 h-4 text-gold shrink-0" />
                <span>+1 (269) 555-0100</span>
              </a>
              <a href="mailto:info@silkroutelogistics.ai" className="flex items-center gap-2 hover:text-gold transition">
                <Mail className="w-4 h-4 text-gold shrink-0" />
                <span>info@silkroutelogistics.ai</span>
              </a>
            </div>
            <div className="flex gap-3 mt-5">
              {["L", "X", "F"].map((s) => (
                <span key={s} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-slate-400 hover:bg-gold/20 hover:text-gold transition cursor-pointer">{s}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 md:px-12 mt-12 pt-8 border-t border-white/10">
          <p className="text-sm text-slate-500 text-center">&copy; 2026 Silk Route Logistics Inc. All rights reserved.</p>
        </div>
      </footer>
      <MarcoPolo isAuthenticated={false} darkMode={false} />
    </main>
  );
}
