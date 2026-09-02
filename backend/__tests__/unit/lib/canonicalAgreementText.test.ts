/**
 * Slice 4 — content hash (decision 8, agreement half) and the registration
 * assent row (decision 9, resolved).
 *
 * DETERMINISM IS THE PROPERTY UNDER TEST. The counterexample this exists to kill
 * is on the record: v3.8.awj downloaded one executed agreement twice and got
 * 43,247 bytes both times with DIFFERENT sha256. A hash over PDF bytes could
 * never re-verify, so it would fail on documents that had not changed — worse
 * than no hash. The hash therefore covers the canonical TEXT, and the renderer
 * consumes that same assembly so the two cannot drift.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import {
  assembleAgreementText,
  assembleAgreementSegments,
  agreementContentHash,
  attestationText,
} from "../../../src/lib/canonicalAgreementText";
import { BROKER_CARRIER_AGREEMENT, CARAVAN_QUICK_PAY_AGREEMENT } from "../../../src/data/agreements";

const SRC = path.resolve(__dirname, "../../../src");
const carrierAuth = fs.readFileSync(path.join(SRC, "routes/carrierAuth.ts"), "utf8");
const carrierController = fs.readFileSync(path.join(SRC, "controllers/carrierController.ts"), "utf8");
const renderer = fs.readFileSync(path.join(SRC, "services/agreementPdfService.ts"), "utf8");
const gate = fs.readFileSync(path.join(SRC, "services/complianceMonitorService.ts"), "utf8");

/**
 * Strip comments before asserting a BAN on a construct.
 *
 * The first version of the three bans below read whole files and went red on
 * this file's own explanatory prose — the comment saying "NO toLocaleString
 * anywhere in this file" matched a ban on toLocaleString. That is the trap §19
 * records twice already: a text assertion matching a comment about the thing it
 * forbids. Anchor on what RUNS. The comments are worth keeping; they explain why
 * the ban exists.
 */
function codeOnly(src: string): string {
  const BLOCK = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
  const LINE = new RegExp("^[ \\t]*//.*$", "gm");
  return src.replace(BLOCK, "").replace(LINE, "");
}

const CARRIER = { legalName: "Falcon Express LLC", mcNumber: "MC-1", dotNumber: "DOT-2", ein: "12-3456789" };
const SIG = {
  signedByName: "Jordan Carrier",
  signedByTitle: "Owner",
  signedAt: new Date("2026-08-31T11:46:28.387Z"),
  signerIp: "203.0.113.7",
  version: BROKER_CARRIER_AGREEMENT.version,
  consentAt: new Date("2026-08-31T11:46:28.387Z"),
};
const opts = { carrier: CARRIER, signature: SIG };

describe("the canonical text is deterministic", () => {
  it("two assemblies of the same row are byte-identical", () => {
    const a = assembleAgreementText(BROKER_CARRIER_AGREEMENT, opts);
    const b = assembleAgreementText(BROKER_CARRIER_AGREEMENT, opts);
    expect(a).toBe(b);
    expect(agreementContentHash(BROKER_CARRIER_AGREEMENT, opts))
      .toBe(agreementContentHash(BROKER_CARRIER_AGREEMENT, opts));
  });

  it("is stable when the SAME instant arrives as a string rather than a Date", () => {
    // A row read back from the database hands dates as Date; a JSON round-trip
    // hands strings. Both must hash the same or re-verification fails on a
    // detail of how the row was fetched.
    const viaString = { ...opts, signature: { ...SIG, signedAt: SIG.signedAt.toISOString(), consentAt: SIG.consentAt.toISOString() } };
    expect(agreementContentHash(BROKER_CARRIER_AGREEMENT, viaString))
      .toBe(agreementContentHash(BROKER_CARRIER_AGREEMENT, opts));
  });

  it("contains NO locale formatting — ICU builds differ between machines", () => {
    const src = codeOnly(fs.readFileSync(path.join(SRC, "lib/canonicalAgreementText.ts"), "utf8"));
    expect(src).not.toContain("toLocaleString");
    expect(src).not.toContain("toLocaleDateString");
    // Tripwire: if the strip ever removed everything, the ban would pass vacuously.
    expect(src).toContain("createHash");
  });

  it("normalises whitespace, so a reflowed line is not a different agreement", () => {
    expect(attestationText({ ...SIG, signedByName: "Jordan   Carrier" }))
      .toContain("Jordan Carrier");
  });
});

describe("one changed character changes the hash", () => {
  const base = agreementContentHash(BROKER_CARRIER_AGREEMENT, opts);

  it("signer name", () => {
    expect(agreementContentHash(BROKER_CARRIER_AGREEMENT, { ...opts, signature: { ...SIG, signedByName: "Jordan Carriar" } })).not.toBe(base);
  });
  it("signer title", () => {
    expect(agreementContentHash(BROKER_CARRIER_AGREEMENT, { ...opts, signature: { ...SIG, signedByTitle: "Owners" } })).not.toBe(base);
  });
  it("signing instant, by one millisecond", () => {
    expect(agreementContentHash(BROKER_CARRIER_AGREEMENT, { ...opts, signature: { ...SIG, signedAt: new Date("2026-08-31T11:46:28.388Z") } })).not.toBe(base);
  });
  it("signer IP", () => {
    expect(agreementContentHash(BROKER_CARRIER_AGREEMENT, { ...opts, signature: { ...SIG, signerIp: "203.0.113.8" } })).not.toBe(base);
  });
  it("carrier legal name, MC, DOT and EIN each", () => {
    for (const patch of [{ legalName: "Falcon Express LLC." }, { mcNumber: "MC-2" }, { dotNumber: "DOT-3" }, { ein: "12-3456780" }]) {
      expect(agreementContentHash(BROKER_CARRIER_AGREEMENT, { ...opts, carrier: { ...CARRIER, ...patch } }), JSON.stringify(patch)).not.toBe(base);
    }
  });
  it("one character of one clause", () => {
    const edited = {
      ...BROKER_CARRIER_AGREEMENT,
      sections: BROKER_CARRIER_AGREEMENT.sections.map((s, i) =>
        i === 0 ? { ...s, clauses: s.clauses.map((c, j) => (j === 0 ? c + "." : c)) } : s),
    };
    expect(agreementContentHash(edited as any, opts)).not.toBe(base);
  });
  it("the version", () => {
    expect(agreementContentHash({ ...BROKER_CARRIER_AGREEMENT, version: "9999-01-01-v9" } as any, opts)).not.toBe(base);
  });
  it("a different document entirely", () => {
    expect(agreementContentHash(CARAVAN_QUICK_PAY_AGREEMENT, opts)).not.toBe(base);
  });
  it("consent present vs absent", () => {
    expect(agreementContentHash(BROKER_CARRIER_AGREEMENT, { ...opts, signature: { ...SIG, consentAt: null } })).not.toBe(base);
  });
});

describe("the renderer consumes the assembly it is hashed from", () => {
  it("draws from segments, not from a second traversal of the source", () => {
    expect(renderer).toContain("assembleAgreementSegments(agreement, { carrier, signature })");
    expect(renderer).toContain('seg("effective-note")');
    expect(renderer).toContain('seg("witness")');
    expect(renderer).toContain('seg("attestation")');
    // The inline attestation construction is gone — it was a second description
    // of the same sentence, free to drift from the hashed one.
    expect(codeOnly(renderer)).not.toContain("Electronically signed by ${signature.signedByName}");
    expect(codeOnly(renderer)).not.toContain("toLocaleString");
    expect(codeOnly(renderer)).toContain("drawSignatureBlock"); // vacuity tripwire
  });

  it("every segment kind the assembly can emit is drawn", () => {
    // EITHER drawing style counts, for every kind. This used to hard-code which
    // kinds were drawn in the ordered loop (`s.kind === "x"`) and which were
    // pulled out by hand (`seg("x")`), and that list went stale the moment a
    // fourth loop-drawn kind appeared: "table" is drawn in the loop, so the
    // guard reported it as never drawn while it was being drawn correctly.
    //
    // The question this case exists to ask is whether a kind reaches the page at
    // all. HOW it is drawn is not the invariant, and encoding it made the guard
    // fail against correct code -- which is worse than not checking, because the
    // instinctive fix is to bend the renderer to satisfy the test.
    const kinds = new Set(assembleAgreementSegments(BROKER_CARRIER_AGREEMENT, opts).map((s) => s.kind));
    for (const k of kinds) {
      const drawn = renderer.includes(`s.kind === "${k}"`) || renderer.includes(`seg("${k}")`);
      expect(drawn, `segment kind ${k} is assembled but never drawn`).toBe(true);
    }
  });
});

describe("the hash is written in the same statement as the signature", () => {
  it("both execution paths compute it before the create and include it there", () => {
    expect(carrierAuth).toContain("const bcaContentHash = agreementContentHash(");
    expect(carrierAuth).toContain("contentHash: bcaContentHash,");
    expect(carrierAuth).toContain("const qpContentHash = agreementContentHash(");
    expect(carrierAuth).toContain("contentHash: qpContentHash,");
  });

  it("is not a follow-up update — no window with a signature and no hash", () => {
    // A second statement would leave the row hashless on any failure between
    // the two, which is exactly the state the column exists to make impossible.
    const bcaCreate = carrierAuth.indexOf("const bcaContentHash");
    const bcaRow = carrierAuth.indexOf("const agreement = await prisma.carrierAgreement.create({");
    expect(bcaCreate).toBeGreaterThan(-1);
    expect(bcaCreate).toBeLessThan(bcaRow);
    expect(carrierAuth).not.toMatch(/data:\s*\{\s*contentHash[^}]*\}\s*\}\s*\)\s*;\s*\/\/\s*follow-up/);
  });
});

describe("ACKNOWLEDGED records assent without satisfying the tender gate", () => {
  it("THE GATE CONDITION IS UNCHANGED — SIGNED only", () => {
    // The whole safety of decision 9 rests on this. If the gate ever widens to
    // accept ACKNOWLEDGED, registration alone would make a carrier tenderable.
    expect(gate).toContain('a.status === "SIGNED" && a.templateName === "broker-carrier"');
    expect(gate).toContain('where: { carrierId, status: "SIGNED", templateName: "broker-carrier" }');
    expect(gate).not.toContain("ACKNOWLEDGED");
  });

  it("registration writes an ACKNOWLEDGED row, never SIGNED", () => {
    const i = carrierController.indexOf("registration assent gets a row");
    const block = carrierController.slice(i, i + 2600);
    expect(block).toContain('status: "ACKNOWLEDGED"');
    expect(block).not.toContain('status: "SIGNED"');
  });

  it("writes NO consentAt — onboarding collects no ESIGN acknowledgement", () => {
    const i = carrierController.indexOf("registration assent gets a row");
    const block = codeOnly(carrierController.slice(i, i + 2600));
    expect(block).not.toContain("consentAt");
    expect(block).toContain("ACKNOWLEDGED"); // vacuity tripwire
  });

  it("leaves the signature fields null — nobody typed a legal name here", () => {
    const i = carrierController.indexOf("registration assent gets a row");
    const block = carrierController.slice(i, i + 2600);
    expect(block).not.toContain("signedByName");
    expect(block).not.toContain("signatureData");
  });

  it("writes the row and the column in the same request, with the trigger recorded", () => {
    expect(carrierController).toContain("bcaAgreedAt: new Date(),");
    expect(carrierController).toContain("ONE FULL MONTH from this commit");
  });

  it("a failed row create does not fail the registration", () => {
    const i = carrierController.indexOf("registration assent gets a row");
    const block = carrierController.slice(i, i + 2600);
    expect(block).toContain(".catch((err)");
  });
});
