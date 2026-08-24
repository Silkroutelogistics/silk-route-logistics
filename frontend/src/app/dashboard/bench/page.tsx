"use client";

/**
 * The Carrier Bench — the scoreboard for the source -> vet -> sign -> bench loop.
 *
 * Consumes GET /analytics/bench-board. Shows who is on the bench, which of them
 * the tender gate would actually accept today, how that population splits across
 * the authority tiers, which lanes they cover, and what moved this week.
 *
 * IT DISTINGUISHES BROKEN FROM EMPTY. The sibling analytics page destructures
 * only { data, isLoading }, so a 500 leaves data undefined, satisfies its
 * empty check, and renders "no data yet" — a confident claim of zero built out
 * of a failed request. That is the same defect this arc already fixed once on
 * the finance cards, and it is not repeated here: isError gets its own state.
 *
 * EVERY ZERO NAMES WHAT WOULD MAKE IT NON-ZERO. A board that renders bare
 * zeroes on an empty bench is indistinguishable from one that is broken, and it
 * tells the person reading it nothing about what to do next.
 */

import { useQuery } from "@tanstack/react-query";
import {
  Users,
  ShieldCheck,
  FileSignature,
  Route as RouteIcon,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Inbox,
} from "lucide-react";
import { api } from "@/lib/api";

type AuthorityTier = "READY" | "OVERRIDE_ELIGIBLE" | "BLOCKED" | "AGE_NOT_ON_FILE";

interface TierCounts {
  READY: number;
  OVERRIDE_ELIGIBLE: number;
  BLOCKED: number;
  AGE_NOT_ON_FILE: number;
}

interface WeeklyCounter {
  thisWeek: number;
  lastWeek: number;
  delta: number;
}

interface LaneRow {
  guideId: string;
  name: string;
  originState: string;
  destState: string;
  equipmentType: string;
  customerName: string | null;
  benched: number;
  tenderable: number;
  tiers: TierCounts;
}

interface CarrierRow {
  carrierId: string;
  companyName: string;
  mcNumber: string | null;
  tier: AuthorityTier;
  tenderable: boolean;
  blockedReasons: string[];
}

interface BenchBoard {
  generatedAt: string;
  provisional: true;
  bench: { total: number; tenderable: number; tiers: TierCounts; carriers: CarrierRow[] };
  lanes: LaneRow[];
  weekly: {
    sourced: WeeklyCounter;
    approved: WeeklyCounter;
    signed: WeeklyCounter;
    lanesOpened: WeeklyCounter;
  };
}

/**
 * Item 182's three tiers, plus the state every carrier is actually in.
 *
 * AGE_NOT_ON_FILE is not a fourth tier — it is the absence of the input the
 * three are computed from. FMCSA's QCMobile endpoint returns current status
 * rather than grant history, so no carrier has an authority grant date on file
 * and the gate treats that as a warning rather than a block. Colouring it red
 * would tell an AE their carriers are refused for being too young when nobody
 * has established how old they are.
 */
const TIER_META: Record<AuthorityTier, { label: string; hint: string; cls: string }> = {
  READY: {
    label: "18+ months",
    hint: "Meets the standard. No authority-age condition on tendering.",
    cls: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  },
  OVERRIDE_ELIGIBLE: {
    label: "12–18 months",
    hint: "Under the 18-month standard. An ADMIN or CEO may apply a scoped override per load.",
    cls: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  },
  BLOCKED: {
    label: "Under 12 months",
    hint: "Absolute block. No override of any kind releases it.",
    cls: "text-red-300 border-red-400/30 bg-red-400/10",
  },
  AGE_NOT_ON_FILE: {
    label: "Age not on file",
    hint: "No FMCSA grant date recorded, so authority age was not checked. Status, insurance, OFAC and safety are still enforced.",
    cls: "text-gray-300 border-white/15 bg-white/5",
  },
};

const TIER_ORDER: AuthorityTier[] = ["READY", "OVERRIDE_ELIGIBLE", "BLOCKED", "AGE_NOT_ON_FILE"];

export default function BenchBoardPage() {
  const { data, isLoading, isError, error, refetch } = useQuery<BenchBoard>({
    queryKey: ["bench-board"],
    queryFn: () => api.get("/analytics/bench-board").then((r) => r.data),
  });

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-white">Carrier Bench</h1>
            <span
              className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-[#C5A572]/40 text-[#C5A572] bg-[#C5A572]/10"
              title="The authority tiers below follow §13.3 Item 182 and have not been ratified with Sandy or BKN. Treat the banding as a working model, not a commitment."
            >
              Provisional
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Who can haul, on which lanes, right now. Eligibility comes from the same gate the
            tender path runs, so a carrier shown as ready here is one the tender endpoint accepts.
          </p>
        </div>
        {data && (
          <p className="text-xs text-gray-500">
            As of {new Date(data.generatedAt).toLocaleString()}
          </p>
        )}
      </header>

      {isLoading && <div className="text-gray-400 text-sm">Loading…</div>}

      {/* Broken is not empty. A failed request must never render as a zero. */}
      {isError && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-5">
          <div className="flex items-center gap-2 text-red-300 font-medium">
            <AlertTriangle className="w-4 h-4" />
            The bench could not be loaded
          </div>
          <p className="text-sm text-gray-300 mt-2">
            This is a failure to fetch, not an empty bench. The counts below are unknown rather
            than zero.
          </p>
          <p className="text-xs text-gray-500 mt-1 font-mono">
            {(error as { message?: string } | undefined)?.message ?? "Unknown error"}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-3 text-xs px-3 py-1.5 rounded border border-white/20 text-gray-200 hover:bg-white/5"
          >
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && data && (
        <>
          {/* ── This week ─────────────────────────────────────────── */}
          <section>
            <SectionTitle>This week</SectionTitle>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <DeltaCard
                icon={<Inbox className="w-4 h-4" />}
                label="Sourced"
                sub="Applications received"
                c={data.weekly.sourced}
              />
              <DeltaCard
                icon={<ShieldCheck className="w-4 h-4" />}
                label="Approved"
                sub="Passed vetting"
                c={data.weekly.approved}
              />
              <DeltaCard
                icon={<FileSignature className="w-4 h-4" />}
                label="Agreements signed"
                sub="Broker-Carrier Agreement"
                c={data.weekly.signed}
              />
              <DeltaCard
                icon={<RouteIcon className="w-4 h-4" />}
                label="Lanes opened"
                sub="New routing guides"
                c={data.weekly.lanesOpened}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Weeks run Sunday to Sunday, Eastern. Deltas compare against the same window last
              week.
            </p>
          </section>

          {/* ── The bench ─────────────────────────────────────────── */}
          <section>
            <SectionTitle>On the bench</SectionTitle>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <StatCard
                icon={<Users className="w-4 h-4" />}
                label="Benched"
                value={data.bench.total}
                hint="Approved, real, not deleted."
              />
              <StatCard
                icon={<ShieldCheck className="w-4 h-4" />}
                label="Tenderable now"
                value={data.bench.tenderable}
                hint="Passes the full compliance gate today. No history exists for this figure, so it carries no week-over-week delta."
                accent
              />
              {TIER_ORDER.map((t) => (
                <StatCard
                  key={t}
                  label={TIER_META[t].label}
                  value={data.bench.tiers[t]}
                  hint={TIER_META[t].hint}
                  tone={TIER_META[t].cls}
                />
              ))}
            </div>

            {data.bench.total === 0 ? (
              <EmptyState
                title="No carriers on the bench yet."
                body="A carrier joins the bench when their application is approved and they are not a test account. Approve one from Carrier Pool, or bring a new applicant through onboarding."
              />
            ) : (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-gray-400 text-xs uppercase tracking-wide">
                    <tr className="border-b border-white/10">
                      <th className="text-left font-medium px-4 py-2">Carrier</th>
                      <th className="text-left font-medium px-4 py-2">MC</th>
                      <th className="text-left font-medium px-4 py-2">Authority</th>
                      <th className="text-left font-medium px-4 py-2">Tenderable</th>
                      <th className="text-left font-medium px-4 py-2">If not, why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bench.carriers.map((c) => (
                      <tr key={c.carrierId} className="border-b border-white/5 last:border-0">
                        <td className="px-4 py-2 text-white">{c.companyName}</td>
                        <td className="px-4 py-2 text-gray-400">{c.mcNumber ?? "—"}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded border ${TIER_META[c.tier].cls}`}
                            title={TIER_META[c.tier].hint}
                          >
                            {TIER_META[c.tier].label}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {c.tenderable ? (
                            <span className="text-emerald-300">Yes</span>
                          ) : (
                            <span className="text-gray-400">No</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-gray-400 text-xs">
                          {c.blockedReasons.length ? c.blockedReasons.join(" · ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Lanes ─────────────────────────────────────────────── */}
          <section>
            <SectionTitle>Lane coverage</SectionTitle>
            {data.lanes.length === 0 ? (
              <EmptyState
                title="No lanes yet."
                body="A lane appears here when a routing guide exists for it — an origin state, a destination state, an equipment type, and the carriers a shipper has ranked on it. Create one from Routing Guide."
              />
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-gray-400 text-xs uppercase tracking-wide">
                    <tr className="border-b border-white/10">
                      <th className="text-left font-medium px-4 py-2">Lane</th>
                      <th className="text-left font-medium px-4 py-2">Customer</th>
                      <th className="text-right font-medium px-4 py-2">Benched</th>
                      <th className="text-right font-medium px-4 py-2">Tenderable</th>
                      {TIER_ORDER.map((t) => (
                        <th key={t} className="text-right font-medium px-3 py-2" title={TIER_META[t].hint}>
                          {TIER_META[t].label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.lanes.map((l) => (
                      <tr key={l.guideId} className="border-b border-white/5 last:border-0">
                        <td className="px-4 py-2">
                          <div className="text-white">
                            {l.originState} → {l.destState}
                          </div>
                          <div className="text-xs text-gray-500">{l.equipmentType}</div>
                        </td>
                        <td className="px-4 py-2 text-gray-400">{l.customerName ?? "Global"}</td>
                        <td className="px-4 py-2 text-right text-gray-200">{l.benched}</td>
                        <td className="px-4 py-2 text-right text-emerald-300">{l.tenderable}</td>
                        {TIER_ORDER.map((t) => (
                          <td key={t} className="px-3 py-2 text-right text-gray-400">
                            {l.tiers[t]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.lanes.length > 0 && data.bench.total === 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Lanes exist but the bench is empty, so every count above is zero by arithmetic
                rather than by coverage.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-medium text-gray-300 mb-2">{children}</h2>;
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
  accent,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${tone ?? "border-white/10 bg-white/5"}`}
      title={hint}
    >
      <div className="flex items-center gap-2 text-xs text-gray-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold ${accent ? "text-[#C5A572]" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

function DeltaCard({
  icon,
  label,
  sub,
  c,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  c: WeeklyCounter;
}) {
  // A flat week is genuinely flat — it gets a dash, not a green zero, because
  // "no change" and "no movement in the right direction" read differently.
  const Arrow = c.delta > 0 ? ArrowUpRight : c.delta < 0 ? ArrowDownRight : Minus;
  const tone =
    c.delta > 0 ? "text-emerald-300" : c.delta < 0 ? "text-red-300" : "text-gray-500";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-white">{c.thisWeek}</span>
        <span className={`inline-flex items-center gap-0.5 text-xs ${tone}`}>
          <Arrow className="w-3 h-3" />
          {c.delta === 0 ? "level" : Math.abs(c.delta)}
        </span>
      </div>
      <div className="text-[11px] text-gray-500 mt-0.5">
        {sub} · {c.lastWeek} last week
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-5">
      <p className="text-sm text-gray-300">{title}</p>
      <p className="text-xs text-gray-500 mt-1 max-w-2xl">{body}</p>
    </div>
  );
}
