"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, Archive } from "lucide-react";
import { api } from "@/lib/api";
import {
  CARRIER_ARCHIVE_REASONS,
  CARRIER_ARCHIVE_REASON_LABELS,
} from "@shared/constants/carrierArchiveReasons";

/**
 * ArchiveCarrierModal — carrier-archive recut C6 (2026-09-21).
 *
 * The AE side of DELETE /api/carriers/:id (carrierController.archiveCarrier,
 * C3). Until this modal the Archive… button posted NO body, so every click was
 * refused 422 ARCHIVE_REASON_REQUIRED and the audit row's reason would have
 * been null: the C2 contract says a reason is REQUIRED and drawn from the one
 * vocabulary (shared/constants/carrierArchiveReasons, C4) and the note is
 * optional, trimmed, capped at 500.
 *
 * THE SERVER IS THE AUTHORITY ON "REQUIRED". The button is not disabled while
 * no reason is chosen: the request goes, the server refuses 422, and the
 * refusal — code and message — is what the operator reads. A client-side gate
 * that pre-empts the server would leave the 422 path unexercised by anything a
 * person can do, and a contract no surface exercises is one nobody notices
 * drifting. The placeholder says a reason is needed; the server says so again.
 *
 * What the copy promises is what C3 does, no more: the login stops, every open
 * offer is withdrawn as SRL's act, every record is kept, a truck under a load
 * refuses the archive, payables stay owed, and restore returns the carrier at
 * REVIEWING (B6c). CLAUDE.md §14 "CARRIER ARCHIVE".
 *
 * Two outcomes reach the page, not the modal: a 409 CARRIER_HOLDS_LIVE_LOADS
 * hands its body up through onRefused so the page's existing refusal renderer
 * (in-flight loads + "Suspend instead") shows it beneath the action bar; a
 * success hands up the response details. Every other refusal renders inline.
 */

export type ArchiveRefusalBody = {
  error?: string;
  message?: string;
  code?: string;
  blockingLoads?: Array<{ id: string; loadNumber?: string | null; status?: string }>;
  remedy?: {
    inFlightLoads?: string[];
    releaseInFlightLoadsFirst?: string;
    holdingTenders?: Array<{ id: string; status: string; loadId: string }>;
    suspend?: string | null;
  };
};

export type ArchiveDoneDetails = {
  archived: boolean;
  loginDeactivated: boolean;
  archiveReason: string;
  references?: number;
  withdrawn?: Record<string, number>;
};

export function ArchiveCarrierModal({
  carrierId, carrierName, onClose, onDone, onRefused,
}: {
  carrierId: string;
  carrierName: string;
  onClose: () => void;
  onDone: (details: ArchiveDoneDetails | undefined) => void;
  /** A 409 (a truck under a load). The page renders it; the modal closes. */
  onRefused: (refusal: ArchiveRefusalBody) => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const archive = useMutation({
    mutationFn: async () => {
      const body: { reason?: string; archiveNote?: string } = {};
      if (reason) body.reason = reason;
      const trimmed = note.trim();
      if (trimmed) body.archiveNote = trimmed;
      // axios carries a DELETE body under `data`; the route reads req.body.
      return (await api.delete(`/carriers/${carrierId}`, { data: body })).data as
        | { details?: ArchiveDoneDetails }
        | undefined;
    },
    onSuccess: (data) => onDone(data?.details),
    onError: (err: unknown) => {
      const e = err as { response?: { status?: number; data?: ArchiveRefusalBody }; message?: string };
      const status = e?.response?.status;
      const data = e?.response?.data;
      if (status === 409 && data) {
        onRefused(data);
        return;
      }
      // 422 { error, code } from assessArchiveInput; anything else with a message.
      const code = data?.code ? ` (${data.code})` : "";
      const message = data?.message ?? data?.error ?? e?.message ?? "Archive failed";
      setErrMsg(`Archive refused${code}: ${message}`);
    },
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="archive-carrier-title">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-5 border border-gray-200">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 id="archive-carrier-title" className="text-base font-semibold text-gray-900 inline-flex items-center gap-2">
            <Archive className="w-4 h-4 text-[#0A2540]" strokeWidth={2} />
            Archive {carrierName}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-700" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-gray-700 mb-3">
          Archiving closes the record. The login stops. Every open offer to this carrier is
          withdrawn as SRL&apos;s act, never as their refusal. The profile, documents, agreements
          and history are kept, and any money owed to them stays owed. It is refused while a
          truck is under a load; release or deliver that load first, or suspend instead. An
          administrator can restore an archived carrier; it comes back at REVIEWING.
        </p>
        <label htmlFor="archive-reason" className="block text-xs font-medium text-gray-600 mb-1">Reason (required)</label>
        <select
          id="archive-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded-md p-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0A2540]/20 focus:border-[#0A2540]"
        >
          <option value="">Choose a reason…</option>
          {CARRIER_ARCHIVE_REASONS.map((r) => (
            <option key={r} value={r}>{CARRIER_ARCHIVE_REASON_LABELS[r]}</option>
          ))}
        </select>
        <label htmlFor="archive-note" className="block text-xs font-medium text-gray-600 mt-3 mb-1">Note (optional, up to 500 characters)</label>
        <textarea
          id="archive-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. Second registration for the same MC; the first record stays live."
          className="w-full text-sm border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#0A2540]/20 focus:border-[#0A2540]"
        />
        {errMsg && <p role="alert" className="mt-2 text-xs text-[#9B2C2C]">{errMsg}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-700 border border-gray-300 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => { setErrMsg(null); archive.mutate(); }}
            disabled={archive.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-[#0A2540] hover:bg-[#15365A] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#0A2540]/40"
          >
            {archive.isPending ? "Archiving…" : "Archive carrier"}
          </button>
        </div>
      </div>
    </div>
  );
}
