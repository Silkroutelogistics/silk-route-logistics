"use client";

import {
  CARRIER_PAY_STATUS,
  COMPLIANCE_STATUS,
  CPP_TIER,
  LOAD_STATUS,
  TONE_CLASSES,
  statusDisplay,
  type StatusDisplay,
  type StatusKind,
} from "@/lib/carrierStatus";

// carrier-portal-upgrade G20 — labels and colours come from lib/carrierStatus,
// the one mapper derived from the DB enums. Pass `kind` when you know it.
// Without it, the badge looks the value up across the kinds that do not share
// a value (load, pay, compliance, tier). Tender statuses must pass
// kind="tender", because CONFIRMED and EXPIRED mean something different there.
const UNAMBIGUOUS: Record<string, StatusDisplay> = {
  ...LOAD_STATUS,
  ...CARRIER_PAY_STATUS,
  ...COMPLIANCE_STATUS,
  ...CPP_TIER,
};

export function CarrierBadge({ status, kind, size = "sm" }: { status: string; kind?: StatusKind; size?: "sm" | "md" }) {
  const d = kind ? statusDisplay(kind, status) : UNAMBIGUOUS[status] ?? statusDisplay("load", status);
  const c = TONE_CLASSES[d.tone];
  const s = size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3.5 py-1 text-xs";
  return (
    <span data-status={status} className={`inline-flex items-center gap-1.5 rounded-full font-medium ${c.bg} ${c.text} ${s}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} aria-hidden="true" />
      {d.label}
    </span>
  );
}
