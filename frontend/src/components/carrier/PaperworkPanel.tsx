"use client";

import { useState } from "react";
import { ClipboardList, CheckCircle, Clock, AlertCircle, Upload, Lock } from "lucide-react";
import { CarrierCard } from "./CarrierCard";
import { apiHref } from "@/lib/download";
import {
  paperworkSlots,
  paperworkMissing,
  PAPERWORK_DOC_LABELS,
  type PaperworkDoc,
  type PaperworkDocType,
  type PaperworkLoad,
  type PaperworkSlot,
} from "@shared/constants/paperwork";

/**
 * E4 (ruling 6, 2026-09-21) -- the paperwork a load owes, one row per slot,
 * with what the AE has and what is still missing.
 *
 * Rendered from the rule in shared/constants/paperwork, which the settlement
 * gate (E5) reads too: the required set this panel shows is the set that
 * decides whether the carrier is paid, by construction rather than by two
 * lists staying in step.
 *
 * Each row is a slot (proof of delivery accepts EITHER a signed delivery BOL
 * or a POD -- one row, two buttons), its state as the rule computes it
 * (missing / uploaded, awaiting review / verified / rejected with the AE's
 * note), the documents on file for it with a View link by id, and an upload
 * control when the slot is open at this status. The one closed slot is the
 * pickup BOL before AT_PICKUP; it says so rather than hiding.
 *
 * The parent owns the upload (it already invalidates the load reads), so this
 * component reports `onUpload(docType, file)` and renders `pending`/`error`.
 */
export interface PaperworkPanelProps {
  load: PaperworkLoad;
  documents: readonly PaperworkDoc[];
  onUpload: (docType: PaperworkDocType, file: File) => void;
  pending?: boolean;
  error?: string | null;
}

const STATE_CHIP: Record<PaperworkSlot["state"], { text: string; cls: string; Icon: typeof CheckCircle }> = {
  MISSING: { text: "Missing", cls: "bg-[#FBEFD4] text-[#B07A1A]", Icon: AlertCircle },
  UPLOADED: { text: "Uploaded, awaiting review", cls: "bg-[#E2EAF2] text-[#2A5B8B]", Icon: Clock },
  VERIFIED: { text: "Verified", cls: "bg-[#E6F0E9] text-[#2F7A4F]", Icon: CheckCircle },
  REJECTED: { text: "Rejected", cls: "bg-[#F6E3E3] text-[#9B2C2C]", Icon: AlertCircle },
};

export function PaperworkPanel({ load, documents, onUpload, pending = false, error = null }: PaperworkPanelProps) {
  const slots = paperworkSlots(load, documents);
  const required = slots.filter((s) => s.required);
  const missing = paperworkMissing(slots);
  const onFile = required.length - missing.length;
  // Which slot's upload the pending state belongs to, so one spinner does not
  // sit on every row.
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  return (
    <CarrierCard padding="p-4" className="mt-3">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h4 className="text-xs font-bold text-[#0A2540] flex items-center gap-1.5">
          <ClipboardList size={14} className="text-[#BA7517]" /> Paperwork
        </h4>
        <span data-testid="paperwork-summary" className={`text-[11px] font-semibold ${missing.length === 0 ? "text-[#2F7A4F]" : "text-[#B07A1A]"}`}>
          {onFile} of {required.length} required on file
        </span>
      </div>

      <ul className="space-y-2" data-testid="paperwork-slots">
        {slots.map((slot) => {
          const chip = STATE_CHIP[slot.state];
          const canUpload = slot.open && slot.state !== "VERIFIED";
          return (
            <li key={slot.key} data-testid={`paperwork-slot-${slot.key}`} data-state={slot.state} className="rounded-md border border-[#EFE6D3] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-[#0A2540]">
                  {slot.label}
                  <span className="ml-1.5 text-[10px] font-normal text-gray-600">{slot.required ? "Required" : "Optional"}</span>
                </div>
                <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${chip.cls}`}>
                  <chip.Icon size={11} /> {chip.text}
                </span>
              </div>

              {slot.state === "REJECTED" && slot.rejectionNote && (
                <p data-testid={`paperwork-rejection-${slot.key}`} className="mt-1 text-[11px] text-[#9B2C2C]">{slot.rejectionNote}</p>
              )}

              {slot.documents.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {slot.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between text-[11px] text-gray-700">
                      <span className="truncate">
                        {PAPERWORK_DOC_LABELS[d.docType as PaperworkDocType] ?? d.docType}
                        {d.fileName ? ` · ${d.fileName}` : ""}
                        {d.status !== "PENDING" ? ` · ${d.status.toLowerCase()}` : ""}
                      </span>
                      <a href={apiHref(`/documents/${d.id}/download`)} target="_blank" rel="noreferrer" className="ml-2 shrink-0 text-[#2A5B8B] underline">View</a>
                    </li>
                  ))}
                </ul>
              )}

              {!slot.open ? (
                <p data-testid={`paperwork-closed-${slot.key}`} className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-600">
                  <Lock size={11} /> Available from {slot.notBefore.replace(/_/g, " ").toLowerCase()}.
                </p>
              ) : canUpload ? (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {slot.accepts.map((t) => {
                    const busy = pending && uploadingKey === `${slot.key}:${t}`;
                    return (
                      <label
                        key={t}
                        data-testid={`paperwork-upload-${t}`}
                        className={`inline-flex items-center gap-1 rounded border border-dashed border-[#C5A572] px-2 py-1 text-[11px] font-medium text-[#0A2540] hover:bg-[#FAEEDA] cursor-pointer ${pending ? "opacity-60 pointer-events-none" : ""}`}
                      >
                        <Upload size={11} /> {busy ? "Uploading…" : `Upload ${PAPERWORK_DOC_LABELS[t].toLowerCase()}`}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,application/pdf"
                          className="hidden"
                          disabled={pending}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploadingKey(`${slot.key}:${t}`);
                            onUpload(t, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error && (
        <p data-testid="paperwork-error" className="mt-2 text-[11px] text-[#9B2C2C] bg-[#F6E3E3] border border-[#9B2C2C]/30 rounded px-2 py-1.5">{error}</p>
      )}
      <p className="mt-2 text-[10px] text-gray-600">JPG, PNG, or PDF, up to 10MB. Paperwork is due within 24 hours of delivery.</p>
    </CarrierCard>
  );
}
