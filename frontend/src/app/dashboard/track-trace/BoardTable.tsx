"use client";

import { MapPin, PhoneCall, AlertTriangle } from "lucide-react";
import type { BoardLoad, ProgressState } from "./types";
import { STRIPE_COLORS } from "./types";

interface BoardTableProps {
  loads: BoardLoad[];
  onRowClick: (loadId: string) => void;
}

const progressSegmentClass = (state: ProgressState) => {
  switch (state) {
    case "complete":  return "bg-green-500";
    case "active":    return "bg-blue-500";
    case "exception": return "bg-red-500";
    default:          return "bg-gray-200";
  }
};

const gpsPill = (gps: BoardLoad["gpsStatus"]) => {
  if (gps === "live") return <span className="inline-flex items-center gap-1 text-xs text-green-700"><span className="w-2 h-2 rounded-full bg-green-500" /> Live</span>;
  if (gps === "stale") return <span className="inline-flex items-center gap-1 text-xs text-amber-700"><span className="w-2 h-2 rounded-full bg-amber-500" /> Stale</span>;
  return <span className="text-xs text-gray-400">—</span>;
};

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    TENDERED: "bg-indigo-100 text-indigo-700",
    CONFIRMED: "bg-purple-100 text-purple-700",
    BOOKED: "bg-violet-100 text-violet-700",
    DISPATCHED: "bg-orange-100 text-orange-700",
    AT_PICKUP: "bg-amber-100 text-amber-700",
    LOADED: "bg-yellow-100 text-yellow-700",
    IN_TRANSIT: "bg-cyan-100 text-cyan-700",
    AT_DELIVERY: "bg-teal-100 text-teal-700",
    DELIVERED: "bg-green-100 text-green-700",
    POD_RECEIVED: "bg-emerald-100 text-emerald-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
  };
  const cls = map[status] ?? "bg-gray-100 text-gray-700";
  return <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded ${cls}`}>{status.replace(/_/g, " ")}</span>;
};

const abbreviateLane = (l: BoardLoad) => {
  const o = `${l.origin.city ?? "—"}, ${l.origin.state ?? ""}`.trim();
  const d = `${l.destination.city ?? "—"}, ${l.destination.state ?? ""}`.trim();
  return `${o} → ${d}`;
};

export function BoardTable({ loads, onRowClick }: BoardTableProps) {
  if (loads.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500 border border-gray-200 rounded-lg bg-white">
        No loads match your filters.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr className="text-left text-gray-600 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 w-1"></th>
            <th className="px-3 py-3 font-medium">Load #</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium w-48">Progress</th>
            <th className="px-3 py-3 font-medium">Shipper</th>
            <th className="px-3 py-3 font-medium">Lane</th>
            <th className="px-3 py-3 font-medium">Carrier</th>
            <th className="px-3 py-3 font-medium">ETA</th>
            <th className="px-3 py-3 font-medium">Check Calls</th>
            <th className="px-3 py-3 font-medium">GPS</th>
          </tr>
        </thead>
        <tbody>
          {loads.map((l) => (
            <tr
              key={l.id}
              onClick={() => onRowClick(l.id)}
              className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition"
            >
              <td className={`w-1 ${STRIPE_COLORS[l.stripe]}`}></td>
              <td className="px-3 py-3 font-medium text-gray-900">
                <div className="flex items-center gap-1.5">
                  {l.loadNumber ?? l.referenceNumber.slice(0, 8)}
                  {l.hasOpenException && (
                    <span title={`${l.openExceptionCount} open exception${l.openExceptionCount === 1 ? "" : "s"}`}>
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-3">{statusBadge(l.status)}</td>
              <td className="px-3 py-3">
                <div className="flex gap-1">
                  <div className={`h-2 flex-1 rounded-l ${progressSegmentClass(l.progress.booked)}`} />
                  <div className={`h-2 flex-1 ${progressSegmentClass(l.progress.pickedUp)}`} />
                  <div className={`h-2 flex-1 ${progressSegmentClass(l.progress.inTransit)}`} />
                  <div className={`h-2 flex-1 rounded-r ${progressSegmentClass(l.progress.delivered)}`} />
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-gray-400 uppercase">
                  <span>Booked</span><span>PU</span><span>Transit</span><span>Del</span>
                </div>
              </td>
              <td className="px-3 py-3 text-gray-700 truncate max-w-[160px]">{l.shipper ?? "—"}</td>
              <td className="px-3 py-3 text-gray-700">
                <div className="flex items-center gap-1 text-xs">
                  <MapPin className="w-3 h-3 text-gray-400" />
                  {abbreviateLane(l)}
                </div>
              </td>
              <td className="px-3 py-3 text-gray-700 truncate max-w-[160px]">{l.carrier?.name ?? "—"}</td>
              <td className="px-3 py-3 text-gray-700">
                {l.eta ? new Date(l.eta).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-1">
                  <PhoneCall className="w-3 h-3 text-gray-400" />
                  {l.callsDue
                    ? <span className="w-2 h-2 rounded-full bg-amber-500" title="Check call due" />
                    : <span className="w-2 h-2 rounded-full bg-gray-300" />}
                </div>
              </td>
              <td className="px-3 py-3">{gpsPill(l.gpsStatus)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
