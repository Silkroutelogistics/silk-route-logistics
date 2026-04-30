"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, FileText, Truck, MapPin, BarChart3, DollarSign,
  File, MessageSquare, Warehouse, Code, Settings, Menu, ArrowLeft, X,
} from "lucide-react";

const navItems = [
  { id: "overview", href: "/shipper/dashboard", icon: Home, label: "Dashboard" },
  { id: "quote", href: "/shipper/dashboard/quote", icon: FileText, label: "Get a Quote" },
  { id: "shipments", href: "/shipper/dashboard/shipments", icon: Truck, label: "Shipments" },
  { id: "tracking", href: "/shipper/dashboard/tracking", icon: MapPin, label: "Live Tracking" },
  { id: "analytics", href: "/shipper/dashboard/analytics", icon: BarChart3, label: "Analytics" },
  { id: "invoices", href: "/shipper/dashboard/invoices", icon: DollarSign, label: "Invoicing" },
  { id: "documents", href: "/shipper/dashboard/documents", icon: File, label: "Documents" },
  { id: "messages", href: "/shipper/dashboard/messages", icon: MessageSquare, label: "Messages" },
  { id: "facilities", href: "/shipper/dashboard/facilities", icon: Warehouse, label: "Facilities" },
  { id: "integrations", href: "/shipper/dashboard/integrations", icon: Code, label: "API / EDI" },
  { id: "settings", href: "/shipper/dashboard/settings", icon: Settings, label: "Settings" },
];

export function ShipperSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/shipper/dashboard") return pathname === "/shipper/dashboard";
    return pathname.startsWith(href);
  };

  // Close sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-[#C9A84C]/15 min-h-[56px] px-5 py-4">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C9A84C] to-[#A88535] flex items-center justify-center text-[13px] font-extrabold text-[#0F1117] flex-shrink-0">
          SR
        </div>
        <div>
          <div className="font-serif text-[13px] font-bold text-white whitespace-nowrap">SILK ROUTE</div>
          <div className="text-[7px] text-[#C9A84C] tracking-[2px]">SHIPPER PORTAL</div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 py-3 px-2 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg mb-0.5 transition-all duration-150 px-3 py-2.5 justify-start ${
                active ? "bg-[#C9A84C]/15" : "hover:bg-white/5"
              }`}
            >
              <Icon size={18} className={`flex-shrink-0 ${active ? "text-[#C9A84C]" : "text-gray-400"}`} />
              <span className={`text-[13px] whitespace-nowrap ${active ? "text-[#C9A84C] font-semibold" : "text-gray-400"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Bottom controls */}
      <div className="py-3 px-2 border-t border-[#C9A84C]/10">
        {/* v3.8.e.2 — link target was /shipper (the divergent legacy
            shipper-prospect landing) which surprised authenticated
            shippers expecting to return to the public marketing site.
            Mirroring the CarrierSidebar pattern: "Back to Website"
            means the homepage. The /shipper page divergence itself
            stays logged under Phase 6 — Portal + Public Page Visual
            Alignment for separate cleanup. */}
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg py-2 mt-0.5 px-3 justify-start hover:bg-white/5"
        >
          <ArrowLeft size={18} className="text-gray-400" />
          <span className="text-xs text-gray-400">Back to Website</span>
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[#0F1117] border-b border-[#C9A84C]/15 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#C9A84C] to-[#A88535] flex items-center justify-center text-[11px] font-extrabold text-[#0F1117]">
            SR
          </div>
          <span className="font-serif text-[12px] font-bold text-white">SILK ROUTE</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition"
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

      {/* Sidebar */}
      <aside
        className={`w-[220px] bg-[#080C18] flex flex-col h-screen flex-shrink-0 transition-transform duration-200 fixed lg:sticky top-0 z-50 lg:z-auto ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Spacer for mobile top bar */}
      <div className="lg:hidden h-14 shrink-0" />
    </>
  );
}
