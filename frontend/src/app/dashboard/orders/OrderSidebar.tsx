"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DollarSign, TrendingUp, Users, Zap, Star, BarChart3 } from "lucide-react";

/**
 * Pricing intelligence sidebar for the Order Builder.
 *
 * Always visible on the right while the user scrolls the 5-section form
 * (position:sticky in the parent). Pulls live data for:
 *  - Customer rate (from ContractRate) or manual target
 *  - DAT spot rate (stub fallback)
 *  - Target carrier cost (editable)
 *  - Projected margin (calculated)
 *  - Lane intelligence
 *  - Eligible carriers preview (top 3 from waterfallScoringService)
 *  - Tracking recipients from CRM contacts
 *  - Customer snapshot
 *  - Order flow visual
 *
 * All subqueries are driven off the current form state passed in via props.
 */

interface Props {
  customerId: string | null;
  customerSnapshot: {
    name: string | null;
    status: string | null;
    paymentTerms: string | null;
    creditLimit: number | null;
    creditStatus: string | null;
    totalRevenue?: number;
    totalShipments?: number;
  } | null;
  originState: string;
  destState: string;
  originCity: string;
  destCity: string;
  equipmentType: string;
  distance: number | null;
  customerRate: number | null;
  targetCost: number | null;
  onTargetCostChange: (value: number) => void;
  onCustomerRateChange: (value: number) => void;
  customerRateSource: "agreement" | "manual" | null;
}

export function OrderSidebar({
  customerId,
  customerSnapshot,
  originState,
  destState,
  originCity,
  destCity,
  equipmentType,
  distance,
  customerRate,
  targetCost,
  onTargetCostChange,
  onCustomerRateChange,
  customerRateSource,
}: Props) {
  const laneReady = !!originState && !!destState;
  const matchReady = laneReady && !!equipmentType;

  // DAT spot rate lookup (only when lane known)
  const marketQuery = useQuery<any>({
    queryKey: ["ob-market", originState, destState, equipmentType],
    queryFn: async () =>
      (await api.get("/market-rates", {
        params: { origin: originState, destination: destState, equipment: equipmentType },
      })).data,
    enabled: laneReady,
    staleTime: 10 * 60_000,
  });

  // Lane intelligence — carrier matches contain lane history per carrier.
  // We roll up customer-level lane intel via the customer loads endpoint.
  const customerLoadsQuery = useQuery<{ topLanes: any[]; loads: any[]; total: number; totalRevenue: number; avgMargin: number }>({
    queryKey: ["ob-customer-loads", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}/loads`)).data,
    enabled: !!customerId,
    staleTime: 60_000,
  });

  // Find matching lane history
  const laneHistory = customerLoadsQuery.data?.topLanes?.find((l) => {
    if (!originCity || !destCity) return false;
    return l.origin?.includes(originState) && l.dest?.includes(destState);
  });

  // Eligible carriers preview (v3.5.b) — calls the dedicated
  // /waterfalls/preview-matches endpoint that runs the real 100pt
  // waterfallScoringService without creating any DB records.
  // Replaces the v3.5.a client-side /carriers filter.
  const carriersPreviewQuery = useQuery<{
    carriers: Array<{
      carrierId: string;
      userId: string;
      companyName: string | null;
      tier: string;
      matchScore: number;
      laneRunCount: number;
      onTimePct: number;
    }>;
    total: number;
  }>({
    queryKey: ["ob-preview-matches", originState, destState, equipmentType],
    queryFn: async () => {
      const res = await api.get("/waterfalls/preview-matches", {
        params: {
          origin_state: originState,
          dest_state: destState,
          origin_city: originCity || undefined,
          dest_city: destCity || undefined,
          equipment: equipmentType,
          limit: 5,
        },
      });
      return res.data;
    },
    enabled: matchReady,
    staleTime: 60_000,
  });

  // Tracking recipients from CRM
  const recipientsQuery = useQuery<{ contacts: any[] }>({
    queryKey: ["ob-tracking-recipients", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}/tracking-recipients`)).data,
    enabled: !!customerId,
  });

  const margin = customerRate !== null && targetCost !== null ? customerRate - targetCost : null;
  const marginPct = margin !== null && customerRate && customerRate > 0 ? (margin / customerRate) * 100 : null;
  const marginTone =
    marginPct === null ? "neutral"
  : marginPct >= 15 ? "green"
  : marginPct >= 10 ? "amber"
  : "red";

  const spotRate = marketQuery.data?.spotRate;

  return (
    <aside className="w-[280px] shrink-0 sticky top-3 self-start max-h-[calc(100vh-32px)] overflow-y-auto pr-1">
      <div className="space-y-3">
        {/* Pricing cards */}
        <Section title="Pricing" Icon={DollarSign}>
          {/* Customer rate */}
          <div className={`rounded-lg p-3 ${customerRateSource === "agreement" ? "border border-[#BA7517] bg-[#FAEEDA]" : "border border-white/10 bg-white/5"}`}>
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase text-slate-400">Customer rate</div>
              {customerRateSource === "agreement" && (
                <span className="text-[9px] text-[#C5A572] font-semibold">From agreement</span>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className={`text-lg font-semibold ${customerRateSource === "agreement" ? "text-[#C5A572]" : "text-white"}`}>
                ${(customerRate ?? 0).toLocaleString()}
              </span>
              {distance && customerRate ? (
                <span className={`text-[10px] ${customerRateSource === "agreement" ? "text-[#C5A572]" : "text-slate-400"}`}>
                  · ${(customerRate / distance).toFixed(2)}/mi
                </span>
              ) : null}
            </div>
            {customerRateSource !== "agreement" && (
              <input
                type="number"
                value={customerRate ?? ""}
                onChange={(e) => onCustomerRateChange(parseFloat(e.target.value) || 0)}
                placeholder="Enter rate"
                className="mt-2 w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white"
              />
            )}
          </div>

          {/* DAT spot rate */}
          <div className="rounded-lg p-3 border border-white/10 bg-white/5">
            <div className="text-[10px] uppercase text-slate-400">DAT spot rate</div>
            {marketQuery.isLoading && <div className="mt-1 text-xs text-slate-500">Loading…</div>}
            {spotRate && (
              <>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-semibold text-white">${spotRate.total?.toLocaleString?.() ?? "—"}</span>
                  {spotRate.perMile && <span className="text-[10px] text-slate-400">· ${spotRate.perMile}/mi</span>}
                </div>
                {marketQuery.data?.range && (
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    ${Math.round(marketQuery.data.range.low).toLocaleString()} – ${Math.round(marketQuery.data.range.high).toLocaleString()}
                  </div>
                )}
              </>
            )}
            {!laneReady && <div className="mt-1 text-xs text-slate-500">Lane not set</div>}
          </div>

          {/* Target carrier cost */}
          <div className="rounded-lg p-3 border border-white/10 bg-white/5">
            <div className="text-[10px] uppercase text-slate-400">Target carrier cost</div>
            <input
              type="number"
              value={targetCost ?? ""}
              onChange={(e) => onTargetCostChange(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full px-2 py-1 bg-white/5 border border-white/10 rounded text-sm font-semibold text-white"
              placeholder="0"
            />
            {distance && targetCost ? (
              <div className="text-[10px] text-slate-500 mt-0.5">${(targetCost / distance).toFixed(2)}/mi</div>
            ) : null}
          </div>

          {/* Projected margin */}
          <div className={`rounded-lg p-3 border ${
            marginTone === "green" ? "border-green-500/40 bg-green-500/10"
            : marginTone === "amber" ? "border-amber-500/40 bg-amber-500/10"
            : marginTone === "red" ? "border-red-500/40 bg-red-500/10"
            : "border-white/10 bg-white/5"
          }`}>
            <div className="text-[10px] uppercase text-slate-400">Projected margin</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className={`text-lg font-semibold ${
                marginTone === "green" ? "text-green-400"
                : marginTone === "amber" ? "text-amber-400"
                : marginTone === "red" ? "text-red-400"
                : "text-white"
              }`}>
                {margin !== null ? `$${margin.toLocaleString()}` : "—"}
              </span>
              {marginPct !== null && (
                <span className={`text-xs ${
                  marginTone === "green" ? "text-green-400"
                  : marginTone === "amber" ? "text-amber-400"
                  : marginTone === "red" ? "text-red-400"
                  : "text-slate-400"
                }`}>· {marginPct.toFixed(1)}%</span>
              )}
            </div>
          </div>
        </Section>

        {/* Lane intelligence */}
        {laneReady && (
          <Section title="Lane intelligence" Icon={BarChart3}>
            <div className="rounded-lg p-3 border border-white/10 bg-white/5 space-y-1.5 text-xs">
              <Row label="Your loads on this lane" value={laneHistory?.count ?? 0} />
              {laneHistory && <Row label="Avg rate" value={`$${laneHistory.avgRate?.toLocaleString() ?? "—"}`} />}
              {marketQuery.data?.loadToTruckRatio !== undefined && (
                <Row label="Load/truck ratio" value={marketQuery.data.loadToTruckRatio.toFixed(1)} />
              )}
              {marketQuery.data?.trend7d !== undefined && (
                <Row
                  label="7d trend"
                  value={`${marketQuery.data.trend7d > 0 ? "+" : ""}${marketQuery.data.trend7d}%`}
                  tone={marketQuery.data.trend7d > 0 ? "green" : "red"}
                />
              )}
              {marketQuery.data?.capacity && <Row label="Capacity" value={marketQuery.data.capacity} />}
            </div>
          </Section>
        )}

        {/* Eligible carriers */}
        {matchReady && (
          <Section
            title={`Eligible carriers (${carriersPreviewQuery.data?.total ?? "…"})`}
            Icon={Users}
          >
            <div className="space-y-1.5">
              {(carriersPreviewQuery.data?.carriers ?? []).map((c) => (
                <div key={c.carrierId} className="rounded-lg p-2 border border-white/10 bg-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-white truncate">{c.companyName ?? "—"}</div>
                      <div className="text-[9px] text-slate-500">
                        {c.tier} · {c.laneRunCount} lane runs · {Math.round(c.onTimePct)}% OT
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[11px] font-semibold text-[#BA7517]">
                        {Math.round(c.matchScore)}%
                      </span>
                      <Star className="w-3 h-3 text-[#BA7517]" />
                    </div>
                  </div>
                  <div className="mt-1 h-0.5 bg-white/10 rounded overflow-hidden">
                    <div
                      className="h-full bg-[#BA7517]"
                      style={{ width: `${Math.min(100, c.matchScore)}%` }}
                    />
                  </div>
                </div>
              ))}
              {(carriersPreviewQuery.data?.carriers?.length ?? 0) === 0 && !carriersPreviewQuery.isLoading && (
                <div className="text-[11px] text-slate-500 text-center py-2">No eligible matches</div>
              )}
            </div>
          </Section>
        )}

        {/* Tracking recipients */}
        {customerId && (
          <Section title="Tracking recipients" Icon={Zap}>
            <div className="space-y-1.5">
              {(recipientsQuery.data?.contacts ?? []).length === 0 && (
                <div className="text-[11px] text-slate-500">
                  No contacts tagged. Add in CRM → Contacts.
                </div>
              )}
              {(recipientsQuery.data?.contacts ?? []).map((c: any) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg p-2 border border-white/10 bg-white/5">
                  <div className="w-6 h-6 rounded-full bg-[#FAEEDA] text-[#BA7517] flex items-center justify-center text-[9px] font-bold shrink-0">
                    {(c.name || "?").split(" ").slice(0, 2).map((w: string) => w[0]).join("")}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-white truncate">{c.name}</div>
                    <div className="text-[9px] text-slate-500 truncate">{c.email}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Customer snapshot */}
        {customerSnapshot && (
          <Section title="Customer" Icon={TrendingUp}>
            <div className="rounded-lg p-3 border border-white/10 bg-white/5 space-y-1.5 text-xs">
              <Row label="Status" value={customerSnapshot.status ?? "—"} />
              <Row label="Pay terms" value={customerSnapshot.paymentTerms ?? "—"} />
              <Row label="Credit limit" value={customerSnapshot.creditLimit ? `$${customerSnapshot.creditLimit.toLocaleString()}` : "—"} />
              <Row label="Credit status" value={customerSnapshot.creditStatus ?? "—"} />
              {customerSnapshot.totalRevenue !== undefined && (
                <Row label="Revenue YTD" value={`$${Math.round(customerSnapshot.totalRevenue).toLocaleString()}`} />
              )}
              {customerSnapshot.totalShipments !== undefined && (
                <Row label="Loads YTD" value={customerSnapshot.totalShipments} />
              )}
            </div>
          </Section>
        )}

        {/* Order flow */}
        <Section title="Order flow">
          <div className="flex items-center gap-1 text-[9px] text-slate-400">
            {["Quote", "Order", "Load", "Dispatch", "T&T", "Invoice"].map((stage, i) => (
              <div key={stage} className="flex items-center flex-1">
                <div className={`flex-1 h-1.5 rounded ${i === 0 ? "bg-[#BA7517]" : "border border-dashed border-white/20"}`} />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1 text-[9px] text-slate-500">
            {["Quote", "Order", "Load", "Dispatch", "T&T", "Invoice"].map((s) => <span key={s}>{s}</span>)}
          </div>
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title, Icon, children,
}: {
  title: string;
  Icon?: typeof DollarSign;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 px-1">
        {Icon && <Icon className="w-3 h-3 text-[#BA7517]" />}
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
  label, value, tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "green" | "red";
}) {
  const cls = tone === "green" ? "text-green-400" : tone === "red" ? "text-red-400" : "text-white";
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  );
}
