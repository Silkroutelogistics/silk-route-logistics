"use client";

/**
 * What happened to every load this carrier was offered.
 *
 * WHY IT EXISTS. The portal showed only LIVE offers. A carrier could see what
 * they were being asked to take and nothing at all about what became of
 * anything else — so three loads lost to faster carriers looked, from their
 * side, like three loads that vanished.
 *
 * That is the surface the DECLINED/WITHDRAWN split was built for. SRL pulling an
 * offer because somebody else got there first is not the carrier refusing work,
 * and §9 scores acceptance rate at 10% of Compass — so the distinction is money
 * to them. Showing it in their own words is the point; keeping it only in our
 * database would be asking them to trust a number they cannot check.
 *
 * Read-only, deliberately. Everything here is settled or is already actionable
 * on the Tenders page; a second place to act on a live offer is a second place
 * for the two to disagree about what state it is in.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard } from "@/components/carrier/CarrierCard";
import { carrierTenderLabel } from "@/lib/loadDerivedStatus";

interface HistoryRow {
  id: string;
  status: string;
  statusReason: string | null;
  declineReason: string | null;
  tenderRate: number | null;
  offeredRate: number | null;
  counterRate: number | null;
  createdAt: string;
  at: string | null;
  load: {
    referenceNumber: string | null;
    loadNumber: string | null;
    originCity: string | null;
    originState: string | null;
    destCity: string | null;
    destState: string | null;
    equipmentType: string | null;
    pickupDate: string | null;
    distance: number | null;
  } | null;
}

/**
 * Tone by outcome, not by status name.
 *
 * A withdrawal and a decline are both "the load went elsewhere" from a
 * carrier's point of view, but only one of them is something they did — and
 * colouring SRL's own withdrawal like a refusal would undo in the palette
 * exactly what the wording is there to fix.
 */
const TONE: Record<string, string> = {
  ACCEPTED: "bg-[#E6F0E9] text-[#256340] border border-[#2F7A4F]/25",
  CONFIRMED: "bg-[#E6F0E9] text-[#256340] border border-[#2F7A4F]/25",
  RC_SENT: "bg-[#FBEFD4] text-[#854F0B]",
  OFFERED: "bg-[#E2EAF2] text-[#2A5B8B]",
  COUNTERED: "bg-[#FBEFD4] text-[#854F0B]",
  DECLINED: "bg-slate-200 text-slate-700",
  WITHDRAWN: "bg-slate-200 text-slate-700",
  EXPIRED: "bg-slate-200 text-slate-700",
  RELEASED: "bg-[#F6E3E3] text-[#9B2C2C]",
};

const money = (n: number | null) =>
  n === null || n === undefined ? "—" : `$${Math.round(n).toLocaleString()}`;

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function TenderHistoryPage() {
  const { data, isLoading } = useQuery<{ tenders: HistoryRow[] }>({
    queryKey: ["carrier-tender-history"],
    queryFn: async () => (await api.get("/carrier-tenders/history")).data,
  });

  const rows = data?.tenders ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#0A2540]">Tender history</h1>
        <p className="text-sm text-[#3A4A5F] mt-1">
          Every load you have been offered, and what happened to it.
        </p>
      </div>

      <CarrierCard>
        {isLoading ? (
          <p className="text-sm text-[#6B7685] p-4">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[#6B7685] p-4">
            No tenders yet. Loads offered to you will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[#6B7685] border-b border-[#EFE6D3]">
                  <th className="px-3 py-2">Load</th>
                  <th className="px-3 py-2">Lane</th>
                  <th className="px-3 py-2">Pickup</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2">Outcome</th>
                  <th className="px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-b border-[#F5EEE0] last:border-0">
                    <td className="px-3 py-2.5 font-medium text-[#0A2540] whitespace-nowrap">
                      {t.load?.loadNumber ?? t.load?.referenceNumber ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[#3A4A5F] whitespace-nowrap">
                      {t.load?.originCity}, {t.load?.originState} &rarr; {t.load?.destCity}, {t.load?.destState}
                    </td>
                    <td className="px-3 py-2.5 text-[#6B7685] whitespace-nowrap">{when(t.load?.pickupDate ?? null)}</td>
                    <td className="px-3 py-2.5 text-right text-[#0A2540] whitespace-nowrap">
                      {money(t.tenderRate)}
                      {t.counterRate !== null && t.counterRate !== undefined && (
                        <span className="block text-[11px] text-[#6B7685]">
                          your counter · offered {money(t.offeredRate)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TONE[t.status] ?? "bg-slate-200 text-slate-700"}`}>
                        {carrierTenderLabel(t.status, t.statusReason)}
                      </span>
                      {/* A carrier's own decline shows the reason they gave. SRL's
                          withdrawal does not get a second line explaining itself,
                          because the label already says what happened. */}
                      {t.status === "DECLINED" && t.declineReason && (
                        <span className="block text-[11px] text-[#6B7685] mt-0.5">{t.declineReason}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[#6B7685] whitespace-nowrap">{when(t.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CarrierCard>
    </div>
  );
}
