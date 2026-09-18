import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  CANCELLATION_REASONS,
  REASON_FAULT_PARTY,
  TONU_SIDE_TO_FAULT_PARTY,
  MIN_CANCELLATION_NOTE_LENGTH,
  assessCancellationInput,
  carrierAtFault,
  faultPartyFor,
  requiresNote,
} from "../../../src/lib/cancellationPolicy";
import { TONU_FAULT_SIDES } from "../../../src/lib/tonuPolicy";

/** The enum as the schema declares it — the policy must cover exactly this set. */
function schemaEnum(name: string): string[] {
  const schema = fs.readFileSync(path.join(__dirname, "../../../prisma/schema.prisma"), "utf8");
  const m = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\}`));
  if (!m) throw new Error(`enum ${name} not in schema.prisma`);
  return m[1]
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter((l) => /^[A-Z_]+$/.test(l));
}

describe("cancellationPolicy — the single reason→fault mapping", () => {
  it("covers every CancellationReason the schema declares, and nothing else (vacuity tripwire)", () => {
    const fromSchema = schemaEnum("CancellationReason").sort();
    expect(fromSchema.length, "tripwire: the schema enum must be non-empty").toBeGreaterThan(0);
    expect([...CANCELLATION_REASONS].sort()).toEqual(fromSchema);
    expect(Object.keys(REASON_FAULT_PARTY).sort()).toEqual(fromSchema);
  });

  it("every fault party it emits is a FaultParty the schema declares", () => {
    const parties = new Set(schemaEnum("FaultParty"));
    for (const p of Object.values(REASON_FAULT_PARTY)) expect(parties.has(p), p).toBe(true);
  });

  it("a shipper reason never blames the carrier; a carrier reason always does", () => {
    for (const r of CANCELLATION_REASONS) {
      if (r.startsWith("SHIPPER_")) expect(carrierAtFault(faultPartyFor(r)), r).toBe(false);
      if (r.startsWith("CARRIER_")) expect(carrierAtFault(faultPartyFor(r)), r).toBe(true);
    }
    expect(faultPartyFor("SHIPPER_FREIGHT_NOT_READY")).toBe("SHIPPER");
    expect(faultPartyFor("DUPLICATE_ENTRY")).toBe("NONE");
    expect(faultPartyFor("OTHER")).toBe("NONE");
  });

  it("OTHER is the only reason that requires a note", () => {
    expect(CANCELLATION_REASONS.filter(requiresNote)).toEqual(["OTHER"]);
  });

  it("bridges every tonuFaultSide onto FaultParty, CUSTOMER ≡ SHIPPER (decision 3)", () => {
    expect(Object.keys(TONU_SIDE_TO_FAULT_PARTY).sort()).toEqual([...TONU_FAULT_SIDES].sort());
    expect(TONU_SIDE_TO_FAULT_PARTY.CUSTOMER).toBe("SHIPPER");
  });

  describe("assessCancellationInput", () => {
    it("refuses a missing code", () => {
      expect(assessCancellationInput({})).toMatchObject({ ok: false, code: "REASON_CODE_REQUIRED" });
      expect(assessCancellationInput({ cancellationReasonCode: "" })).toMatchObject({ ok: false, code: "REASON_CODE_REQUIRED" });
    });
    it("refuses an unknown code", () => {
      expect(assessCancellationInput({ cancellationReasonCode: "SHIPPER_BORED" })).toMatchObject({ ok: false, code: "REASON_CODE_INVALID" });
    });
    it("refuses OTHER without a real note", () => {
      expect(assessCancellationInput({ cancellationReasonCode: "OTHER" })).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
      expect(assessCancellationInput({ cancellationReasonCode: "OTHER", cancellationReason: "   short  " })).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
    });
    it("accepts OTHER with a note of the minimum length, trimmed", () => {
      const note = "x".repeat(MIN_CANCELLATION_NOTE_LENGTH);
      expect(assessCancellationInput({ cancellationReasonCode: "OTHER", cancellationReason: `  ${note}  ` }))
        .toEqual({ ok: true, reason: "OTHER", faultParty: "NONE", note });
    });
    it("derives the fault party from the code; a note is optional elsewhere", () => {
      expect(assessCancellationInput({ cancellationReasonCode: "SHIPPER_FREIGHT_NOT_READY" }))
        .toEqual({ ok: true, reason: "SHIPPER_FREIGHT_NOT_READY", faultParty: "SHIPPER", note: null });
    });
  });
});
