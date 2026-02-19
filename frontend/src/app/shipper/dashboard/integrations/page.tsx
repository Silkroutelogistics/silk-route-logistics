"use client";

import { Code, RefreshCw, FileText, MessageSquare } from "lucide-react";
import { ShipperCard } from "@/components/shipper";

const ediCodes = [
  { code: "EDI 204", desc: "Motor Carrier Load Tender" },
  { code: "EDI 214", desc: "Shipment Status Updates" },
  { code: "EDI 210", desc: "Freight Details & Invoice" },
  { code: "EDI 990", desc: "Response to Load Tender" },
];

export default function ShipperIntegrationsPage() {
  return (
    <div>
      <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">API &amp; EDI Integration</h1>
      <p className="text-[13px] text-gray-500 mb-6">Connect your TMS or ERP to automate freight shipment management</p>

      <div className="grid grid-cols-2 gap-5">
        {/* REST API */}
        <ShipperCard padding="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-[10px] bg-blue-500/10 flex items-center justify-center">
              <Code size={22} className="text-blue-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0D1B2A]">REST API</h3>
              <div className="text-xs text-gray-400">v2.0 · JSON over HTTPS</div>
            </div>
          </div>
          <div className="font-mono text-xs bg-[#0D1B2A] text-gray-300 p-4 rounded-lg mb-4 leading-relaxed">
            <span className="text-[#C9A84C]">GET</span> /api/v2/shipments<br/>
            <span className="text-[#C9A84C]">POST</span> /api/v2/quotes<br/>
            <span className="text-[#C9A84C]">GET</span> /api/v2/tracking/{"{"}
            <span className="text-emerald-400">id</span>
            {"}"}<br/>
            <span className="text-[#C9A84C]">GET</span> /api/v2/invoices<br/>
            <span className="text-[#C9A84C]">POST</span> /api/v2/documents<br/>
            <span className="text-gray-500">{"// api.silkroutelogistics.ai"}</span>
          </div>
          <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-500 text-[11px] font-semibold uppercase tracking-[2px] rounded hover:text-[#C9A84C] hover:border-[#C9A84C] transition-colors">
            <FileText size={14} /> View API Documentation
          </button>
        </ShipperCard>

        {/* EDI */}
        <ShipperCard padding="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-md bg-violet-500/10 flex items-center justify-center">
              <RefreshCw size={22} className="text-violet-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0D1B2A]">EDI Integration</h3>
              <div className="text-xs text-gray-400">ANSI X12 Standards</div>
            </div>
          </div>
          {ediCodes.map((e, i) => (
            <div key={i} className={`flex justify-between py-2.5 ${i < ediCodes.length - 1 ? "border-b border-gray-100" : ""}`}>
              <span className="font-mono text-xs font-semibold text-[#0D1B2A]">{e.code}</span>
              <span className="text-xs text-gray-500">{e.desc}</span>
            </div>
          ))}
          <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 mt-4 border border-gray-200 text-gray-500 text-[11px] font-semibold uppercase tracking-[2px] rounded hover:text-[#C9A84C] hover:border-[#C9A84C] transition-colors">
            <MessageSquare size={14} /> Contact for EDI Setup
          </button>
        </ShipperCard>
      </div>

      {/* API Credentials */}
      <ShipperCard padding="p-5" className="mt-5">
        <h3 className="text-sm font-bold text-[#0D1B2A] mb-1">Your API Credentials</h3>
        <p className="text-xs text-gray-400 mb-4">Use these to authenticate your freight management integration</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] font-semibold text-gray-500 mb-1">API Key</div>
            <div className="font-mono text-xs bg-gray-50 px-3.5 py-2.5 rounded-md text-gray-600">srl_live_sk_••••••••••••••••</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-gray-500 mb-1">Webhook URL</div>
            <div className="font-mono text-xs bg-gray-50 px-3.5 py-2.5 rounded-md text-gray-600">https://your-tms.com/webhooks/srl</div>
          </div>
        </div>
      </ShipperCard>
    </div>
  );
}
