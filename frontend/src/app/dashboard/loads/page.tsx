"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Load } from "@shared/types";

const statusColors: Record<string, string> = {
  POSTED: "bg-blue-50 text-blue-700",
  BOOKED: "bg-purple-50 text-purple-700",
  IN_TRANSIT: "bg-amber-50 text-amber-700",
  DELIVERED: "bg-green-50 text-green-700",
  COMPLETED: "bg-slate-100 text-slate-600",
  CANCELLED: "bg-red-50 text-red-700",
};

export default function LoadsPage() {
  const [filters, setFilters] = useState({ originState: "", destState: "", equipmentType: "", status: "" });

  const query = new URLSearchParams();
  if (filters.originState) query.set("originState", filters.originState);
  if (filters.destState) query.set("destState", filters.destState);
  if (filters.equipmentType) query.set("equipmentType", filters.equipmentType);
  if (filters.status) query.set("status", filters.status);

  const { data, isLoading } = useQuery({
    queryKey: ["loads", filters],
    queryFn: () => api.get<{ loads: Load[]; total: number }>(`/loads?${query.toString()}`).then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Load Board</h1>
        <span className="text-sm text-slate-500">{data?.total || 0} loads</span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input placeholder="Origin State (e.g. GA)" value={filters.originState}
            onChange={(e) => setFilters((p) => ({ ...p, originState: e.target.value.toUpperCase().slice(0, 2) }))}
            className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
          <input placeholder="Dest State (e.g. FL)" value={filters.destState}
            onChange={(e) => setFilters((p) => ({ ...p, destState: e.target.value.toUpperCase().slice(0, 2) }))}
            className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
          <select value={filters.equipmentType}
            onChange={(e) => setFilters((p) => ({ ...p, equipmentType: e.target.value }))}
            className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none">
            <option value="">All Equipment</option>
            <option value="Dry Van">Dry Van</option><option value="Reefer">Reefer</option>
            <option value="Flatbed">Flatbed</option><option value="Step Deck">Step Deck</option>
          </select>
          <select value={filters.status}
            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
            className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none">
            <option value="">All Statuses</option>
            <option value="POSTED">Posted</option><option value="BOOKED">Booked</option>
            <option value="IN_TRANSIT">In Transit</option><option value="DELIVERED">Delivered</option>
          </select>
        </div>
      </div>

      {/* Loads */}
      {isLoading ? (
        <p className="text-slate-400 text-center py-12">Loading loads...</p>
      ) : (
        <div className="space-y-3">
          {data?.loads.map((load) => (
            <div key={load.id} className="bg-white rounded-xl border p-5 hover:shadow-sm transition">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm text-slate-400">{load.referenceNumber}</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[load.status] || "")}>{load.status}</span>
                  </div>
                  <p className="font-semibold">
                    {load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}
                  </p>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                    <span>{load.equipmentType}</span>
                    {load.weight && <span>{load.weight.toLocaleString()} lbs</span>}
                    {load.distance && <span>{load.distance} mi</span>}
                    <span>Pickup: {new Date(load.pickupDate).toLocaleDateString()}</span>
                  </div>
                  {load.poster && (
                    <p className="text-xs text-slate-400 mt-1">Posted by {load.poster.company || `${load.poster.firstName} ${load.poster.lastName}`}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-navy">${load.rate.toLocaleString()}</p>
                  {load.distance && <p className="text-xs text-slate-400">${(load.rate / load.distance).toFixed(2)}/mi</p>}
                </div>
              </div>
            </div>
          ))}
          {data?.loads.length === 0 && (
            <div className="bg-white rounded-xl border p-12 text-center text-slate-400">
              No loads match your filters
            </div>
          )}
        </div>
      )}
    </div>
  );
}
