"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, Eye } from "lucide-react";

/**
 * What a parser read out of the COI, shown BESIDE what the carrier typed.
 *
 * v3.8.awh. Two rules shape everything here.
 *
 * The extracted value never replaces the typed one. A typed value is what the
 * carrier attested to; an extracted value is a second reading of the same
 * document. Where they disagree, that disagreement is the finding — collapsing
 * them into one number destroys it, and the pre-existing `?apply=true` path did
 * exactly that with no comparison and no confidence gate.
 *
 * A reading nobody should trust says so. A failed or low-confidence parse
 * renders as "needs review" with the document one click away, never as a blank
 * that reads like a clean result, and never as a pass.
 */

interface Discrepancy { field: string; typed: string | number | null; extracted: string | number | null }

interface Extraction {
  id: string;
  docType: string;
  status: "OK" | "LOW_CONFIDENCE" | "FAILED";
  confidence: string | null;
  extracted: Record<string, unknown> | null;
  discrepancies: Discrepancy[] | null;
  error: string | null;
  createdAt: string;
  document: { id: string; fileName: string; createdAt: string; fileUrl: string } | null;
}

const money = (v: unknown) =>
  typeof v === "number" ? `$${v.toLocaleString()}` : v ? String(v) : "—";

export function CoiReadingPanel({
  carrierId,
  typed,
  onOpenDocument,
}: {
  carrierId: string;
  typed: {
    autoLiabilityAmount?: number | null;
    cargoInsuranceAmount?: number | null;
    generalLiabilityAmount?: number | null;
    workersCompAmount?: number | null;
    insuranceExpiry?: string | null;
  };
  onOpenDocument?: (documentId: string) => void;
}) {
  const { data, isLoading } = useQuery<{ extractions: Extraction[] }>({
    queryKey: ["carrier-extractions", carrierId],
    queryFn: async () => (await api.get(`/carriers/${carrierId}/extractions`)).data,
    enabled: !!carrierId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-gray-500 pt-3 border-t border-gray-200">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading the document reading…
      </div>
    );
  }

  const coi = data?.extractions?.find((e) => e.docType === "COI");

  // No extraction is NOT a failure state. Most carriers predate the trigger, and
  // rendering an alarm for them would train the AE to ignore this panel.
  if (!coi) {
    return (
      <div className="pt-3 border-t border-gray-200">
        <p className="text-[11px] text-gray-500">
          No COI reading on file. Documents uploaded from now on are read automatically.
        </p>
      </div>
    );
  }

  const needsReview = coi.status === "FAILED" || coi.status === "LOW_CONFIDENCE";
  const disc = coi.discrepancies || [];
  const ex = (coi.extracted || {}) as Record<string, never>;
  const pick = (path: string[]): unknown =>
    path.reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : null), ex);

  const rows: { label: string; typed: unknown; extracted: unknown }[] = [
    { label: "Auto liability", typed: typed.autoLiabilityAmount, extracted: pick(["autoLiability", "combinedSingleLimit"]) },
    { label: "Cargo insurance", typed: typed.cargoInsuranceAmount, extracted: pick(["cargoInsurance", "perOccurrence"]) },
    { label: "General liability", typed: typed.generalLiabilityAmount, extracted: pick(["generalLiability", "perOccurrence"]) },
    { label: "Workers comp", typed: typed.workersCompAmount, extracted: pick(["workersComp", "perAccident"]) },
  ];

  const flagged = new Set(disc.map((d) => d.field));

  return (
    <div className="pt-3 border-t border-gray-200 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold text-[#BA7517] uppercase tracking-[0.14em] flex items-center gap-1.5">
          <FileSearch className="w-3.5 h-3.5" /> COI reading
        </h4>
        <div className="flex items-center gap-2">
          {coi.confidence && (
            <span className="text-[11px] text-gray-500">confidence {coi.confidence.toLowerCase()}</span>
          )}
          {coi.document && onOpenDocument && (
            <button
              onClick={() => onOpenDocument(coi.document!.id)}
              className="text-[11px] text-[#BA7517] hover:underline flex items-center gap-1"
            >
              <Eye className="w-3 h-3" /> View document
            </button>
          )}
        </div>
      </div>

      {/* Review state. Deliberately BEFORE the values: if the reading cannot be
          trusted, that is the first thing an AE should know about it. */}
      {needsReview && (
        <div className="rounded-lg border border-[#B07A1A]/40 bg-[#FBEFD4] px-3 py-2">
          <p className="text-[11px] font-semibold text-[#B07A1A] flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Needs review — this document was not read with confidence
          </p>
          <p className="text-[11px] text-[#7a5512] mt-1 leading-relaxed">
            {coi.error || "The reader returned a low-confidence result."} Nothing was changed on the
            carrier record. Open the document and confirm the values by eye.
          </p>
        </div>
      )}

      {/* Discrepancies. A finding, never a verdict — the wording says so, because
          an AE reading "mismatch" in red will assume the carrier is at fault when
          the likeliest explanation is a scanned fax. */}
      {disc.length > 0 && (
        <div className="rounded-lg border border-[#9B2C2C]/30 bg-[#F6E3E3] px-3 py-2">
          <p className="text-[11px] font-semibold text-[#9B2C2C] flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            The COI disagrees with the typed values on {disc.length} field{disc.length > 1 ? "s" : ""}
          </p>
          <ul className="mt-1 space-y-0.5">
            {disc.map((d) => (
              <li key={d.field} className="text-[11px] text-[#7d2323]">
                <span className="font-medium">{d.field}:</span> typed {money(d.typed)} · COI says {money(d.extracted)}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-[#7d2323] mt-1.5 leading-relaxed">
            Compass records this as a warning, not a failure. Confirm which is correct before approving.
          </p>
        </div>
      )}

      {!needsReview && disc.length === 0 && (
        <p className="text-[11px] text-[#2F7A4F] flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> The COI matches the typed insurance values.
        </p>
      )}

      {/* Side by side. Typed first — it is the carrier's own statement, and the
          column order should not imply the machine reading outranks it. */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-3 bg-gray-50 px-3 py-1.5">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Field</span>
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Typed</span>
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Read from COI</span>
        </div>
        {rows.map((r) => {
          const isFlagged = flagged.has(r.label);
          return (
            <div
              key={r.label}
              className={`grid grid-cols-3 px-3 py-1.5 border-t border-gray-100 ${isFlagged ? "bg-[#F6E3E3]/50" : ""}`}
            >
              <span className="text-[12px] text-gray-700">{r.label}</span>
              <span className="text-[12px] text-[#0A2540] font-medium">{money(r.typed)}</span>
              <span className={`text-[12px] font-medium ${isFlagged ? "text-[#9B2C2C]" : "text-[#0A2540]"}`}>
                {money(r.extracted)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
