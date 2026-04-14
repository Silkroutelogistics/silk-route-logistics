"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Truck } from "lucide-react";

interface LoadsResponse {
  loads: any[];
  total: number;
  totalRevenue: number;
  avgMargin: number;
  topLanes: { origin: string; dest: string; count: number; avgRate: number }[];
}

export function LoadsTab({ customerId }: { customerId: string }) {
  const q = useQuery<LoadsResponse>({
    queryKey: ["crm-loads", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}/loads`)).data,
  });

  if (q.isLoading) return <div className="text-sm text-gray-400">Loading…</div>;
  const d = q.data;
  if (!d) return null;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Total loads" value={d.total} />
        <Stat label="Revenue" value={`$${Math.round(d.totalRevenue).toLocaleString()}`} />
        <Stat label="Avg margin" value={`${d.avgMargin.toFixed(1)}%`} tone="green" />
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Top lanes</h3>
        <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
          {d.topLanes.length === 0 && <div className="p-3 text-xs text-gray-400 text-center">No lanes yet.</div>}
          {d.topLanes.map((l, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2">
              <div className="text-sm text-gray-900">{l.origin} → {l.dest}</div>
              <div className="text-xs text-gray-500">
                {l.count} load{l.count === 1 ? "" : "s"} · avg ${l.avgRate.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recent loads</h3>
          <Link href="/dashboard/track-trace" className="text-[11px] text-[#854F0B] hover:underline">
            View all →
          </Link>
        </div>
        <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
          {d.loads.length === 0 && <div className="p-3 text-xs text-gray-400 text-center">No loads yet.</div>}
          {d.loads.map((l) => (
            <Link
              key={l.id}
              href="/dashboard/track-trace"
              className="flex items-center justify-between px-3 py-2 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Truck className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="font-medium text-gray-900">{l.loadNumber ?? l.referenceNumber.slice(0, 8)}</span>
                <span className="text-xs text-gray-500 truncate">
                  {l.originCity}, {l.originState} → {l.destCity}, {l.destState}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-gray-500">{new Date(l.pickupDate).toLocaleDateString()}</span>
                <span className={`px-1.5 py-0.5 text-[10px] rounded ${
                  l.status === "DELIVERED" ? "bg-green-100 text-green-700"
                  : l.status === "IN_TRANSIT" ? "bg-cyan-100 text-cyan-700"
                  : "bg-gray-100 text-gray-600"
                }`}>
                  {l.status.replace(/_/g, " ")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "green" }) {
  const cls = tone === "green" ? "text-green-700" : "text-gray-900";
  return (
    <div className="border border-gray-200 rounded-lg bg-white p-3">
      <div className="text-[11px] uppercase text-gray-500">{label}</div>
      <div className={`text-xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
