"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { isCarrier } from "@/lib/roles";
import { Plus, Search, MapPin, Truck, Calendar, DollarSign, ArrowLeft, Download, Package, Thermometer, Shield, Phone, FileText, X, Users, Send, ChevronRight, ClipboardCheck, Globe } from "lucide-react";
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
  datPostId?: string; datPostedAt?: string; datPostedFields?: any;
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
    queryKey: ["carrier-match", selectedLoadId],
    queryFn: () => api.get<{ matches: { carrierId: string; company: string; tier: string; equipmentTypes: string[]; safetyScore: number | null; complianceStatus: string; matchScore: number }[]; totalCandidates: number; suggestDAT: boolean }>(
      `/carrier-match/${selectedLoadId}`
    ).then((r) => ({ carriers: r.data.matches, total: r.data.totalCandidates })),
    enabled: !!selectedLoadId && !!loadDetail && loadDetail.status === "POSTED" && canCreate,
  });

  const queryClient = useQueryClient();
  const [showTender, setShowTender] = useState(false);
  const [showRateConf, setShowRateConf] = useState(false);
  const [tenderCarrierId, setTenderCarrierId] = useState("");
  const [tenderRate, setTenderRate] = useState("");
  const [complianceResult, setComplianceResult] = useState<{ allowed: boolean; blocked_reasons: string[]; warnings: string[] } | null>(null);
  const [checkingCompliance, setCheckingCompliance] = useState(false);

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

  // DAT Load Board state
  const [showDatAdvanced, setShowDatAdvanced] = useState(false);
  const [datAdvForm, setDatAdvForm] = useState({ originCity: "", originState: "", destCity: "", destState: "", equipmentType: "", weight: "", rate: "", pickupDate: "", deliveryDate: "", loadType: "FULL", comments: "" });

  const datPostMutation = useMutation({
    mutationFn: (loadId: string) => api.post("/dat/post-load", { loadId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load", selectedLoadId] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
    },
  });

  const datPostAdvancedMutation = useMutation({
    mutationFn: (body: Record<string, any>) => api.post("/dat/post-load-advanced", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load", selectedLoadId] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      setShowDatAdvanced(false);
    },
  });

  const datRemoveMutation = useMutation({
    mutationFn: (datPostId: string) => api.delete(`/dat/remove-post/${datPostId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load", selectedLoadId] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
    },
  });

  const { data: datResponses } = useQuery({
    queryKey: ["dat-responses", selectedLoadId],
    queryFn: () => api.get<{ responses: { id: string; carrierName: string; mcNumber: string; dotNumber: string; equipment: string; offeredRate: number; phone: string; email: string; driverAvailable: boolean; truckCount: number }[]; mock?: boolean }>(`/dat/responses/${selectedLoadId}`).then((r) => r.data),
    enabled: !!selectedLoadId && !!(loadDetail?.datPostId || loadDetail?.status === "POSTED"),
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

            {/* DAT Load Board */}
            {canCreate && (
              <div className="bg-white/5 rounded-xl border border-white/10 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-slate-400 flex items-center gap-2"><Globe className="w-4 h-4" /> DAT Load Board</h2>
                  {load.datPostedAt && <span className="text-xs text-green-400">Posted {new Date(load.datPostedAt).toLocaleDateString()}</span>}
                </div>

                {!load.datPostId && ["POSTED", "TENDERED", "CONFIRMED"].includes(load.status) && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => datPostMutation.mutate(load.id)}
                      disabled={datPostMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30 disabled:opacity-50"
                    >
                      <Globe className="w-4 h-4" /> {datPostMutation.isPending ? "Posting..." : "Post to DAT"}
                    </button>
                    <button
                      onClick={() => { setDatAdvForm({ originCity: load.originCity, originState: load.originState, destCity: load.destCity, destState: load.destState, equipmentType: load.equipmentType, weight: load.weight ? String(load.weight) : "", rate: String(load.rate), pickupDate: load.pickupDate?.slice(0, 10) || "", deliveryDate: load.deliveryDate?.slice(0, 10) || "", loadType: "FULL", comments: "" }); setShowDatAdvanced(true); }}
                      className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20"
                    >
                      Advanced Post
                    </button>
                  </div>
                )}

                {load.datPostId && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                      <div>
                        <p className="text-sm text-green-400 font-medium">Active on DAT</p>
                        <p className="text-xs text-slate-400">Post ID: {load.datPostId}</p>
                      </div>
                      <button
                        onClick={() => datRemoveMutation.mutate(load.datPostId!)}
                        disabled={datRemoveMutation.isPending}
                        className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30 disabled:opacity-50"
                      >
                        {datRemoveMutation.isPending ? "Removing..." : "Remove from DAT"}
                      </button>
                    </div>
                  </div>
                )}

                {datResponses && datResponses.responses.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-medium text-slate-400 mb-2">DAT Responses ({datResponses.responses.length})</h3>
                    {datResponses.mock && <p className="text-xs text-yellow-400 mb-2">Demo mode — showing sample responses</p>}
                    <div className="space-y-2">
                      {datResponses.responses.map((r) => (
                        <div key={r.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                          <div>
                            <p className="text-sm text-white font-medium">{r.carrierName}</p>
                            <p className="text-xs text-slate-400">MC# {r.mcNumber} | DOT# {r.dotNumber} | {r.equipment}</p>
                            <p className="text-xs text-slate-400">{r.phone} | {r.email}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gold font-medium">${r.offeredRate.toLocaleString()}</p>
                            <p className="text-xs text-slate-400">{r.truckCount} truck{r.truckCount !== 1 ? "s" : ""} {r.driverAvailable ? "— driver ready" : ""}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {datPostMutation.isError && <p className="text-xs text-red-400 mt-2">Failed to post to DAT. Please try again.</p>}
                {datRemoveMutation.isError && <p className="text-xs text-red-400 mt-2">Failed to remove from DAT. Please try again.</p>}
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
                <p className="text-xs text-slate-500 mb-3">{suggestedCarriers.total} candidates evaluated</p>
                <div className="space-y-2">
                  {suggestedCarriers.carriers.slice(0, 5).map((c) => {
                    const isRed = c.complianceStatus === "red";
                    const isAmber = c.complianceStatus === "amber";
                    return (
                      <div key={c.carrierId} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isRed ? "bg-red-500" : isAmber ? "bg-amber-500" : "bg-green-500"}`} title={isRed ? "Non-Compliant" : isAmber ? "Expiring Soon" : "Compliant"} />
                          <div>
                            <p className="text-sm text-white">{c.company}</p>
                            <p className="text-xs text-slate-500">{c.equipmentTypes.join(", ")}</p>
                          </div>
                        </div>
                        {isRed ? (
                          <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">Non-Compliant</span>
                        ) : (
                          <button
                            onClick={() => { setTenderCarrierId(c.carrierId); setTenderRate(String(load.rate)); setShowTender(true); setComplianceResult(null); }}
                            className="px-2 py-1 bg-gold/20 text-gold rounded text-xs hover:bg-gold/30"
                          >
                            Quick Tender
                          </button>
                        )}
                      </div>
                    );
                  })}
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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Tender Load to Carrier</h2>
                <button onClick={() => { setShowTender(false); setComplianceResult(null); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-gray-600">{load.referenceNumber} — {load.originCity}, {load.originState} → {load.destCity}, {load.destState}</p>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Select Carrier</label>
                <select value={tenderCarrierId} onChange={(e) => { setTenderCarrierId(e.target.value); setComplianceResult(null); }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20">
                  <option value="">Choose a carrier...</option>
                  {suggestedCarriers?.carriers?.filter((c) => c.complianceStatus !== "red").map((c) => (
                    <option key={c.carrierId} value={c.carrierId}>
                      {c.company} ({c.tier}){c.complianceStatus === "amber" ? " - Expiring" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Offered Rate ($)</label>
                <input type="number" value={tenderRate} onChange={(e) => setTenderRate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
              </div>

              {/* Compliance warnings/blocks */}
              {complianceResult && !complianceResult.allowed && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm font-medium text-red-400 mb-1">Carrier Blocked</p>
                  {complianceResult.blocked_reasons.map((r, i) => (
                    <p key={i} className="text-xs text-red-300">- {r}</p>
                  ))}
                </div>
              )}
              {complianceResult && complianceResult.allowed && complianceResult.warnings.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-sm font-medium text-amber-400 mb-1">Compliance Warnings</p>
                  {complianceResult.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-300">- {w}</p>
                  ))}
                </div>
              )}

              <button
                onClick={async () => {
                  if (!tenderCarrierId || !tenderRate) return;
                  // Pre-flight compliance check
                  if (!complianceResult) {
                    setCheckingCompliance(true);
                    try {
                      const res = await api.post(`/compliance/carrier/${tenderCarrierId}/check`);
                      const result = res.data as { allowed: boolean; blocked_reasons: string[]; warnings: string[] };
                      setComplianceResult(result);
                      if (result.allowed && result.warnings.length === 0) {
                        createTender.mutate({ loadId: load.id, carrierId: tenderCarrierId, offeredRate: parseFloat(tenderRate) });
                      }
                    } catch {
                      createTender.mutate({ loadId: load.id, carrierId: tenderCarrierId, offeredRate: parseFloat(tenderRate) });
                    } finally {
                      setCheckingCompliance(false);
                    }
                    return;
                  }
                  if (complianceResult.allowed) {
                    createTender.mutate({ loadId: load.id, carrierId: tenderCarrierId, offeredRate: parseFloat(tenderRate) });
                  }
                }}
                disabled={!tenderCarrierId || !tenderRate || createTender.isPending || checkingCompliance || (complianceResult !== null && !complianceResult.allowed)}
                className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50"
              >
                {checkingCompliance ? "Checking Compliance..." : complianceResult && complianceResult.allowed && complianceResult.warnings.length > 0 ? "Send Tender (with warnings)" : "Send Tender"}
              </button>
            </div>
          </div>
        )}

        {/* Advanced DAT Post Modal */}
        {showDatAdvanced && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Globe className="w-5 h-5 text-gold" /> Advanced DAT Post</h2>
                <button onClick={() => setShowDatAdvanced(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-gray-600">Override load details for the DAT posting. Leave blank to use load defaults.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Origin City</label>
                  <input value={datAdvForm.originCity} onChange={(e) => setDatAdvForm((f) => ({ ...f, originCity: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Origin State</label>
                  <input value={datAdvForm.originState} onChange={(e) => setDatAdvForm((f) => ({ ...f, originState: e.target.value }))} maxLength={2}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dest City</label>
                  <input value={datAdvForm.destCity} onChange={(e) => setDatAdvForm((f) => ({ ...f, destCity: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dest State</label>
                  <input value={datAdvForm.destState} onChange={(e) => setDatAdvForm((f) => ({ ...f, destState: e.target.value }))} maxLength={2}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Equipment Type</label>
                  <select value={datAdvForm.equipmentType} onChange={(e) => setDatAdvForm((f) => ({ ...f, equipmentType: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20">
                    <option value="">Use default</option>
                    {["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Weight (lbs)</label>
                  <input type="number" value={datAdvForm.weight} onChange={(e) => setDatAdvForm((f) => ({ ...f, weight: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Rate ($)</label>
                  <input type="number" value={datAdvForm.rate} onChange={(e) => setDatAdvForm((f) => ({ ...f, rate: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Load Type</label>
                  <select value={datAdvForm.loadType} onChange={(e) => setDatAdvForm((f) => ({ ...f, loadType: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20">
                    <option value="FULL">Full Truckload</option>
                    <option value="PARTIAL">Partial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pickup Date</label>
                  <input type="date" value={datAdvForm.pickupDate} onChange={(e) => setDatAdvForm((f) => ({ ...f, pickupDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Delivery Date</label>
                  <input type="date" value={datAdvForm.deliveryDate} onChange={(e) => setDatAdvForm((f) => ({ ...f, deliveryDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Comments</label>
                <textarea value={datAdvForm.comments} onChange={(e) => setDatAdvForm((f) => ({ ...f, comments: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 resize-none" />
              </div>
              {datPostAdvancedMutation.isError && <p className="text-xs text-red-400">Failed to post. Please try again.</p>}
              <button
                onClick={() => {
                  const body: Record<string, any> = { loadId: load.id };
                  if (datAdvForm.originCity) body.originCity = datAdvForm.originCity;
                  if (datAdvForm.originState) body.originState = datAdvForm.originState;
                  if (datAdvForm.destCity) body.destCity = datAdvForm.destCity;
                  if (datAdvForm.destState) body.destState = datAdvForm.destState;
                  if (datAdvForm.equipmentType) body.equipmentType = datAdvForm.equipmentType;
                  if (datAdvForm.weight) body.weight = parseFloat(datAdvForm.weight);
                  if (datAdvForm.rate) body.rate = parseFloat(datAdvForm.rate);
                  if (datAdvForm.pickupDate) body.pickupDate = datAdvForm.pickupDate;
                  if (datAdvForm.deliveryDate) body.deliveryDate = datAdvForm.deliveryDate;
                  if (datAdvForm.loadType) body.loadType = datAdvForm.loadType;
                  if (datAdvForm.comments) body.comments = datAdvForm.comments;
                  datPostAdvancedMutation.mutate(body);
                }}
                disabled={datPostAdvancedMutation.isPending}
                className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50"
              >
                {datPostAdvancedMutation.isPending ? "Posting to DAT..." : "Post to DAT"}
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-1">No loads match your filters</h3>
            <p className="text-sm text-slate-400 mb-4 max-w-sm">Create a new load to get started</p>
            {canCreate && (
              <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-gold text-navy rounded-lg text-sm font-medium">Create Load</button>
            )}
          </div>
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
