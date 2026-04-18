"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { VersionFooter } from "@/components/ui/VersionFooter";

export type LoginVariant = "ae" | "carrier" | "shipper";

interface FeaturePill {
  icon: string;
  label: string;
}

interface Slide {
  label: string;
  text: string;
}

interface VariantConfig {
  featurePills: FeaturePill[];
  slides: Slide[];
}

const VARIANTS: Record<LoginVariant, VariantConfig> = {
  ae: {
    featurePills: [
      { icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7", label: "Load Management" },
      { icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z", label: "Carrier Network" },
      { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", label: "Compliance Engine" },
      { icon: "M13 10V3L4 14h7v7l9-11h-7z", label: "AI-Powered Ops" },
    ],
    slides: [
      { label: "COMMAND CENTER", text: "Full visibility into loads, carriers, and financials" },
      { label: "COMPASS COMPLIANCE", text: "35-check carrier vetting built for safety first" },
      { label: "MARCO POLO AI", text: "Intelligent automation for modern freight brokerage" },
    ],
  },
  carrier: {
    featurePills: [
      { icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7", label: "Load Board" },
      { icon: "M13 10V3L4 14h7v7l9-11h-7z", label: "QuickPay" },
      { icon: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", label: "Scorecard" },
      { icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z", label: "Self-Service" },
    ],
    slides: [
      { label: "PARTNER DASHBOARD", text: "Your loads, payments, and performance in one place" },
      { label: "PERFORMANCE SCORECARD", text: "Track your KPIs and climb the tier ladder" },
      { label: "QUICKPAY EXPRESS", text: "Get paid within 24 hours, no paperwork" },
    ],
  },
  shipper: {
    featurePills: [
      { icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z", label: "Live Tracking" },
      { icon: "M13 10V3L4 14h7v7l9-11h-7z", label: "Instant Quotes" },
      { icon: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4", label: "Document Vault" },
      { icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", label: "Analytics" },
    ],
    slides: [
      { label: "REAL-TIME TRACKING", text: "Know exactly where your freight is, always" },
      { label: "SMART QUOTING", text: "Get competitive rates in seconds, not hours" },
      { label: "WHITE GLOVE SERVICE", text: "Dedicated account team for your success" },
    ],
  },
};

const INSIGHTS = [
  { cat: "INDUSTRY FACT", text: "The US trucking industry moves 72.6% of all freight by weight, generating $940 billion annually.", src: "American Trucking Associations, 2025" },
  { cat: "MOTIVATION", text: "The Silk Road connected civilizations across 4,000 miles. We connect commerce across North America \u2014 one load at a time.", src: "Silk Route Logistics" },
  { cat: "OPERATIONS TIP", text: "Brokerages using automated carrier vetting reduce fraud exposure by 60% and onboard 3x faster.", src: "Transport Topics" },
  { cat: "DID YOU KNOW", text: "The average truck driver covers 100,000+ miles per year \u2014 that\u2019s circling the Earth four times.", src: "FMCSA" },
  { cat: "SRL VISION", text: "Every load moved is a connection made. Trust, transparency, and technology \u2014 the three pillars of modern brokerage.", src: "Silk Route Logistics" },
  { cat: "MARKET INSIGHT", text: "Digital freight brokerages now handle 8% of US truckload volume, up from 2% in 2020.", src: "FreightWaves Research" },
];

function useDailyInsight() {
  return useMemo(() => {
    const day = Math.floor(Date.now() / 86_400_000);
    return INSIGHTS[day % INSIGHTS.length];
  }, []);
}

export function LoginBrandPanel({ variant }: { variant: LoginVariant }) {
  const { featurePills, slides } = VARIANTS[variant];
  const insight = useDailyInsight();
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrentSlide((s) => (s + 1) % slides.length), 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  return (
    <div
      className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col items-center justify-center"
      style={{ background: "linear-gradient(165deg, #1b3a5e 0%, #224870 40%, #285280 70%, #1e4060 100%)" }}
    >
      {/* Map + animated dots */}
      <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice">
        <path
          d="M120,180 L180,140 L240,130 L300,120 L350,115 L400,110 L460,120 L520,130 L580,110 L640,120 L700,130 L720,160 L710,200 L700,240 L690,280 L680,320 L650,340 L600,350 L550,360 L500,370 L450,360 L400,350 L350,340 L300,330 L250,320 L200,300 L160,270 L140,230 Z"
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1"
        />
        {[
          [280, 200], [350, 250], [420, 280], [500, 300], [600, 250], [650, 200],
          [550, 180], [200, 220], [480, 150], [380, 320], [300, 300], [520, 350],
          [180, 160], [620, 320], [450, 100], [680, 150], [350, 180], [240, 280],
          [150, 300], [100, 350], [250, 350],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="3" fill="rgba(255,255,255,0.5)" />
            <circle cx={x} cy={y} r="5" fill="none" stroke="rgba(201,168,76,0.3)" strokeWidth="1">
              <animate attributeName="r" values="3;8;3" dur={`${3 + (i % 3)}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0;0.5" dur={`${3 + (i % 3)}s`} repeatCount="indefinite" />
            </circle>
          </g>
        ))}
        <circle r="4" fill="#C9A84C" opacity="0.8">
          <animateMotion dur="12s" repeatCount="indefinite" path="M200,220 L280,200 L350,250 L420,280 L500,300 L600,250 L650,200" />
        </circle>
      </svg>

      <div className="relative z-10 flex flex-col items-start w-full max-w-[480px] px-12">
        <div className="mb-8">
          <Link href="/" aria-label="Silk Route Logistics home" style={{ display: "inline-block", lineHeight: 0 }}>
            <Logo size="lg" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-8 w-full max-w-[360px]">
          {featurePills.map((f) => (
            <div
              key={f.label}
              className="flex items-center justify-center gap-1.5 border border-white/25 text-white bg-white/10 rounded-lg px-3 py-2.5 text-xs font-medium cursor-default"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={f.icon} />
              </svg>
              {f.label}
            </div>
          ))}
        </div>

        <div className="relative w-full h-[150px] mb-6">
          <div className="absolute -right-2 -bottom-2 w-full h-full bg-white/10 rounded-2xl" />
          {slides.map((slide, i) => (
            <div
              key={i}
              className="absolute inset-0 bg-white rounded-2xl p-8 transition-opacity duration-[1200ms]"
              style={{ opacity: currentSlide === i ? 1 : 0, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
            >
              <div className="text-[#8B7428] text-xs tracking-[3px] uppercase font-bold">{slide.label}</div>
              <p className="text-[#1A1714] text-lg font-normal leading-relaxed mt-3">{slide.text}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-8">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentSlide(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`rounded-full transition-all duration-500 border-none cursor-pointer ${
                currentSlide === i ? "w-5 h-2 bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]" : "w-2 h-2 bg-white/30"
              }`}
            />
          ))}
        </div>

        <div className="relative pl-5 max-w-[440px]">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#C9A84C] to-[#C9A84C]/30 rounded-full" />
          <div className="text-[#E8D48B] text-[11px] tracking-[2px] uppercase font-semibold mb-2">{insight.cat}</div>
          <p className="text-white text-[16px] italic leading-relaxed m-0">{insight.text}</p>
          <p className="text-white/70 text-[13px] mt-2 m-0">&mdash; {insight.src}</p>
        </div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 flex justify-center">
        <VersionFooter className="text-[9px] text-[#2a4a60]" />
      </div>
    </div>
  );
}
