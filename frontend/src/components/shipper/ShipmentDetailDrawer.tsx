"use client";

import { X, FileText, Download, MessageSquare } from "lucide-react";
import { ShipperBadge } from "./ShipperBadge";
import type { Shipment } from "./shipperData";

export function ShipmentDetailDrawer({
  shipment,
  onClose,
}: {
  shipment: Shipment;
  onClose: () => void;
}) {
  const progressBg =
    shipment.status === "At Risk"
      ? "bg-gradient-to-r from-emerald-500 to-red-500"
      : "bg-gradient-to-r from-emerald-500 to-blue-500";

  return (
    <div className="fixed top-0 right-0 bottom-0 w-[420px] bg-white shadow-[-8px_0_30px_rgba(13,27,42,0.15)] z-[200] overflow-y-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-serif text-xl text-[#0D1B2A]">Shipment Details</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>

      <div className="flex justify-between items-center mb-5">
        <span className="font-mono text-sm font-bold text-[#0D1B2A]">{shipment.id}</span>
        <ShipperBadge status={shipment.status} size="md" />
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-[11px] text-gray-400 mb-1.5">
          <span>{shipment.origin}</span>
          <span>{shipment.dest}</span>
        </div>
        <div className="bg-gray-200 rounded-md h-2 overflow-hidden">
          <div
            className={`h-full rounded-md transition-all duration-500 ${progressBg}`}
            style={{ width: `${shipment.progress}%` }}
          />
        </div>
      </div>

      {/* Detail rows */}
      {[
        ["Carrier", shipment.carrier],
        ["Equipment", shipment.equipment],
        ["Weight", shipment.weight],
        ["Distance", shipment.distance],
        ["Rate", `$${shipment.rate.toLocaleString()}`],
        ["Pickup", shipment.pickDate],
        ["Delivery", shipment.delDate],
        ["ETA", shipment.eta],
      ].map(([k, v]) => (
        <div key={k} className="flex justify-between py-2.5 border-b border-gray-100">
          <span className="text-[13px] text-gray-500">{k}</span>
          <span className={`text-[13px] font-semibold ${v === "Delayed" ? "text-red-500" : "text-[#0D1B2A]"}`}>{v}</span>
        </div>
      ))}

      <div className="mt-6 flex gap-2 flex-wrap">
        <button className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-[11px] font-semibold uppercase tracking-wider rounded">
          <FileText size={14} /> View BOL
        </button>
        <button className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/20 text-gray-500 text-[11px] font-semibold uppercase tracking-wider rounded hover:text-[#C9A84C] hover:border-[#C9A84C]">
          <Download size={14} /> Download POD
        </button>
        <button className="inline-flex items-center gap-1.5 px-4 py-2 text-gray-500 text-[11px] font-semibold uppercase tracking-wider rounded hover:text-[#C9A84C]">
          <MessageSquare size={14} /> Message Rep
        </button>
      </div>
    </div>
  );
}
