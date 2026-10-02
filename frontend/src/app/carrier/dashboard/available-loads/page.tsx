"use client";

/**
 * Open loads a carrier can take.
 *
 * carrier-portal-upgrade: one column under lg with the chosen load's detail
 * first (M4: this page scrolled sideways at 380px on a fixed 1fr_380px grid);
 * keyboard-selectable cards, rate per mile, copyable reference, stops that open
 * in maps, and the SRL rep to call (M5, G28, G40).
 */
import { formatStopDate } from "@/lib/stopDate";
import { useState } from "react";
import { MapPin, Calendar, Weight, Ruler, ChevronRight, Truck, Send, CheckCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard } from "@/components/carrier";
import { CopyButton, RateWithRpm, MapsLink, RepContact } from "@/components/carrier/LoadUtils";
import type { Load } from "@/types/entities";
import { carrierPay } from "@/lib/rateDisplay";
import { extractApiError } from "@/lib/download";
import { BTN, TEXT_MUTED } from "@/lib/carrierUi";

const NOT_SET = "Not set";
const FIELD =
  "w-full min-h-[44px] px-3 py-2 border border-[#EFE6D3] rounded-lg text-sm transition-colors duration-150 motion-reduce:transition-none " +
  "focus:outline-none focus:border-[#BA7517] focus-visible:ring-2 focus-visible:ring-[#BA7517]/40";
const EMPTY_CAPACITY = { currentCity: "", currentState: "", availableDate: "", equipmentType: "Dry Van", notes: "" };

export default function AvailableLoadsPage() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["carrier-available", page],
    queryFn: () => api.get<{ loads: Load[]; total: number; totalPages: number }>(`/carrier-loads/available?page=${page}&limit=20`).then((r) => r.data),
  });

  const { data: detail } = useQuery({
    queryKey: ["carrier-load-detail", selectedId],
    queryFn: () => api.get(`/carrier-loads/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const [acceptError, setAcceptError] = useState<string | null>(null);
  const acceptMutation = useMutation({
    mutationFn: (loadId: string) => api.post(`/carrier-loads/${loadId}/accept`),
    onMutate: () => setAcceptError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrier-available"] });
      queryClient.invalidateQueries({ queryKey: ["carrier-my-loads"] });
      setSelectedId(null);
    },
    onError: async (err) => setAcceptError(await extractApiError(err, "Could not accept this load.")),
  });

  const [showCapacity, setShowCapacity] = useState(false);
  const [capForm, setCapForm] = useState(EMPTY_CAPACITY);
  const [capSuccess, setCapSuccess] = useState(false);
  const [capError, setCapError] = useState<string | null>(null);
  const postCapacity = useMutation({
    mutationFn: (body: typeof capForm) => api.post("/carrier-loads/post-capacity", body),
    onMutate: () => setCapError(null),
    onSuccess: () => {
      setCapSuccess(true);
      setTimeout(() => setCapSuccess(false), 3000);
      setCapForm(EMPTY_CAPACITY);
    },
    onError: async (err) => setCapError(await extractApiError(err, "Could not post your capacity.")),
  });

  const loads = data?.loads || [];
  const capReady = !!capForm.currentCity && !!capForm.currentState && !!capForm.availableDate;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-serif font-bold text-2xl text-[#0A2540] mb-1">Available Loads</h1>
          <p className={`text-[13px] ${TEXT_MUTED}`}>
            Loads matching your equipment and operating regions &middot; {data?.total || 0} available
          </p>
        </div>
        <button type="button" onClick={() => setShowCapacity((p) => !p)} aria-expanded={showCapacity} className={BTN.secondary}>
          <Truck size={14} aria-hidden="true" /> Post My Capacity
        </button>
      </div>

      {showCapacity && (
        <CarrierCard padding="p-4" className="mb-4">
          <h2 className="text-sm font-semibold text-[#0A2540] mb-3 flex items-center gap-1.5">
            <Truck size={16} className="text-[#854F0B]" aria-hidden="true" /> Announce Your Availability
          </h2>
          <p className={`text-xs ${TEXT_MUTED} mb-3`}>Tell SRL where you are and when you are available. Matching loads will be pushed to you.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input aria-label="Current city" placeholder="Current City" value={capForm.currentCity} onChange={(e) => setCapForm({ ...capForm, currentCity: e.target.value })} className={FIELD} />
            <input aria-label="State" placeholder="State (e.g. MI)" value={capForm.currentState} onChange={(e) => setCapForm({ ...capForm, currentState: e.target.value.toUpperCase().slice(0, 2) })} className={FIELD} />
            <input aria-label="Available date" type="date" value={capForm.availableDate} onChange={(e) => setCapForm({ ...capForm, availableDate: e.target.value })} className={FIELD} />
            <select aria-label="Equipment type" value={capForm.equipmentType} onChange={(e) => setCapForm({ ...capForm, equipmentType: e.target.value })} className={FIELD}>
              {["Dry Van", "Reefer", "Flatbed", "Step Deck", "Power Only"].map((eq) => (
                <option key={eq} value={eq}>{eq}</option>
              ))}
            </select>
          </div>
          <textarea aria-label="Notes" placeholder="Notes (e.g. prefer loads heading east)" value={capForm.notes} onChange={(e) => setCapForm({ ...capForm, notes: e.target.value })} className={`${FIELD} mb-3`} rows={2} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { if (!postCapacity.isPending) postCapacity.mutate(capForm); }}
              disabled={!capReady || postCapacity.isPending}
              title={capReady ? undefined : "Add your city, state and available date first"}
              className={BTN.primary}
            >
              <Send size={12} aria-hidden="true" /> {postCapacity.isPending ? "Posting..." : "Post Capacity"}
            </button>
            {!capReady && <span className={`text-xs ${TEXT_MUTED}`}>Add your city, state and available date first.</span>}
            {capSuccess && <span role="status" className="text-xs text-[#2F7A4F] flex items-center gap-1"><CheckCircle size={12} aria-hidden="true" /> Posted</span>}
            {capError && <span role="alert" className="text-xs text-[#9B2C2C]">{capError}</span>}
          </div>
        </CarrierCard>
      )}

      {/* M4 — one column under lg; the chosen load's detail comes first. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
        {/* Load list */}
        <div className="space-y-2 min-w-0">
          {isLoading ? (
            [...Array(5)].map((_, i) => (
              <CarrierCard key={i} padding="p-4">
                <div className="h-16 bg-[#F5EEE0] rounded animate-pulse motion-reduce:animate-none" />
              </CarrierCard>
            ))
          ) : isError ? (
            <CarrierCard padding="p-6">
              <div role="alert" className="text-center text-sm text-[#9B2C2C]">
                Available loads could not be loaded.
                <div className="mt-2"><button type="button" onClick={() => refetch()} className={BTN.secondary}>Try again</button></div>
              </div>
            </CarrierCard>
          ) : loads.length === 0 ? (
            <CarrierCard padding="p-12">
              <div className="text-center text-sm">
                <div className="font-semibold text-[#0A2540]">No loads match your profile right now</div>
                <div className={`mt-1 ${TEXT_MUTED}`}>New loads appear here as SRL posts them. Posting your capacity tells SRL where you are.</div>
              </div>
            </CarrierCard>
          ) : (
            loads.map((load) => (
              <CarrierCard
                key={load.id}
                padding="p-4"
                onClick={() => setSelectedId(load.id)}
                selected={selectedId === load.id}
                label={`Load ${load.referenceNumber}, ${load.originCity} to ${load.destCity}. Show details`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="font-mono text-xs font-bold text-[#0A2540]">{load.referenceNumber}</span>
                      <span className="text-[11px] text-[#3A4A5F] bg-[#F5EEE0] px-2 py-0.5 rounded">{load.equipmentType}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-sm text-[#3A4A5F]">
                      <MapPin size={14} className="text-[#854F0B]" aria-hidden="true" />
                      <span>{load.originCity}, {load.originState}</span>
                      <span aria-hidden="true">&rarr;</span>
                      <span className="sr-only">to</span>
                      <span>{load.destCity}, {load.destState}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-[#3A4A5F]">
                      <span className="flex items-center gap-1"><Calendar size={12} aria-hidden="true" /> {formatStopDate(load.pickupDate)}</span>
                      {load.weight && <span className="flex items-center gap-1"><Weight size={12} aria-hidden="true" /> {Number(load.weight).toLocaleString()} lbs</span>}
                      {load.distance && <span className="flex items-center gap-1"><Ruler size={12} aria-hidden="true" /> {load.distance} mi</span>}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1 shrink-0">
                    <RateWithRpm amount={carrierPay(load)} miles={load.distance} className="text-base font-bold text-[#854F0B]" />
                    <ChevronRight size={16} className="text-[#5B6B7D] mt-1" aria-hidden="true" />
                  </div>
                </div>
              </CarrierCard>
            ))
          )}

          {data && data.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              {page > 1 && <button type="button" onClick={() => setPage(page - 1)} className={BTN.secondary}>Previous</button>}
              <span className={`self-center px-3 text-xs ${TEXT_MUTED}`}>Page {page} of {data.totalPages}</span>
              {page < data.totalPages && <button type="button" onClick={() => setPage(page + 1)} className={BTN.secondary}>Next</button>}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className={selectedId ? "order-first lg:order-none" : "hidden lg:block"}>
          {selectedId && detail ? (
            <CarrierCard padding="p-5" className="lg:sticky lg:top-6">
              <h2 className="text-sm font-bold text-[#0A2540] mb-4">Load Details</h2>
              <dl className="space-y-3 text-xs">
                <div className="flex justify-between items-center gap-3">
                  <dt className={TEXT_MUTED}>Reference</dt>
                  <dd className="flex items-center font-mono font-bold">
                    {detail.referenceNumber}
                    {detail.referenceNumber && <CopyButton value={detail.referenceNumber} label="load number" />}
                  </dd>
                </div>
                <div className="flex justify-between gap-3"><dt className={TEXT_MUTED}>Equipment</dt><dd>{detail.equipmentType}</dd></div>
                {[
                  { k: "Origin", a: `${detail.originCity}, ${detail.originState} ${detail.originZip || ""}`.trim() },
                  { k: "Destination", a: `${detail.destCity}, ${detail.destState} ${detail.destZip || ""}`.trim() },
                ].map((stop) => (
                  <div key={stop.k} className="flex justify-between items-center gap-3">
                    <dt className={TEXT_MUTED}>{stop.k}</dt>
                    <dd className="flex items-center text-right"><MapsLink address={stop.a}>{stop.a}</MapsLink></dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3"><dt className={TEXT_MUTED}>Pickup</dt><dd>{formatStopDate(detail.pickupDate) ?? NOT_SET}</dd></div>
                {detail.deliveryDate && (
                  <div className="flex justify-between gap-3"><dt className={TEXT_MUTED}>Delivery</dt><dd>{formatStopDate(detail.deliveryDate)}</dd></div>
                )}
                <div className="flex justify-between gap-3"><dt className={TEXT_MUTED}>Weight</dt><dd>{detail.weight ? `${Number(detail.weight).toLocaleString()} lbs` : NOT_SET}</dd></div>
                <div className="flex justify-between gap-3"><dt className={TEXT_MUTED}>Commodity</dt><dd>{detail.commodity || NOT_SET}</dd></div>
                <div className="flex justify-between items-center gap-3">
                  <dt className={TEXT_MUTED}>Rate</dt>
                  <dd><RateWithRpm amount={carrierPay(detail)} miles={detail.distance} className="text-lg font-bold text-[#854F0B]" /></dd>
                </div>
                {detail.specialInstructions && (
                  <div>
                    <dt className={`${TEXT_MUTED} mb-1`}>Special Instructions</dt>
                    <dd className="text-[#3A4A5F] bg-[#FBF7F0] rounded p-2 break-words">{detail.specialInstructions}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-3 pt-3 border-t border-[#F5EEE0] text-xs">
                <RepContact rep={detail.poster ?? {}} />
              </div>

              <button
                type="button"
                onClick={() => { if (!acceptMutation.isPending) acceptMutation.mutate(selectedId); }}
                disabled={acceptMutation.isPending}
                className={`${BTN.primary} w-full mt-5`}
              >
                {acceptMutation.isPending ? "Accepting..." : "Accept Load"}
              </button>
              {acceptError && <p role="alert" className="text-xs text-[#9B2C2C] mt-2 text-center">{acceptError}</p>}
            </CarrierCard>
          ) : selectedId ? (
            <CarrierCard padding="p-5"><div role="status" aria-label="Loading load details" className="h-40 rounded bg-[#F5EEE0] animate-pulse motion-reduce:animate-none" /></CarrierCard>
          ) : (
            <CarrierCard padding="p-8" className="lg:sticky lg:top-6">
              <div className={`text-center text-sm ${TEXT_MUTED}`}>
                <MapPin size={32} className="mx-auto mb-3 text-[#5B6B7D]" aria-hidden="true" />
                Select a load to view details
              </div>
            </CarrierCard>
          )}
        </div>
      </div>
    </div>
  );
}
