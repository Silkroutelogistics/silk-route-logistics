"use client";

import { useState } from "react";
import { MapPin, Phone, FileText, CheckCircle, Clock, AlertCircle, Printer } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard, CarrierBadge } from "@/components/carrier";
import { BOLTemplate } from "@/components/templates";
import type { BOLData } from "@/components/templates";

const statusFilters = ["All", "BOOKED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED"];
const statusTransitions: Record<string, string[]> = {
  BOOKED: ["AT_PICKUP"],
  DISPATCHED: ["AT_PICKUP"],
  AT_PICKUP: ["LOADED"],
  LOADED: ["IN_TRANSIT"],
  IN_TRANSIT: ["AT_DELIVERY"],
  AT_DELIVERY: ["DELIVERED"],
};

export default function MyLoadsPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkCallForm, setCheckCallForm] = useState({ city: "", state: "", notes: "" });
  const [showBOL, setShowBOL] = useState(false);
  const queryClient = useQueryClient();

  const query = new URLSearchParams();
  if (activeFilter !== "All") query.set("status", activeFilter);
  query.set("page", String(page));
  query.set("limit", "20");

  const { data, isLoading } = useQuery({
    queryKey: ["carrier-my-loads", activeFilter, page],
    queryFn: () => api.get(`/carrier-loads/my-loads?${query.toString()}`).then((r) => r.data),
  });

  const { data: detail } = useQuery({
    queryKey: ["carrier-my-load-detail", selectedId],
    queryFn: () => api.get(`/carrier-loads/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const statusMutation = useMutation({
    mutationFn: ({ loadId, status }: { loadId: string; status: string }) =>
      api.post(`/carrier-loads/${loadId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrier-my-loads"] });
      queryClient.invalidateQueries({ queryKey: ["carrier-my-load-detail", selectedId] });
    },
  });

  const checkCallMutation = useMutation({
    mutationFn: ({ loadId, data }: { loadId: string; data: any }) =>
      api.post(`/carrier-loads/${loadId}/check-call`, data),
    onSuccess: () => {
      setCheckCallForm({ city: "", state: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["carrier-my-load-detail", selectedId] });
    },
  });

  const loads = data?.loads || [];
  const nextStatuses = detail ? statusTransitions[detail.status] || [] : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">My Loads</h1>
        <p className="text-[13px] text-gray-500">Manage your assigned loads and update shipment status</p>
      </div>

      {/* Filters */}
      <CarrierCard padding="p-3" className="mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {statusFilters.map((f) => (
            <button
              key={f}
              onClick={() => { setActiveFilter(f); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium ${
                f === activeFilter ? "bg-[#0D1B2A] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >{f === "All" ? "All" : f.replace(/_/g, " ")}</button>
          ))}
        </div>
      </CarrierCard>

      <div className="grid grid-cols-[1fr_400px] gap-5">
        {/* Load list */}
        <div className="space-y-2">
          {isLoading ? (
            [...Array(5)].map((_, i) => (
              <CarrierCard key={i} padding="p-4"><div className="h-16 bg-gray-100 rounded animate-pulse" /></CarrierCard>
            ))
          ) : loads.length === 0 ? (
            <CarrierCard padding="p-12">
              <div className="text-center text-gray-400 text-sm">No loads found</div>
            </CarrierCard>
          ) : (
            loads.map((load: any) => (
              <CarrierCard
                key={load.id}
                hover
                padding="p-4"
                onClick={() => setSelectedId(load.id)}
                className={selectedId === load.id ? "!border-[#C9A84C]" : ""}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-[#0D1B2A]">{load.referenceNumber}</span>
                      <CarrierBadge status={load.status} />
                    </div>
                    <div className="text-xs text-gray-600">
                      {load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      {load.equipmentType} &middot; Pick: {new Date(load.pickupDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[#0D1B2A]">${(load.carrierRate || load.rate || 0).toLocaleString()}</span>
                </div>
              </CarrierCard>
            ))
          )}
          {data && data.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              {page > 1 && <button onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-xs rounded bg-gray-100">Prev</button>}
              <span className="px-3 py-1.5 text-xs text-gray-500">Page {page}/{data.totalPages}</span>
              {page < data.totalPages && <button onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-xs rounded bg-gray-100">Next</button>}
            </div>
          )}
        </div>

        {/* Detail + Actions */}
        <div className="space-y-4">
          {selectedId && detail ? (
            <>
              {/* Load info */}
              <CarrierCard padding="p-5">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-sm font-bold text-[#0D1B2A]">{detail.referenceNumber}</h3>
                  <CarrierBadge status={detail.status} size="md" />
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-[#C9A84C] mt-0.5" />
                    <div>
                      <div className="font-medium">{detail.originCity}, {detail.originState} {detail.originZip || ""}</div>
                      <div className="text-gray-400">&darr;</div>
                      <div className="font-medium">{detail.destCity}, {detail.destState} {detail.destZip || ""}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-100">
                    <div><span className="text-gray-400">Equipment</span><br />{detail.equipmentType}</div>
                    <div><span className="text-gray-400">Weight</span><br />{detail.weight ? `${Number(detail.weight).toLocaleString()} lbs` : "—"}</div>
                    <div><span className="text-gray-400">Pickup</span><br />{new Date(detail.pickupDate).toLocaleDateString()}</div>
                    <div><span className="text-gray-400">Delivery</span><br />{detail.deliveryDate ? new Date(detail.deliveryDate).toLocaleDateString() : "—"}</div>
                    <div><span className="text-gray-400">Rate</span><br /><span className="text-[#C9A84C] font-bold">${(detail.carrierRate || detail.rate || 0).toLocaleString()}</span></div>
                    <div><span className="text-gray-400">Distance</span><br />{detail.distance ? `${detail.distance} mi` : "—"}</div>
                  </div>
                  {detail.poster && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                      <Phone size={14} className="text-gray-400" />
                      <span>{detail.poster.company || `${detail.poster.firstName} ${detail.poster.lastName}`}</span>
                    </div>
                  )}
                  {detail.rateConfirmationPdfUrl && (
                    <a href={detail.rateConfirmationPdfUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[#C9A84C] font-semibold mt-2">
                      <FileText size={14} /> View Rate Confirmation
                    </a>
                  )}
                  <button
                    onClick={() => setShowBOL(true)}
                    className="flex items-center gap-1.5 text-[#C9A84C] font-semibold mt-2 hover:underline text-xs"
                  >
                    <Printer size={14} /> Print Bill of Lading
                  </button>
                </div>
              </CarrierCard>

              {/* Status Update */}
              {nextStatuses.length > 0 && (
                <CarrierCard padding="p-4">
                  <h4 className="text-xs font-bold text-[#0D1B2A] mb-3 flex items-center gap-1.5">
                    <CheckCircle size={14} className="text-[#C9A84C]" /> Update Status
                  </h4>
                  <div className="flex gap-2">
                    {nextStatuses.map((ns) => (
                      <button
                        key={ns}
                        onClick={() => statusMutation.mutate({ loadId: selectedId, status: ns })}
                        disabled={statusMutation.isPending}
                        className="px-4 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-white text-xs font-semibold rounded-md disabled:opacity-60"
                      >
                        {ns.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                  {statusMutation.isError && (
                    <p className="text-xs text-red-500 mt-2">{(statusMutation.error as any)?.response?.data?.error || "Update failed"}</p>
                  )}
                </CarrierCard>
              )}

              {/* Check Call */}
              {!["DELIVERED", "POD_RECEIVED", "COMPLETED", "CANCELLED"].includes(detail.status) && (
                <CarrierCard padding="p-4">
                  <h4 className="text-xs font-bold text-[#0D1B2A] mb-3 flex items-center gap-1.5">
                    <Clock size={14} className="text-amber-500" /> Submit Check Call
                  </h4>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input
                      placeholder="City"
                      value={checkCallForm.city}
                      onChange={(e) => setCheckCallForm({ ...checkCallForm, city: e.target.value })}
                      className="px-3 py-2 border border-gray-200 rounded text-xs focus:border-[#C9A84C] focus:outline-none"
                    />
                    <input
                      placeholder="State"
                      value={checkCallForm.state}
                      onChange={(e) => setCheckCallForm({ ...checkCallForm, state: e.target.value })}
                      className="px-3 py-2 border border-gray-200 rounded text-xs focus:border-[#C9A84C] focus:outline-none"
                    />
                  </div>
                  <textarea
                    placeholder="Notes (optional)"
                    value={checkCallForm.notes}
                    onChange={(e) => setCheckCallForm({ ...checkCallForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded text-xs mb-2 focus:border-[#C9A84C] focus:outline-none resize-none"
                    rows={2}
                  />
                  <button
                    onClick={() => checkCallMutation.mutate({ loadId: selectedId, data: checkCallForm })}
                    disabled={checkCallMutation.isPending}
                    className="px-4 py-2 bg-[#0D1B2A] text-white text-xs font-semibold rounded-md disabled:opacity-60"
                  >
                    {checkCallMutation.isPending ? "Submitting..." : "Submit Check Call"}
                  </button>
                </CarrierCard>
              )}
            </>
          ) : (
            <CarrierCard padding="p-8">
              <div className="text-center text-gray-400 text-sm">
                <Truck size={32} className="mx-auto mb-3 text-gray-300" />
                Select a load to manage
              </div>
            </CarrierCard>
          )}
        </div>
      </div>

      {/* BOL Template Modal */}
      {showBOL && detail && (
        <BOLTemplate
          onClose={() => setShowBOL(false)}
          data={{
            referenceNumber: detail.referenceNumber || "",
            loadNumber: detail.loadNumber,
            shipperReference: detail.shipperReference,
            shipperPoNumber: detail.shipperPoNumber,
            pickupNumber: detail.pickupNumber,
            deliveryReference: detail.deliveryReference,
            originCompany: detail.originCompany,
            originAddress: detail.originAddress,
            originCity: detail.originCity || "",
            originState: detail.originState || "",
            originZip: detail.originZip || "",
            originContactName: detail.originContactName,
            originContactPhone: detail.originContactPhone,
            destCompany: detail.destCompany,
            destAddress: detail.destAddress,
            destCity: detail.destCity || "",
            destState: detail.destState || "",
            destZip: detail.destZip || "",
            destContactName: detail.destContactName,
            destContactPhone: detail.destContactPhone,
            carrierCompany: detail.carrier?.companyName || detail.carrier?.company,
            carrierMC: detail.carrier?.mcNumber,
            carrierDOT: detail.carrier?.dotNumber,
            driverName: detail.driverName,
            driverPhone: detail.driverPhone,
            truckNumber: detail.truckNumber,
            trailerNumber: detail.trailerNumber,
            pickupDate: detail.pickupDate,
            pickupTimeStart: detail.pickupTimeStart,
            pickupTimeEnd: detail.pickupTimeEnd,
            deliveryDate: detail.deliveryDate,
            deliveryTimeStart: detail.deliveryTimeStart,
            deliveryTimeEnd: detail.deliveryTimeEnd,
            commodity: detail.commodity,
            weight: detail.weight,
            pieces: detail.pieces,
            pallets: detail.pallets,
            equipmentType: detail.equipmentType || "",
            freightClass: detail.freightClass,
            stackable: detail.stackable,
            dimensionsLength: detail.dimensionsLength,
            dimensionsWidth: detail.dimensionsWidth,
            dimensionsHeight: detail.dimensionsHeight,
            hazmat: detail.hazmat,
            hazmatUnNumber: detail.hazmatUnNumber,
            hazmatClass: detail.hazmatClass,
            hazmatEmergencyContact: detail.hazmatEmergencyContact,
            temperatureControlled: detail.temperatureControlled,
            tempMin: detail.tempMin,
            tempMax: detail.tempMax,
            pickupInstructions: detail.pickupInstructions,
            deliveryInstructions: detail.deliveryInstructions,
            specialInstructions: detail.specialInstructions,
          } as BOLData}
        />
      )}
    </div>
  );
}

function Truck(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" />
    </svg>
  );
}
