"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { isCarrier } from "@/lib/roles";
import { Plus, Search, MapPin, Truck, Calendar, DollarSign, ArrowLeft, Download, Package, Thermometer, Shield, Phone, FileText, X, Users, Send, ChevronRight, ClipboardCheck } from "lucide-react";
import { CreateLoadModal } from "@/components/loads/CreateLoadModal";
import { RateConfirmationModal } from "@/components/loads/RateConfirmationModal";

interface Load {
  id: string; referenceNumber: string; status: string;
  originCity: string; originState: string; originZip?: string; destCity: string; destState: string; destZip?: string;
  weight: number | null; equipmentType: string; commodity: string | null;
  rate: number; distance: number | null; pickupDate: string; deliveryDate?: string; createdAt: string;
  pieces?: number; freightClass?: string; hazmat?: boolean; tempMin?: number; tempMax?: number;
  customsRequired?: boolean; bondType?: string; accessorials?: string[]; specialInstructions?: string;
  contactName?: string; contactPhone?: string;
  poster?: { company: string | null; firstName: string; lastName: string; phone?: string };
  carrier?: { company: string | null; firstName: string; lastName: string; phone?: string } | null;
  tenders?: { id: string; status: string; offeredRate: number; counterRate: number | null; createdAt: string; carrier: { user: { company: string | null; firstName: string; lastName: string } } }[];
  documents?: { id: string; fileName: string; fileUrl: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-500/20 text-slate-400", POSTED: "bg-blue-500/20 text-blue-400",
  TENDERED: "bg-indigo-500/20 text-indigo-400", CONFIRMED: "bg-purple-500/20 text-purple-400",
  BOOKED: "bg-violet-500/20 text-violet-400", DISPATCHED: "bg-orange-500/20 text-orange-400",
  AT_PICKUP: "bg-amber-500/20 text-amber-400", LOADED: "bg-yellow-500/20 text-yellow-400",
  PICKED_UP: "bg-yellow-500/20 text-yellow-400", IN_TRANSIT: "bg-cyan-500/20 text-cyan-400",
  AT_DELIVERY: "bg-teal-500/20 text-teal-400", DELIVERED: "bg-green-500/20 text-green-400",
  POD_RECEIVED: "bg-emerald-500/20 text-emerald-400", INVOICED: "bg-lime-500/20 text-lime-400",
  COMPLETED: "bg-emerald-500/20 text-emerald-400",
  TONU: "bg-red-500/20 text-red-400", CANCELLED: "bg-red-500/20 text-red-400",
};

const TENDER_COLORS: Record<string, string> = {
  OFFERED: "bg-blue-500/20 text-blue-400", ACCEPTED: "bg-green-500/20 text-green-400",
  COUNTERED: "bg-yellow-500/20 text-yellow-400", DECLINED: "bg-red-500/20 text-red-400",
  EXPIRED: "bg-slate-500/20 text-slate-400",
};

export default function LoadsPage() {
  const { user } = useAuthStore();
  const canCreate = !isCarrier(user?.role);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ originState: "", destState: "", equipmentType: "", status: "", search: "" });
  const [page, setPage] = useState(1);

  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  else query.set("activeOnly", "true");
  if (filters.originState) query.set("originState", filters.originState);
  if (filters.destState) query.set("destState", filters.destState);
  if (filters.equipmentType) query.set("equipmentType", filters.equipmentType);
  if (filters.search) query.set("search", filters.search);
  query.set("page", String(page));

  const { data } = useQuery({
    queryKey: ["loads", filters, page],
    queryFn: () => api.get<{ loads: Load[]; total: number; totalPages: number }>(`/loads?${query.toString()}`).then((r) => r.data),
  });

  const { data: loadDetail } = useQuery({
    queryKey: ["load", selectedLoadId],
    queryFn: () => api.get<Load>(`/loads/${selectedLoadId}`).then((r) => r.data),
    enabled: !!selectedLoadId,
  });

  const { data: suggestedCarriers } = useQuery({
    queryKey: ["suggested-carriers", loadDetail?.equipmentType],
    queryFn: () => api.get<{ carriers: { carrierId: string; company: string; tier: string; equipmentTypes: string[]; safetyScore: number | null }[]; total: number }>(
      `/market/capacity?equipmentType=${encodeURIComponent(loadDetail?.equipmentType || "")}`
    ).then((r) => r.data),
    enabled: !!loadDetail && loadDetail.status === "POSTED" && canCreate,
  });

  const queryClient = useQueryClient();
  const [showTender, setShowTender] = useState(false);
  const [showRateConf, setShowRateConf] = useState(false);
  const [tenderCarrierId, setTenderCarrierId] = useState("");
  const [tenderRate, setTenderRate] = useState("");

  const updateStatus = useMutation({
    mutationFn: ({ loadId, status }: { loadId: string; status: string }) =>
      api.patch(`/loads/${loadId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load", selectedLoadId] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
    },
  });

  const carrierUpdateStatus = useMutation({
    mutationFn: ({ loadId, status }: { loadId: string; status: string }) =>
      api.patch(`/loads/${loadId}/carrier-status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load", selectedLoadId] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
    },
  });

  const createTender = useMutation({
    mutationFn: ({ loadId, carrierId, offeredRate }: { loadId: string; carrierId: string; offeredRate: number }) =>
      api.post(`/loads/${loadId}/tenders`, { carrierId, offeredRate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load", selectedLoadId] });
      setShowTender(false);
      setTenderCarrierId("");
      setTenderRate("");
    },
  });

  const NEXT_STATUS: Record<string, string> = {
    POSTED: "TENDERED", TENDERED: "CONFIRMED", CONFIRMED: "BOOKED",
    BOOKED: "DISPATCHED", DISPATCHED: "AT_PICKUP", AT_PICKUP: "LOADED",
    LOADED: "IN_TRANSIT", PICKED_UP: "IN_TRANSIT", IN_TRANSIT: "AT_DELIVERY",
    AT_DELIVERY: "DELIVERED", DELIVERED: "POD_RECEIVED",
    POD_RECEIVED: "INVOICED", INVOICED: "COMPLETED",
  };

  const STATUS_ACTIONS: Record<string, string> = {
    POSTED: "Tender", TENDERED: "Confirm", CONFIRMED: "Book Load",
    BOOKED: "Dispatch", DISPATCHED: "At Pickup", AT_PICKUP: "Mark Loaded",
    LOADED: "In Transit", PICKED_UP: "In Transit", IN_TRANSIT: "At Delivery",
    AT_DELIVERY: "Mark Delivered", DELIVERED: "POD Received",
    POD_RECEIVED: "Mark Invoiced", INVOICED: "Complete",
  };

  const downloadPdf = async (loadId: string, refNum: string) => {
    const res = await api.get(`/pdf/rate-confirmation/${loadId}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a"); a.href = url; a.download = `RateConf-${refNum}.pdf`; a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadBol = async (loadId: string, refNum: string) => {
    const res = await api.get(`/pdf/bol-load/${loadId}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a"); a.href = url; a.download = `BOL-${refNum}.pdf`; a.click();
    window.URL.revokeObjectURL(url);
  };

  // Detail overlay view
  if (selectedLoadId && loadDetail) {
    const load = loadDetail;
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedLoadId(null)} className="text-slate-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{load.referenceNumber}</h1>
              <span className={`px-3 py-1 rounded text-sm font-medium ${STATUS_COLORS[load.status] || ""}`}>{load.status.replace(/_/g, " ")}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {canCreate && load.status === "POSTED" && (
              <button onClick={() => setShowTender(true)} className="flex items-center gap-2 px-4 py-2 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">
                <Send className="w-4 h-4" /> Tender to Carrier
              </button>
            )}
            {canCreate && NEXT_STATUS[load.status] && (
              <button
                onClick={() => updateStatus.mutate({ loadId: load.id, status: NEXT_STATUS[load.status] })}
                disabled={updateStatus.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30 disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" /> {STATUS_ACTIONS[load.status]}
              </button>
            )}
            {isCarrier(user?.role) && load.carrier?.firstName === user?.firstName && (
              <>
                {["BOOKED", "DISPATCHED"].includes(load.status) && (
                  <button onClick={() => carrierUpdateStatus.mutate({ loadId: load.id, status: "AT_PICKUP" })}
                    disabled={carrierUpdateStatus.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm hover:bg-amber-500/30 disabled:opacity-50">
                    <MapPin className="w-4 h-4" /> At Pickup
                  </button>
                )}
                {load.status === "AT_PICKUP" && (
                  <button onClick={() => carrierUpdateStatus.mutate({ loadId: load.id, status: "LOADED" })}
                    disabled={carrierUpdateStatus.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm hover:bg-yellow-500/30 disabled:opacity-50">
                    <Truck className="w-4 h-4" /> Mark Loaded
                  </button>
                )}
                {["LOADED", "PICKED_UP"].includes(load.status) && (
                  <button onClick={() => carrierUpdateStatus.mutate({ loadId: load.id, status: "IN_TRANSIT" })}
                    disabled={carrierUpdateStatus.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm hover:bg-cyan-500/30 disabled:opacity-50">
                    <Truck className="w-4 h-4" /> In Transit
                  </button>
                )}
                {load.status === "IN_TRANSIT" && (
                  <button onClick={() => carrierUpdateStatus.mutate({ loadId: load.id, status: "AT_DELIVERY" })}
                    disabled={carrierUpdateStatus.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-teal-500/20 text-teal-400 rounded-lg text-sm hover:bg-teal-500/30 disabled:opacity-50">
                    <MapPin className="w-4 h-4" /> At Delivery
                  </button>
                )}
                {load.status === "AT_DELIVERY" && (
                  <button onClick={() => carrierUpdateStatus.mutate({ loadId: load.id, status: "DELIVERED" })}
                    disabled={carrierUpdateStatus.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30 disabled:opacity-50">
                    <Package className="w-4 h-4" /> Mark Delivered
                  </button>
                )}
              </>
            )}
            {canCreate && !["DRAFT", "CANCELLED", "TONU"].includes(load.status) && (
              <button onClick={() => setShowRateConf(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-500/20 text-indigo-400 rounded-lg text-sm hover:bg-indigo-500/30">
                <ClipboardCheck className="w-4 h-4" /> Rate Confirmation
              </button>
            )}
            <button onClick={() => downloadBol(load.id, load.referenceNumber)} className="flex items-center gap-2 px-4 py-2 bg-gold/20 text-gold rounded-lg text-sm hover:bg-gold/30">
              <Download className="w-4 h-4" /> BOL
            </button>
            {["BOOKED", "CONFIRMED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"].includes(load.status) && (
              <button onClick={() => downloadPdf(load.id, load.referenceNumber)} className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20">
                <Download className="w-4 h-4" /> Rate Conf PDF
              </button>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Route */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-6">
              <h2 className="text-sm font-medium text-slate-400 mb-4">Route Information</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 text-gold mb-1"><MapPin className="w-4 h-4" /> Origin</div>
                  <p className="text-white font-medium">{load.originCity}, {load.originState} {load.originZip || ""}</p>
                  <p className="text-sm text-slate-400 mt-1 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Pickup: {new Date(load.pickupDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-gold mb-1"><MapPin className="w-4 h-4" /> Destination</div>
                  <p className="text-white font-medium">{load.destCity}, {load.destState} {load.destZip || ""}</p>
                  {load.deliveryDate && <p className="text-sm text-slate-400 mt-1 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Delivery: {new Date(load.deliveryDate).toLocaleDateString()}</p>}
                </div>
              </div>
              {load.distance && <p className="text-sm text-slate-400 mt-4">Distance: {load.distance} miles</p>}
            </div>

            {/* Freight Details */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-6">
              <h2 className="text-sm font-medium text-slate-400 mb-4">Freight Details</h2>
              <div className="grid md:grid-cols-3 gap-4">
                <Detail icon={<Truck className="w-4 h-4" />} label="Equipment" value={load.equipmentType} />
                <Detail icon={<Package className="w-4 h-4" />} label="Commodity" value={load.commodity || "—"} />
                <Detail label="Weight" value={load.weight ? `${load.weight.toLocaleString()} lbs` : "—"} />
                {load.pieces && <Detail label="Pieces" value={String(load.pieces)} />}
                {load.freightClass && <Detail label="Freight Class" value={load.freightClass} />}
                {load.hazmat && <Detail icon={<Shield className="w-4 h-4 text-red-400" />} label="Hazmat" value="Yes" />}
                {load.tempMin != null && <Detail icon={<Thermometer className="w-4 h-4" />} label="Temperature" value={`${load.tempMin}°F - ${load.tempMax}°F`} />}
                {load.customsRequired && <Detail label="Customs" value={`Required — ${load.bondType || "TBD"}`} />}
              </div>
              {load.accessorials && load.accessorials.length > 0 && (
                <div className="mt-4">
                  <span className="text-xs text-slate-400">Accessorials: </span>
                  {load.accessorials.map((a) => <span key={a} className="inline-block px-2 py-0.5 bg-white/10 rounded text-xs text-slate-300 mr-1 mb-1">{a}</span>)}
                </div>
              )}
              {load.specialInstructions && (
                <div className="mt-4 p-3 bg-white/5 rounded-lg">
                  <span className="text-xs text-slate-400">Special Instructions</span>
                  <p className="text-sm text-white mt-1">{load.specialInstructions}</p>
                </div>
              )}
            </div>

            {/* Tender History */}
            {load.tenders && load.tenders.length > 0 && (
              <div className="bg-white/5 rounded-xl border border-white/10 p-6">
                <h2 className="text-sm font-medium text-slate-400 mb-4">Tender History</h2>
                <div className="space-y-3">
                  {load.tenders.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div>
                        <p className="text-white text-sm">{t.carrier?.user?.company || `${t.carrier?.user?.firstName} ${t.carrier?.user?.lastName}`}</p>
                        <p className="text-xs text-slate-400">{new Date(t.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <p className="text-sm text-white">${t.offeredRate.toLocaleString()}</p>
                          {t.counterRate && <p className="text-xs text-yellow-400">Counter: ${t.counterRate.toLocaleString()}</p>}
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${TENDER_COLORS[t.status] || ""}`}>{t.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-white/5 rounded-xl border border-white/10 p-6">
              <h2 className="text-sm font-medium text-slate-400 mb-3">Pricing</h2>
              <div className="flex items-center gap-2 text-gold mb-1">
                <DollarSign className="w-5 h-5" />
                <span className="text-3xl font-bold">{load.rate.toLocaleString()}</span>
              </div>
              {load.distance && <p className="text-sm text-slate-400">${(load.rate / load.distance).toFixed(2)}/mile</p>}
            </div>

            {(load.contactName || load.poster) && (
              <div className="bg-white/5 rounded-xl border border-white/10 p-6">
                <h2 className="text-sm font-medium text-slate-400 mb-3">Contact</h2>
                {load.contactName && (
                  <div className="mb-2">
                    <p className="text-white text-sm">{load.contactName}</p>
                    {load.contactPhone && <p className="text-sm text-slate-400 flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {load.contactPhone}</p>}
                  </div>
                )}
                {load.poster && (
                  <div className="pt-2 border-t border-white/10">
                    <p className="text-xs text-slate-500">Posted by</p>
                    <p className="text-sm text-white">{load.poster.company || `${load.poster.firstName} ${load.poster.lastName}`}</p>
                    {load.poster.phone && <p className="text-xs text-slate-400">{load.poster.phone}</p>}
                  </div>
                )}
              </div>
            )}

            {load.carrier && (
              <div className="bg-white/5 rounded-xl border border-white/10 p-6">
                <h2 className="text-sm font-medium text-slate-400 mb-3">Assigned Carrier</h2>
                <p className="text-white">{load.carrier.company || `${load.carrier.firstName} ${load.carrier.lastName}`}</p>
                {load.carrier.phone && <p className="text-sm text-slate-400">{load.carrier.phone}</p>}
              </div>
            )}

            {load.documents && load.documents.length > 0 && (
              <div className="bg-white/5 rounded-xl border border-white/10 p-6">
                <h2 className="text-sm font-medium text-slate-400 mb-3">Documents</h2>
                <div className="space-y-2">
                  {load.documents.map((doc) => (
                    <a key={doc.id} href={doc.fileUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-slate-300 hover:text-gold">
                      <FileText className="w-4 h-4" /> {doc.fileName}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {load.status === "POSTED" && canCreate && suggestedCarriers && suggestedCarriers.carriers.length > 0 && (
              <div className="bg-white/5 rounded-xl border border-gold/20 p-6">
                <h2 className="text-sm font-medium text-gold mb-3 flex items-center gap-2"><Users className="w-4 h-4" /> Suggested Carriers</h2>
                <p className="text-xs text-slate-500 mb-3">{suggestedCarriers.total} carriers match this equipment type</p>
                <div className="space-y-2">
                  {suggestedCarriers.carriers.slice(0, 5).map((c) => (
                    <div key={c.carrierId} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                      <div>
                        <p className="text-sm text-white">{c.company}</p>
                        <p className="text-xs text-slate-500">{c.equipmentTypes.join(", ")}</p>
                      </div>
                      <button
                        onClick={() => { setTenderCarrierId(c.carrierId); setTenderRate(String(load.rate)); setShowTender(true); }}
                        className="px-2 py-1 bg-gold/20 text-gold rounded text-xs hover:bg-gold/30"
                      >
                        Quick Tender
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status Pipeline */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-6">
              <h2 className="text-sm font-medium text-slate-400 mb-3">Load Pipeline</h2>
              <div className="space-y-0">
                {["POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"].map((st, i, arr) => {
                  const statusList = ["POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"];
                  const mappedStatus = load.status === "PICKED_UP" ? "LOADED" : load.status;
                  const currentIdx = statusList.indexOf(mappedStatus);
                  const done = i <= currentIdx;
                  const active = i === currentIdx;
                  return (
                    <div key={st} className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${done ? (active ? "bg-gold" : "bg-green-500") : "bg-slate-700"}`} />
                      {i < arr.length - 1 && <div className={`w-0.5 h-4 ml-1 -my-1 ${done ? "bg-green-500/30" : "bg-slate-800"}`} />}
                      <span className={`text-xs ${done ? (active ? "text-gold font-medium" : "text-green-400") : "text-slate-600"}`}>
                        {st.replace(/_/g, " ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Tender Modal */}
        {showTender && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Tender Load to Carrier</h2>
                <button onClick={() => setShowTender(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-slate-400">{load.referenceNumber} — {load.originCity}, {load.originState} → {load.destCity}, {load.destState}</p>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Select Carrier</label>
                <select value={tenderCarrierId} onChange={(e) => setTenderCarrierId(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
                  <option value="" className="bg-navy">Choose a carrier...</option>
                  {suggestedCarriers?.carriers?.map((c) => (
                    <option key={c.carrierId} value={c.carrierId} className="bg-navy">
                      {c.company} ({c.tier})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Offered Rate ($)</label>
                <input type="number" value={tenderRate} onChange={(e) => setTenderRate(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
              </div>
              <button
                onClick={() => createTender.mutate({ loadId: load.id, carrierId: tenderCarrierId, offeredRate: parseFloat(tenderRate) })}
                disabled={!tenderCarrierId || !tenderRate || createTender.isPending}
                className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50"
              >
                Send Tender
              </button>
            </div>
          </div>
        )}

        <RateConfirmationModal
          open={showRateConf}
          onClose={() => setShowRateConf(false)}
          load={showRateConf ? load : null}
        />
      </div>
    );
  }

  // List view
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Load Board</h1>
          <p className="text-slate-400 text-sm mt-1">{data?.total || 0} loads available</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">
            <Plus className="w-4 h-4" /> Create Load
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input placeholder="Search loads..." value={filters.search} onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>
        <select value={filters.status} onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
          <option value="" className="bg-navy">All Statuses</option>
          {["DRAFT", "POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED", "TONU", "CANCELLED"].map((s) =>
            <option key={s} value={s} className="bg-navy">{s.replace(/_/g, " ")}</option>
          )}
        </select>
        <select value={filters.equipmentType} onChange={(e) => { setFilters((f) => ({ ...f, equipmentType: e.target.value })); setPage(1); }}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
          <option value="" className="bg-navy">All Equipment</option>
          {["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler"].map((t) => <option key={t} value={t} className="bg-navy">{t}</option>)}
        </select>
      </div>

      {/* Load Cards */}
      <div className="space-y-3">
        {data?.loads?.map((load) => (
          <button key={load.id} onClick={() => setSelectedLoadId(load.id)}
            className="block w-full text-left bg-white/5 rounded-xl border border-white/10 p-5 hover:border-gold/30 transition">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm text-slate-300">{load.referenceNumber}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[load.status] || "bg-white/10 text-white"}`}>
                    {load.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <MapPin className="w-4 h-4 text-gold shrink-0" />
                  <span className="font-medium">{load.originCity}, {load.originState}</span>
                  <span className="text-slate-500">&rarr;</span>
                  <span className="font-medium">{load.destCity}, {load.destState}</span>
                </div>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-400">
                  <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> {load.equipmentType}</span>
                  {load.weight && <span>{load.weight.toLocaleString()} lbs</span>}
                  {load.distance && <span>{load.distance} mi</span>}
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(load.pickupDate).toLocaleDateString()}</span>
                  {load.poster && <span>Posted by {load.poster.company || `${load.poster.firstName} ${load.poster.lastName}`}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-gold">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xl font-bold">{load.rate.toLocaleString()}</span>
                </div>
                {load.distance && <p className="text-xs text-slate-500 mt-1">${(load.rate / load.distance).toFixed(2)}/mi</p>}
              </div>
            </div>
          </button>
        ))}
        {(!data?.loads || data.loads.length === 0) && (
          <div className="text-center py-12 text-slate-500">No loads found matching your criteria</div>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm bg-white/5 rounded-lg text-slate-400 disabled:opacity-30">Prev</button>
          <span className="text-sm text-slate-400">Page {page} of {data.totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="px-3 py-1.5 text-sm bg-white/5 rounded-lg text-slate-400 disabled:opacity-30">Next</button>
        </div>
      )}

      <CreateLoadModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}

function Detail({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-slate-400 mb-0.5">{icon}{label}</div>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}
