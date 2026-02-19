"use client";

import { ShipperCard, QuoteForm } from "@/components/shipper";

export default function ShipperQuotePage() {
  return (
    <div>
      <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">Request a Freight Quote</h1>
      <p className="text-[13px] text-gray-500 mb-6">Fill in your shipment details and receive competitive truckload rates within minutes.</p>
      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <ShipperCard padding="p-7">
          <QuoteForm />
        </ShipperCard>
        <div>
          <ShipperCard padding="p-5" className="mb-4">
            <h4 className="text-[13px] font-bold text-[#0D1B2A] mb-3">Quick Templates</h4>
            {[
              { name: "Kalamazoo → Chicago (Weekly)", equip: "Dry Van" },
              { name: "Detroit → Indianapolis", equip: "Reefer" },
            ].map((t, i) => (
              <div key={i} className="p-3 rounded-md border border-gray-200 cursor-pointer mb-2 hover:border-[#C9A84C]/30 transition-colors">
                <div className="text-xs font-semibold text-[#0D1B2A]">{t.name}</div>
                <div className="text-[11px] text-gray-400">{t.equip}</div>
              </div>
            ))}
          </ShipperCard>
          <ShipperCard padding="p-5" className="!bg-[#0D1B2A] !border-transparent">
            <h4 className="text-[13px] font-bold text-[#C9A84C] mb-3">Market Rate Insight</h4>
            <div className="text-xs text-gray-300 leading-relaxed">
              Midwest dry van spot rates are trending <span className="text-emerald-400 font-semibold">↑ 3.2%</span> this week. Reefer capacity tightening on MI→IL lanes.
            </div>
            <div className="mt-3 text-[11px] text-gray-400">
              Source: DAT RateView · Updated 2h ago
            </div>
          </ShipperCard>
        </div>
      </div>
    </div>
  );
}
