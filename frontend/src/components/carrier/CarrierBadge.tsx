"use client";

const colors: Record<string, { bg: string; text: string; dot: string }> = {
  // Load statuses
  POSTED: { bg: "bg-blue-500/10", text: "text-blue-600", dot: "bg-blue-500" },
  BOOKED: { bg: "bg-violet-500/10", text: "text-violet-600", dot: "bg-violet-500" },
  DISPATCHED: { bg: "bg-orange-500/10", text: "text-orange-600", dot: "bg-orange-500" },
  AT_PICKUP: { bg: "bg-amber-500/10", text: "text-amber-600", dot: "bg-amber-500" },
  LOADED: { bg: "bg-yellow-500/10", text: "text-yellow-700", dot: "bg-yellow-500" },
  IN_TRANSIT: { bg: "bg-cyan-500/10", text: "text-cyan-600", dot: "bg-cyan-500" },
  AT_DELIVERY: { bg: "bg-teal-500/10", text: "text-teal-600", dot: "bg-teal-500" },
  DELIVERED: { bg: "bg-emerald-500/10", text: "text-emerald-600", dot: "bg-emerald-500" },
  POD_RECEIVED: { bg: "bg-emerald-500/10", text: "text-emerald-600", dot: "bg-emerald-500" },
  COMPLETED: { bg: "bg-emerald-500/10", text: "text-emerald-600", dot: "bg-emerald-500" },
  CANCELLED: { bg: "bg-red-500/10", text: "text-red-600", dot: "bg-red-500" },
  // Payment statuses
  PAID: { bg: "bg-emerald-500/10", text: "text-emerald-600", dot: "bg-emerald-500" },
  PENDING: { bg: "bg-amber-500/10", text: "text-amber-600", dot: "bg-amber-500" },
  APPROVED: { bg: "bg-blue-500/10", text: "text-blue-600", dot: "bg-blue-500" },
  PROCESSING: { bg: "bg-indigo-500/10", text: "text-indigo-600", dot: "bg-indigo-500" },
  SCHEDULED: { bg: "bg-purple-500/10", text: "text-purple-600", dot: "bg-purple-500" },
  // Compliance
  VALID: { bg: "bg-emerald-500/10", text: "text-emerald-600", dot: "bg-emerald-500" },
  EXPIRING_SOON: { bg: "bg-amber-500/10", text: "text-amber-600", dot: "bg-amber-500" },
  EXPIRED: { bg: "bg-red-500/10", text: "text-red-600", dot: "bg-red-500" },
  // Tier
  PLATINUM: { bg: "bg-violet-500/10", text: "text-violet-600", dot: "bg-violet-500" },
  GOLD: { bg: "bg-amber-500/10", text: "text-amber-600", dot: "bg-amber-500" },
  SILVER: { bg: "bg-gray-500/10", text: "text-gray-600", dot: "bg-gray-500" },
  BRONZE: { bg: "bg-orange-500/10", text: "text-orange-600", dot: "bg-orange-500" },
};

const fallback = { bg: "bg-gray-500/10", text: "text-gray-600", dot: "bg-gray-500" };

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
