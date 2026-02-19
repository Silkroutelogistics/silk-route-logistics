"use client";

import { Plus } from "lucide-react";
import { ShipperCard } from "@/components/shipper";

const facilities = [
  { name: "Kalamazoo Distribution Center", addr: "1234 Industrial Pkwy, Kalamazoo, MI 49001", type: "Origin", hours: "M-F 6AM-6PM", dock: "4 docks, 2 ramps", contact: "Jim K. · (269) 555-0101" },
  { name: "Chicago Cross-Dock", addr: "5678 Logistics Dr, Chicago, IL 60601", type: "Destination", hours: "M-Sat 5AM-10PM", dock: "12 docks", contact: "Maria R. · (312) 555-0202" },
  { name: "Detroit Warehouse", addr: "910 Commerce Blvd, Detroit, MI 48201", type: "Both", hours: "24/7", dock: "8 docks, 3 ramps", contact: "Dave L. · (313) 555-0303" },
];

const typeColors: Record<string, { bg: string; text: string }> = {
  Origin: { bg: "bg-blue-500/10", text: "text-blue-500" },
  Destination: { bg: "bg-emerald-500/10", text: "text-emerald-500" },
  Both: { bg: "bg-violet-500/10", text: "text-violet-500" },
};

export default function ShipperFacilitiesPage() {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">Shipping Facilities Management</h1>
          <p className="text-[13px] text-gray-500">Manage your pickup, delivery, and warehouse locations</p>
        </div>
        <button className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-[11px] font-semibold uppercase tracking-[2px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)]">
          <Plus size={14} /> Add Facility
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {facilities.map((f, i) => {
          const tc = typeColors[f.type] || typeColors.Both;
          return (
            <ShipperCard key={i} hover padding="p-5">
              <div className="flex justify-between mb-3">
                <h3 className="text-[15px] font-bold text-[#0D1B2A]">{f.name}</h3>
                <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-xl ${tc.bg} ${tc.text}`}>{f.type}</span>
              </div>
              {[
                ["Address", f.addr],
                ["Hours", f.hours],
                ["Dock Info", f.dock],
                ["Contact", f.contact],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b border-gray-50">
                  <span className="text-xs text-gray-400">{k}</span>
                  <span className="text-xs text-gray-700 font-medium text-right max-w-[60%]">{v}</span>
                </div>
              ))}
            </ShipperCard>
          );
        })}
      </div>
    </div>
  );
}
