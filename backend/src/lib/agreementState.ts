/**
 * THE ONE ANSWER TO "DOES THIS CARRIER HAVE AN EXECUTED BROKER-CARRIER
 * AGREEMENT" — v3.8.beh.
 *
 * Three surfaces asked that question and each carried its own where-clause:
 * the tender gate (complianceMonitorService), the Compass "Carrier-Broker
 * Agreement" factor (carrierVettingService), and — from Commit 2 — the rate
 * confirmation signature (rcSign). Three copies of one filter is three places
 * for the answer to drift, and the Quick Pay row already fooled one of them
 * once (v3.8.aqi: a "quick-pay" SIGNED row read as the BCA on the vetting
 * report). This file is the filter, stated once.
 *
 * WHAT COUNTS AS EXECUTED — ruled 2026-09-21 (§14 D1): a SIGNED row of ANY
 * version, including the archived 2026-06-27-v1 body. There is no in-portal
 * re-sign surface yet (§13.3 Item 199 Phase 2), so requiring the current
 * version would lock out the two carriers who signed v1 with nothing they
 * could do about it. Version drift is a separate question, answered by
 * lib/agreementVersions.ts; this file answers only whether a contract exists.
 *
 * WHAT DOES NOT COUNT: `ACKNOWLEDGED`. That is the registration click-wrap
 * assent (v3.8.awo) — the applicant accepted the terms without the typed name
 * and the separate ESIGN consent that the in-portal step captures. The enum
 * comment on `AgreementStatus` says it is deliberately not SIGNED; this helper
 * is where that sentence becomes code. A carrier with only an ACKNOWLEDGED
 * row is MISSING, not SIGNED, and the AE surfaces say so.
 *
 * PRECEDENCE: a SIGNED row wins over a TERMINATED one. A carrier who signed,
 * was terminated, and signed again has a newer SIGNED row, and that is the
 * contract in force. TERMINATED is reported only when NO SIGNED row exists —
 * same block as MISSING at the gate, but an honest reason: it sends an AE to
 * ask for a re-signature rather than chase a carrier for a signature they
 * already gave and someone revoked.
 *
 * TWO ENTRY POINTS, ONE RULE. `agreementStateFrom(rows)` is pure and is what
 * every caller ultimately runs; `getAgreementState(carrierId, db)` fetches the
 * rows and hands them to it. The batched tender gate already holds the rows
 * for a hundred carriers at once and must not re-query per carrier
 * (complianceCheckMany, 53 ms → 48 ms for 100), so it calls the pure half.
 * rcSign calls the fetching half INSIDE the transaction that writes the
 * signature, passing the transaction client, so the state it decides on is
 * the state that commits alongside the signature.
 *
 * `expiresAt` is passed through rather than folded into the state. Every
 * writer sets it null (evergreen agreements) and the gate's expiry branch has
 * never fired; folding it in would invent a fourth state nothing produces.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

/** The only template that satisfies the executed-BCA question. Quick Pay is
 *  a supplement with its own SIGNED row and must never satisfy it. */
export const BCA_TEMPLATE_NAME = "broker-carrier" as const;

export type AgreementState = "SIGNED" | "TERMINATED" | "MISSING";

/** The columns the rule reads. Callers holding whole rows pass them as-is. */
export interface AgreementStateRow {
  status: string;
  templateName: string;
  version?: string;
  signedAt: Date | null;
  terminatedAt: Date | null;
  terminationReason?: string | null;
  expiresAt: Date | null;
}

export interface AgreementVerdict<R extends AgreementStateRow = AgreementStateRow> {
  state: AgreementState;
  /** Newest SIGNED broker-carrier row. Set iff state === "SIGNED". */
  signed: R | null;
  /** Newest TERMINATED broker-carrier row. Set iff state === "TERMINATED". */
  terminated: R | null;
}

const ts = (d: Date | null | undefined) => (d ? d.getTime() : 0);

/**
 * Pure: decide the state from rows already in hand. Rows of other templates
 * are ignored here rather than trusted to have been filtered upstream, so a
 * caller that fetched every agreement for a carrier gets the same answer as
 * one that fetched only the BCA rows.
 */
export function agreementStateFrom<R extends AgreementStateRow>(rows: readonly R[]): AgreementVerdict<R> {
  const bca = rows.filter((r) => r.templateName === BCA_TEMPLATE_NAME);

  const signed = bca
    .filter((r) => r.status === "SIGNED")
    .sort((a, b) => ts(b.signedAt) - ts(a.signedAt))[0] ?? null;
  if (signed) return { state: "SIGNED", signed, terminated: null };

  const terminated = bca
    .filter((r) => r.status === "TERMINATED")
    .sort((a, b) => ts(b.terminatedAt) - ts(a.terminatedAt))[0] ?? null;
  if (terminated) return { state: "TERMINATED", signed: null, terminated };

  return { state: "MISSING", signed: null, terminated: null };
}

export type AgreementReader = Prisma.TransactionClient | typeof prisma;

/**
 * Fetching entry point. `db` defaults to the shared client; pass the
 * transaction client when the answer must be decided inside a transaction.
 * `carrierId` is a CarrierProfile.id — the FK on carrier_agreements — never a
 * User.id (§13.3 Items 57, 222.4).
 */
export async function getAgreementState(
  carrierId: string,
  db: AgreementReader = prisma,
): Promise<AgreementVerdict> {
  const rows = await db.carrierAgreement.findMany({
    where: { carrierId, templateName: BCA_TEMPLATE_NAME },
    select: {
      status: true,
      templateName: true,
      version: true,
      signedAt: true,
      terminatedAt: true,
      terminationReason: true,
      expiresAt: true,
    },
  });
  return agreementStateFrom(rows);
}
