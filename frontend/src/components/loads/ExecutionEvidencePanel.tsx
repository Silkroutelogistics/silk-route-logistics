"use client";

/**
 * C5 — what SRL can prove about this load, in one read-only place.
 *
 * AE-ONLY BY LOCATION AND BY ROUTE. It lives in the AE console, and every field
 * it renders comes from an endpoint whose authorize list excludes CARRIER. The
 * carrier portal shows a carrier their own document; it does not show them the
 * IP SRL recorded, the hash of the bytes, or anything about the stored
 * artifact — that is SRL's evidence ABOUT them, not their copy of it.
 *
 * Read-only on purpose. Evidence a surface can edit is not evidence.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileCheck2, Download, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/download";

interface RcEvidence {
  id: string;
  rateConNumber: string | null;
  status: string;
  signed: boolean;
  signedAt: string | null;
  signerName: string | null;
  signerIp: string | null;
  contentHash: string | null;
  counterSignedByName: string | null;
  counterSignedByTitle: string | null;
  counterSignedAt: string | null;
}

export interface ExecutionEvidencePanelProps {
  loadId: string;
  /** From the load. Null until some act records one — never inferred from status. */
  carrierAcceptedAt?: string | null;
  carrierAcceptedVia?: string | null;
  carrierAcceptedByUserId?: string | null;
}

const VIA_LABEL: Record<string, string> = {
  RC_SIGNATURE: "Signed the rate confirmation",
  TENDER_ACCEPT: "Accepted the tender",
  BID_AWARD_ACCEPT: "Bid awarded",
  STATUS_CONFIRMED: "Confirmed the load",
  STATUS_BOOKED: "Booked the load",
  PICKUP_ARRIVAL: "Arrived at pickup",
};

function when(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** A label/value row. An absent value reads as an em dash, never as blank. */
function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-[11px] text-slate-500 shrink-0">{label}</span>
      <span className={"text-[11px] text-[#0A2540] text-right break-all " + (mono ? "font-mono" : "")}>
        {value}
      </span>
    </div>
  );
}

export default function ExecutionEvidencePanel({
  loadId,
  carrierAcceptedAt,
  carrierAcceptedVia,
  carrierAcceptedByUserId,
}: ExecutionEvidencePanelProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rcs, isLoading } = useQuery({
    queryKey: ["rc-evidence", loadId],
    queryFn: async () =>
      (await api.get("/rate-confirmations/load/" + loadId)).data as RcEvidence[],
    enabled: !!loadId,
  });

  // The signed one carries the evidence. Falling back to the newest row keeps
  // the panel honest about an unsigned RC rather than hiding it.
  const rc = rcs?.find((r) => r.signed) ?? rcs?.[0] ?? null;
  const accepted = !!carrierAcceptedAt;

  if (isLoading) {
    return (
      <section>
        <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
          Execution Evidence
        </h3>
        <div className="p-3 bg-gray-100 rounded-lg border border-gray-200 text-[11px] text-slate-500">
          Loading…
        </div>
      </section>
    );
  }

  // Nothing to show only when there is neither an acceptance nor any RC at all.
  if (!rc && !accepted) return null;

  async function getCertificate() {
    if (!rc) return;
    setError(null);
    setDownloading(true);
    try {
      // Through the api client, never a bare href: the endpoint answers JSON
      // errors an AE is meant to act on, and a raw link renders those as raw
      // JSON in a tab (§13.3 Item 251).
      await downloadFromApi(
        "/rate-confirmations/" + rc.id + "/certificate",
        (rc.rateConNumber ?? rc.id) + "-signature-certificate.pdf",
      );
    } catch {
      setError("Could not open the certificate.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section data-testid="execution-evidence">
      <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
        <FileCheck2 className="w-3.5 h-3.5" /> Execution Evidence
      </h3>
      <div className="p-3 bg-[#FBF7F0] rounded-lg border border-[#EFE6D3] divide-y divide-[#EFE6D3]">
        {/* The ACT, kept separate from the paperwork. */}
        <div className="pb-1">
          <p className="text-[11px] uppercase tracking-wider text-[#BA7517] font-semibold mb-1">
            Carrier acceptance
          </p>
          {accepted ? (
            <>
              <Row label="Accepted" value={when(carrierAcceptedAt)} />
              <Row
                label="How"
                value={VIA_LABEL[carrierAcceptedVia ?? ""] ?? carrierAcceptedVia ?? "—"}
              />
              <Row
                label="By user"
                value={carrierAcceptedByUserId ?? "— (signed by link, no session)"}
                mono
              />
            </>
          ) : (
            <p className="text-[11px] text-slate-500" data-testid="evidence-no-acceptance">
              No acceptance recorded. A load can reach a dispatched status without one.
            </p>
          )}
        </div>

        {/* The signature. */}
        <div className="pt-2">
          <p className="text-[11px] uppercase tracking-wider text-[#BA7517] font-semibold mb-1">
            Rate confirmation{rc?.rateConNumber ? " · " + rc.rateConNumber : ""}
          </p>
          {rc?.signed ? (
            <>
              <Row label="Signed by" value={rc.signerName ?? "—"} />
              <Row label="Signed at" value={when(rc.signedAt)} />
              <Row label="From IP" value={rc.signerIp ?? "—"} mono />
              <Row label="Content hash" value={rc.contentHash ?? "—"} mono />
            </>
          ) : (
            <p className="text-[11px] text-slate-500" data-testid="evidence-not-signed">
              Not signed.
            </p>
          )}
        </div>

        {/* SRL's countersignature. NULL on anything issued before it existed,
            which renders as "Not countersigned" rather than a manufactured name. */}
        <div className="pt-2">
          <p className="text-[11px] uppercase tracking-wider text-[#BA7517] font-semibold mb-1">
            SRL countersignature
          </p>
          {rc?.counterSignedByName ? (
            <>
              <Row
                label="Countersigned by"
                value={rc.counterSignedByName + ", " + (rc.counterSignedByTitle ?? "—")}
              />
              <Row label="Countersigned at" value={when(rc.counterSignedAt)} />
            </>
          ) : (
            <p className="text-[11px] text-slate-500" data-testid="evidence-no-countersign">
              Not countersigned.
            </p>
          )}
        </div>

        {rc?.signed && (
          <div className="pt-2">
            <button
              type="button"
              onClick={getCertificate}
              disabled={downloading}
              className="flex items-center gap-1.5 text-[#BA7517] font-semibold text-[11px] hover:underline disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {downloading ? "Opening…" : "Certificate of Electronic Signature"}
            </button>
            {error && <p className="mt-1 text-[11px] text-[#9B2C2C]">{error}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
