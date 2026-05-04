"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus } from "lucide-react";

const FLOW = ["Quote", "Order", "Load", "Dispatch", "T&T", "Invoice"];

function statusBucket(s: string): number {
  if (["POSTED", "TENDERED", "CONFIRMED", "BOOKED"].includes(s)) return 1;
  if (["DISPATCHED", "AT_PICKUP", "LOADED"].includes(s)) return 3;
  if (["IN_TRANSIT", "AT_DELIVERY"].includes(s)) return 4;
  if (["DELIVERED", "POD_RECEIVED"].includes(s)) return 4;
  if (["INVOICED", "COMPLETED"].includes(s)) return 5;
  return 0;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    POSTED: "bg-amber-100 text-amber-700",
    TENDERED: "bg-indigo-100 text-indigo-700",
    BOOKED: "bg-blue-100 text-blue-700",
    DISPATCHED: "bg-green-100 text-green-700",
    IN_TRANSIT: "bg-cyan-100 text-cyan-700",
    DELIVERED: "bg-green-100 text-green-700",
    INVOICED: "bg-emerald-100 text-emerald-700",
    COMPLETED: "bg-gray-100 text-gray-600",
  };
  const cls = map[status] ?? "bg-gray-100 text-gray-600";
  return <span className={`px-1.5 py-0.5 text-[10px] rounded ${cls}`}>{status.replace(/_/g, " ")}</span>;
}

export function OrdersTab({ customerId }: { customerId: string }) {
  const q = useQuery<{ loads: any[] }>({
    queryKey: ["crm-orders", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}/loads`)).data,
  });

  const loads = q.data?.loads ?? [];
  const maxBucket = loads.length > 0
    ? Math.max(...loads.map((l) => statusBucket(l.status)))
    : 0;

  return (
    <div className="space-y-4 text-sm">
      <Link
        href={`/dashboard/orders?customerId=${customerId}`}
        className="inline-flex items-center gap-1 px-4 py-2 bg-[#BA7517] hover:bg-[#8f5a11] text-white text-sm font-medium rounded"
      >
        <Plus className="w-4 h-4" /> New order
      </Link>

      <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
        {loads.length === 0 && <div className="p-4 text-xs text-gray-700 text-center">No orders yet.</div>}
        {loads.map((l) => (
          <div key={l.id} className="flex items-center justify-between p-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{l.loadNumber ?? l.referenceNumber.slice(0, 8)}</span>
                {statusBadge(l.status)}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {l.originCity}, {l.originState} → {l.destCity}, {l.destState} · {l.equipmentType}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold text-gray-900">
                ${Math.round(l.customerRate ?? l.rate ?? 0).toLocaleString()}
              </div>
              <div className="text-[10px] text-gray-500">
                {new Date(l.pickupDate).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Order flow</h3>
        <div className="flex items-center gap-1">
          {FLOW.map((stage, i) => {
            const active = i <= maxBucket;
            return (
              <div key={stage} className="flex items-center flex-1">
                <div className={`flex-1 h-2 rounded ${active ? "bg-[#BA7517]" : "border border-dashed border-gray-300"}`} />
                {i < FLOW.length - 1 && <span className="w-1" />}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
          {FLOW.map((s) => <span key={s}>{s}</span>)}
        </div>
      </div>
    </div>
  );
}
