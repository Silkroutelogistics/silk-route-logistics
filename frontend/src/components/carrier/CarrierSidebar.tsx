"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Package, Send, Truck, Users, GraduationCap, Shield, DollarSign, FileText, MessageSquare, Settings, ExternalLink, Menu, X, History, Lock } from "lucide-react";
import { lockedFeatureForPath } from "@/lib/carrierPortalFeatures";

// Sprint 52.hotfix.b — Tenders nav entry added at position 3 between
// Available Loads and My Loads. Reflects workflow: scout available loads
// → review pending tenders (action required) → check active booked loads.
// Page wired to /api/carrier/tenders (LoadTender consumer) per Sprint
// 52.hotfix.b — see frontend/src/app/carrier/dashboard/tenders/page.tsx.
// Exported so the welcome tour can be checked against what the sidebar offers (M3).
export const CARRIER_NAV = [
  { id: "overview", href: "/carrier/dashboard", icon: Home, label: "Dashboard" },
  { id: "available", href: "/carrier/dashboard/available-loads", icon: Package, label: "Available Loads" },
  { id: "tenders", href: "/carrier/dashboard/tenders", icon: Send, label: "Tenders" },
  // v3.8.axr — what happened to everything else. The portal showed only live
  // offers, so a load lost to a faster carrier simply vanished from the
  // carrier's view. It sits next to Tenders because it answers the question
  // the Tenders page raises and cannot answer.
  { id: "tender-history", href: "/carrier/dashboard/tender-history", icon: History, label: "History" },
  { id: "myloads", href: "/carrier/dashboard/my-loads", icon: Truck, label: "My Loads" },
  // v3.8.amw — Driver Academy T1: roster entry between operational loads
  // and compliance (drivers are the people side of compliance).
  { id: "drivers", href: "/carrier/dashboard/drivers", icon: Users, label: "Drivers" },
  // v3.8.anc — Driver Academy T5: training completion dashboard.
  { id: "training", href: "/carrier/dashboard/training", icon: GraduationCap, label: "Training" },
  { id: "compliance", href: "/carrier/dashboard/compliance", icon: Shield, label: "Compliance" },
  { id: "payments", href: "/carrier/dashboard/payments", icon: DollarSign, label: "Payments" },
  { id: "documents", href: "/carrier/dashboard/documents", icon: FileText, label: "Documents" },
  { id: "messaging", href: "/carrier/dashboard/messaging", icon: MessageSquare, label: "Messages" },
  { id: "settings", href: "/carrier/dashboard/settings", icon: Settings, label: "Settings" },
];

export function CarrierSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // M1 — which locked nav item has its reason open (tap shows it; there is no hover on a phone).
  const [lockedOpen, setLockedOpen] = useState<string | null>(null);

  // Close sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-[#15365A]">
        <div className="w-8 h-8 rounded-md bg-[#C5A572] flex items-center justify-center text-[#0A2540] text-[11px] font-black tracking-tight">
          SR
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#FBF7F0] tracking-[2px]">SILK ROUTE</div>
          <div className="text-[9px] text-[#C5A572] tracking-[3px] -mt-0.5">CARRIER PORTAL</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {CARRIER_NAV.map((item) => {
          const active = pathname === item.href || (item.id !== "overview" && pathname.startsWith(item.href));
          const locked = lockedFeatureForPath(item.href);
          if (locked) {
            // M1 — locked: shown, explained, never a link. The layout also sends
            // anyone who types the URL back to the Dashboard.
            return (
              <div key={item.id}>
                <button
                  type="button"
                  aria-disabled="true"
                  aria-expanded={lockedOpen === item.id}
                  aria-label={`${item.label}: Available soon. ${locked.reason}`}
                  title={locked.reason}
                  onClick={() => setLockedOpen((o) => (o === item.id ? null : item.id))}
                  className="w-full flex items-center gap-2.5 px-2.5 min-h-[44px] rounded-md text-[13px] font-medium text-[#8AA5C0] cursor-not-allowed transition-colors duration-150 motion-reduce:transition-none hover:bg-[#FBF7F0]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A572]"
                >
                  <item.icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  <span>{item.label}</span>
                  <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[#C9D2DE]"><Lock size={11} aria-hidden="true" /> Soon</span>
                </button>
                {lockedOpen === item.id && <p className="px-2.5 pb-2 text-[11px] leading-snug text-[#C9D2DE]">{locked.reason}</p>}
              </div>
            );
          }
          return (
            <Link key={item.id} href={item.href} aria-current={active ? "page" : undefined} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A572]">
              <div
                className={`flex items-center gap-2.5 px-2.5 min-h-[44px] rounded-md text-[13px] font-medium transition-colors duration-150 motion-reduce:transition-none ${
                  active
                    ? "bg-[#C5A572]/15 text-[#DAC39C]"
                    : "text-[#C9D2DE] hover:bg-[#FBF7F0]/5 hover:text-[#FBF7F0]"
                }`}
              >
                <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-3 space-y-1">
        <Link href="/" className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[#8AA5C0] hover:bg-[#FBF7F0]/5 hover:text-[#FBF7F0] text-[13px]">
          <ExternalLink size={16} />
          <span>Back to Website</span>
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[#0A2540] border-b border-[#15365A] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[#C5A572] flex items-center justify-center text-[#0A2540] text-[10px] font-black tracking-tight">
            SR
          </div>
          <span className="text-[11px] font-bold text-[#FBF7F0] tracking-[2px]">SILK ROUTE</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="inline-flex h-11 w-11 items-center justify-center text-[#FBF7F0]/80 hover:text-[#FBF7F0] hover:bg-[#FBF7F0]/5 rounded-lg transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A572]"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — explicit canonical navy rail (div, not <aside>, to escape
          the globals.css [data-mode="light"] aside warm-stone !important remap) */}
      <div
        role="navigation"
        aria-label="Carrier portal"
        className={`w-[220px] bg-[#0A2540] border-r border-[#15365A] flex flex-col h-screen flex-shrink-0 transition-transform duration-200 fixed lg:sticky top-0 z-50 lg:z-auto ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {sidebarContent}
      </div>

      {/* Spacer for mobile top bar */}
      <div className="lg:hidden h-14 shrink-0" />
    </>
  );
}
