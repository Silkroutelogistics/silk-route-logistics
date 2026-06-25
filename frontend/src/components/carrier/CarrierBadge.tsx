"use client";

// Canonical SRL status palette (§2.1 / skill tokens) — the rainbow of
// Tailwind hues was retired so badges read in-brand: success #2F7A4F,
// warning #B07A1A, danger #9B2C2C, info #2A5B8B, plus navy/gold for tiers.
const TONE = {
  success: { bg: "bg-[#E6F0E9]", text: "text-[#2F7A4F]", dot: "bg-[#2F7A4F]" },
  warning: { bg: "bg-[#FBEFD4]", text: "text-[#B07A1A]", dot: "bg-[#B07A1A]" },
  danger:  { bg: "bg-[#F6E3E3]", text: "text-[#9B2C2C]", dot: "bg-[#9B2C2C]" },
  info:    { bg: "bg-[#E2EAF2]", text: "text-[#2A5B8B]", dot: "bg-[#2A5B8B]" },
  gold:    { bg: "bg-[#FAEEDA]", text: "text-[#BA7517]", dot: "bg-[#C5A572]" },
  navy:    { bg: "bg-[#E2EAF2]", text: "text-[#0A2540]", dot: "bg-[#C5A572]" },
  silver:  { bg: "bg-[#E2EAF2]", text: "text-[#5B7EA3]", dot: "bg-[#8AA5C0]" },
  neutral: { bg: "bg-[#F5EEE0]", text: "text-[#3A4A5F]", dot: "bg-[#6B7685]" },
} as const;

const colors: Record<string, (typeof TONE)[keyof typeof TONE]> = {
  // Load statuses
  POSTED: TONE.info,
  BOOKED: TONE.info,
  DISPATCHED: TONE.info,
  AT_PICKUP: TONE.warning,
  LOADED: TONE.warning,
  IN_TRANSIT: TONE.info,
  AT_DELIVERY: TONE.info,
  DELIVERED: TONE.success,
  POD_RECEIVED: TONE.success,
  COMPLETED: TONE.success,
  CANCELLED: TONE.danger,
  // Payment statuses
  PAID: TONE.success,
  PENDING: TONE.warning,
  APPROVED: TONE.info,
  PROCESSING: TONE.info,
  SCHEDULED: TONE.warning,
  // Compliance
  VALID: TONE.success,
  EXPIRING_SOON: TONE.warning,
  EXPIRED: TONE.danger,
  // Caravan Partner Program tiers (v3.7.a — Silver/Gold/Platinum only)
  PLATINUM: TONE.navy,
  GOLD: TONE.gold,
  SILVER: TONE.silver,
};

const fallback = TONE.neutral;

export function CarrierBadge({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const c = colors[status] || fallback;
  const s = size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${c.bg} ${c.text} ${s}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status.replace(/_/g, " ")}
    </span>
  );
}
