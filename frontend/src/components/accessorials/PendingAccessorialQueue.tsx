"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CircleDollarSign } from "lucide-react";
import { api } from "@/lib/api";
import {
  type AccessorialRow,
  accessorialLabel, computationBasis, stopLabel, money, num,
} from "./accessorialPresentation";

interface PendingRow extends AccessorialRow {
  load?: {
    id: string;
    loadNumber?: string | null;
    referenceNumber?: string | null;
    originCity?: string | null;
    originState?: string | null;
    destCity?: string | null;
    destState?: string | null;
    customer?: { name?: string | null } | null;
    carrier?: { company?: string | null; firstName?: string | null; lastName?: string | null } | null;
  } | null;
}

/**
 * Accessorial claims waiting on a decision, across every load.
 *
 * This sits on the Track & Trace board rather than on a page of its own, on
 * purpose. Detention posts itself against a stop that closed hours ago, so
 * there is no load anyone is looking at when the claim appears — and a queue
 * on its own route is a queue nobody opens. The board is the surface the
 * operator already has open, so the claim finds them.
 *
 * Collapsed to a single line when the queue is empty so it costs nothing on a
 * clean morning, and opens itself when there is money waiting.
 */
export function PendingAccessorialQueue({
  onOpenLoad,
}: {
  onOpenLoad: (loadId: string) => void;
}) {
  const [open, setOpen] = useState(true);

  const query = useQuery<{ accessorials: PendingRow[]; count: number }>({
    queryKey: ["accessorials-pending"],
    queryFn: async () => (await api.get("/load-accessorials/pending")).data,
    refetchInterval: 60_000,
  });

  const rows = query.data?.accessorials ?? [];
  const total = rows.reduce((s, r) => s + num(r.amount), 0);

  if (query.isLoading || !rows.length) return null;

  return (
    <div className="border border-amber-300 bg-amber-50 rounded-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <CircleDollarSign className="w-4 h-4 text-amber-700 shrink-0" />
          <span className="text-sm font-medium text-amber-900">
            {rows.length} accessorial claim{rows.length === 1 ? "" : "s"} awaiting approval
          </span>
          <span className="text-sm text-amber-800">· {money(total)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-amber-700 hidden sm:inline">
            Unapproved claims are neither paid nor billed
          </span>
          {open ? <ChevronDown className="w-4 h-4 text-amber-700" /> : <ChevronRight className="w-4 h-4 text-amber-700" />}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          {rows.map((row) => {
            const load = row.load;
            const ref = load?.loadNumber ?? load?.referenceNumber?.slice(0, 8) ?? "Load";
            const lane = load
              ? `${load.originCity ?? "—"}, ${load.originState ?? ""} → ${load.destCity ?? "—"}, ${load.destState ?? ""}`
              : null;
            const carrier =
              load?.carrier?.company ||
              [load?.carrier?.firstName, load?.carrier?.lastName].filter(Boolean).join(" ") ||
              null;
            const basis = computationBasis(row);
            const where = stopLabel(row);

            return (
              <button
                key={row.id}
                onClick={() => load?.id && onOpenLoad(load.id)}
                disabled={!load?.id}
                className="w-full text-left flex items-start justify-between gap-3 bg-white border border-amber-200 rounded px-3 py-2 hover:border-amber-400 transition disabled:cursor-default"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium text-gray-900">{ref}</span>
                    <span className="text-[13px] text-gray-700">{accessorialLabel(row.type)}</span>
                  </div>
                  {lane && <div className="text-[11px] text-gray-500 mt-0.5">{lane}</div>}
                  <div className="text-[11px] text-gray-600 mt-0.5">
                    {[carrier, load?.customer?.name, where].filter(Boolean).join(" · ")}
                  </div>
                  {/* The reason the claim exists, in the operator's units. */}
                  {basis && <div className="text-[11px] text-gray-700 mt-0.5 font-medium">{basis}</div>}
                  {!basis && row.notes && (
                    <div className="text-[11px] text-gray-600 mt-0.5 line-clamp-1">{row.notes}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[13px] font-semibold text-gray-900">{money(num(row.amount))}</div>
                  <div className="text-[10px] text-[#BA7517]">Review →</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
