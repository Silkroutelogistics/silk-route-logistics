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
 *
 * carrier-portal-upgrade: colours come from lib/carrierStatus (G20); the pickup
 * date goes through formatStopDate, because it is a calendar date stored as UTC
 * midnight and an unzoned render showed the day before west of UTC (G16, the
 * SRL-121497 class); under 768px each row is a card, not a table (M4).
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard } from "@/components/carrier/CarrierCard";
import { carrierTenderLabel } from "@/lib/loadDerivedStatus";
import { formatStopDate } from "@/lib/stopDate";
import { TONE_CLASSES, statusDisplay } from "@/lib/carrierStatus";
import { BTN } from "@/lib/carrierUi";

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

const NOT_SET = "Not set";

const money = (n: number | null) =>
  n === null || n === undefined ? NOT_SET : `$${Math.round(n).toLocaleString()}`;

/** `at` is an instant (when the outcome happened), so the viewer's own zone is right for it. */
const onDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : NOT_SET;

function Outcome({ t }: { t: HistoryRow }) {
  const c = TONE_CLASSES[statusDisplay("tender", t.status).tone];
  return (
    <>
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
        {carrierTenderLabel(t.status, t.statusReason)}
      </span>
      {/* A carrier's own decline shows the reason they gave. SRL's withdrawal
          does not get a second line explaining itself, because the label
          already says what happened. */}
      {t.status === "DECLINED" && t.declineReason && (
        <span className="block text-[11px] text-[#5B6B7D] mt-0.5">{t.declineReason}</span>
      )}
    </>
  );
}

function Rate({ t }: { t: HistoryRow }) {
  return (
    <>
      {money(t.tenderRate)}
      {t.counterRate !== null && t.counterRate !== undefined && (
        <span className="block text-[11px] text-[#5B6B7D]">your counter, offered {money(t.offeredRate)}</span>
      )}
    </>
  );
}

const loadName = (t: HistoryRow) => t.load?.loadNumber ?? t.load?.referenceNumber ?? NOT_SET;
const lane = (t: HistoryRow) =>
  t.load ? `${t.load.originCity}, ${t.load.originState} to ${t.load.destCity}, ${t.load.destState}` : NOT_SET;
const pickup = (t: HistoryRow) => formatStopDate(t.load?.pickupDate) ?? NOT_SET;

export default function TenderHistoryPage() {
  const { data, isLoading, isError, refetch } = useQuery<{ tenders: HistoryRow[] }>({
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
          <div role="status" aria-label="Loading tender history" className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded bg-[#F5EEE0] animate-pulse motion-reduce:animate-none" />
            ))}
          </div>
        ) : isError ? (
          <div role="alert" className="p-4 text-sm text-[#9B2C2C]">
            Tender history could not be loaded.{" "}
            <button type="button" onClick={() => refetch()} className={BTN.ghost}>Try again</button>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[#5B6B7D] p-4">
            No tenders yet. Loads offered to you will appear here.
          </p>
        ) : (
          <>
            {/* M4: cards under 768px. */}
            <ul className="md:hidden divide-y divide-[#F5EEE0]" data-testid="tender-history-cards">
              {rows.map((t) => (
                <li key={t.id} className="p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-[#0A2540] break-all">{loadName(t)}</span>
                    <span className="text-right text-sm text-[#0A2540]"><Rate t={t} /></span>
                  </div>
                  <div className="text-sm text-[#3A4A5F]">{lane(t)}</div>
                  <div className="text-xs text-[#5B6B7D]">Pickup {pickup(t)}. Outcome {onDay(t.at)}.</div>
                  <div><Outcome t={t} /></div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#5B6B7D] border-b border-[#EFE6D3]">
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
                      <td className="px-3 py-2.5 font-medium text-[#0A2540] whitespace-nowrap">{loadName(t)}</td>
                      <td className="px-3 py-2.5 text-[#3A4A5F] whitespace-nowrap">{lane(t)}</td>
                      <td className="px-3 py-2.5 text-[#5B6B7D] whitespace-nowrap">{pickup(t)}</td>
                      <td className="px-3 py-2.5 text-right text-[#0A2540] whitespace-nowrap"><Rate t={t} /></td>
                      <td className="px-3 py-2.5"><Outcome t={t} /></td>
                      <td className="px-3 py-2.5 text-[#5B6B7D] whitespace-nowrap">{onDay(t.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CarrierCard>
    </div>
  );
}
