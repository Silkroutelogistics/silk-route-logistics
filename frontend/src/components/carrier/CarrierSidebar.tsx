"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Package, Truck, Shield, DollarSign, FileText, MessageSquare, Settings, ExternalLink, Menu, X,
} from "lucide-react";

const nav = [
  { id: "overview", href: "/carrier/dashboard", icon: Home, label: "Dashboard" },
  { id: "available", href: "/carrier/dashboard/available-loads", icon: Package, label: "Available Loads" },
  { id: "myloads", href: "/carrier/dashboard/my-loads", icon: Truck, label: "My Loads" },
  { id: "compliance", href: "/carrier/dashboard/compliance", icon: Shield, label: "Compliance" },
  { id: "payments", href: "/carrier/dashboard/payments", icon: DollarSign, label: "Payments" },
  { id: "documents", href: "/carrier/dashboard/documents", icon: FileText, label: "Documents" },
  { id: "messaging", href: "/carrier/dashboard/messaging", icon: MessageSquare, label: "Messages" },
  { id: "settings", href: "/carrier/dashboard/settings", icon: Settings, label: "Settings" },
];

export function CarrierSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-white/5">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#C9A84C] to-[#A88535] flex items-center justify-center text-[#1a1a2e] text-[11px] font-black tracking-tight">
          SR
        </div>
        <div>
          <div className="text-[11px] font-bold text-white tracking-[2px]">SILK ROUTE</div>
          <div className="text-[9px] text-[#C9A84C] tracking-[3px] -mt-0.5">CARRIER PORTAL</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {nav.map((item) => {
          const active = pathname === item.href || (item.id !== "overview" && pathname.startsWith(item.href));
          return (
            <Link key={item.id} href={item.href}>
              <div
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-[#C9A84C]/10 text-[#C9A84C]"
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
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
        <Link href="/" className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-gray-500 hover:bg-white/5 hover:text-gray-300 text-[13px]">
          <ExternalLink size={16} />
          <span>Back to Website</span>
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[#1a1a2e] border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#C9A84C] to-[#A88535] flex items-center justify-center text-[#1a1a2e] text-[10px] font-black tracking-tight">
            SR
          </div>
          <span className="text-[11px] font-bold text-white tracking-[2px]">SILK ROUTE</span>
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
        className={`w-[220px] bg-[#1a1a2e] border-r border-white/5 flex flex-col h-screen flex-shrink-0 transition-transform duration-200 fixed lg:sticky top-0 z-50 lg:z-auto ${
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
