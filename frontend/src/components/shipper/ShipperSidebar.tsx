"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, FileText, Truck, MapPin, BarChart3, DollarSign,
  File, MessageSquare, Warehouse, Code, Settings, Menu, ArrowLeft,
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
  const [open, setOpen] = useState(true);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/shipper/dashboard") return pathname === "/shipper/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className="flex flex-col bg-[#0D1B2A] flex-shrink-0 transition-all duration-300 overflow-hidden"
      style={{ width: open ? 220 : 64 }}
    >
      {/* Logo */}
      <div className={`flex items-center gap-2.5 border-b border-[#C9A84C]/15 min-h-[56px] ${open ? "px-5 py-4" : "px-3 py-4"}`}>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C9A84C] to-[#A88535] flex items-center justify-center text-[13px] font-extrabold text-[#0D1B2A] flex-shrink-0">
          SR
        </div>
        {open && (
          <div>
            <div className="font-serif text-[13px] font-bold text-white whitespace-nowrap">SILK ROUTE</div>
            <div className="text-[7px] text-[#C9A84C] tracking-[2px]">SHIPPER PORTAL</div>
          </div>
        )}
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
              className={`flex items-center gap-3 rounded-lg mb-0.5 transition-all duration-150 ${
                open ? "px-3 py-2.5 justify-start" : "py-2.5 justify-center"
              } ${active ? "bg-[#C9A84C]/15" : "hover:bg-white/5"}`}
            >
              <Icon size={18} className={`flex-shrink-0 ${active ? "text-[#C9A84C]" : "text-gray-400"}`} />
              {open && (
                <span className={`text-[13px] whitespace-nowrap ${active ? "text-[#C9A84C] font-semibold" : "text-gray-400"}`}>
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Bottom controls */}
      <div className="py-3 px-2 border-t border-[#C9A84C]/10">
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-3 rounded-lg py-2 w-full ${open ? "px-3 justify-start" : "justify-center"} hover:bg-white/5`}
        >
          <Menu size={18} className="text-gray-400" />
          {open && <span className="text-xs text-gray-400">Collapse</span>}
        </button>
        <Link
          href="/shipper"
          className={`flex items-center gap-3 rounded-lg py-2 mt-0.5 ${open ? "px-3 justify-start" : "justify-center"} hover:bg-white/5`}
        >
          <ArrowLeft size={18} className="text-gray-400" />
          {open && <span className="text-xs text-gray-400">Back to Website</span>}
        </Link>
      </div>
    </aside>
  );
}
