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

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface QuickPayOverridePanelProps {
  loadId: string;
  carrierUserId: string | null;
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

export function QuickPayOverridePanel({ loadId, carrierUserId, onAppliedRateChange }: QuickPayOverridePanelProps) {
  const queryClient = useQueryClient();

  // Fetch carrier's tier-default QP rate (e.g. 0.03 for Silver).
  const { data: tierData, isLoading: tierLoading } = useQuery({
    queryKey: ["qp-tier-default", carrierUserId],
    queryFn: () => api.get<{ tierDefaultRate: number }>(`/loads/quickpay/tier-default/${carrierUserId}`).then((r) => r.data),
    enabled: !!carrierUserId,
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

  // Pre-fill from tier default once loaded, or from existing override row.
  useEffect(() => {
    if (existing) {
      setAppliedPct((Number(existing.appliedRate) * 100).toFixed(2));
      setReason(existing.reason);
      setReasonNote(existing.reasonNote ?? "");
    } else if (tierDefaultPct !== null && appliedPct === "") {
      setAppliedPct(tierDefaultPct.toFixed(2));
    }
  }, [existing, tierDefaultPct, appliedPct]);

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

  return (
    <div className="rounded-xl border border-white/10 bg-[#0F1117] p-5">
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
          <span className="block text-[11px] text-slate-400 mb-1">Applied 7-day QP rate (%)</span>
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
