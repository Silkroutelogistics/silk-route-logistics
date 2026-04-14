"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import type { BoardLoad, BoardPosition } from "./types";

interface Props {
  loads: BoardLoad[];
  onRowClick: (loadId: string) => void;
}

const fmtLane = (l: BoardLoad) =>
  `${l.originCity ?? "—"}, ${l.originState ?? ""} → ${l.destCity ?? "—"}, ${l.destState ?? ""}`;

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    POSTED:    "bg-blue-100 text-blue-700",
    TENDERED:  "bg-indigo-100 text-indigo-700",
    BOOKED:    "bg-violet-100 text-violet-700",
    DISPATCHED: "bg-green-100 text-green-700",
  };
  const cls = map[status] ?? "bg-gray-100 text-gray-700";
  return <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded ${cls}`}>{status.replace(/_/g, " ")}</span>;
};

function PositionDots({ positions }: { positions: BoardPosition[] }) {
  if (positions.length === 0) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <div className="flex gap-1 items-center">
      {positions.slice(0, 8).map((p) => {
        const cls =
          p.status === "declined" || p.status === "expired" ? "bg-gray-300 text-gray-500" :
          p.status === "tendered" ? "bg-[#BA7517] text-white ring-2 ring-[#FAEEDA]" :
          p.status === "accepted" ? "bg-green-500 text-white" :
          p.status === "queued"   ? "border border-gray-300 text-gray-500 bg-white" :
          "bg-gray-200 text-gray-500";
        return (
          <span
            key={p.id}
            className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center ${cls}`}
            title={`#${p.position} ${p.status}${p.isFallback ? " (DAT)" : ""}`}
          >
            {p.isFallback ? "D" : p.position}
          </span>
        );
      })}
    </div>
  );
}

function Countdown({ expiresAt }: { expiresAt: string | null }) {
  const [remaining, setRemaining] = useState(() =>
    expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0
  );
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => {
      setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return <span className="text-gray-400 text-xs">—</span>;
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const cls = mins < 5 ? "text-red-600 font-semibold" : mins < 10 ? "text-amber-600" : "text-gray-700";
  return (
    <span className={`text-xs tabular-nums ${cls}`}>
      {remaining === 0 ? "Expired" : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`}
    </span>
  );
}

export function BoardTable({ loads, onRowClick }: Props) {
  if (loads.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500 border border-gray-200 rounded-lg bg-white">
        No loads match this view.
      </div>
    );
  }
  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr className="text-left text-gray-600 text-xs uppercase tracking-wide">
            <th className="px-3 py-3 font-medium">Load #</th>
            <th className="px-3 py-3 font-medium">Lane</th>
            <th className="px-3 py-3 font-medium">PU</th>
            <th className="px-3 py-3 font-medium">Equip</th>
            <th className="px-3 py-3 font-medium">Waterfall</th>
            <th className="px-3 py-3 font-medium">Pos</th>
            <th className="px-3 py-3 font-medium">Timer</th>
            <th className="px-3 py-3 font-medium">Rate</th>
            <th className="px-3 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {loads.map((l) => {
            const wf = l.waterfalls[0];
            const currentPos = wf?.positions.find((p) => p.status === "tendered");
            return (
              <tr
                key={l.id}
                onClick={() => onRowClick(l.id)}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition"
              >
                <td className="px-3 py-3 font-medium text-gray-900">
                  {l.loadNumber ?? l.referenceNumber.slice(0, 8)}
                </td>
                <td className="px-3 py-3 text-gray-700">
                  <div className="flex items-center gap-1 text-xs">
                    <MapPin className="w-3 h-3 text-gray-400" />{fmtLane(l)}
                  </div>
                </td>
                <td className="px-3 py-3 text-gray-700 text-xs">{fmtDate(l.pickupDate)}</td>
                <td className="px-3 py-3 text-gray-700 text-xs">{l.equipmentType}</td>
                <td className="px-3 py-3">
                  <PositionDots positions={wf?.positions ?? []} />
                </td>
                <td className="px-3 py-3 text-xs text-gray-700">
                  {wf ? `${wf.currentPosition || 0}/${wf.totalPositions}` : "—"}
                </td>
                <td className="px-3 py-3"><Countdown expiresAt={currentPos?.tenderExpiresAt ?? null} /></td>
                <td className="px-3 py-3 text-gray-700 text-xs">
                  ${(l.customerRate ?? l.rate ?? 0).toLocaleString()}
                </td>
                <td className="px-3 py-3">{statusBadge(l.status)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
