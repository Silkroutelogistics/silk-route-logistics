"use client";

/**
 * Reverse a cancellation — the confirm step.
 *
 * IT ASKS THE SERVER WHAT WILL HAPPEN BEFORE IT OFFERS THE BUTTON. The preview
 * runs the same policy the PUT does, so a load the reversal would refuse says
 * so here, with the reason, instead of after the AE has typed a justification.
 *
 * IT LISTS WHAT WILL BE RESTORED, and the one thing that will not. Rate
 * confirmations cannot be un-voided -- the void nulls the signing token hash
 * and a hash is not recoverable -- so they are named here as work the AE still
 * has to do rather than left to be discovered when a carrier cannot sign.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Undo2, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface Preview {
  canReverse: boolean;
  code?: string;
  message?: string;
  restoreTo?: string;
  unhide?: boolean;
  willRestore?: {
    shipments: number;
    trackingLink: boolean;
    shipperTrackingLinks: number;
    tenders: number;
    carrierPays: number;
    shipperCredit: boolean;
  };
  rateConfirmationsToReissue?: Array<{ id: string; status: string }>;
}

const MIN_REASON = 10;

export default function ReverseCancellationModal({
  loadId,
  reference,
  onClose,
}: {
  loadId: string;
  reference: string | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: preview, isLoading } = useQuery({
    queryKey: ["uncancel-preview", loadId],
    queryFn: () => api.get<Preview>(`/loads/${loadId}/uncancel`).then((r: { data: Preview }) => r.data),
  });

  const reverse = useMutation({
    mutationFn: () => api.put(`/loads/${loadId}/uncancel`, { reason: reason.trim() }).then((r: { data: unknown }) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      queryClient.invalidateQueries({ queryKey: ["load", loadId] });
      onClose();
    },
    onError: (e: unknown) => {
      // The server's own message, never a generic one: every refusal it
      // produces names what to do instead, and replacing that with "something
      // went wrong" throws away the only useful part.
      const r = (e as { response?: { data?: { error?: string } } })?.response?.data;
      setError(r?.error ?? "The reversal could not be completed.");
    },
  });

  const ready = reason.trim().length >= MIN_REASON && preview?.canReverse === true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Reverse cancellation"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#0A2540]">
            <Undo2 className="h-4 w-4 text-[#BA7517]" />
            Reverse cancellation
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-sm text-[#3A4A5F]">
            Load <span className="font-semibold text-[#0A2540]">{reference ?? loadId}</span>
          </p>

          {isLoading && (
            <p className="flex items-center gap-2 text-sm text-[#6B7685]">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking what this would restore…
            </p>
          )}

          {preview && !preview.canReverse && (
            <div className="rounded-lg border border-[#9B2C2C]/40 bg-[#F6E3E3] px-4 py-3">
              <p className="flex items-start gap-2 text-sm text-[#9B2C2C]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{preview.message}</span>
              </p>
            </div>
          )}

          {preview?.canReverse && preview.willRestore && (
            <div className="rounded-lg border border-[#EFE6D3] bg-[#FBF7F0] px-4 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#BA7517]">
                What will be restored
              </p>
              <ul className="space-y-1 text-sm text-[#3A4A5F]">
                <li>
                  Load status back to{" "}
                  <span className="font-semibold text-[#0A2540]">{preview.restoreTo}</span>
                  {preview.unhide ? ", and the load unhidden" : ""}
                </li>
                {preview.willRestore.shipments > 0 && <li>{preview.willRestore.shipments} shipment(s)</li>}
                {preview.willRestore.trackingLink && (
                  <li>
                    The shipper&apos;s tracking link — the{" "}
                    <span className="font-semibold text-[#0A2540]">same link</span> they already have
                  </li>
                )}
                {preview.willRestore.shipperTrackingLinks > 0 && (
                  <li>{preview.willRestore.shipperTrackingLinks} shipper tracking record(s)</li>
                )}
                {preview.willRestore.tenders > 0 && (
                  <li>{preview.willRestore.tenders} tender(s), with no new offer sent</li>
                )}
                {preview.willRestore.carrierPays > 0 && (
                  <li>{preview.willRestore.carrierPays} carrier pay record(s)</li>
                )}
                {preview.willRestore.shipperCredit && <li>The shipper&apos;s credit utilisation</li>}
              </ul>
            </div>
          )}

          {preview?.canReverse && (preview.rateConfirmationsToReissue?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-[#B07A1A]/40 bg-[#FBEFD4] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#B07A1A]">
                What will NOT be restored
              </p>
              <p className="mt-1 text-sm text-[#B07A1A]">
                {preview.rateConfirmationsToReissue!.length} rate confirmation(s) were voided and cannot be
                un-voided — their signing links are gone for good. Re-issue them after reversing, or the
                carrier will have a document they cannot sign.
              </p>
            </div>
          )}

          {preview?.canReverse && (
            <div>
              <label htmlFor="reverse-reason" className="mb-1 block text-sm font-medium text-[#0A2540]">
                Why are you reversing this? <span className="text-[#9B2C2C]">*</span>
              </label>
              <textarea
                id="reverse-reason"
                rows={3}
                value={reason}
                onChange={(e) => { setReason(e.target.value); setError(null); }}
                placeholder="e.g. shipper re-confirmed the pickup for the original window"
                className="w-full rounded-lg border border-[#EFE6D3] bg-white px-3 py-2 text-sm text-[#0A2540] placeholder:text-[#A7AEB8] focus:border-[#BA7517] focus:outline-none focus:ring-2 focus:ring-[#BA7517]/15"
              />
              <p className="mt-1 text-xs text-[#6B7685]">
                Recorded on the load&apos;s audit trail. At least {MIN_REASON} characters.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border-l-4 border-[#9B2C2C] bg-[#F6E3E3] px-3 py-2 text-sm text-[#9B2C2C]">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[#3A4A5F] hover:bg-[#F5EEE0]"
          >
            Cancel
          </button>
          <button
            onClick={() => reverse.mutate()}
            disabled={!ready || reverse.isPending}
            className="flex items-center gap-2 rounded-lg bg-[#BA7517] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {reverse.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Reverse cancellation
          </button>
        </div>
      </div>
    </div>
  );
}
