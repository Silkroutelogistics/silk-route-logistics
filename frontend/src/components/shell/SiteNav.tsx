"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { siteChrome } from "@/lib/site-chrome";

interface SiteNavProps {
  theme?: "dark" | "light";
}

export function SiteNav({ theme = "dark" }: SiteNavProps) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLoginOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isDark = theme === "dark";
  const navBg = isDark ? "bg-[#0F1117]/90 backdrop-blur border-b border-white/5" : "bg-white border-b border-slate-200";
  const linkText = isDark ? "text-white/70 hover:text-white" : "text-slate-700 hover:text-slate-900";
  const primaryBtn = "bg-gradient-to-r from-[#C9A84C] to-[#d4b85e] text-[#0F1117] shadow-[0_2px_8px_rgba(201,168,76,0.25)]";

  return (
    <nav className={`${navBg} sticky top-0 z-40`}>
      <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 no-underline" aria-label={`${siteChrome.company} Home`}>
          <img src="/logo.png" alt="SRL" style={{ height: 32, width: "auto", borderRadius: 4 }} />
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {siteChrome.navItems.map((item) => (
            <Link key={item.href} href={item.href} className={`text-[14px] ${linkText}`}>{item.label}</Link>
          ))}
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setLoginOpen((v) => !v)}
              aria-haspopup="true"
              aria-expanded={loginOpen}
              className={`text-[14px] font-medium px-4 py-2 rounded-lg ${primaryBtn}`}
            >
              Sign In ▾
            </button>
            {loginOpen && (
              <div role="menu" className="absolute right-0 top-full mt-2 min-w-[200px] bg-white rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.15)] py-1.5 border border-slate-200">
                {siteChrome.loginDropdown.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setLoginOpen(false)}
                    className="block px-4 py-2 text-[13px] text-slate-700 hover:bg-slate-50"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          className={`md:hidden p-2 ${linkText}`}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-white/5 px-6 py-4 space-y-2">
          {siteChrome.navItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`block py-2 text-[14px] ${linkText}`}>{item.label}</Link>
          ))}
          <div className="pt-3 mt-3 border-t border-white/5">
            <p className={`text-[11px] uppercase tracking-wider mb-2 ${isDark ? "text-white/40" : "text-slate-400"}`}>Sign in</p>
            {siteChrome.loginDropdown.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`block py-2 text-[14px] ${linkText}`}>{item.label}</Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
