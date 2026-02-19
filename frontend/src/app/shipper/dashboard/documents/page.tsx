"use client";

import { File, Check, FileText, Shield, Download, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ShipperCard } from "@/components/shipper";
import type { DocumentsResponse } from "@/components/shipper/shipperData";

const iconMap: Record<string, { icon: typeof File; color: string; bg: string }> = {
  BOL: { icon: File, color: "text-blue-500", bg: "bg-blue-500/10" },
  POD: { icon: Check, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  RATE_CON: { icon: FileText, color: "text-violet-500", bg: "bg-violet-500/10" },
  CLAIM: { icon: Shield, color: "text-amber-500", bg: "bg-amber-500/10" },
};
const defaultIcon = { icon: File, color: "text-gray-500", bg: "bg-gray-500/10" };

const typeLabels: Record<string, string> = {
  BOL: "BOL", POD: "POD", RATE_CON: "Rate Conf", CLAIM: "Claims", OTHER: "Other",
  W9: "W9", COI: "COI", AUTHORITY: "Authority",
};

export default function ShipperDocumentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["shipper-documents"],
    queryFn: () => api.get<DocumentsResponse>("/shipper-portal/documents").then((r) => r.data),
  });

  const typeCounts = data?.typeCounts || [];
  const documents = data?.documents || [];

  return (
    <div>
      <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">Freight Document Vault</h1>
      <p className="text-[13px] text-gray-500 mb-6">All your BOLs, proof of delivery, rate confirmations, and freight claims in one secure location</p>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <ShipperCard key={i} padding="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-200 animate-pulse" />
                <div>
                  <div className="h-6 w-8 bg-gray-200 rounded animate-pulse mb-1" />
                  <div className="h-3 w-12 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
            </ShipperCard>
          ))
        ) : (
          typeCounts.map((d, i) => {
            const { icon: Icon, color, bg } = iconMap[d.type] || defaultIcon;
            return (
              <ShipperCard key={i} hover padding="p-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon size={20} className={color} />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-[#0D1B2A]">{d.count}</div>
                    <div className="text-[11px] text-gray-400">{typeLabels[d.type] || d.type}</div>
                  </div>
                </div>
              </ShipperCard>
            );
          })
        )}
      </div>

      {/* Upload area */}
      <ShipperCard padding="p-8" className="mb-5 !border-2 !border-dashed !border-gray-300 text-center !bg-gray-50">
        <Download size={32} className="text-gray-400 mx-auto" />
        <div className="text-sm font-semibold text-gray-600 mt-3">Drag &amp; drop files here or click to upload</div>
        <div className="text-xs text-gray-400 mt-1">Supports PDF, JPEG, PNG up to 25MB</div>
      </ShipperCard>

      {/* Recent docs */}
      <ShipperCard padding="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-[15px] font-bold text-[#0D1B2A]">Recent Documents</h3>
        </div>
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-gray-200 animate-pulse" />
              <div className="flex-1">
                <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-1" />
                <div className="h-3 w-56 bg-gray-200 rounded animate-pulse" />
              </div>
            </div>
          ))
        ) : documents.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">No documents found</div>
        ) : (
          documents.map((doc) => (
            <div key={doc.id} className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-red-500/10 flex items-center justify-center">
                  <File size={18} className="text-red-500" />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#0D1B2A]">{doc.name}</div>
                  <div className="text-[11px] text-gray-400">
                    {typeLabels[doc.type] || doc.type} &middot; {doc.shipment} &middot; {doc.size > 1024 * 1024 ? `${(doc.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(doc.size / 1024)} KB`}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {doc.url && (
                  <>
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
                      <Search size={14} /> View
                    </a>
                    <a href={doc.url} download className="inline-flex items-center gap-1 text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
                      <Download size={14} /> Download
                    </a>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </ShipperCard>
    </div>
  );
}
