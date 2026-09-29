"use client";

import { EVIDENCE_LABELS, type OfferQuickPayEvidence, type OfferQuickPaySpeed, type OfferQuickPayValue } from "@/lib/offerQuickPay";

const SPEEDS: { value: OfferQuickPaySpeed; label: string }[] = [
  { value: "", label: "Standard terms" },
  { value: "SEVEN_DAY", label: "Quick Pay 7-day" },
  { value: "SAME_DAY", label: "Quick Pay same-day" },
];

/**
 * Item 342 (v3.8.bor) — the AE's Quick Pay election on an offer. Shared by the
 * Load Board tender drawer and the Carrier Engagement Drawer so both offer
 * surfaces ask the same question the same way.
 */
export function OfferQuickPayFields({
  value,
  onChange,
}: {
  value: OfferQuickPayValue;
  onChange: (v: OfferQuickPayValue) => void;
}) {
  return (
    <div data-testid="offer-quick-pay">
      <label className="block text-xs text-gray-500 mb-1">Payment terms on the rate confirmation</label>
      <div className="flex gap-2">
        {SPEEDS.map((s) => (
          <button
            key={s.value || "standard"}
            type="button"
            onClick={() => onChange({ ...value, speed: s.value })}
            aria-pressed={value.speed === s.value}
            className={`flex-1 py-2 rounded-lg text-xs font-medium border transition ${
              value.speed === s.value
                ? "bg-[#BA7517] text-white border-[#BA7517]"
                : "bg-gray-50 text-gray-700 border-gray-200 hover:border-[#BA7517]/40"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {value.speed && (
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
          <select
            aria-label="Evidence type"
            value={value.evidenceType}
            onChange={(e) => onChange({ ...value, evidenceType: e.target.value as OfferQuickPayEvidence })}
            className="px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900"
          >
            {(Object.keys(EVIDENCE_LABELS) as OfferQuickPayEvidence[]).map((k) => (
              <option key={k} value={k}>{EVIDENCE_LABELS[k]}</option>
            ))}
          </select>
          <input
            aria-label="Evidence"
            value={value.evidenceRef}
            onChange={(e) => onChange({ ...value, evidenceRef: e.target.value })}
            placeholder="Where the carrier asked for Quick Pay"
            className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400"
          />
        </div>
      )}
      <p className="mt-1 text-[11px] text-gray-400">
        The carrier signs these terms when they accept. Quick Pay is checked against the pilot, their signed Quick Pay
        agreement and their account before the offer is sent.
      </p>
    </div>
  );
}
