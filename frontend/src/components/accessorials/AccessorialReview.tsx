"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Loader2, Bot, User } from "lucide-react";
import { api } from "@/lib/api";
import {
  type AccessorialRow,
  accessorialLabel, computationBasis, stopLabel, money, num,
  isPending, isApproved, isRejected, isSystemWritten,
  isAtCostReimbursement, billsToCustomer,
} from "./accessorialPresentation";

/**
 * Approve or reject an accessorial claim.
 *
 * Every accessorial is written PENDING — the reconciler that prices detention
 * stamps its own rows that way (backend/src/lib/detentionLayover.ts) and both
 * money paths gate on APPROVED. So until someone acts here the carrier is not
 * paid and the customer is not billed, no matter how correctly the amount was
 * computed. This is the only place in the authoritative console where that
 * decision can be made.
 *
 * Approving pushes into both money paths in one call server-side, so a line
 * approved after the settlement already exists still reaches it.
 */
export function AccessorialReview({
  rows,
  loadId,
  onChange,
}: {
  rows: AccessorialRow[];
  loadId: string;
  onChange?: () => void;
}) {
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const settled = () => {
    setRejectingId(null);
    setReason("");
    setError(null);
    // The board's pending count and this load's rows both move on a decision.
    queryClient.invalidateQueries({ queryKey: ["tt-load-detail", loadId] });
    queryClient.invalidateQueries({ queryKey: ["accessorials-pending"] });
    onChange?.();
  };

  const failed = (err: any, fallback: string) =>
    setError(err?.response?.data?.error ?? err?.message ?? fallback);

  const approve = useMutation({
    mutationFn: async (id: string) =>
      (await api.put(`/load-accessorials/item/${id}/approve`)).data,
    onSuccess: settled,
    onError: (e) => failed(e, "Failed to approve"),
  });

  const reject = useMutation({
    mutationFn: async (vars: { id: string; reason: string }) =>
      (await api.put(`/load-accessorials/item/${vars.id}/reject`, { reason: vars.reason })).data,
    onSuccess: settled,
    onError: (e) => failed(e, "Failed to reject"),
  });

  const busy = approve.isPending || reject.isPending;

  if (!rows.length) {
    return (
      <p className="text-[12px] text-gray-500">
        No accessorials on this load. Detention and layover post themselves when a stop closes.
      </p>
    );
  }

  const pendingCount = rows.filter(isPending).length;

  return (
    <div className="space-y-2">
      {pendingCount > 0 && (
        <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          {pendingCount} claim{pendingCount === 1 ? "" : "s"} awaiting a decision. Nothing is paid to the
          carrier or billed to the customer until each one is approved.
        </p>
      )}

      {error && (
        <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
          {error}
        </div>
      )}

      {rows.map((row) => {
        const pending = isPending(row);
        const basis = computationBasis(row);
        const where = stopLabel(row);
        const atCost = isAtCostReimbursement(row);
        const passesThrough = billsToCustomer(row);

        return (
          <div
            key={row.id}
            className={`border rounded-lg p-3 ${
              pending ? "border-amber-300 bg-amber-50/40" : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">
                    {accessorialLabel(row.type)}
                  </span>
                  <StatusPill row={row} />
                  {isSystemWritten(row) ? (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] text-gray-500"
                      title="Priced automatically from the stop's arrival and departure times"
                    >
                      <Bot className="w-3 h-3" /> auto
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                      <User className="w-3 h-3" /> entered by hand
                    </span>
                  )}
                </div>

                {where && <div className="text-[11px] text-gray-500 mt-0.5">{where}</div>}
                {basis && <div className="text-[11px] text-gray-700 mt-0.5 font-medium">{basis}</div>}
                {row.notes && <div className="text-[11px] text-gray-600 mt-1">{row.notes}</div>}

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {atCost && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"
                      title="Money the carrier fronted. Repaid in full, and no Quick Pay fee is charged on it."
                    >
                      at cost · no QP fee
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    {passesThrough ? "carrier + customer" : "carrier only"}
                  </span>
                  {row.shipperInvoiceId && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                      already invoiced
                    </span>
                  )}
                </div>

                {isRejected(row) && row.rejectedReason && (
                  <div className="text-[11px] text-red-700 mt-1.5 italic">
                    Rejected: {row.rejectedReason}
                  </div>
                )}
              </div>

              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-gray-900">{money(num(row.amount))}</div>
                {pending && (
                  <div className="flex gap-1.5 mt-2">
                    <button
                      onClick={() => approve.mutate(row.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 disabled:opacity-40"
                    >
                      {approve.isPending && approve.variables === row.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Check className="w-3 h-3" />}
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setRejectingId(rejectingId === row.id ? null : row.id);
                        setReason("");
                        setError(null);
                      }}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      <X className="w-3 h-3" /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>

            {rejectingId === row.id && (
              <div className="mt-2.5 pt-2.5 border-t border-amber-200">
                <label className="block text-[11px] text-gray-600 mb-1">
                  Why is this being rejected? The carrier will ask.
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder="Driver was in the door on time. No billable dwell at this stop."
                  className="w-full px-2 py-1.5 text-[12px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#BA7517]/30"
                />
                <div className="flex gap-2 mt-1.5">
                  <button
                    onClick={() => reject.mutate({ id: row.id, reason: reason.trim() })}
                    disabled={busy || reason.trim().length < 4}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-red-300 bg-red-50 text-red-800 hover:bg-red-100 disabled:opacity-40"
                    title={reason.trim().length < 4 ? "A reason is required" : undefined}
                  >
                    {reject.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                    Confirm rejection
                  </button>
                  <button
                    onClick={() => { setRejectingId(null); setReason(""); }}
                    className="px-2.5 py-1 text-[11px] text-gray-600 hover:text-gray-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ row }: { row: AccessorialRow }) {
  const cls = isApproved(row)
    ? "bg-green-100 text-green-700"
    : isRejected(row)
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-800";
  const label = isApproved(row) ? "Approved" : isRejected(row) ? "Rejected" : "Pending";
  return <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${cls}`}>{label}</span>;
}
