"use client";

import { useEffect, useState } from "react";
import { Warehouse, Package, Truck, MapPin, Building2 } from "lucide-react";
import { splashQuotes } from "@/data/splashQuotes";
import { getTodaysQuote } from "@/lib/splashUtils";
import { Logo } from "@/components/ui/Logo";
import "./LoginSplash.css";

interface LoginSplashProps {
  userRole: string;
  firstName: string;
  onComplete: () => void;
  duration?: number;
}

const CITIES = [
  { name: "Seattle", x: 100, y: 115 },
  { name: "Chicago", x: 540, y: 155 },
  { name: "Kalamazoo", x: 560, y: 165 },
  { name: "Dallas", x: 420, y: 310 },
  { name: "Atlanta", x: 600, y: 280 },
  { name: "LA", x: 115, y: 260 },
  { name: "Toronto", x: 620, y: 110 },
];

const PIPELINE = [
  { icon: Warehouse, label: "Warehouse" },
  { icon: Package, label: "Package" },
  { icon: Truck, label: "In Transit" },
  { icon: MapPin, label: "Destination" },
  { icon: Building2, label: "Delivered" },
];

export default function LoginSplash({
  userRole,
  firstName,
  onComplete,
  duration = 3500,
}: LoginSplashProps) {
  const [fadingOut, setFadingOut] = useState(false);

  const isCarrier = ["CARRIER", "OWNER_OPERATOR"].includes(userRole);
  const audience = isCarrier ? "carrier" : "employee";
  const quote = getTodaysQuote(splashQuotes, audience);

  const typeLabel =
    quote.type === "quote"
      ? "Quote of the Day"
      : quote.type === "fact"
        ? "Industry Fact"
        : quote.type === "trivia"
          ? "Did You Know?"
          : "Logistics Humor";

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingOut(true), duration - 400);
    const completeTimer = setTimeout(onComplete, duration);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [duration, onComplete]);

  return (
    <div className={`splash-container ${fadingOut ? "fade-out" : ""}`}>
      {/* ── SVG Background: US/Canada outline + route ──── */}
      <div className="absolute inset-0 flex items-center justify-center opacity-30">
        <svg
          viewBox="0 0 900 450"
          className="w-full max-w-5xl h-auto"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Simplified US outline */}
          <path
            d="M80,120 L120,100 L200,95 L280,90 L350,85 L420,80 L500,85 L580,90 L650,95 L720,105 L780,120 L800,140 L810,170 L800,200 L780,230 L750,260 L720,280 L680,300 L640,310 L600,320 L550,330 L500,335 L450,330 L400,325 L350,320 L300,310 L250,300 L200,290 L150,270 L120,250 L100,220 L85,190 L80,160 Z"
            stroke="rgba(212,165,116,0.3)"
            strokeWidth="1.5"
            fill="rgba(212,165,116,0.03)"
          />
          {/* Canada outline hint */}
          <path
            d="M100,120 L150,80 L250,60 L350,50 L450,45 L550,50 L650,60 L720,75 L780,100"
            stroke="rgba(212,165,116,0.15)"
            strokeWidth="1"
            fill="none"
          />
          {/* Animated route line */}
          <path
            className="splash-route-line"
            d="M100,215 C200,180 350,200 420,190 C500,175 540,160 560,165 C600,170 650,200 700,180 L780,150"
            stroke="#d4a574"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          {/* City dots */}
          {CITIES.map((city) => (
            <g key={city.name} className="splash-city-dot">
              <circle cx={city.x} cy={city.y} r="4" fill="#d4a574" />
              <circle
                cx={city.x}
                cy={city.y}
                r="7"
                fill="none"
                stroke="#d4a574"
                strokeWidth="1"
                opacity="0.4"
              />
              <text
                x={city.x}
                y={city.y - 12}
                textAnchor="middle"
                fill="rgba(212,165,116,0.6)"
                fontSize="10"
                fontFamily="system-ui"
              >
                {city.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* ── Truck icon moving along route ─────────────── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-full max-w-5xl" style={{ aspectRatio: "900/450" }}>
          <div className="splash-truck">
            <Truck className="w-6 h-6 text-[#d4a574]" />
          </div>
        </div>
      </div>

      {/* ── Foreground content ────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-2xl">
        {/* Logo */}
        <div className="splash-logo mb-6">
          <Logo size="lg" />
        </div>

        {/* Welcome */}
        <h1 className="splash-welcome text-2xl md:text-3xl font-bold text-white mb-2"
            style={{ animationDelay: "0.3s" }}>
          Welcome back, {firstName}
        </h1>

        <p className="splash-welcome text-sm text-slate-400 mb-8"
           style={{ animationDelay: "0.5s", opacity: 0 }}>
          {isCarrier ? "Carrier Portal" : "Silk Route Logistics"}
        </p>

        {/* Quote */}
        <div className="splash-quote mb-2" style={{ animationDelay: "0.9s" }}>
          <p className="text-xs uppercase tracking-widest text-[#d4a574] font-semibold mb-3">
            {typeLabel}
          </p>
        </div>

        <div className="splash-quote max-w-lg" style={{ animationDelay: "1.1s" }}>
          <p className="text-base md:text-lg text-slate-200 leading-relaxed italic">
            &ldquo;{quote.text}&rdquo;
          </p>
          {quote.author && (
            <p className="text-sm text-[#d4a574] mt-2">
              &mdash; {quote.author}
            </p>
          )}
        </div>
      </div>

      {/* ── Supply Chain Pipeline ─────────────────────── */}
      <div className="relative z-10 mt-12 flex items-center gap-0 px-6">
        {PIPELINE.map((node, i) => {
          const Icon = node.icon;
          return (
            <div key={node.label} className="flex items-center">
              {i > 0 && (
                <div
                  className="splash-pipeline-line w-8 md:w-14"
                  style={{ animationDelay: `${0.4 + i * 0.5 - 0.25}s` }}
                />
              )}
              <div
                className="splash-pipeline-node active flex flex-col items-center gap-1.5"
                style={{ animationDelay: `${0.4 + i * 0.5}s` }}
              >
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/5 border border-[#d4a574]/30 flex items-center justify-center">
                  <Icon className="w-5 h-5 md:w-6 md:h-6 text-[#d4a574]" />
                </div>
                <span className="text-[10px] md:text-xs text-slate-500 whitespace-nowrap">
                  {node.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Progress Bar ─────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0">
        <div className="splash-progress-bar" />
      </div>
    </div>
  );
}
