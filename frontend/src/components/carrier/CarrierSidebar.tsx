"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Package, Truck, Shield, DollarSign, FileText, MessageSquare, Settings, ChevronLeft, ChevronRight, ExternalLink,
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
  const [open, setOpen] = useState(true);
  const pathname = usePathname();

  return (
    <aside
      className="h-screen flex flex-col bg-[#0D1B2A] border-r border-white/5 transition-all duration-300 flex-shrink-0"
      style={{ width: open ? 220 : 64 }}
    >
      {/* Logo */}
      <div className={`flex items-center gap-2.5 px-4 h-14 border-b border-white/5 ${open ? "" : "justify-center"}`}>
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#C9A84C] to-[#A88535] flex items-center justify-center text-[#0D1B2A] text-[11px] font-black tracking-tight">
          SR
        </div>
        {open && (
          <div>
            <div className="text-[11px] font-bold text-white tracking-[2px]">SILK ROUTE</div>
            <div className="text-[9px] text-[#C9A84C] tracking-[3px] -mt-0.5">CARRIER PORTAL</div>
          </div>
        )}
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
                } ${!open ? "justify-center" : ""}`}
              >
                <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                {open && <span>{item.label}</span>}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-3 space-y-1">
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-gray-500 hover:bg-white/5 hover:text-gray-300 text-[13px] w-full ${
            !open ? "justify-center" : ""
          }`}
        >
          {open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          {open && <span>Collapse</span>}
        </button>
        <Link href="/" className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-gray-500 hover:bg-white/5 hover:text-gray-300 text-[13px] ${!open ? "justify-center" : ""}`}>
          <ExternalLink size={16} />
          {open && <span>Back to Website</span>}
        </Link>
      </div>
    </aside>
  );
}
