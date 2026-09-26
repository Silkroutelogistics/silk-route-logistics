/**
 * The production target gate shared by the D1-D5 write scripts, and the rate
 * card merge behind step 5a (BKN TONU 250).
 */
import { describe, it, expect } from "vitest";
import { targetVerdict } from "../../../scripts/_prodTarget";
import { mergeRate } from "../../../scripts/set-customer-accessorial-rate";

const PROD = "ep-green-frog-ajsgv9me-pooler.c-3.us-east-2.aws.neon.tech";

describe("production target gate", () => {
  it("a production write needs --execute, --target=prod AND PRISMA_TARGET=production", () => {
    expect(targetVerdict(["--execute", "--target=prod"], PROD, "production")).toEqual({ write: true });
    expect(targetVerdict(["--execute", "--target=prod"], PROD, undefined).write).toBe(false);
    expect(targetVerdict(["--execute"], PROD, "production").write).toBe(false);
    expect(targetVerdict(["--target=prod"], PROD, "production").write).toBe(false);
  });

  it("a local host writes on --execute without the production escape hatch", () => {
    expect(targetVerdict(["--execute"], "127.0.0.1:55499", undefined)).toEqual({ write: true });
  });
});

describe("rate card merge", () => {
  it("adds TONU 250 to an empty card", () => {
    expect(mergeRate(null, "TONU", 250)).toEqual({ card: { TONU: 250 } });
  });

  it("keeps every other key and replaces only the one given", () => {
    expect(mergeRate({ LUMPER: 75, TONU: 200 }, "TONU", 250)).toEqual({ card: { LUMPER: 75, TONU: 250 } });
  });

  it("refuses a type that is not an accessorial, and a negative or non-numeric rate", () => {
    expect(mergeRate(null, "Detention", 50).refuse).toBeTruthy();
    expect(mergeRate(null, "TONU", -1).refuse).toBeTruthy();
    expect(mergeRate(null, "TONU", NaN).refuse).toBeTruthy();
  });
});
