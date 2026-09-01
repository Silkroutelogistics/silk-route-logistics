/**
 * CARRIER_REVIEWER reaches the carrier queue and nothing else.
 *
 * The role inherits nothing: `authorize()` resolves it entirely against
 * CARRIER_REVIEWER_ALLOW and refuses anything unmatched. So the allow-list IS
 * the role, and a rule added there is a permission grant with no other review.
 *
 * The exclusions below are not a wish-list. Each is a specific thing the audit
 * established this role must not do, and the reasons differ:
 *
 *   terminate an agreement  — hard-blocks the carrier from every tender
 *   SIGN an agreement       — signing CLEARS AGREEMENT_TERMINATED, so granting
 *                             it lets this role un-terminate a carrier it cannot
 *                             terminate. That asymmetry was a live P1 (v3.8.awx)
 *                             and must not come back through a new role
 *   override-block          — scoped or blanket; §14 reserves the judgment call
 *   authority-grant-date    — an INPUT to the <12-month absolute. Excluding the
 *                             block but not its input would be theatre
 *   quickpay-override       — the per-load FEE, a money decision
 *   grace-period / suspend / delete / emergency-approve / test-account flag
 *
 * The path-shape assertions matter as much as the role list. A rule written
 * without a `methods` constraint would hand this role every verb its route
 * family exposes, and DELETE /carriers/:id lives in the same family as the reads
 * it legitimately needs.
 */
import { describe, it, expect } from "vitest";
import {
  CARRIER_REVIEWER,
  CARRIER_REVIEWER_ALLOW,
  matchCarrierReviewerAllow,
} from "../../../src/middleware/auth";

const allowed = (method: string, url: string) => matchCarrierReviewerAllow(method, url) !== null;

describe("CARRIER_REVIEWER allow-list", () => {
  it("is a real, non-trivial list (vacuity tripwire)", () => {
    // A parser or import failure that produced an empty list would make every
    // "must be refused" assertion below pass for the wrong reason.
    expect(CARRIER_REVIEWER).toBe("CARRIER_REVIEWER");
    expect(CARRIER_REVIEWER_ALLOW.length).toBeGreaterThan(10);
    expect(allowed("POST", "/api/carriers/abc123/approve")).toBe(true);
  });

  it("every rule constrains its methods", () => {
    // A path grant with no verb list is the quiet way this role acquires DELETE.
    const unconstrained = CARRIER_REVIEWER_ALLOW.filter((r) => !r.methods || r.methods.length === 0);
    expect(
      unconstrained.map((r) => r.name),
      unconstrained.length ? "Rule(s) with no methods constraint — a bare path grants every verb the route family exposes." : "",
    ).toEqual([]);
  });

  it("grants the reversible queue actions", () => {
    expect(allowed("POST", "/api/carriers/c1/approve")).toBe(true);
    expect(allowed("POST", "/api/carriers/c1/reject")).toBe(true);
    expect(allowed("POST", "/api/carriers/c1/lift-rejection")).toBe(true);
    expect(allowed("POST", "/api/carriers/c1/start-review")).toBe(true);
    expect(allowed("POST", "/api/carriers/c1/full-vet")).toBe(true);
    expect(allowed("POST", "/api/info-requests")).toBe(true);
    expect(allowed("PATCH", "/api/info-requests/i1/cancel")).toBe(true);
    expect(allowed("PATCH", "/api/carriers/c1/documents/d1")).toBe(true);
    expect(allowed("GET", "/api/carriers")).toBe(true);
    expect(allowed("GET", "/api/carriers/c1")).toBe(true);
  });

  it("refuses everything the audit said it must never do", () => {
    const forbidden: [string, string, string][] = [
      ["POST", "/api/carriers/c1/agreements/a1/terminate", "terminate hard-blocks every tender"],
      ["POST", "/api/carriers/c1/agreements/a1/sign", "signing un-terminates a carrier it cannot terminate"],
      ["POST", "/api/carriers/c1/agreements", "creating an agreement is the same authority as signing one"],
      ["POST", "/api/compliance/carrier/c1/override-block", "scoped or blanket override is §14 judgment"],
      ["POST", "/api/carrier/c1/authority-grant-date", "an input to the <12-month absolute"],
      ["POST", "/api/loads/l1/quickpay-override", "per-load fee is a money decision"],
      ["POST", "/api/carriers/c1/quickpay/approve", "Quick Pay enrolment is a money decision"],
      ["POST", "/api/carriers/c1/grace-period", "waives an insurance block"],
      ["POST", "/api/compliance/carrier/c1/suspend", "suspension is carrier-approval authority"],
      ["POST", "/api/carriers/c1/emergency-approve", "bypasses the queue this role exists to work"],
      ["PATCH", "/api/carriers/c1/test-account", "changes what the fences hide"],
      ["DELETE", "/api/carriers/c1", "soft-delete is not queue work"],
      ["PUT", "/api/carriers/c1/restore", "nor is restore"],
      ["PATCH", "/api/carriers/c1", "profile and tier edits are not queue work"],
      ["PUT", "/api/carriers/chameleon-matches/m1/review", "clearing a fraud signal releases a block"],
      ["POST", "/api/carriers/c1/override-mismatch", "waives a geo-mismatch signal"],
      ["GET", "/api/admin/users", "admin console"],
      ["POST", "/api/accounting/payments/p1/mark-paid", "money movement"],
    ];
    const leaked = forbidden.filter(([m, u]) => allowed(m, u)).map(([m, u, why]) => `${m} ${u} — ${why}`);
    expect(
      leaked,
      leaked.length ? `CARRIER_REVIEWER can reach surface(s) it must never reach:\n  ${leaked.join("\n  ")}` : "",
    ).toEqual([]);
  });

  it("is case- and slash-insensitive, like the router", () => {
    // Express matches case-insensitively and forgives trailing slashes, so a
    // matcher that did not normalize could be walked past with /API/... — the
    // same reasoning as matchAccountExecutiveDeny. Here it would FAIL CLOSED
    // (a normalization miss refuses a legitimate request rather than granting
    // an illegitimate one), but a role that mysteriously 403s on a capitalized
    // path is its own bug.
    expect(allowed("POST", "/API/Carriers/c1/Approve")).toBe(true);
    expect(allowed("POST", "/api/carriers/c1/approve/")).toBe(true);
    expect(allowed("POST", "/api/carriers/c1/approve?force=1")).toBe(true);
  });

  it("does not grant a verb the queue does not need on a path it does", () => {
    // /api/carriers/:id is a legitimate GET for this role. It must not become a
    // PATCH (profile edit) or DELETE (soft-delete) by sharing the path.
    expect(allowed("GET", "/api/carriers/c1")).toBe(true);
    expect(allowed("PATCH", "/api/carriers/c1")).toBe(false);
    expect(allowed("DELETE", "/api/carriers/c1")).toBe(false);
  });
});
