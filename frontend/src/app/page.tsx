"use client";

import Link from "next/link";
import { Truck, Package, Globe, Shield, Clock, BarChart3, Users, Award, ChevronRight, MapPin, Phone, Mail } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

const services = [
  { icon: Truck, title: "Full Truckload (FTL)", desc: "Dedicated full truckload capacity across North America with real-time tracking and guaranteed delivery windows." },
  { icon: Package, title: "Less Than Truckload (LTL)", desc: "Cost-effective partial load solutions with consolidated shipments and flexible scheduling." },
  { icon: Globe, title: "Cross-Border", desc: "Seamless US-Canada cross-border freight services with customs brokerage expertise and compliance management." },
  { icon: Shield, title: "Dedicated Fleet", desc: "Dedicated equipment and drivers for your supply chain. Consistent capacity with predictable costs." },
];

const fleet = [
  { type: "Dry Vans", count: "150+", desc: "53' standard dry vans for general freight" },
  { type: "Reefers", count: "75+", desc: "Temperature-controlled for perishable goods" },
  { type: "Flatbeds", count: "40+", desc: "Open deck for oversized and construction loads" },
  { type: "Step Decks", count: "25+", desc: "Low-profile trailers for tall freight" },
];

const whyUs = [
  { icon: Clock, title: "98% On-Time Delivery", desc: "Industry-leading on-time performance backed by real-time GPS tracking and proactive communication." },
  { icon: BarChart3, title: "Performance Transparency", desc: "Carrier scorecards, KPI dashboards, and detailed analytics so you always know where you stand." },
  { icon: Users, title: "Dedicated Support", desc: "24/7 dispatch and operations support. Your freight is always monitored by experienced logistics professionals." },
  { icon: Award, title: "Tier Rewards Program", desc: "Our carrier partners earn bonuses based on performance. Platinum carriers earn up to 3% extra on every load." },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-charcoal">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Logo size="md" />
          <div className="hidden sm:block">
            <p className="text-lg font-semibold leading-tight text-charcoal">Silk Route Logistics</p>
            <p className="text-xs text-gray-500">Your Trusted Partner in North American Freight</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href="/auth/login" className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm transition text-charcoal">
            Sign In
          </Link>
          <Link href="/onboarding" className="px-4 py-2 rounded-lg bg-gold text-white font-semibold text-sm hover:bg-gold-light transition">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="max-w-3xl">
          <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6 text-charcoal">
            Empowering Carriers.<br />
            <span className="text-gold">Transforming Freight.</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-2xl">
            North America&apos;s leading asset-based carrier platform with real-time performance insights,
            transparent operations, and growth opportunities for our carrier partners.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/onboarding" className="inline-flex items-center gap-2 px-8 py-3 bg-gold text-white font-semibold rounded-lg hover:bg-gold-light text-lg transition">
              Get Started <ChevronRight className="w-5 h-5" />
            </Link>
            <Link href="/auth/login" className="inline-flex items-center gap-2 px-8 py-3 border-2 border-charcoal text-charcoal font-semibold rounded-lg hover:bg-charcoal hover:text-white text-lg transition">
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="bg-warm-gray py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid md:grid-cols-2 gap-12">
          <div className="p-8 rounded-2xl bg-white border border-gray-200 shadow-sm">
            <h3 className="text-gold font-semibold text-sm uppercase tracking-wider mb-3">Our Mission</h3>
            <p className="text-gray-600 leading-relaxed">
              To revolutionize freight logistics by empowering carriers with transparent, technology-driven tools
              for real-time performance insights, fair compensation, and growth opportunities through trust,
              innovation, and mutual success.
            </p>
          </div>
          <div className="p-8 rounded-2xl bg-white border border-gray-200 shadow-sm">
            <h3 className="text-gold font-semibold text-sm uppercase tracking-wider mb-3">Our Vision</h3>
            <p className="text-gray-600 leading-relaxed">
              To become North America&apos;s most trusted asset-based carrier platform where carriers thrive
              with the tools, transparency, and opportunities they deserve.
            </p>
          </div>
        </div>
      </section>

      {/* Our Fleet */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-charcoal">Our Fleet</h2>
          <p className="text-gray-500 max-w-2xl mx-auto">Modern, well-maintained equipment to handle any freight requirement across North America.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {fleet.map((f) => (
            <div key={f.type} className="p-6 rounded-2xl bg-warm-gray border border-gray-200 text-center">
              <p className="text-3xl font-bold text-gold mb-1">{f.count}</p>
              <p className="font-semibold text-charcoal mb-2">{f.type}</p>
              <p className="text-sm text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Our Services */}
      <section className="bg-warm-gray py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-charcoal">Our Services</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">Comprehensive freight solutions tailored to your supply chain needs.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {services.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.title} className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm hover:border-gold/50 transition group">
                  <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center mb-4 group-hover:bg-gold/20 transition">
                    <Icon className="w-6 h-6 text-gold" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-charcoal">{s.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-charcoal">Why Choose Silk Route</h2>
          <p className="text-gray-500 max-w-2xl mx-auto">Built on trust, powered by technology, driven by performance.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {whyUs.map((w) => {
            const Icon = w.icon;
            return (
              <div key={w.title} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-gold/10 flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-7 h-7 text-gold" />
                </div>
                <h3 className="font-semibold mb-2 text-charcoal">{w.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{w.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tier System */}
      <section className="bg-charcoal py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">Carrier Performance Tiers</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">Your performance unlocks better rates, faster payments, and bonus rewards.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: "Platinum", color: "bg-slate-200", textColor: "text-slate-800", score: "98%+", bonus: "3%", perks: "Priority loads, fastest factoring, dedicated support" },
              { name: "Gold", color: "bg-yellow-300", textColor: "text-yellow-900", score: "95-98%", bonus: "1.5%", perks: "Priority loads, fast factoring, premium support" },
              { name: "Silver", color: "bg-slate-400", textColor: "text-white", score: "90-95%", bonus: "0%", perks: "Standard load access, standard factoring" },
              { name: "Bronze", color: "bg-amber-600", textColor: "text-white", score: "<90%", bonus: "0%", perks: "Standard access, path-to-upgrade coaching" },
            ].map((t) => (
              <div key={t.name} className="rounded-2xl border border-white/10 overflow-hidden bg-charcoal-light">
                <div className={`${t.color} ${t.textColor} p-5 text-center`}>
                  <p className="font-bold text-xl">{t.name}</p>
                  <p className="text-sm opacity-80">Score: {t.score}</p>
                </div>
                <div className="p-5 space-y-3">
                  <div><p className="text-xs text-gray-500 uppercase">Bonus</p><p className="text-2xl font-bold text-gold">{t.bonus}</p></div>
                  <div><p className="text-xs text-gray-500 uppercase">Perks</p><p className="text-sm text-gray-300">{t.perks}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-24 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4 text-charcoal">Ready to Partner with Silk Route?</h2>
        <p className="text-gray-500 mb-8 max-w-xl mx-auto">
          Register in minutes. Get approved in hours. Start hauling with us today.
        </p>
        <Link href="/onboarding" className="inline-flex items-center gap-2 px-10 py-4 bg-gold text-white font-bold rounded-lg hover:bg-gold-light text-lg transition">
          Start Your Application <ChevronRight className="w-5 h-5" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-warm-gray py-12">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Logo size="sm" />
              <span className="font-semibold text-charcoal">Silk Route Logistics</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Your Trusted Partner in North American Freight.
              Asset-based carrier providing reliable FTL, LTL, cross-border, and dedicated services.
            </p>
          </div>
          <div>
            <p className="font-semibold text-sm mb-3 text-charcoal">Services</p>
            <div className="space-y-2 text-sm text-gray-500">
              <p>Full Truckload (FTL)</p><p>Less Than Truckload (LTL)</p><p>Cross-Border</p><p>Dedicated Fleet</p>
            </div>
          </div>
          <div>
            <p className="font-semibold text-sm mb-3 text-charcoal">Company</p>
            <div className="space-y-2 text-sm text-gray-500">
              <p>About Us</p><p>Careers</p><p>Terms of Service</p><p>Privacy Policy</p>
            </div>
          </div>
          <div>
            <p className="font-semibold text-sm mb-3 text-charcoal">Contact</p>
            <div className="space-y-3 text-sm text-gray-500">
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gold shrink-0" /><span>4000 S Westnedge Ave, Kalamazoo, MI 49008</span></div>
              <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gold shrink-0" /><span>+1 (269) 555-0100</span></div>
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gold shrink-0" /><span>info@silkroutelogistics.ai</span></div>
            </div>
            <div className="flex gap-3 mt-4">
              {["LinkedIn", "X", "FB"].map((s) => (
                <span key={s} className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500 hover:bg-gold/20 hover:text-gold transition cursor-pointer">{s[0]}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 md:px-12 mt-8 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-400 text-center">&copy; 2026 Silk Route Logistics Inc. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
