"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ShipperCard, ShipperBadge, ShipmentDetailDrawer } from "@/components/shipper";
import type { Shipment, ShipmentsResponse } from "@/components/shipper/shipperData";

const filters = ["All", "In Transit", "Delivered", "Pending", "At Risk", "Picked Up"];

export default function ShipperShipmentsPage() {
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = new URLSearchParams();
  if (activeFilter !== "All") query.set("status", activeFilter);
  if (search) query.set("search", search);
  query.set("page", String(page));

  const { data, isLoading } = useQuery({
    queryKey: ["shipper-shipments", activeFilter, search, page],
    queryFn: () => api.get<ShipmentsResponse>(`/shipper-portal/shipments?${query.toString()}`).then((r) => r.data),
  });

  const shipments = data?.shipments || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">Freight Shipments</h1>
          <p className="text-[13px] text-gray-500">Manage and monitor all your truckload and LTL shipments</p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-1.5 px-4 py-2 text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
            <Download size={14} /> Export CSV
          </button>
          <Link href="/shipper/dashboard/quote" className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-[11px] font-semibold uppercase tracking-[2px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)]">
            <Plus size={14} /> New Shipment
          </Link>
        </div>
      </div>

      {/* Filters */}
      <ShipperCard padding="p-4" className="mb-4">
        <div className="flex gap-2 items-center flex-wrap">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => { setActiveFilter(f); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium ${
                f === activeFilter ? "bg-[#0D1B2A] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >{f}</button>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-md">
            <Search size={14} className="text-gray-400" />
            <input
              placeholder="Search by ID, route, carrier..."
              className="border-none outline-none text-xs w-[180px]"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>
      </ShipperCard>

      {/* Table */}
      <ShipperCard padding="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-gray-50">
                {["Shipment ID", "Origin → Destination", "Status", "Carrier", "Equipment", "Weight", "Rate", "Pick Date", "Del Date", "Progress"].map((h) => (
                  <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-semibold text-gray-500 tracking-wide uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {[...Array(10)].map((_, j) => (
                      <td key={j} className="px-3.5 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : shipments.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">No shipments found</td></tr>
              ) : (
                shipments.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(s)}>
                    <td className="px-3.5 py-3 font-semibold text-[#0D1B2A] font-mono text-[11px]">{s.id}</td>
                    <td className="px-3.5 py-3">
                      <div className="text-xs text-gray-700">{s.origin}</div>
                      <div className="text-[11px] text-gray-400">&rarr; {s.dest}</div>
                    </td>
                    <td className="px-3.5 py-3"><ShipperBadge status={s.status} /></td>
                    <td className="px-3.5 py-3 text-gray-600 text-xs">{s.carrier}</td>
                    <td className="px-3.5 py-3 text-gray-500 text-xs">{s.equipment}</td>
                    <td className="px-3.5 py-3 text-gray-500 text-xs">{s.weight}</td>
                    <td className="px-3.5 py-3 font-semibold text-[#0D1B2A]">${s.rate.toLocaleString()}</td>
                    <td className="px-3.5 py-3 text-gray-500 text-xs">{s.pickDate}</td>
                    <td className="px-3.5 py-3 text-gray-500 text-xs">{s.delDate}</td>
                    <td className="px-3.5 py-3 min-w-[100px]">
                      <div className="bg-gray-200 rounded h-1.5 overflow-hidden">
                        <div className={`h-full rounded transition-all duration-500 ${
                          s.progress === 100 ? "bg-emerald-500" : s.status === "At Risk" ? "bg-red-500" : "bg-blue-500"
                        }`} style={{ width: `${s.progress}%` }} />
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1">{s.progress}%</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500">
            <span>Showing {shipments.length} of {data.total} shipments</span>
            <div className="flex gap-1">
              {page > 1 && <button onClick={() => setPage(page - 1)} className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200">Prev</button>}
              <span className="px-3 py-1">Page {page} of {data.totalPages}</span>
              {page < data.totalPages && <button onClick={() => setPage(page + 1)} className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200">Next</button>}
            </div>
          </div>
        )}
      </ShipperCard>

      {selected && <ShipmentDetailDrawer shipment={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
