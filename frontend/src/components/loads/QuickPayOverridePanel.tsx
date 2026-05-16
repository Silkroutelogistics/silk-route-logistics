"use client";

// Caravan Partner Program per-load QP override panel (v3.7.b).
//
// Placed inside the rate-confirmation creation flow so AEs can elect a
// non-default QP rate on specific loads (competitive match, volume bonus,
// strategic lane, other). Panel fetches the carrier's tier default from the
// backend, pre-fills the applied rate, and POSTs an audit row via
// `POST /api/loads/:id/quickpay-override` when the applied rate differs.
//
// Carrier-facing surfaces (rate-con PDF, carrier dashboard) never see the
// tier default or the override reason — only the applied rate.

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

// Sprint 51.c (Items 147.a + 149 + 150 + 151) — SPEED-aware override panel.
// Speed comes from the parent SectionPayment SPEED card selection. The panel
// hides entirely when STANDARD (no fee to override), uses speed-aware labels
// for QP_7DAY vs QP_SAMEDAY, and queries the speed-specific tier default
// from backend so the displayed default matches the active speed card.
export type QuickPaySpeed = "STANDARD" | "QP_7DAY" | "QP_SAMEDAY";

interface QuickPayOverridePanelProps {
  loadId: string;
  carrierUserId: string | null;
  // Sprint 51.c — required for speed-aware tier default + label.
  speed: QuickPaySpeed;
  // Called when the applied rate changes so the parent rate-con form can
  // keep its own `quickPayFeePercent` field in sync.
  onAppliedRateChange?: (percentRate: number) => void;
}

type OverrideReason = "COMPETITIVE_MATCH" | "VOLUME_BONUS" | "STRATEGIC_LANE" | "OTHER";

const REASON_LABELS: Record<OverrideReason, string> = {
  COMPETITIVE_MATCH: "Competitive match",
  VOLUME_BONUS: "Volume bonus",
  STRATEGIC_LANE: "Strategic lane",
  OTHER: "Other (note required)",
};

export function QuickPayOverridePanel({ loadId, carrierUserId, speed, onAppliedRateChange }: QuickPayOverridePanelProps) {
  const queryClient = useQueryClient();

  // Fetch carrier's tier-default QP rate for the ACTIVE SPEED. Sprint 51.c —
  // queryKey includes speed so the cache invalidates when AE toggles SPEED
  // card; backend route accepts ?speed= per Item 151. When speed === STANDARD
  // the override panel is hidden so the query is disabled (no point fetching
  // a default that won't be displayed).
  const speedForQuery: "QP_7DAY" | "QP_SAMEDAY" = speed === "QP_SAMEDAY" ? "QP_SAMEDAY" : "QP_7DAY";
  const { data: tierData, isLoading: tierLoading } = useQuery({
    queryKey: ["qp-tier-default", carrierUserId, speedForQuery],
    queryFn: () => api.get<{ tierDefaultRate: number }>(`/loads/quickpay/tier-default/${carrierUserId}?speed=${speedForQuery}`).then((r) => r.data),
    enabled: !!carrierUserId && speed !== "STANDARD",
  });

  // Fetch any existing override row so re-opening the panel shows the saved values.
  const { data: existing } = useQuery({
    queryKey: ["qp-override", loadId],
    queryFn: () => api.get<{ override: { tierDefaultRate: string; appliedRate: string; reason: OverrideReason; reasonNote: string | null } | null }>(`/loads/${loadId}/quickpay-override`).then((r) => r.data.override),
    enabled: !!loadId,
  });

  const tierDefaultPct = tierData ? tierData.tierDefaultRate * 100 : null;
  const [appliedPct, setAppliedPct] = useState<string>("");
  const [reason, setReason] = useState<OverrideReason | "">("");
  const [reasonNote, setReasonNote] = useState<string>("");
  // Sprint 51.b (Item 147) — single-shot hydration flag. Prevents the effect
  // below from re-firing on subsequent renders and overwriting user-edited
  // state (reason / reasonNote / appliedPct). Pre-Sprint-51.b the effect had
  // appliedPct in its dependency array, causing user keystrokes in the
  // applied-rate field to trigger re-fire of the `if (existing)` branch,
  // which reset reason + reasonNote back to the saved override values
  // mid-edit. User reported "not able to change the QP reason that was
  // overwritten" — exact symptom of the dep-array overwrite class.
  const [hydrated, setHydrated] = useState(false);

  // Pre-fill from tier default once loaded, or from existing override row.
  // One-shot hydration: fires on initial mount when either `existing` or
  // `tierDefaultPct` resolves; never re-fires once hydrated. User edits
  // are preserved; post-save refetches do not clobber local state because
  // the local state already reflects what was just saved.
  useEffect(() => {
    if (hydrated) return;
    if (existing) {
      setAppliedPct((Number(existing.appliedRate) * 100).toFixed(2));
      setReason(existing.reason);
      setReasonNote(existing.reasonNote ?? "");
      setHydrated(true);
    } else if (tierDefaultPct !== null) {
      setAppliedPct(tierDefaultPct.toFixed(2));
      setHydrated(true);
    }
  }, [existing, tierDefaultPct, hydrated]);

  // Sprint 51.e (Item 153) — intentional-vs-incidental SPEED-toggle refinement.
  //
  // Sprint 51.c shipped Q2 ratification "persist override values across SPEED
  // toggles" literally — every value persisted regardless of whether it
  // represented an intentional override (e.g., 2.5% with "Competitive match"
  // reason) or an incidental tier-default-matching value left in the field
  // (e.g., 3% on 7-Day because that IS the 7-Day default for Silver/GUEST).
  // AE complaint: toggling 7-Day (default 3%) → Same-Day (default 5%) kept
  // Override at 3, firing amber "Δ -2pp vs tier default" and reason-required
  // validation for an override the AE never intended.
  //
  // Sprint 51.e refinement: on SPEED-driven tier-default change, detect whether
  // the current Override was incidental (matched OLD default AND no reason set)
  // vs intentional (didn't match OLD default OR has a reason). Auto-sync the
  // incidental case to the new tier default + clear reason. Preserve the
  // intentional case (Sprint 51.c behavior intact).
  //
  // Sub-pattern 10 (hydration-effect-dep-array-audit) applied: useRef reads
  // appliedPct + reason WITHOUT putting them in the dep array. Effect fires
  // ONLY on tierDefaultPct change (which only changes when AE toggles SPEED,
  // since the tier-default query key includes speed per Sprint 51.c Item 151).
  // appliedPctRef + reasonRef capture current-render values for read inside
  // the effect without triggering re-fires.
  //
  // Test 6 refinement (Phase B1 surfaced): also gate on reason-empty. If AE
  // typed a reason on the previous speed, that's an intent signal regardless
  // of whether the value happened to match the old default — preserve both.
  const prevTierDefaultRef = useRef<number | null>(null);
  const appliedPctRef = useRef<string>("");
  const reasonRef = useRef<OverrideReason | "">("");
  appliedPctRef.current = appliedPct;
  reasonRef.current = reason;

  useEffect(() => {
    if (tierDefaultPct === null) return;
    const prev = prevTierDefaultRef.current;
    prevTierDefaultRef.current = tierDefaultPct;

    if (prev === null) return;                          // initial hydration
    if (Math.abs(prev - tierDefaultPct) < 0.001) return; // same speed, refetch noise

    // SPEED change detected. Check intent signals.
    const currentPct = parseFloat(appliedPctRef.current);
    const matchesOldDefault =
      !isNaN(currentPct) && Math.abs(currentPct - prev) < 0.01;
    const reasonEmpty = reasonRef.current === "";

    if (matchesOldDefault && reasonEmpty) {
      // Incidental — auto-sync to new tier default
      setAppliedPct(tierDefaultPct.toFixed(2));
      setReason("");
      setReasonNote("");
    }
    // Else: intentional override (value diverges from old default OR
    // reason was typed) — preserve Sprint 51.c behavior
  }, [tierDefaultPct]);

  const appliedRateNumber = parseFloat(appliedPct);
  const appliedRateFraction = Number.isFinite(appliedRateNumber) ? appliedRateNumber / 100 : null;
  const deltaPp = appliedRateFraction !== null && tierData
    ? appliedRateFraction - tierData.tierDefaultRate
    : null;
  const isOverride = deltaPp !== null && Math.abs(deltaPp) > 0.0001;

  useEffect(() => {
    if (appliedRateFraction !== null && onAppliedRateChange) onAppliedRateChange(appliedRateNumber);
  }, [appliedRateNumber, appliedRateFraction, onAppliedRateChange]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!tierData) throw new Error("Tier default not loaded yet");
      if (appliedRateFraction === null) throw new Error("Applied rate is required");
      return api.post(`/loads/${loadId}/quickpay-override`, {
        tierDefaultRate: tierData.tierDefaultRate,
        appliedRate: appliedRateFraction,
        reason: isOverride ? reason : undefined,
        reasonNote: reasonNote.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qp-override", loadId] });
    },
  });

  const saveError = saveMutation.error instanceof Error ? saveMutation.error.message : null;
  const noteRequired = isOverride && reason === "OTHER";
  const reasonRequired = isOverride;
  const canSave =
    appliedRateFraction !== null &&
    (!reasonRequired || !!reason) &&
    (!noteRequired || reasonNote.trim().length > 0) &&
    !saveMutation.isPending;

  if (!carrierUserId) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0F1117] p-4 text-sm text-slate-500">
        Assign a carrier to this load before configuring the Quick Pay override.
      </div>
    );
  }

  // Sprint 51.c (Item 147.a) — hide panel on STANDARD speed (no fee to
  // override). Wrap in conditional CSS instead of returning null to
  // PRESERVE local state (reason, reasonNote) across SPEED toggles.
  // Returning null would unmount the component → state lost. CSS hide
  // keeps the component mounted; React state survives toggle cycles.
  // form.quickPayFeePercent already persists in the parent form state
  // (via onAppliedRateChange callback), so applied rate is preserved
  // regardless. The reason + note are panel-local state — those need
  // the CSS-hide approach.
  const speedLabel = speed === "QP_SAMEDAY" ? "Same-Day" : "7-day";

  return (
    <div className={`rounded-xl border border-white/10 bg-[#0F1117] p-5 ${speed === "STANDARD" ? "hidden" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-white">Quick Pay Override (Caravan)</h4>
        {tierLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
        ) : tierDefaultPct !== null ? (
          <span className="text-[11px] text-slate-500">
            Tier default: <span className="text-[#C8963E] font-medium">{tierDefaultPct.toFixed(2)}%</span>
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[11px] text-slate-400 mb-1">Applied {speedLabel} QP rate (%)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            max="20"
            value={appliedPct}
            onChange={(e) => setAppliedPct(e.target.value)}
            className="w-full px-3 py-2 bg-[#0A0B0F] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-[#C8963E]/50"
          />
        </label>
        <div className="flex items-end">
          {deltaPp !== null && (
            <div className={`text-xs ${isOverride ? "text-amber-400" : "text-emerald-400"}`}>
              {isOverride ? (
                <>
                  Δ {deltaPp > 0 ? "+" : ""}{(deltaPp * 100).toFixed(2)} pp vs tier default
                </>
              ) : (
                <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> Matches tier default</span>
              )}
            </div>
          )}
        </div>
      </div>

      {isOverride && (
        <div className="mt-4 space-y-3 pt-4 border-t border-white/5">
          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-1">Override reason <span className="text-red-400">*</span></span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as OverrideReason | "")}
              className="w-full px-3 py-2 bg-[#0A0B0F] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-[#C8963E]/50"
            >
              <option value="">Select a reason…</option>
              {(Object.keys(REASON_LABELS) as OverrideReason[]).map((key) => (
                <option key={key} value={key}>{REASON_LABELS[key]}</option>
              ))}
            </select>
          </label>
          {noteRequired && (
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Note <span className="text-red-400">*</span></span>
              <textarea
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                rows={2}
                placeholder="Why this rate was elected on this load"
                className="w-full px-3 py-2 bg-[#0A0B0F] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-[#C8963E]/50"
              />
            </label>
          )}
          {!noteRequired && reason && (
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-1">Note (optional)</span>
              <input
                type="text"
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder="Optional context"
                className="w-full px-3 py-2 bg-[#0A0B0F] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-[#C8963E]/50"
              />
            </label>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => saveMutation.mutate()}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#C8963E] text-[#0F1117] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d4a64e] transition"
        >
          {saveMutation.isPending ? "Saving…" : existing ? "Update override" : isOverride ? "Save override" : "Confirm tier default"}
        </button>
        {saveMutation.isSuccess && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
            <Check className="w-3 h-3" /> Saved
          </span>
        )}
        {saveError && (
          <span className="inline-flex items-center gap-1 text-xs text-red-400">
            <AlertTriangle className="w-3 h-3" /> {saveError}
          </span>
        )}
      </div>

      <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
        Carriers never see the tier default or override mechanics — only the applied rate appears on the rate confirmation and in their dashboard. Every override is audit-logged and rolled up in the monthly variance report.
      </p>
    </div>
  );
}
