"use client";

const statusMap: Record<string, { bg: string; text: string; dot: string }> = {
  "In Transit": { bg: "bg-blue-500/10", text: "text-blue-500", dot: "bg-blue-500" },
  "Delivered": { bg: "bg-emerald-500/10", text: "text-emerald-500", dot: "bg-emerald-500" },
  "Pending": { bg: "bg-amber-500/10", text: "text-amber-500", dot: "bg-amber-500" },
  "Quoted": { bg: "bg-violet-500/10", text: "text-violet-500", dot: "bg-violet-500" },
  "Booked": { bg: "bg-blue-500/10", text: "text-blue-500", dot: "bg-blue-500" },
  "At Risk": { bg: "bg-red-500/10", text: "text-red-500", dot: "bg-red-500" },
  "Picked Up": { bg: "bg-emerald-600/10", text: "text-emerald-600", dot: "bg-emerald-600" },
  "Paid": { bg: "bg-emerald-500/10", text: "text-emerald-500", dot: "bg-emerald-500" },
  "Unpaid": { bg: "bg-red-500/10", text: "text-red-500", dot: "bg-red-500" },
  "Processing": { bg: "bg-amber-500/10", text: "text-amber-500", dot: "bg-amber-500" },
};

export function ShipperBadge({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const s = statusMap[status] || { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 ${s.bg} ${s.text} ${size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3.5 py-1 text-xs"} rounded-full font-semibold tracking-wide`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}
