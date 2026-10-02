"use client";

/**
 * The load board: open and reserved loads a carrier can bid on.
 *
 * carrier-portal-upgrade F2 (M4/M5): cards stack on a phone; the bid form is a
 * bottom sheet under 768px and a centred dialog above; every control is 44px
 * with a focus ring; the rate shows per mile; the load number copies; the bid
 * cannot be sent twice and a failure is shown, where before it vanished.
 * `rate` left the type: the feed stopped sending it (G37, it can hold the
 * customer rate).
 */
import { formatStopDate } from "@/lib/stopDate";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MapPin, DollarSign, X, CheckCircle } from "lucide-react";
import { carrierPay } from "@/lib/rateDisplay";
import { CopyButton, RateWithRpm } from "@/components/carrier/LoadUtils";
import { extractApiError } from "@/lib/download";
import { BTN, TEXT_MUTED, useUnsavedChangesWarning } from "@/lib/carrierUi";

interface BoardLoad {
  id: string;
  loadNumber: string | null;
  referenceNumber: string;
  visibility: string;
  originCity: string | null;
  originState: string | null;
  destCity: string | null;
  destState: string | null;
  equipmentType: string;
  weight: number | null;
  commodity: string | null;
  distance: number | null;
  pickupDate: string;
  deliveryDate: string;
  carrierRate: number | null;
}

const FIELD =
  "w-full min-h-[44px] bg-white border border-[#EFE6D3] rounded text-[#0A2540] transition-colors duration-150 motion-reduce:transition-none " +
  "focus:border-[#BA7517] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]/40";

export default function LoadboardPage() {
  const [bidFor, setBidFor] = useState<BoardLoad | null>(null);
  const [bidRate, setBidRate] = useState("");
  const [notes, setNotes] = useState("");
  const [bidError, setBidError] = useState<string | null>(null);
  const [bidSent, setBidSent] = useState<string | null>(null);

  const loadsQuery = useQuery<{ loads: BoardLoad[] }>({
    queryKey: ["carrier-loadboard"],
    queryFn: async () => (await api.get("/loadboard")).data,
    refetchInterval: 30_000,
  });

  const submitBid = useMutation({
    mutationFn: async () => {
      if (!bidFor) return;
      return (await api.post(`/loads/${bidFor.id}/bids`, {
        bidRate: parseFloat(bidRate),
        notes: notes || undefined,
      })).data;
    },
    onMutate: () => setBidError(null),
    onSuccess: () => {
      setBidSent(bidFor ? bidFor.loadNumber ?? bidFor.referenceNumber : null);
      setBidFor(null); setBidRate(""); setNotes("");
      loadsQuery.refetch();
    },
    onError: async (err) => setBidError(await extractApiError(err, "Could not send your bid. Please try again.")),
  });

  const close = () => { if (!submitBid.isPending) { setBidFor(null); setBidError(null); } };
  useEffect(() => {
    if (!bidFor) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useUnsavedChangesWarning(!!bidFor && !submitBid.isPending && (bidRate !== String(bidFor.carrierRate ?? "") || !!notes));

  const loads = loadsQuery.data?.loads ?? [];
  const bidValid = Number(bidRate) > 0;

  return (
    <div className="p-0 sm:p-2 space-y-4">
      <div>
        <h1 className="text-2xl font-serif font-bold text-[#0A2540]">Load Board</h1>
        <p className="text-sm text-[#3A4A5F] mt-1">Browse available loads from The Caravan. Submit a bid to book.</p>
      </div>

      {bidSent && (
        <div role="status" className="flex items-center gap-2 p-3 rounded-lg bg-[#E6F0E9] text-sm text-[#256340]">
          <CheckCircle size={16} aria-hidden="true" /> Bid sent on load {bidSent}. SRL will reply by email and on your Tenders page.
        </div>
      )}

      {loadsQuery.isLoading ? (
        <div role="status" aria-label="Loading the load board" className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-lg bg-[#F5EEE0] animate-pulse motion-reduce:animate-none" />)}
        </div>
      ) : loadsQuery.isError ? (
        <div role="alert" className="p-6 text-center text-sm text-[#9B2C2C] bg-white border border-[#EFE6D3] rounded-xl">
          The load board could not be loaded.
          <div className="mt-2"><button type="button" onClick={() => loadsQuery.refetch()} className={BTN.secondary}>Try again</button></div>
        </div>
      ) : loads.length === 0 ? (
        <div className="p-8 sm:p-12 text-center text-sm bg-[#F5EEE0] border border-[#EFE6D3] rounded-xl">
          <div className="font-semibold text-[#0A2540]">No loads available right now</div>
          <div className={`mt-1 ${TEXT_MUTED}`}>The board refreshes every 30 seconds.</div>
        </div>
      ) : (
        <ul className="space-y-2">
          {loads.map((l) => (
            <li key={l.id} className="bg-white border border-[#EFE6D3] rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none hover:border-[#C5A572] hover:shadow-[0_8px_30px_rgba(10,37,64,0.08)]">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#0A2540]">{l.loadNumber ?? l.referenceNumber}</span>
                  <CopyButton value={l.loadNumber ?? l.referenceNumber} label="load number" />
                  {l.visibility === "reserved" && (
                    <span className="px-1.5 py-0.5 text-[11px] rounded bg-[#E2EAF2] text-[#2A5B8B]">Reserved</span>
                  )}
                </div>
                <div className="mt-1 text-sm text-[#3A4A5F] flex flex-wrap items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#854F0B]" aria-hidden="true" />
                  {l.originCity}, {l.originState} → {l.destCity}, {l.destState}
                  {l.distance && ` · ${Math.round(l.distance).toLocaleString()} mi`}
                </div>
                <div className="mt-0.5 text-xs text-[#3A4A5F]">
                  {l.equipmentType}
                  {l.weight && ` · ${l.weight} lbs`}
                  {l.commodity && ` · ${l.commodity}`}
                  {" · Pickup "}{formatStopDate(l.pickupDate)}
                </div>
              </div>
              <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                <div className="sm:text-right">
                  <div className={`text-[11px] uppercase ${TEXT_MUTED}`}>Posted rate</div>
                  <RateWithRpm amount={carrierPay(l)} miles={l.distance} className="text-lg font-semibold text-[#854F0B]" />
                </div>
                <button
                  type="button"
                  onClick={() => { setBidSent(null); setBidFor(l); setBidRate(l.carrierRate != null ? String(l.carrierRate) : ""); }}
                  className={BTN.primary}
                >
                  Bid
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Bid form: a bottom sheet under 768px, a centred dialog above. */}
      {bidFor && (
        <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center bg-[#0A2540]/60 md:px-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bid-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-[#EFE6D3] rounded-t-xl md:rounded-xl p-5 sm:p-6 w-full md:max-w-md max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="bid-title" className="text-lg font-semibold text-[#0A2540]">Submit bid</h2>
              <button type="button" onClick={close} aria-label="Close" className="inline-flex h-11 w-11 items-center justify-center rounded hover:bg-[#F5EEE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]">
                <X className="w-4 h-4 text-[#5B6B7D]" aria-hidden="true" />
              </button>
            </div>

            <div className="text-sm text-[#3A4A5F] mb-4">
              Load {bidFor.loadNumber ?? bidFor.referenceNumber}
              <div className={`text-xs mt-0.5 ${TEXT_MUTED}`}>
                {bidFor.originCity}, {bidFor.originState} → {bidFor.destCity}, {bidFor.destState}
              </div>
            </div>

            <label htmlFor="bid-rate" className="block text-xs text-[#3A4A5F] mb-1">Your bid rate ($)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3.5 w-4 h-4 text-[#5B6B7D]" aria-hidden="true" />
              <input id="bid-rate" type="number" min="1" inputMode="decimal" value={bidRate} onChange={(e) => setBidRate(e.target.value)} className={`${FIELD} pl-9 pr-3 py-2`} />
            </div>

            <label htmlFor="bid-notes" className="block text-xs text-[#3A4A5F] mb-1 mt-3">Notes (optional)</label>
            <textarea id="bid-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${FIELD} px-3 py-2 text-sm`} />

            {bidError && <p role="alert" className="mt-3 text-xs text-[#9B2C2C]">{bidError}</p>}

            <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2">
              <button type="button" onClick={close} disabled={submitBid.isPending} className={`${BTN.secondary} flex-1`}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { if (!submitBid.isPending && bidValid) submitBid.mutate(); }}
                disabled={!bidValid || submitBid.isPending}
                title={bidValid ? undefined : "Enter a bid rate above zero"}
                className={`${BTN.primary} flex-1`}
              >
                {submitBid.isPending ? "Submitting..." : "Submit bid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
