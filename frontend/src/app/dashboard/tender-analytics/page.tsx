"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, XCircle, Clock, RefreshCw, Hash } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * v3.8.alz §13.3 Item 145 — Tender funnel + decline taxonomy analytics.
 * Consumes GET /analytics/tender-funnel. Renders the lifecycle funnel,
 * conversion + response-time stats, decline-reason distribution, and
 * breakdowns by equipment / carrier tier / expiry window. Surfaces honestly
 * at low volume (the data needs ~50+ tenders/week to be meaningful).
 */

const PERIOD_OPTIONS = [
  { label: "30 Days", value: 30 },
  { label: "90 Days", value: 90 },
  { label: "180 Days", value: 180 },
  { label: "1 Year", value: 365 },
];

interface Bucket { key: string; total: number; accepted: number; declined: number; expired: number; acceptanceRate: number; }
interface FunnelData {
  periodDays: number;
  funnel: { total: number; accepted: number; declined: number; countered: number; expired: number; pending: number; responded: number };
  conversion: { acceptanceRateOfTotal: number; acceptanceRateOfResponded: number; responseRate: number };
  avgResponseMinutes: number | null;
  declineReasons: { reason: string; count: number }[];
  byEquipment: Bucket[];
  byTier: Bucket[];
  byExpiryWindow: Bucket[];
}

function fmtDuration(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  const h = min / 60;
  if (h < 48) return `${h.toFixed(1)} hr`;
  return `${(h / 24).toFixed(1)} days`;
}

export default function TenderAnalyticsPage() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = useQuery<FunnelData>({
    queryKey: ["tender-funnel", days],
    queryFn: () => api.get("/analytics/tender-funnel", { params: { days } }).then((r) => r.data),
  });

  const f = data?.funnel;
  const empty = !isLoading && (!f || f.total === 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#C5A572]" /> Tender Analytics
          </h1>
          <p className="text-sm text-gray-400 mt-1">Tender funnel, conversion, and decline taxonomy</p>
        </div>
        <div className="flex items-center gap-2">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition",
                days === p.value ? "bg-[#C5A572] text-[#0F1117]" : "bg-white/5 text-gray-400 hover:bg-white/10"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="text-gray-400 text-sm">Loading…</div>}

      {empty && (
        <div className="p-12 text-center text-gray-500 bg-white/5 border border-white/10 rounded-xl">
          No tenders in this window yet. Funnel analytics surface here once tenders start flowing.
        </div>
      )}

      {!isLoading && f && f.total > 0 && data && (
        <>
          {/* Funnel stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatCard label="Offered" value={f.total} icon={<Hash className="w-4 h-4" />} tone="neutral" />
            <StatCard label="Accepted" value={f.accepted} icon={<CheckCircle2 className="w-4 h-4" />} tone="green" />
            <StatCard label="Countered" value={f.countered} icon={<RefreshCw className="w-4 h-4" />} tone="gold" />
            <StatCard label="Declined" value={f.declined} icon={<XCircle className="w-4 h-4" />} tone="red" />
            <StatCard label="Expired" value={f.expired} icon={<Clock className="w-4 h-4" />} tone="slate" />
            <StatCard label="Pending" value={f.pending} icon={<Clock className="w-4 h-4" />} tone="blue" />
            <StatCard label="Avg response" value={fmtDuration(data.avgResponseMinutes)} icon={<Clock className="w-4 h-4" />} tone="neutral" small />
          </div>

          {/* Conversion bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <RateCard label="Acceptance (of all offered)" pct={data.conversion.acceptanceRateOfTotal} />
            <RateCard label="Acceptance (of responded)" pct={data.conversion.acceptanceRateOfResponded} />
            <RateCard label="Response rate" pct={data.conversion.responseRate} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Decline reasons */}
            <Panel title="Decline reasons">
              {data.declineReasons.length === 0 ? (
                <EmptyRow text="No declines in this window." />
              ) : (
                <BarList rows={data.declineReasons.map((d) => ({ label: d.reason, value: d.count }))} />
              )}
            </Panel>

            {/* By expiry window */}
            <Panel title="Expiry-window effectiveness">
              {data.byExpiryWindow.length === 0 ? <EmptyRow text="No data." /> : (
                <RateTable rows={data.byExpiryWindow} />
              )}
            </Panel>

            {/* By equipment */}
            <Panel title="By equipment">
              {data.byEquipment.length === 0 ? <EmptyRow text="No data." /> : (
                <RateTable rows={data.byEquipment} />
              )}
            </Panel>

            {/* By tier */}
            <Panel title="By carrier tier">
              {data.byTier.length === 0 ? <EmptyRow text="No data." /> : (
                <RateTable rows={data.byTier} />
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

const TONES: Record<string, string> = {
  neutral: "text-white", green: "text-green-400", gold: "text-[#C5A572]",
  red: "text-red-400", slate: "text-gray-400", blue: "text-blue-400",
};

function StatCard({ label, value, icon, tone, small }: { label: string; value: number | string; icon: React.ReactNode; tone: string; small?: boolean }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-gray-400 text-[11px] uppercase tracking-wide">{icon}{label}</div>
      <div className={cn("mt-1 font-semibold", small ? "text-lg" : "text-2xl", TONES[tone])}>{value}</div>
    </div>
  );
}

function RateCard({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="text-gray-400 text-xs">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{pct}%</div>
      <div className="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-[#C5A572]" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <div className="text-sm font-semibold text-white mb-3">{title}</div>
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="text-xs text-gray-500 py-2">{text}</div>;
}

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-xs text-gray-300 mb-0.5"><span>{r.label}</span><span>{r.value}</span></div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-[#C5A572]" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RateTable({ rows }: { rows: Bucket[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-gray-500 text-left">
          <th className="pb-2 font-medium">Group</th>
          <th className="pb-2 font-medium text-right">Offered</th>
          <th className="pb-2 font-medium text-right">Accepted</th>
          <th className="pb-2 font-medium text-right">Accept %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-white/5">
            <td className="py-1.5 text-gray-200">{r.key}</td>
            <td className="py-1.5 text-right text-gray-300">{r.total}</td>
            <td className="py-1.5 text-right text-green-400">{r.accepted}</td>
            <td className="py-1.5 text-right text-white font-medium">{r.acceptanceRate}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
