import Link from "next/link";
import { Truck, BarChart3, DollarSign, Shield, Globe, Award, ChevronRight } from "lucide-react";

const features = [
  { icon: Truck, title: "Self-Onboarding", desc: "Register, upload documents, and get approved in under 24 hours. No paperwork hassle." },
  { icon: BarChart3, title: "Performance Dashboard", desc: "Track your KPIs in real-time: on-time delivery, acceptance rate, communication score, and more." },
  { icon: DollarSign, title: "Revenue Tracking", desc: "See weekly, monthly, and YTD revenue breakdowns with detailed per-load analytics." },
  { icon: Award, title: "Tier Rewards", desc: "Earn bonus pay based on your performance tier. Platinum carriers earn up to 3% extra." },
  { icon: Globe, title: "Load Marketplace", desc: "Browse available loads, accept tenders, and counter-offer — all from your dashboard." },
  { icon: Shield, title: "API Integrations", desc: "Seamless connections with McLeod, TMW, MercuryGate, DAT, and more." },
];

const tiers = [
  { name: "Platinum", color: "bg-slate-200", textColor: "text-slate-800", score: "98%+", bonus: "3%", perks: "Priority load access, fastest factoring, dedicated support" },
  { name: "Gold", color: "bg-yellow-300", textColor: "text-yellow-900", score: "95-98%", bonus: "1.5%", perks: "Priority load access, fast factoring, premium support" },
  { name: "Silver", color: "bg-slate-400", textColor: "text-white", score: "90-95%", bonus: "0%", perks: "Standard load access, standard factoring" },
  { name: "Bronze", color: "bg-amber-600", textColor: "text-white", score: "<90%", bonus: "0%", perks: "Standard load access, path-to-upgrade coaching" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-navy text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-gold">SRL</span>
          <span className="text-lg font-semibold hidden sm:inline">Silk Route Logistics</span>
        </div>
        <div className="flex gap-3">
          <Link href="/auth/login" className="px-4 py-2 rounded-lg border border-white/20 hover:bg-white/10 text-sm transition">
            Sign In
          </Link>
          <Link href="/onboarding" className="px-4 py-2 rounded-lg bg-gold text-navy font-semibold text-sm hover:bg-gold-light transition">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="max-w-3xl">
          <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
            Empowering Carriers.<br />
            <span className="text-gold">Transforming Freight.</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl">
            The carrier-first logistics platform with real-time performance insights,
            fair compensation, and growth opportunities through trust, innovation, and mutual success.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/onboarding" className="inline-flex items-center gap-2 px-8 py-3 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light text-lg transition">
              Get Started as Carrier <ChevronRight className="w-5 h-5" />
            </Link>
            <Link href="/auth/login" className="px-8 py-3 border border-white/20 hover:bg-white/10 rounded-lg text-lg transition">
              I&apos;m a Broker
            </Link>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="bg-navy-light py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid md:grid-cols-2 gap-12">
          <div className="p-8 rounded-2xl border border-white/10">
            <h3 className="text-gold font-semibold text-sm uppercase tracking-wider mb-3">Our Mission</h3>
            <p className="text-slate-300 leading-relaxed">
              To revolutionize freight logistics by empowering carriers with transparent, technology-driven tools
              for real-time performance insights, fair compensation, and growth opportunities through trust,
              innovation, and mutual success.
            </p>
          </div>
          <div className="p-8 rounded-2xl border border-white/10">
            <h3 className="text-gold font-semibold text-sm uppercase tracking-wider mb-3">Our Vision</h3>
            <p className="text-slate-300 leading-relaxed">
              To become North America&apos;s most trusted logistics platform where carriers thrive
              with the tools, transparency, and opportunities they deserve.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for Carriers, by Logistics Experts</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">Everything you need to grow your business on a single platform.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="p-6 rounded-2xl bg-navy-light border border-white/5 hover:border-gold/30 transition group">
                <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center mb-4 group-hover:bg-gold/20 transition">
                  <Icon className="w-6 h-6 text-gold" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tiers */}
      <section className="bg-navy-light py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Performance Tier System</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">Your performance unlocks better rates, faster payments, and bonus rewards.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiers.map((t) => (
              <div key={t.name} className="rounded-2xl border border-white/10 overflow-hidden">
                <div className={`${t.color} ${t.textColor} p-5 text-center`}>
                  <p className="font-bold text-xl">{t.name}</p>
                  <p className="text-sm opacity-80">Score: {t.score}</p>
                </div>
                <div className="p-5 space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 uppercase">Bonus</p>
                    <p className="text-2xl font-bold text-gold">{t.bonus}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase">Perks</p>
                    <p className="text-sm text-slate-300">{t.perks}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-24 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Join the Silk Route?</h2>
        <p className="text-slate-400 mb-8 max-w-xl mx-auto">
          Register in minutes. Get approved in hours. Start earning more today.
        </p>
        <Link href="/onboarding" className="inline-flex items-center gap-2 px-10 py-4 bg-gold text-navy font-bold rounded-lg hover:bg-gold-light text-lg transition">
          Start Your Application <ChevronRight className="w-5 h-5" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid sm:grid-cols-3 gap-8">
          <div>
            <span className="text-xl font-bold text-gold">SRL</span>
            <p className="text-sm text-slate-500 mt-2">Silk Route Logistics</p>
            <p className="text-sm text-slate-500">Empowering carriers nationwide.</p>
          </div>
          <div>
            <p className="font-semibold text-sm mb-3">Platform</p>
            <div className="space-y-2 text-sm text-slate-400">
              <p>Load Board</p><p>Carrier Dashboard</p><p>Invoice Factoring</p><p>API Integrations</p>
            </div>
          </div>
          <div>
            <p className="font-semibold text-sm mb-3">Company</p>
            <div className="space-y-2 text-sm text-slate-400">
              <p>About Us</p><p>Contact</p><p>Terms of Service</p><p>Privacy Policy</p>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 md:px-12 mt-8 pt-8 border-t border-white/5">
          <p className="text-sm text-slate-600 text-center">&copy; 2026 Silk Route Logistics. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
