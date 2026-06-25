"use client";

// Canonical SRL status palette (§2.1 / skill tokens) — success #2F7A4F,
// warning #B07A1A, danger #9B2C2C, info #2A5B8B. Retired the Tailwind rainbow.
const TONE = {
  success: { bg: "bg-[#E6F0E9]", text: "text-[#2F7A4F]", dot: "bg-[#2F7A4F]" },
  warning: { bg: "bg-[#FBEFD4]", text: "text-[#B07A1A]", dot: "bg-[#B07A1A]" },
  danger:  { bg: "bg-[#F6E3E3]", text: "text-[#9B2C2C]", dot: "bg-[#9B2C2C]" },
  info:    { bg: "bg-[#E2EAF2]", text: "text-[#2A5B8B]", dot: "bg-[#2A5B8B]" },
} as const;

const statusMap: Record<string, (typeof TONE)[keyof typeof TONE]> = {
  "In Transit": TONE.info,
  "Delivered": TONE.success,
  "Pending": TONE.warning,
  "Quoted": TONE.info,
  "Booked": TONE.info,
  "At Risk": TONE.danger,
  "Picked Up": TONE.success,
  "Paid": TONE.success,
  "Unpaid": TONE.danger,
  "Processing": TONE.warning,
};

export function ShipperBadge({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const s = statusMap[status] || { bg: "bg-[#F5EEE0]", text: "text-[#3A4A5F]", dot: "bg-[#6B7685]" };
  return (
    <span className={`inline-flex items-center gap-1.5 ${s.bg} ${s.text} ${size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3.5 py-1 text-xs"} rounded-full font-semibold tracking-wide`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}
