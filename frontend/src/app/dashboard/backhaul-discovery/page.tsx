"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Compass, Search, MapPin, ArrowRight, Truck, DollarSign,
  Package, Calendar, RotateCw, ArrowLeftRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

export default function BackhaulDiscoveryPage() {
  const [state, setState] = useState("TX");
  const [city, setCity] = useState("");
  const [type, setType] = useState<"backhaul" | "fronthaul">("backhaul");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["backhaul-discovery", state, city, type],
    queryFn: () => api.get("/analytics/backhaul-discovery", {
      params: { state, city: city || undefined, type },
    }).then((r) => r.data),
    enabled: !!state,
  });

  const results = data?.results || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#C5A572]" /> Backhaul / Fronthaul Discovery
          </h1>
          <p className="text-sm text-gray-400 mt-1">Find unassigned loads near a location to maximize carrier utilization</p>
        </div>
      </div>

      {/* Search Controls */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 mb-6">
        <div className="flex items-end gap-4">
          {/* Type toggle */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Search Type</label>
            <div className="flex items-center bg-white/5 rounded-lg p-0.5">
              {(["backhaul", "fronthaul"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "px-4 py-2 rounded-md text-xs font-medium transition",
                    type === t ? "bg-[#C5A572] text-[#0F1117]" : "text-gray-400 hover:text-white"
                  )}
                >
                  {t === "backhaul" ? "Backhaul (loads TO area)" : "Fronthaul (loads FROM area)"}
                </button>
              ))}
            </div>
          </div>

          {/* State */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">State</label>
            <select
              value={state} onChange={(e) => setState(e.target.value)}
              className="px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white focus:border-[#C5A572]/50 focus:outline-none"
            >
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* City */}
          <div className="flex-1 max-w-xs">
            <label className="block text-xs text-gray-400 mb-1.5">City (optional)</label>
            <input
              value={city} onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Dallas"
              className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-[#C5A572]/50 focus:outline-none"
            />
          </div>

          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#C5A572] text-[#0F1117] rounded-lg font-medium text-sm hover:bg-[#d4b65c] transition"
          >
            <Search className="w-4 h-4" /> Search
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          {type === "backhaul"
            ? `Showing unassigned loads with DELIVERY in ${state}${city ? `, ${city}` : ""} — ideal for carriers dropping off nearby`
            : `Showing unassigned loads with PICKUP in ${state}${city ? `, ${city}` : ""} — ideal for carriers picking up nearby`
          }
        </p>
      </div>

      {/* Results */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-medium text-white">
            {results.length} Available Load{results.length !== 1 ? "s" : ""} Found
          </h3>
          <span className="text-xs text-gray-500">Unassigned · {type === "backhaul" ? "Delivering" : "Picking up"} in {state}</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Searching...</div>
        ) : results.length === 0 ? (
          <div className="p-12 text-center">
            <Compass className="w-10 h-10 mx-auto mb-3 text-gray-600" />
            <p className="text-sm text-gray-500">No unassigned loads found in this area</p>
            <p className="text-xs text-gray-600 mt-1">Try expanding your search to a different state or removing the city filter</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {results.map((load: any) => (
              <div key={load.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition">
                {/* Lane */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">{load.loadNumber || load.referenceNumber?.slice(0, 12)}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded",
                      load.status === "POSTED" ? "bg-blue-500/10 text-blue-400" : "bg-indigo-500/10 text-indigo-400"
                    )}>
                      {load.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <MapPin className="w-3 h-3" />
                    <span>{load.originCity}, {load.originState}</span>
                    <ArrowRight className="w-3 h-3 text-gray-600" />
                    <span>{load.destCity}, {load.destState}</span>
                  </div>
                </div>

                {/* Equipment */}
                <span className="text-[10px] px-2 py-1 bg-white/5 text-gray-400 rounded">
                  <Truck className="w-3 h-3 inline mr-1" />{load.equipmentType?.replace("_", " ")}
                </span>

                {/* Rate */}
                <div className="text-right">
                  <p className="text-sm font-medium text-white">${load.rate?.toLocaleString()}</p>
                  {load.distance && <p className="text-[10px] text-gray-500">{Math.round(load.distance)} mi</p>}
                </div>

                {/* Weight */}
                {load.weight && (
                  <span className="text-xs text-gray-500">{load.weight.toLocaleString()} lbs</span>
                )}

                {/* Dates */}
                <div className="text-right text-xs text-gray-500">
                  <div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(load.pickupDate).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
