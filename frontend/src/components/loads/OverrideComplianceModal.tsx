"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Machine-readable block-code entry surfaced alongside blocked_reasons by
 * the v3.8.ahq backend (Item 182 sprint 4). Mirror of the BlockedCode
 * interface in backend/src/services/complianceMonitorService.ts — kept
 * locally so the modal isn't coupled to a shared types import.
 *
 *   - AUTHORITY_TOO_YOUNG + overridable=true  → 12-18 month band, scoped
 *     override via POST /override-block with checkCode = "AUTHORITY_TOO_YOUNG"
 *     is the authorized path.
 *   - AUTHORITY_TOO_YOUNG + overridable=false → <12 month hard floor;
 *     submit is disabled with a tooltip explaining the floor.
 *   - AUTHORITY_UNVERIFIED + overridable=false → null grant ≥24h after
 *     approval; not overridable through the authority-age path
 *     (contact compliance).
 */
export interface BlockedCode {
  code:
    | "AUTHORITY_TOO_YOUNG"
    | "AUTHORITY_UNVERIFIED"
    | "AGREEMENT_TERMINATED"
    | "CHAMELEON_UNREVIEWED"
    // Arc 27 — federal absolutes. Never overridable, scoped or blanket. §14.
    | "OFAC_MATCH"
    | "FMCSA_REVOKED"
    | "OUT_OF_SERVICE"
    // v3.8.axl — sixth absolute. Cover is a fact held by the insurer, and a
    // broker putting freight on an uninsured truck is the one uncovered loss
    // nobody can claw back. The grace period stays a WARNING, because that is
    // SRL deliberately granting time, not an AE waving a lapse through.
    | "INSURANCE_EXPIRED";
  ageMonths?: number;
  overridable: boolean;
}

/**
 * Sprint 40 (Item 58) — AE compliance override modal. Sprint v3.8.ahq
 * extended (commit 2 of the ahq arc): the modal now drives its
 * authority-age control off the structured blocked_codes signal from
 * complianceCheck() rather than parsing the AUTHORITY_TOO_YOUNG: coded
 * string in blocked_reasons. When an overridable=true authority-age
 * entry is present, submit posts checkCode = "AUTHORITY_TOO_YOUNG"
 * (scoped override). When overridable=false (hard floor or
 * unverified), submit is disabled with an explanatory tooltip — the
 * backend would 409 anyway; the UI prevents the round-trip.
 *
 * Calls POST /api/compliance/carrier/:carrierId/override-block. Backend
 * gates to ADMIN/CEO (Sprint 40 widened from ADMIN-only per Pattern 6
 * cross-sprint precedent audit — symmetric with Sprint 39 acceptOnBehalf).
 *
 * Reason required (min 10 chars, server enforces). Quota: max 15
 * overrides per carrier per 30 days (Sprint 64 raised from 2); server
 * returns 429 on exceed. 24h expiry on the resulting override record.
 * Audit captured to auditTrail under action "COMPLIANCE_OVERRIDE",
 * with checkCode persisted on both the row and the audit changedFields.
 *
 * On success the parent re-runs the compliance check; the existing amber
 * warning banner ("Active compliance override in effect" for blanket OR
 * "AUTHORITY_AGE_OVERRIDE: ..." warning for scoped) renders the
 * post-override state without new UI plumbing.
 */
export function OverrideComplianceModal({
  carrierId,
  carrierName,
  blockedReasons,
  blockedCodes,
  onClose,
  onSuccess,
}: {
  carrierId: string;
  carrierName: string;
  blockedReasons: string[];
  blockedCodes?: BlockedCode[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Drive the authority-age behavior off blocked_codes — never parse
  // the blocked_reasons strings. Three cases that affect submit:
  //   - overridableAuthority: 12-18 mo, scoped override is the path.
  //   - hardFloorAuthority:   <12 mo, submit blocked with tooltip.
  //   - unverifiedAuthority:  null grant ≥24h, submit blocked with
  //                           "contact compliance" message.
  const codes = blockedCodes ?? [];
  const overridableAuthority = codes.find(
    (c) => c.code === "AUTHORITY_TOO_YOUNG" && c.overridable,
  );
  const hardFloorAuthority = codes.find(
    (c) => c.code === "AUTHORITY_TOO_YOUNG" && !c.overridable,
  );
  const unverifiedAuthority = codes.find(
    (c) => c.code === "AUTHORITY_UNVERIFIED",
  );
  // v3.8.atf — a terminated agreement is a hard block, and the remedy is a
  // signature rather than a waiver. Overriding it would put a load on a carrier
  // with no agreement governing it, which is the one thing an override must not
  // be able to do. The backend already returns overridable: false; this makes
  // the UI say why instead of offering a button that would be refused.
  const terminatedAgreement = codes.find(
    (c) => c.code === "AGREEMENT_TERMINATED",
  );
  // v3.8.auh — chameleon HIGH is override-eligible, but the review is the
  // remedy. The modal says so in that order, for the same reason the blocked
  // reason does: an override that reads as the primary path teaches AEs to
  // waive a fraud signal instead of triaging it.
  const chameleonUnreviewed = codes.find(
    (c) => c.code === "CHAMELEON_UNREVIEWED" && c.overridable,
  );

  // Arc 27 — the three federal absolutes. An override releases a JUDGMENT CALL,
  // never a FACT: sanctions, a revoked authority and an Out-of-Service order are
  // facts held by another party, and SRL waiving its own record of one does not
  // change it — it only removes the evidence SRL knew. The backend returns
  // overridable: false and the endpoint 409s; this is the third leg of that
  // same mirror, so the AE is told rather than offered a button that is refused.
  const federalAbsolute = codes.find(
    (c) => c.code === "OFAC_MATCH" || c.code === "FMCSA_REVOKED" || c.code === "OUT_OF_SERVICE",
  );

  const isAuthorityOverride = !!overridableAuthority;
  const isHardBlocked =
    !!hardFloorAuthority || !!unverifiedAuthority || !!terminatedAgreement || !!federalAbsolute;
  const disabledTooltip = hardFloorAuthority
    ? "Authority under 12 months — hard floor, cannot be overridden"
    : unverifiedAuthority
      ? "FMCSA authority unverified — contact compliance"
      : terminatedAgreement
        ? "Agreement terminated — the carrier must re-sign. This is not something to override."
        : federalAbsolute?.code === "OFAC_MATCH"
          ? "OFAC/SDN sanctions match — the screening review must clear it. Not overridable."
          : federalAbsolute?.code === "FMCSA_REVOKED"
            ? "FMCSA authority revoked — the carrier must restore it with FMCSA. Not overridable."
            : federalAbsolute?.code === "OUT_OF_SERVICE"
              ? "FMCSA Out-of-Service order — only FMCSA can lift it. Not overridable."
              : undefined;

  const { data: status } = useQuery<{
    recentOverrideCount: number;
    max: number;
    activeOverride: { id: string; expiresAt: string } | null;
  }>({
    queryKey: ["override-status", carrierId],
    queryFn: async () => {
      const { data } = await api.get(`/compliance/carrier/${carrierId}/override-status`);
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      // v3.8.auh — two scoped codes now. Authority takes precedence when both
      // are present, because the authority block is the narrower window; the
      // chameleon override would not release the authority block anyway, so
      // offering it first would produce an override that changes nothing.
      // v3.8.ahq — send checkCode only when an overridable authority-age
      // block is the surfaced state. Omitting checkCode preserves the
      // Sprint 40 blanket-override semantic for all other use cases
      // (mixed blocks, OFAC, insurance, FMCSA status revocation, etc.).
      const body: { reason: string; checkCode?: string } = { reason };
      if (isAuthorityOverride) {
        body.checkCode = "AUTHORITY_TOO_YOUNG";
      } else if (chameleonUnreviewed) {
        body.checkCode = "CHAMELEON_UNREVIEWED";
      }
      const { data } = await api.post(
        `/compliance/carrier/${carrierId}/override-block`,
        body,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["override-status", carrierId] });
      onSuccess();
      onClose();
    },
    onError: (err: { response?: { data?: { error?: string; code?: string }; status?: number }; message?: string }) => {
      const data = err.response?.data;
      if (err.response?.status === 429) {
        // Server-returned error text includes the canonical quota number;
        // fallback is generic since the cap is owned by the backend
        // (Sprint 64 raised 2 → 15; future tuning lives in backend
        // controllers/complianceController.ts MAX_OVERRIDES_PER_30_DAYS).
        setError(data?.error || "Override quota exhausted. Contact VP of Operations.");
      } else if (err.response?.status === 409 && data?.code) {
        // v3.8.ahq — three distinct 409 codes from the scoped
        // authority-age path. Surface the server's specific message
        // since each implies a different operational follow-up
        // (FMCSA scan, hard floor explanation, no-op).
        const codeLabel =
          data.code === "NO_AUTHORITY_DATE"
            ? "No FMCSA grant date on file"
            : data.code === "HARD_FLOOR_NOT_OVERRIDABLE"
              ? "Hard floor (under 12 months)"
              : data.code === "OVERRIDE_NOT_NEEDED"
                ? "Override not needed"
                : data.code;
        setError(`${codeLabel} — ${data.error || "Cannot mint authority-age override"}`);
      } else {
        setError(data?.error || err.message || "Failed to apply override");
      }
    },
  });

  // Reset error if user edits reason after a failed attempt
  useEffect(() => { if (error) setError(null); }, [reason]); // eslint-disable-line react-hooks/exhaustive-deps

  const remaining = status ? Math.max(0, status.max - status.recentOverrideCount) : null;
  const quotaExhausted = remaining === 0;
  // v3.8.ahq — submit is disabled when an authority-age hard floor or
  // unverified state is present, even if the AE has filled in a reason.
  // The backend would 409 anyway; preventing the round-trip surfaces
  // the "why" via tooltip instead of an error toast.
  const canSubmit =
    reason.trim().length >= 10 &&
    confirmed &&
    !mutation.isPending &&
    !quotaExhausted &&
    !isHardBlocked;

  return (
    // Sprint 65 (v3.8.afm) hotfix — z-[70] so the override modal stacks
    // above the Carrier Engagement Drawer (bumped to z-[60] same sprint)
    // when both are mounted (drawer triggers modal via "Override
    // compliance block" button).
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-[#0A2540] mb-1">Override Compliance Block</h2>
        <p className="text-sm text-slate-600 mb-3">Carrier: <span className="font-medium text-[#0A2540]">{carrierName}</span></p>

        {status && (
          <div className={`mb-3 p-2 rounded text-xs ${quotaExhausted ? "bg-red-50 text-red-700 border-l-4 border-red-500" : "bg-amber-50 text-amber-800"}`}>
            {quotaExhausted
              ? `Quota exhausted: ${status.recentOverrideCount} of ${status.max} overrides used in last 30 days. Contact VP of Operations.`
              : `${status.recentOverrideCount} of ${status.max} overrides used this month for this carrier`}
          </div>
        )}

        {blockedReasons.length > 0 && (
          <div className="mb-3 p-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded">
            <p className="font-medium mb-1">Compliance block reasons:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {blockedReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}

        {/* v3.8.ahq — authority-age status panel. Renders only when an
            AUTHORITY_TOO_YOUNG or AUTHORITY_UNVERIFIED blocked_codes
            entry is present. Drives off the structured signal, never
            from blocked_reasons string parsing. */}
        {(overridableAuthority || hardFloorAuthority || unverifiedAuthority) && (
          <div
            className={`mb-3 p-2 border-l-4 text-xs rounded ${
              overridableAuthority
                ? "bg-amber-50 border-amber-500 text-amber-800"
                : "bg-slate-50 border-slate-400 text-slate-600"
            }`}
            title={disabledTooltip}
          >
            <p className="font-medium mb-1">Authority-age status</p>
            {overridableAuthority && (
              <p>
                Carrier authority is{" "}
                <span className="font-semibold">{overridableAuthority.ageMonths} months</span>{" "}
                old (12-18 month override window). Applying this override mints a scoped
                <code className="px-1 mx-0.5 bg-amber-100 rounded">AUTHORITY_TOO_YOUNG</code>
                waiver. Other compliance checks remain in effect.
              </p>
            )}
            {hardFloorAuthority && (
              <p>
                Carrier authority is{" "}
                <span className="font-semibold">{hardFloorAuthority.ageMonths} months</span>{" "}
                old — under the 12-month hard floor. No override may be applied.
              </p>
            )}
            {unverifiedAuthority && (
              <p>
                FMCSA authority could not be verified — contact compliance.
                No authority-age override available.
              </p>
            )}
          </div>
        )}

        {/* v3.8.auh — the review comes first here, deliberately. Clearing the
            matches is the fix; the override only buys time, and an AE who reads
            it as the primary path learns to waive a fraud signal rather than
            look at it. */}
        {/* Arc 27 — a tooltip on a disabled button is discoverable only by
            hovering it. A federal absolute is the case where the AE most needs
            to know that no amount of authority on their part changes the
            answer, and what would. */}
        {federalAbsolute && (
          <div className="mb-3 p-3 border-l-4 rounded bg-[#F6E3E3] border-[#9B2C2C] text-sm">
            <p className="font-semibold text-[#9B2C2C]">
              {federalAbsolute.code === "OFAC_MATCH"
                ? "Sanctions match — not overridable"
                : federalAbsolute.code === "FMCSA_REVOKED"
                  ? "Operating authority revoked — not overridable"
                  : "Out-of-Service order — not overridable"}
            </p>
            <p className="mt-1 text-[#3A4A5F]">
              {federalAbsolute.code === "OFAC_MATCH"
                ? "This is a legal prohibition on transacting, not a risk to weigh. The screening review has to clear the match."
                : federalAbsolute.code === "FMCSA_REVOKED"
                  ? "The carrier has no operating authority. Restoring it is between the carrier and FMCSA."
                  : "FMCSA has prohibited this carrier from operating. Only FMCSA can lift the order."}
            </p>
            <p className="mt-1 text-[#6B7685]">
              An override cannot change a fact held by another party — it would only remove SRL&apos;s
              record of knowing it.
            </p>
          </div>
        )}

        {chameleonUnreviewed && (
          <div className="mb-3 p-2 border-l-4 text-xs rounded bg-red-50 border-red-500 text-red-800">
            <p className="font-medium mb-1">Identity overlap — unreviewed</p>
            <p>
              This carrier&apos;s fingerprint overlaps another carrier&apos;s.{" "}
              <span className="font-semibold">
                The fix is to review the matches on the carrier&apos;s Security Signals card
              </span>{" "}
              — clearing them releases this block permanently.
            </p>
            <p className="mt-1">
              If the load cannot wait for that triage, this override mints a scoped
              <code className="px-1 mx-0.5 bg-red-100 rounded">CHAMELEON_UNREVIEWED</code>
              waiver that lasts 24 hours. The block returns when it expires, because
              nothing about the carrier will have changed.
            </p>
          </div>
        )}

        <label className="block text-xs font-medium text-slate-700 mb-1">
          Reason <span className="text-red-600">*</span>
          <span className="text-slate-500 font-normal"> (min 10 chars, audit-logged)</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder={
            isAuthorityOverride
              ? "Reason for waiving the 18-month minimum, e.g. known carrier or prior business history"
              : "Why is this override operationally necessary?"
          }
          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-[#0A2540] placeholder:text-slate-400 focus:outline-none focus:border-[#BA7517]"
        />

        {/* Arc 26 — a general override no longer waives everything. It runs the
            full check sequence and releases only the waivable blocks; the
            authority under-12-month floor and a terminated agreement always
            apply. This is stated here because the old behaviour was "waive the
            lot", and an AE who learned that behaviour will otherwise assume it
            still holds.

            Also gated on !isHardBlocked: when a floor is standing, submit is
            disabled and no override can be granted from here at all, so
            describing what one would do is describing an action the UI is
            refusing. The floor's own panel above explains that case. */}
        {!isAuthorityOverride && !chameleonUnreviewed && !isHardBlocked && (
          <div className="mb-3 p-2 border-l-4 text-xs rounded bg-slate-50 border-slate-400 text-slate-700">
            <p className="font-medium mb-1">What a general override does</p>
            <p>
              Releases every <span className="font-semibold">waivable</span> block on this
              carrier for 24 hours. The confirmation will list exactly which ones.
            </p>
            <p className="mt-1">
              It does <span className="font-semibold">not</span> release the authority
              under-12-month floor or a terminated agreement. Those apply regardless of any
              override, and the carrier stays blocked by them.
            </p>
          </div>
        )}

        <label className="flex items-start gap-2 mt-4 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm text-slate-700">
            I confirm this override is operationally necessary and will expire in 24 hours
          </span>
        </label>

        {error && (
          <div className="mt-3 p-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm rounded">
            <span className="font-medium">Error:</span> {error}
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={mutation.isPending}
            className="flex-1 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => { setError(null); mutation.mutate(); }}
            disabled={!canSubmit}
            title={isHardBlocked ? disabledTooltip : undefined}
            className="flex-1 px-4 py-2 text-sm bg-[#BA7517] text-white rounded-lg hover:bg-[#854F0B] disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="apply-override-btn"
          >
            {mutation.isPending
              ? "Applying..."
              : isAuthorityOverride
                ? "Apply Authority-Age Override"
                : "Apply Override"}
          </button>
        </div>
      </div>
    </div>
  );
}
