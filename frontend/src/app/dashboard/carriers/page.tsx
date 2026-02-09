"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { Search, Shield, Truck, MapPin, Star, CheckCircle2, Clock, AlertCircle, X, ChevronDown, ChevronUp, MessageSquare, FileText, Users } from "lucide-react";

interface Carrier {
  carrierId: string;
  userId: string;
  company: string;
  tier: string;
  equipmentTypes: string[];
  operatingRegions: string[];
  safetyScore: number | null;
  numberOfTrucks: number | null;
}

interface CarrierDetail {
  id: string;
  userId: string;
  mcNumber: string | null;
  dotNumber: string | null;
  tier: string;
  equipmentTypes: string[];
  operatingRegions: string[];
  safetyScore: number | null;
  numberOfTrucks: number | null;
  onboardingStatus: string;
  w9Uploaded: boolean;
  insuranceCertUploaded: boolean;
  authorityDocUploaded: boolean;
  approvedAt: string | null;
  user: { id: string; firstName: string; lastName: string; email: string; company: string | null; phone: string | null };
}

const TIER_COLORS: Record<string, string> = {
  PLATINUM: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  GOLD: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  SILVER: "bg-slate-400/20 text-slate-300 border-slate-400/30",
  BRONZE: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400",
  DOCUMENTS_SUBMITTED: "bg-blue-500/20 text-blue-400",
  UNDER_REVIEW: "bg-purple-500/20 text-purple-400",
  APPROVED: "bg-green-500/20 text-green-400",
  REJECTED: "bg-red-500/20 text-red-400",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Clock className="w-4 h-4" />,
  DOCUMENTS_SUBMITTED: <FileText className="w-4 h-4" />,
  UNDER_REVIEW: <Shield className="w-4 h-4" />,
  APPROVED: <CheckCircle2 className="w-4 h-4" />,
  REJECTED: <AlertCircle className="w-4 h-4" />,
};

export default function CarrierPoolPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [equipFilter, setEquipFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<CarrierDetail | null>(null);

  const { data } = useQuery({
    queryKey: ["carrier-pool", equipFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (equipFilter) params.set("equipmentType", equipFilter);
      return api.get<{ carriers: Carrier[]; total: number }>(`/market/capacity?${params.toString()}`).then((r) => r.data);
    },
  });

  const filtered = data?.carriers?.filter((c) => {
    if (tierFilter && c.tier !== tierFilter) return false;
    if (search && !c.company.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const verifyCarrier = useMutation({
    mutationFn: ({ carrierId, status }: { carrierId: string; status: string }) =>
      api.patch(`/carrier/${carrierId}/verify`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrier-pool"] });
      setSelectedCarrier(null);
    },
  });

  const tierCounts = {
    PLATINUM: data?.carriers?.filter((c) => c.tier === "PLATINUM").length || 0,
    GOLD: data?.carriers?.filter((c) => c.tier === "GOLD").length || 0,
    SILVER: data?.carriers?.filter((c) => c.tier === "SILVER").length || 0,
    BRONZE: data?.carriers?.filter((c) => c.tier === "BRONZE").length || 0,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Carrier Pool</h1>
          <p className="text-slate-400 text-sm mt-1">{data?.total || 0} carriers in network</p>
        </div>
      </div>

      {/* Tier Summary Cards */}
      <div className="grid sm:grid-cols-4 gap-4">
        {(["PLATINUM", "GOLD", "SILVER", "BRONZE"] as const).map((tier) => (
          <button key={tier} onClick={() => setTierFilter(tierFilter === tier ? "" : tier)}
            className={`bg-white/5 rounded-xl border p-4 text-left transition ${tierFilter === tier ? "border-gold" : "border-white/10 hover:border-white/20"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${TIER_COLORS[tier]}`}>{tier}</span>
              <span className="text-2xl font-bold text-white">{tierCounts[tier]}</span>
            </div>
            <p className="text-xs text-slate-500">carriers</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search carriers..."
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>
        <select value={equipFilter} onChange={(e) => setEquipFilter(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
          <option value="" className="bg-[#0f172a]">All Equipment</option>
          {["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler"].map((t) => (
            <option key={t} value={t} className="bg-[#0f172a]">{t}</option>
          ))}
        </select>
      </div>

      {/* Carrier List */}
      <div className="space-y-3">
        {filtered?.map((carrier) => (
          <div key={carrier.carrierId} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === carrier.carrierId ? null : carrier.carrierId)}
              className="w-full text-left p-5 hover:bg-white/5 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                    <Truck className="w-6 h-6 text-gold" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-white">{carrier.company}</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${TIER_COLORS[carrier.tier] || ""}`}>{carrier.tier}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Truck className="w-3 h-3" /> {carrier.equipmentTypes.join(", ")}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {carrier.operatingRegions.slice(0, 3).join(", ")}{carrier.operatingRegions.length > 3 ? ` +${carrier.operatingRegions.length - 3}` : ""}
                      </span>
                      {carrier.numberOfTrucks && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {carrier.numberOfTrucks} trucks
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {carrier.safetyScore && (
                    <div className="text-right">
                      <p className="text-lg font-bold text-white">{carrier.safetyScore}%</p>
                      <p className="text-[10px] text-slate-500">Safety Score</p>
                    </div>
                  )}
                  {expanded === carrier.carrierId ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>
            </button>

            {expanded === carrier.carrierId && (
              <div className="border-t border-white/10 p-5 bg-white/5">
                <div className="grid sm:grid-cols-3 gap-4 mb-4">
                  <div>
                    <span className="text-xs text-slate-500">Equipment Types</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {carrier.equipmentTypes.map((eq) => (
                        <span key={eq} className="px-2 py-0.5 bg-white/10 rounded text-xs text-slate-300">{eq}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Operating Regions</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {carrier.operatingRegions.map((r) => (
                        <span key={r} className="px-2 py-0.5 bg-white/10 rounded text-xs text-slate-300">{r}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Fleet Size</span>
                    <p className="text-sm text-white mt-1">{carrier.numberOfTrucks || "—"} trucks</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a href={`/dashboard/messages`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition">
                    <MessageSquare className="w-3.5 h-3.5" /> Message
                  </a>
                  <a href={`/dashboard/loads`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gold/20 text-gold rounded-lg text-xs hover:bg-gold/30 transition">
                    <FileText className="w-3.5 h-3.5" /> Tender Load
                  </a>
                </div>
              </div>
            )}
          </div>
        ))}
        {(!filtered || filtered.length === 0) && (
          <div className="text-center py-12 text-slate-500">
            <Truck className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No carriers found matching your criteria</p>
          </div>
        )}
      </div>
    </div>
  );
}
