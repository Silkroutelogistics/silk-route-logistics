/**
 * ARC 32 — CI-resident guards for the email verification gate.
 *
 * The full proof (`scripts/_arc32-verification-proof.ts`) drives the real
 * router against a real database and cannot run in CI. These cover the two
 * invariants whose failure would be silent and total.
 *
 * The FIRST one is the important one, and it guards a trap this codebase has
 * already fallen into once. `validateBody` does `req.body = result.data` and
 * `z.object()` strips unknown keys, so if `verificationReceipt` is ever dropped
 * from `carrierRegisterSchema`, the field never reaches the controller, the
 * gate sees `undefined`, and EVERY legitimate carrier registration is refused.
 * No type error, no crash — just onboarding, closed. That is Sub-pattern 5, and
 * the TONU 422 shipped exactly this way.
 */

import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import { carrierRegisterSchema } from "../../../src/validators/carrier";
import { mintReceipt, verifyReceipt } from "../../../src/services/onboardingDraftService";

/** Minimal body that satisfies every required member of the schema. */
function validBody(extra: Record<string, unknown> = {}) {
  return {
    email: "carrier@example.com",
    password: "Rehearsal!Passw0rd#2026",
    firstName: "Test",
    lastName: "Carrier",
    company: "Test Carrier LLC",
    phone: "2692206760",
    mcNumber: "MC-123456",
    dotNumber: "4526880",
    equipmentTypes: ["Dry Van"],
    operatingRegions: ["Midwest"],
    address: "2317 S 35th St",
    city: "Galesburg",
    state: "MI",
    zip: "49053",
    ...extra,
  };
}

describe("carrierRegisterSchema — verificationReceipt survives validation", () => {
  it("keeps the receipt on the parsed body", () => {
    const parsed = carrierRegisterSchema.parse(validBody({ verificationReceipt: "abc.def" }));
    // If this is ever undefined, the gate refuses every real applicant.
    expect(parsed.verificationReceipt).toBe("abc.def");
  });

  it("still parses without it, so the CONTROLLER owns the refusal message", () => {
    // Making it required at the schema layer would answer with a Zod field
    // error instead of the gate's own copy, which names the remedy.
    const parsed = carrierRegisterSchema.parse(validBody());
    expect(parsed.verificationReceipt).toBeUndefined();
  });

  it("tripwire: the fixture is genuinely valid, so the checks above mean something", () => {
    expect(() => carrierRegisterSchema.parse(validBody())).not.toThrow();
  });
});

describe("receipt — a forged or misaddressed one is refused", () => {
  // These four rejection paths all return before touching the database, which
  // is what makes them testable here at all.
  const EMAIL = "carrier@example.com";

  it("rejects a tampered signature", async () => {
    const good = mintReceipt({ email: EMAIL, verifiedAt: Date.now(), nonce: "n1" });
    const [body] = good.split(".");
    const forged = `${body}.${crypto.randomBytes(32).toString("base64url")}`;
    expect((await verifyReceipt(forged, EMAIL)).ok).toBe(false);
  });

  it("rejects a receipt minted for a DIFFERENT address", async () => {
    const good = mintReceipt({ email: EMAIL, verifiedAt: Date.now(), nonce: "n1" });
    const r = await verifyReceipt(good, "someone-else@example.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("email_mismatch");
  });

  it("rejects one older than its 24h life", async () => {
    const stale = mintReceipt({
      email: EMAIL,
      verifiedAt: Date.now() - 25 * 60 * 60 * 1000,
      nonce: "n1",
    });
    const r = await verifyReceipt(stale, EMAIL);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("rejects absent and malformed tokens", async () => {
    expect((await verifyReceipt(undefined, EMAIL)).ok).toBe(false);
    expect((await verifyReceipt("", EMAIL)).ok).toBe(false);
    expect((await verifyReceipt("no-dot-here", EMAIL)).ok).toBe(false);
    expect((await verifyReceipt("!!!.!!!", EMAIL)).ok).toBe(false);
  });

  it("tripwire: a well-formed receipt gets PAST the signature and address checks", async () => {
    // It fails at the nonce lookup because prisma is mocked and returns no
    // draft — which is the point: reaching that far proves the earlier
    // rejections above were doing real work rather than failing on everything.
    const good = mintReceipt({ email: EMAIL, verifiedAt: Date.now(), nonce: "n1" });
    const r = await verifyReceipt(good, EMAIL);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("nonce_stale");
  });
});
