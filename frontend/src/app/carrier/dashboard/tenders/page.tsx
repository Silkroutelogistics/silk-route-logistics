"use client";

// Sprint 52.hotfix.b — rewired to canonical /api/carrier/tenders consumer.
// Pre-fix this page called /carrier-tenders/active (WaterfallPosition-only,
// pre-v3.4.d state field) which never surfaced direct AE-console tenders
// to the carrier. The right endpoint (GET /api/carrier/tenders, controller
// getCarrierTenders) returns LoadTender[] for the authed carrier and was
// unused by any frontend. Sub-pattern 12 (write-read-dataflow-audit) fire
// #28 — endpoint-selection drift between similar-named parallel endpoints.

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Clock, MapPin, AlertTriangle, CheckCircle2, Repeat2 } from "lucide-react";

const DECLINE_REASONS = [
  "No capacity / all trucks committed",
  "Rate too low",
  "Lane doesn't work for us",
  "Equipment not available",
  "Dates don't work",
  "Already committed to another load",
  "Other",
];

// LoadTender shape returned by GET /api/carrier/tenders (full default
// Prisma selection on LoadTender + load relation with poster sub-include
// per getCarrierTenders controller). waterfallPositionId is the
// discriminator: null = direct AE tender; set = cascade-originated.
interface ActiveTender {
  id: string;
  loadId: string;
  carrierId: string;
  status: string;
  offeredRate: number;
  counterRate: number | null;
  respondedAt: string | null;
  expiresAt: string;
  createdAt: string;
  waterfallPositionId: string | null;
  load: {
    id: string;
    referenceNumber: string;
    originCity: string;
    originState: string;
    destCity: string;
    destState: string;
    equipmentType: string;
    weight: number | null;
    commodity: string | null;
    pickupDate: string;
    deliveryDate: string;
    distance: number | null;
    rate: number;
    poster: {
      id: string;
      company: string | null;
      firstName: string;
      lastName: string;
    } | null;
  };
}

// Countdown widget — same as pre-fix.
function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now())
  );
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const cls = h === 0 && m < 5 ? "text-[#9B2C2C]" : h === 0 && m < 30 ? "text-[#B07A1A]" : "text-[#BA7517]";
  if (remaining === 0) return <span className="font-mono font-semibold text-2xl text-[#9B2C2C]">Expired</span>;
  const display = h > 0
    ? `${h}h ${String(m).padStart(2, "0")}m`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return <span className={`font-mono font-semibold tabular-nums text-2xl ${cls}`}>{display}</span>;
}

export default function CarrierTendersPage() {
  const queryClient = useQueryClient();
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // v3.8.alt §13.3 Item 144 — carrier counter-offer
  const [countering, setCountering] = useState<string | null>(null);
  const [counterRate, setCounterRate] = useState("");

  // Sprint 52.hotfix.b — consume canonical /api/carrier/tenders.
  // Backend filters status=OFFERED + expiresAt > now + deletedAt: null
  // (Sprint 52.hotfix.b getCarrierTenders WHERE-clause hardening). Both
  // direct + cascade-originated tenders surface together; frontend renders
  // source badge for cascade rows.
  const tendersQuery = useQuery<ActiveTender[]>({
    queryKey: ["carrier-tenders"],
    queryFn: async () => (await api.get("/carrier/tenders")).data,
    refetchInterval: 10_000,
  });

  const accept = useMutation({
    mutationFn: async (tenderId: string) =>
      (await api.post(`/tenders/${tenderId}/accept`)).data,
    onSuccess: () => {
      // Sprint 38 Item 53 atomic transaction also flips Load → BOOKED +
      // sets carrierId; invalidate carrier-loads queries so My Loads picks
      // up the newly booked load without a manual refresh.
      queryClient.invalidateQueries({ queryKey: ["carrier-tenders"] });
      queryClient.invalidateQueries({ queryKey: ["carrier-loads"] });
      queryClient.invalidateQueries({ queryKey: ["carrier-my-loads"] });
    },
  });

  const decline = useMutation({
    mutationFn: async ({ tenderId, reason }: { tenderId: string; reason: string }) =>
      (await api.post(`/tenders/${tenderId}/decline`, { reason })).data,
    onSuccess: () => {
      setDeclining(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["carrier-tenders"] });
    },
  });

  // v3.8.alt §13.3 Item 144 — carrier counter-offer. Backend counterTender
  // (POST /tenders/:id/counter) was fully wired since v3.8.aka (status →
  // COUNTERED + counterRate + audit + notifyTenderAction("COUNTERED") email
  // to the AE) but had NO carrier-facing UI to submit one. Once countered
  // the tender drops off this OFFERED-filtered list — the ball is in the
  // AE's court (same disappear-on-action UX as decline).
  const counter = useMutation({
    mutationFn: async ({ tenderId, counterRate }: { tenderId: string; counterRate: number }) =>
      (await api.post(`/tenders/${tenderId}/counter`, { counterRate })).data,
    onSuccess: () => {
      setCountering(null);
      setCounterRate("");
      queryClient.invalidateQueries({ queryKey: ["carrier-tenders"] });
    },
  });

  const tenders = tendersQuery.data ?? [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-serif font-semibold text-[#0A2540]">Active tenders</h1>
        <p className="text-sm text-slate-700 mt-1">
          Accept or decline each tender before its expiration. Accepted tenders book the load immediately.
        </p>
      </div>

      {tenders.length === 0 && !tendersQuery.isLoading && (
        <div className="p-12 text-center text-slate-500 bg-[#F5EEE0] border border-[#EFE6D3] rounded-xl">
          No tenders pending — we&apos;ll surface a tender here as soon as one matches your equipment and lanes.
        </div>
      )}

      {tenders.map((t) => {
        const isDeclining = declining === t.id;
        const isCountering = countering === t.id;
        const isCascade = t.waterfallPositionId !== null;
        const counterNum = parseFloat(counterRate);
        const counterValid = !isNaN(counterNum) && counterNum > 0;
        return (
          <div key={t.id} className="bg-white border border-[#EFE6D3] rounded-xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-semibold text-[#0A2540]">
                    Load {t.load.referenceNumber}
                  </h2>
                  {isCascade && (
                    <span className="px-2 py-0.5 text-xs rounded bg-[#FAEEDA] text-[#854F0B] font-medium">
                      Cascade Tender
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm text-slate-500 flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-[#BA7517]" />
                  {t.load.originCity}, {t.load.originState} → {t.load.destCity}, {t.load.destState}
                  {t.load.distance && ` · ${Math.round(t.load.distance).toLocaleString()} mi`}
                </div>
                <div className="mt-1 text-xs text-slate-700">
                  {t.load.equipmentType}
                  {t.load.weight && ` · ${t.load.weight.toLocaleString()} lbs`}
                  {t.load.commodity && ` · ${t.load.commodity}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase">Offered Rate</div>
                <div className="text-2xl font-semibold text-[#BA7517]">
                  ${Number(t.offeredRate).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-slate-500 uppercase text-[10px]">Pickup</div>
                <div className="text-slate-700">{new Date(t.load.pickupDate).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase text-[10px]">Delivery</div>
                <div className="text-slate-700">{new Date(t.load.deliveryDate).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase text-[10px]">Time left</div>
                <Countdown expiresAt={t.expiresAt} />
              </div>
            </div>

            {!isDeclining && !isCountering && (
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => accept.mutate(t.id)}
                  disabled={accept.isPending}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#2F7A4F] hover:bg-[#276641] text-[#FBF7F0] font-semibold rounded disabled:opacity-40"
                >
                  <CheckCircle2 className="w-4 h-4" /> Accept
                </button>
                <button
                  onClick={() => { setCountering(t.id); setCounterRate(String(Math.round(Number(t.offeredRate)))); }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#FAEEDA] hover:bg-[#f3e3c4] text-[#854F0B] font-semibold rounded border border-[#BA7517]/40"
                >
                  <Repeat2 className="w-4 h-4" /> Counter
                </button>
                <button
                  onClick={() => setDeclining(t.id)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#F5EEE0] hover:bg-[#EFE6D3] text-slate-700 font-semibold rounded border border-[#EFE6D3]"
                >
                  <AlertTriangle className="w-4 h-4" /> Decline
                </button>
              </div>
            )}

            {isCountering && (
              <div className="mt-5 space-y-2">
                <label className="block text-xs text-slate-700">
                  Your counter rate (offered: ${Number(t.offeredRate).toLocaleString("en-US", { maximumFractionDigits: 0 })})
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={counterRate}
                    onChange={(e) => setCounterRate(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 bg-white border border-[#EFE6D3] rounded text-sm text-[#0A2540] focus:border-[#BA7517] focus:ring-[#BA7517]/15 focus:outline-none"
                    placeholder="Enter your rate"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => counter.mutate({ tenderId: t.id, counterRate: counterNum })}
                    disabled={!counterValid || counter.isPending}
                    className="flex-1 py-2 bg-[#BA7517] hover:bg-[#854F0B] text-[#FBF7F0] text-sm font-medium rounded disabled:opacity-40"
                  >
                    {counter.isPending ? "Sending…" : "Send counter offer"}
                  </button>
                  <button
                    onClick={() => { setCountering(null); setCounterRate(""); }}
                    className="flex-1 py-2 bg-[#F5EEE0] text-slate-700 text-sm font-medium rounded border border-[#EFE6D3]"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {isDeclining && (
              <div className="mt-5 space-y-2">
                <label className="block text-xs text-slate-700">Decline reason (required)</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#EFE6D3] rounded text-sm text-[#0A2540] focus:border-[#BA7517] focus:ring-[#BA7517]/15 focus:outline-none"
                >
                  <option value="">Select a reason…</option>
                  {DECLINE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => decline.mutate({ tenderId: t.id, reason })}
                    disabled={!reason || decline.isPending}
                    className="flex-1 py-2 bg-[#9B2C2C] hover:bg-[#7d2323] text-[#FBF7F0] text-sm font-medium rounded disabled:opacity-40"
                  >
                    {decline.isPending ? "Declining…" : "Confirm decline"}
                  </button>
                  <button
                    onClick={() => { setDeclining(null); setReason(""); }}
                    className="flex-1 py-2 bg-[#F5EEE0] text-slate-700 text-sm font-medium rounded border border-[#EFE6D3]"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="text-[11px] text-slate-500 text-center pt-2">
        <Clock className="w-3 h-3 inline mr-1" />
        Tenders refresh every 10 seconds.
      </div>
    </div>
  );
}
