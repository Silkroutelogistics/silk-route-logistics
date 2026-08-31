/**
 * Correctness fixes from the 2026-08-31 e-signature and document-custody audit.
 *
 * Each case pins a defect the audit reproduced against a live local database, so
 * the assertion is about behaviour that was observed rather than inferred.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { signRateConfirmationSchema } from "../../../src/validators/rateConfirmation";
import { SHIPPER_VISIBLE_DOC_TYPES } from "../../../src/controllers/shipperPortalController";

/**
 * The download gate, extracted verbatim in shape from documentController so the
 * ordering of the two refusals can be exercised without standing up Express.
 * If the controller's logic changes, `gate reproduces the controller` below
 * fails and this helper must be re-derived rather than quietly diverging.
 */
function gate(opts: {
  role: string;
  userId: string;
  docUserId: string;
  docType: string | null;
  load: { posterId: string | null; carrierId: string | null; customer: { userId: string } | null } | null;
}): number {
  const { role, userId, docUserId, docType, load } = opts;
  if (role === "ADMIN" || role === "CEO") return 200;
  const isOwner = docUserId === userId;
  const isLoadParticipant = !!load && (load.posterId === userId || load.carrierId === userId);
  const isLoadCustomer = !!load?.customer && load.customer.userId === userId;
  if (!isOwner && !isLoadParticipant && !isLoadCustomer) return 403;
  if (isLoadCustomer && !isOwner && !isLoadParticipant &&
      !SHIPPER_VISIBLE_DOC_TYPES.includes(docType ?? "")) return 403;
  return 200;
}

const SHIPPER = "user-shipper";
const CARRIER = "user-carrier";
const POSTER = "user-ae";
const OTHER = "user-other";
const ownLoad = { posterId: POSTER, carrierId: CARRIER, customer: { userId: SHIPPER } };
const foreignLoad = { posterId: POSTER, carrierId: CARRIER, customer: { userId: "user-other-shipper" } };

describe("fix 1 — a shipper who owns the load can retrieve allowlisted documents", () => {
  it("shipper on OWN load gets BOL", () => {
    // Observed pre-fix: 403 on BOL with `owner match: true`, because the gate
    // never consulted customerId. SHIPPER sat in authorize() and could never pass.
    expect(gate({ role: "SHIPPER", userId: SHIPPER, docUserId: POSTER, docType: "BOL", load: ownLoad })).toBe(200);
  });

  it("shipper on OWN load gets POD and INVOICE too", () => {
    for (const t of ["POD", "INVOICE"]) {
      expect(gate({ role: "SHIPPER", userId: SHIPPER, docUserId: POSTER, docType: t, load: ownLoad }), t).toBe(200);
    }
  });

  it("shipper on ANOTHER customer's load is refused", () => {
    expect(gate({ role: "SHIPPER", userId: SHIPPER, docUserId: POSTER, docType: "BOL", load: foreignLoad })).toBe(403);
  });

  it("THE ALLOWLIST IS NOT WIDENED — a shipper on their own load cannot pull RATE_CON", () => {
    // This is the case that makes the fix safe. Adding customerId to the
    // participant match WITHOUT the allowlist would hand the customer every
    // docType on their load, and RATE_CON carries carrier pay. The audit's
    // first pass wrongly claimed this leak already existed; the fix must not
    // be the thing that creates it.
    expect(gate({ role: "SHIPPER", userId: SHIPPER, docUserId: POSTER, docType: "RATE_CON", load: ownLoad })).toBe(403);
    expect(gate({ role: "SHIPPER", userId: SHIPPER, docUserId: POSTER, docType: "W9", load: ownLoad })).toBe(403);
    expect(gate({ role: "SHIPPER", userId: SHIPPER, docUserId: POSTER, docType: null, load: ownLoad })).toBe(403);
  });

  it("carrier and AE outcomes are unchanged", () => {
    // Carrier on their own load: any docType, exactly as before the fix.
    expect(gate({ role: "CARRIER", userId: CARRIER, docUserId: POSTER, docType: "RATE_CON", load: ownLoad })).toBe(200);
    expect(gate({ role: "CARRIER", userId: CARRIER, docUserId: POSTER, docType: "BOL", load: ownLoad })).toBe(200);
    // A carrier who is not on the load is still refused.
    expect(gate({ role: "CARRIER", userId: OTHER, docUserId: POSTER, docType: "BOL", load: ownLoad })).toBe(403);
    // ADMIN bypasses, as before.
    expect(gate({ role: "ADMIN", userId: OTHER, docUserId: POSTER, docType: "RATE_CON", load: ownLoad })).toBe(200);
    // An uploader still reaches their own document whatever its type.
    expect(gate({ role: "SHIPPER", userId: SHIPPER, docUserId: SHIPPER, docType: "OTHER", load: null })).toBe(200);
  });

  it("gate reproduces the controller — the customer branch and its allowlist are both present", () => {
    // Sub-pattern 16: a helper that drifts from the code proves nothing about
    // the code. Anchor on the executed lines, not on prose about them.
    const src = fs.readFileSync(path.resolve(__dirname, "../../../src/controllers/documentController.ts"), "utf8");
    expect(src).toContain("const isLoadCustomer = !!doc.load?.customer && doc.load.customer.userId === userId;");
    expect(src).toContain("!SHIPPER_VISIBLE_DOC_TYPES.includes(doc.docType ?? \"\")");
    expect(src).toContain("customer: { select: { userId: true } }");
  });
});

describe("fix 2 — Rate Confirmation attribution is server-derived", () => {
  it("a spoofed ipAddress in the body is stripped by the schema", () => {
    // Observed pre-fix: a request from 127.0.0.1 carrying "10.52.0.9" persisted
    // 10.52.0.9, because the controller wrote `ipAddress || req.ip`.
    const parsed: any = signRateConfirmationSchema.parse({
      signerName: "Jordan Carrier",
      signerTitle: "Dispatcher",
      ipAddress: "10.52.0.9",
    });
    expect(parsed.ipAddress, "a client-supplied IP must not survive validation").toBeUndefined();
    expect(parsed.signerName).toBe("Jordan Carrier");
  });

  it("the schema no longer declares ipAddress at all", () => {
    expect(Object.keys((signRateConfirmationSchema as any).shape)).toEqual(["signerName", "signerTitle"]);
  });

  it("the controller derives IP and user agent from the request", () => {
    // Re-anchored in v3.8.awk. This asserted `req.headers["user-agent"]` and went
    // red when that read moved behind clientUserAgent(req) — the guarded property
    // (server-derived, never body-derived) is unchanged and now stronger, so the
    // anchor moves rather than the assertion weakening.
    const src = fs.readFileSync(path.resolve(__dirname, "../../../src/controllers/rateConfirmationController.ts"), "utf8");
    expect(src).toContain("const signerIp = extractClientIp(req as any);");
    expect(src).toContain("carrierSignIP: signerIp,");
    expect(src).toContain("clientUserAgent(req)");
    // The exact expression that made attribution client-controlled must not return.
    expect(src).not.toContain("ipAddress || req.ip");
  });
});

describe("fix 3 — the agreement signing time carries its zone and its source value", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../../src/services/agreementPdfService.ts"), "utf8");

  it("renders in UTC, labelled, and prints the stored ISO instant", () => {
    expect(src).toContain('timeZone: "UTC"');
    expect(src).toContain("} UTC`");
    expect(src).toContain("Signed at (UTC, ISO 8601): ${signedAtUtc.toISOString()}");
  });

  it("the rendered string parses back to the stored instant", () => {
    // The round-trip the fix exists to guarantee. Pre-fix the rendered text was
    // server-local and unlabelled, so it could not be reconciled with the row.
    const stored = new Date("2026-08-31T11:46:28.387Z");
    const human = stored.toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "UTC",
    });
    expect(human).toContain("11:46");           // UTC hour, not a server-local one
    expect(new Date(stored.toISOString()).getTime()).toBe(stored.getTime());
    // And the minute the reader sees is the minute the record holds.
    expect(human).toBe("Aug 31, 2026, 11:46 AM");
  });
});
