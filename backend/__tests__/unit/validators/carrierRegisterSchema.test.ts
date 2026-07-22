import { describe, it, expect } from "vitest";
import { carrierRegisterSchema } from "../../../src/validators/carrier";

/**
 * v3.8.aql regression suite.
 *
 * Carrier self-registration returned HTTP 422 on EVERY request from 2026-05-26
 * until 2026-07-22 — roughly two months — and nothing caught it.
 *
 * Mechanism: routes/carrier.ts normalizes FormData fields onto req.body, then
 * validateBody (middleware/validate.ts:21) does `req.body = result.data`. Zod
 * strips undeclared keys, so any field the route normalizes but the schema does
 * not declare is silently deleted before the controller runs. `docTypes` was
 * exactly that, and registerCarrier's required-document gate read it, found
 * nothing, and rejected every application.
 *
 * The load-bearing test is the last one: it asserts the STRUCTURAL invariant
 * (every normalized field is declared) rather than just the one field that
 * happened to break, so the whole class is guarded rather than the instance.
 */

const validBody = {
  email: "dispatch@examplecarrier.com",
  password: "Str0ng!Passw0rd#2026",
  firstName: "Jordan",
  lastName: "Reyes",
  company: "Example Carrier LLC",
  phone: "(269) 220-6760",
  mcNumber: "MC-999999",
  dotNumber: "1234567",
  equipmentTypes: ["Dry Van"],
  operatingRegions: ["Midwest"],
  address: "2317 S 35th St",
  city: "Galesburg",
  state: "MI",
  zip: "49053",
};

describe("carrierRegisterSchema — v3.8.aql required-document gate regression", () => {
  it("preserves docTypes through validation (the exact two-month outage)", () => {
    const result = carrierRegisterSchema.safeParse({
      ...validBody,
      docTypes: ["w9", "insurance", "authority", "wc"],
    });

    expect(result.success).toBe(true);
    // Pre-fix this was `undefined` — validateBody then wrote a body with no
    // docTypes, and the controller's gate had nothing to read.
    expect(result.success && result.data.docTypes).toEqual([
      "w9",
      "insurance",
      "authority",
      "wc",
    ]);
  });

  it("a complete application clears the required-document gate", () => {
    // Mirrors registerCarrier's gate: tags are paired with uploaded files BY INDEX,
    // so a tag only counts when a file exists at the same position.
    const parsed = carrierRegisterSchema.safeParse({
      ...validBody,
      docTypes: ["w9", "insurance", "authority", "wc"],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const uploadedFiles = [{}, {}, {}, {}]; // 4 files in files[]
    const clientTags: unknown[] = Array.isArray(parsed.data.docTypes) ? parsed.data.docTypes : [];
    const present = new Set<string>();
    for (let i = 0; i < uploadedFiles.length; i++) {
      const tag = typeof clientTags[i] === "string" ? (clientTags[i] as string).toLowerCase() : "";
      if (tag) present.add(tag);
    }
    const missing = ["w9", "insurance", "authority", "wc"].filter((k) => !present.has(k));

    expect(missing).toEqual([]);
  });

  it("still rejects an application that is genuinely missing documents", () => {
    // The gate must keep working — the fix restores it, it does not disable it.
    const parsed = carrierRegisterSchema.safeParse({ ...validBody, docTypes: ["w9"] });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const uploadedFiles = [{}]; // only one file
    const clientTags: unknown[] = parsed.data.docTypes ?? [];
    const present = new Set<string>();
    for (let i = 0; i < uploadedFiles.length; i++) {
      const tag = typeof clientTags[i] === "string" ? (clientTags[i] as string).toLowerCase() : "";
      if (tag) present.add(tag);
    }
    const missing = ["w9", "insurance", "authority", "wc"].filter((k) => !present.has(k));

    expect(missing).toEqual(["insurance", "authority", "wc"]);
  });

  it("declares every field the /register route normalizes (structural guard)", () => {
    // Any field routes/carrier.ts touches on req.body MUST be declared here, or
    // Zod deletes it before the controller sees it. Adding a normalized field
    // without a schema entry is the bug class that caused the outage — this
    // assertion fails loudly instead of silently dropping data.
    const normalizedByRoute = [
      "equipmentTypes",
      "operatingRegions",
      "docTypes",
      "numberOfTrucks",
      "autoLiabilityAmount",
      "cargoInsuranceAmount",
      "generalLiabilityAmount",
      "workersCompAmount",
      "additionalInsuredSRL",
      "waiverOfSubrogation",
      "thirtyDayCancellationNotice",
    ];

    const declared = Object.keys(carrierRegisterSchema.shape);
    const undeclared = normalizedByRoute.filter((f) => !declared.includes(f));

    expect(undeclared).toEqual([]);
  });
});
