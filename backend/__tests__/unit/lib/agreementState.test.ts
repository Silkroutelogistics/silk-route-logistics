/**
 * lib/agreementState — the ONE predicate for "does this carrier hold an
 * executed Broker-Carrier Agreement" (v3.8.beh, C1).
 *
 * Three surfaces decide on it: the tender gate, the Compass factor, and the
 * rate confirmation signature. These cases pin the rule they share, so a
 * change to it is a change here first.
 */
import { describe, it, expect } from "vitest";
import { agreementStateFrom, BCA_TEMPLATE_NAME } from "../../../src/lib/agreementState";

const d = (iso: string) => new Date(iso);
const row = (o: Partial<{ status: string; templateName: string; signedAt: Date | null; terminatedAt: Date | null; expiresAt: Date | null; version: string }>) => ({
  status: "SIGNED",
  templateName: BCA_TEMPLATE_NAME,
  signedAt: null,
  terminatedAt: null,
  terminationReason: null,
  expiresAt: null,
  ...o,
});

describe("agreementStateFrom", () => {
  it("no rows → MISSING", () => {
    expect(agreementStateFrom([])).toEqual({ state: "MISSING", signed: null, terminated: null });
  });

  it("ACKNOWLEDGED (registration click-wrap) is MISSING, not SIGNED", () => {
    // The AgreementStatus enum comment: deliberately not SIGNED. This is the
    // exact shape PEACE TRANSPORT and every other F11 registrant holds today.
    const v = agreementStateFrom([row({ status: "ACKNOWLEDGED", signedAt: d("2026-09-18T16:00:43Z") })]);
    expect(v.state).toBe("MISSING");
    expect(v.signed).toBeNull();
  });

  it("a SIGNED quick-pay row does not satisfy the BCA question", () => {
    // v3.8.aqi — the Quick Pay supplement writes its own SIGNED row.
    const v = agreementStateFrom([row({ templateName: "quick-pay", signedAt: d("2026-09-01T00:00:00Z") })]);
    expect(v.state).toBe("MISSING");
  });

  it("any SIGNED broker-carrier version counts — D1, including the archived v1 body", () => {
    const v = agreementStateFrom([row({ version: "2026-06-27-v1", signedAt: d("2026-07-01T00:00:00Z") })]);
    expect(v.state).toBe("SIGNED");
    expect(v.signed?.version).toBe("2026-06-27-v1");
  });

  it("SIGNED wins over TERMINATED regardless of row order (re-signed after termination)", () => {
    const terminated = row({ status: "TERMINATED", signedAt: d("2026-05-01T00:00:00Z"), terminatedAt: d("2026-06-01T00:00:00Z") });
    const signed = row({ signedAt: d("2026-07-01T00:00:00Z") });
    for (const rows of [[terminated, signed], [signed, terminated]]) {
      const v = agreementStateFrom(rows);
      expect(v.state).toBe("SIGNED");
      expect(v.signed).toBe(signed);
      expect(v.terminated).toBeNull();
    }
  });

  it("TERMINATED only when no SIGNED row exists, and picks the newest termination", () => {
    const older = row({ status: "TERMINATED", terminatedAt: d("2026-05-01T00:00:00Z") });
    const newer = row({ status: "TERMINATED", terminatedAt: d("2026-06-01T00:00:00Z") });
    const v = agreementStateFrom([older, newer]);
    expect(v.state).toBe("TERMINATED");
    expect(v.terminated).toBe(newer);
    expect(v.signed).toBeNull();
  });

  it("picks the newest SIGNED row when several exist", () => {
    const a = row({ signedAt: d("2026-06-27T00:00:00Z"), version: "2026-06-27-v1" });
    const b = row({ signedAt: d("2026-09-03T00:00:00Z"), version: "2026-09-03-F11" });
    expect(agreementStateFrom([a, b]).signed).toBe(b);
    expect(agreementStateFrom([b, a]).signed).toBe(b);
  });

  it("DRAFT / SENT / EXPIRED rows are neither signed nor terminated", () => {
    const v = agreementStateFrom([row({ status: "DRAFT" }), row({ status: "SENT" }), row({ status: "EXPIRED" })]);
    expect(v.state).toBe("MISSING");
  });
});
