"use client";

/**
 * v3.8.aki §13.3 Item 8.6 — Carrier preference manual override admin UI.
 *
 * Pre-aki the backend endpoint `PUT /ai/preferences/:carrierId` (added
 * pre-Sprint-44 audit-completeness Tier A reclassification) had ZERO
 * frontend callers — operations team had no way to manually correct
 * an auto-learned preference (e.g. "carrier won't take refrigerated
 * despite history") or seed initial preferences before the
 * auto-learner had data. aki ships the missing admin UI on the
 * existing /dashboard/carriers carrier-detail panel as a new
 * "Preferences" tab.
 *
 * Auto-learner at carrierPreferenceService.autoLearnPreferences
 * writes Prisma directly (bypasses this HTTP endpoint by design);
 * the panel surfaces the auto-learned signals as read-only context
 * + lets the admin override them with manual values that take
 * precedence + sets lastUpdatedBy="ADMIN" for audit attribution.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sliders, Save, Sparkles, AlertCircle, RefreshCw } from "lucide-react";

interface CarrierPreferences {
  carrierId: string;
  preferredLanes: Array<{ origin: string; dest: string }> | unknown[];
  preferredRegions: string[] | unknown[];
  avoidRegions: string[] | unknown[];
  preferredLoadTypes: string[] | unknown[];
  minRatePerMile: number | null;
  maxDeadheadMiles: number;
  preferredPayTerms: string | null;
  homeBaseLat: number | null;
  homeBaseLng: number | null;
  typicalRadiusMiles: number;
  notifyMethod: string;
  notifyFrequency: string;
  autoLearned: Record<string, unknown>;
  lastUpdatedBy?: string;
  updatedAt?: string;
  isNew?: boolean;
}

// Form-state shape uses raw textareas for the array/JSON fields so the
// admin can paste/edit comma-separated values directly without needing
// a chip picker (out of scope for aki — bank as polish if needed).
interface FormState {
  preferredLanesRaw: string;
  preferredRegionsRaw: string;
  avoidRegionsRaw: string;
  preferredLoadTypesRaw: string;
  minRatePerMile: string;
  maxDeadheadMiles: string;
  preferredPayTerms: string;
  typicalRadiusMiles: string;
  notifyMethod: string;
  notifyFrequency: string;
}

const PAY_TERMS = ["Net-7", "Net-14", "Net-21", "Net-30", "Quick Pay 1%", "Quick Pay 2%", "Quick Pay 3%"];
const NOTIFY_METHODS = ["EMAIL", "SMS", "BOTH", "NONE"];
const NOTIFY_FREQUENCIES = ["IMMEDIATE", "HOURLY_DIGEST", "DAILY_DIGEST"];

function arrayToCsv(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((v) => (typeof v === "string" ? v : typeof v === "object" && v ? `${(v as Record<string, unknown>).origin ?? ""} → ${(v as Record<string, unknown>).dest ?? ""}` : ""))
    .filter(Boolean)
    .join(", ");
}

function csvToStringArray(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function csvToLanes(raw: string): Array<{ origin: string; dest: string }> {
  // Lane format: "Origin → Dest" or "Origin -> Dest" or "Origin > Dest"
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((lane) => {
      const match = lane.match(/^(.+?)\s*(?:→|->|>)\s*(.+)$/);
      return match ? { origin: match[1].trim(), dest: match[2].trim() } : null;
    })
    .filter((x): x is { origin: string; dest: string } => x !== null);
}

export function CarrierPreferencesPanel({ carrierId, isAdmin }: { carrierId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const { data, isLoading, isError } = useQuery<CarrierPreferences>({
    queryKey: ["carrier-preferences", carrierId],
    queryFn: () => api.get(`/ai/preferences/${carrierId}`).then((r) => r.data),
    enabled: !!carrierId,
  });

  // Hydrate form once data lands. Ref-based to avoid keystroke-resets
  // (Sub-pattern 10 banked Sprint 51.b).
  useEffect(() => {
    if (!data || form) return;
    setForm({
      preferredLanesRaw: arrayToCsv(data.preferredLanes),
      preferredRegionsRaw: arrayToCsv(data.preferredRegions),
      avoidRegionsRaw: arrayToCsv(data.avoidRegions),
      preferredLoadTypesRaw: arrayToCsv(data.preferredLoadTypes),
      minRatePerMile: data.minRatePerMile != null ? String(data.minRatePerMile) : "",
      maxDeadheadMiles: String(data.maxDeadheadMiles ?? 150),
      preferredPayTerms: data.preferredPayTerms ?? "",
      typicalRadiusMiles: String(data.typicalRadiusMiles ?? 500),
      notifyMethod: data.notifyMethod ?? "EMAIL",
      notifyFrequency: data.notifyFrequency ?? "IMMEDIATE",
    });
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("Form not loaded");
      const body = {
        preferredLanes: csvToLanes(form.preferredLanesRaw),
        preferredRegions: csvToStringArray(form.preferredRegionsRaw),
        avoidRegions: csvToStringArray(form.avoidRegionsRaw),
        preferredLoadTypes: csvToStringArray(form.preferredLoadTypesRaw),
        minRatePerMile: form.minRatePerMile.trim() ? Number(form.minRatePerMile) : null,
        maxDeadheadMiles: form.maxDeadheadMiles.trim() ? Number(form.maxDeadheadMiles) : 150,
        preferredPayTerms: form.preferredPayTerms || null,
        typicalRadiusMiles: form.typicalRadiusMiles.trim() ? Number(form.typicalRadiusMiles) : 500,
        notifyMethod: form.notifyMethod,
        notifyFrequency: form.notifyFrequency,
      };
      return api.put(`/ai/preferences/${carrierId}`, body);
    },
    onSuccess: () => {
      setSaveMessage({ kind: "success", text: "Preferences saved. Attribution recorded as ADMIN." });
      queryClient.invalidateQueries({ queryKey: ["carrier-preferences", carrierId] });
      setTimeout(() => setSaveMessage(null), 6000);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setSaveMessage({ kind: "error", text: err.response?.data?.error || "Could not save preferences" });
    },
  });

  const autoLearnMutation = useMutation({
    mutationFn: () => api.post(`/ai/preferences/${carrierId}/auto-learn`),
    onSuccess: () => {
      setSaveMessage({ kind: "success", text: "Auto-learn cycle complete. Refreshed below." });
      queryClient.invalidateQueries({ queryKey: ["carrier-preferences", carrierId] });
      setForm(null); // re-hydrate from latest data
      setTimeout(() => setSaveMessage(null), 6000);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setSaveMessage({ kind: "error", text: err.response?.data?.error || "Auto-learn failed" });
    },
  });

  if (isLoading) {
    return (
      <div className="bg-gray-100 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-500 animate-pulse">Loading preferences…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-700">Couldn&apos;t load carrier preferences.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-gray-100 rounded-lg p-4 flex items-start gap-2">
        <AlertCircle size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-gray-600">
          Carrier preferences are ADMIN-only. Contact a CEO or ADMIN to modify these values for this carrier.
        </div>
      </div>
    );
  }

  if (!form) return null;

  const autoLearnedHasContent = Object.keys(data.autoLearned ?? {}).length > 0;
  const lastUpdatedByBadge = data.lastUpdatedBy ?? "SYSTEM";
  const lastUpdatedColor =
    lastUpdatedByBadge === "ADMIN" ? "bg-[#FAEEDA] text-[#BA7517]" :
    lastUpdatedByBadge === "CARRIER" ? "bg-blue-50 text-blue-700" :
    "bg-gray-100 text-gray-600";

  return (
    <div className="space-y-4">
      {/* Header + attribution badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders size={14} className="text-gray-500" />
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Carrier preferences</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${lastUpdatedColor}`}>
            Last updated by {lastUpdatedByBadge}
          </span>
          {data.isNew && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700">No row yet (defaults shown)</span>
          )}
        </div>
      </div>

      {/* Auto-learned read-only context */}
      {autoLearnedHasContent && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={12} className="text-blue-600" />
            <p className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider">Auto-learned signals</p>
          </div>
          <pre className="text-[10px] text-blue-900 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(data.autoLearned, null, 2)}
          </pre>
          <p className="text-[10px] text-blue-700 mt-2 italic">
            Manual overrides below take precedence over auto-learned values.
          </p>
        </div>
      )}

      {/* Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1">Preferred lanes</label>
          <textarea
            value={form.preferredLanesRaw}
            onChange={(e) => setForm({ ...form, preferredLanesRaw: e.target.value })}
            rows={2}
            placeholder="ORD → MIA, LAX → SEA, DAL → ATL"
            className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:border-[#C5A572]"
          />
          <p className="text-[10px] text-gray-500 mt-0.5">Format: <code>Origin → Dest</code>, comma-separated.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1">Preferred regions</label>
            <input
              type="text"
              value={form.preferredRegionsRaw}
              onChange={(e) => setForm({ ...form, preferredRegionsRaw: e.target.value })}
              placeholder="SE, MW, NE"
              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:border-[#C5A572]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1">Avoid regions</label>
            <input
              type="text"
              value={form.avoidRegionsRaw}
              onChange={(e) => setForm({ ...form, avoidRegionsRaw: e.target.value })}
              placeholder="NW, NYC metro"
              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:border-[#C5A572]"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1">Preferred load types</label>
          <input
            type="text"
            value={form.preferredLoadTypesRaw}
            onChange={(e) => setForm({ ...form, preferredLoadTypesRaw: e.target.value })}
            placeholder="DRY_VAN, REEFER, FLATBED"
            className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:border-[#C5A572]"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1">Min rate / mile</label>
            <input
              type="number"
              step="0.01"
              value={form.minRatePerMile}
              onChange={(e) => setForm({ ...form, minRatePerMile: e.target.value })}
              placeholder="2.50"
              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:border-[#C5A572]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1">Max deadhead (mi)</label>
            <input
              type="number"
              value={form.maxDeadheadMiles}
              onChange={(e) => setForm({ ...form, maxDeadheadMiles: e.target.value })}
              placeholder="150"
              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:border-[#C5A572]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1">Typical radius (mi)</label>
            <input
              type="number"
              value={form.typicalRadiusMiles}
              onChange={(e) => setForm({ ...form, typicalRadiusMiles: e.target.value })}
              placeholder="500"
              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:border-[#C5A572]"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1">Pay terms</label>
            <select
              value={form.preferredPayTerms}
              onChange={(e) => setForm({ ...form, preferredPayTerms: e.target.value })}
              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:border-[#C5A572]"
            >
              <option value="">— Not specified —</option>
              {PAY_TERMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1">Notify method</label>
            <select
              value={form.notifyMethod}
              onChange={(e) => setForm({ ...form, notifyMethod: e.target.value })}
              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:border-[#C5A572]"
            >
              {NOTIFY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1">Frequency</label>
            <select
              value={form.notifyFrequency}
              onChange={(e) => setForm({ ...form, notifyFrequency: e.target.value })}
              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:border-[#C5A572]"
            >
              {NOTIFY_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <button
            onClick={() => autoLearnMutation.mutate()}
            disabled={autoLearnMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded border border-blue-200 disabled:opacity-50"
            title="Re-run the auto-learner against this carrier's load history"
          >
            <RefreshCw size={12} className={autoLearnMutation.isPending ? "animate-spin" : ""} />
            {autoLearnMutation.isPending ? "Learning…" : "Re-run auto-learn"}
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#BA7517] hover:bg-[#A36513] rounded disabled:opacity-50"
          >
            <Save size={12} />
            {saveMutation.isPending ? "Saving…" : "Save manual override"}
          </button>
        </div>

        {saveMessage && (
          <div className={`text-[11px] px-3 py-2 rounded ${saveMessage.kind === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {saveMessage.text}
          </div>
        )}
      </div>
    </div>
  );
}
