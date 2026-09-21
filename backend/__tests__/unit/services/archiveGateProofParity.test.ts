/**
 * Carrier-archive recut B2a (2026-09-20) — the tripwire between the gate and
 * the end-to-end proof.
 *
 * scripts/_carrier-archive-proof.ts reports two gate checks as PENDING(B2)
 * behind `const B2_LANDED = false` while the gate lacks CARRIER_ARCHIVED and
 * CARRIER_NOT_APPROVED. A PENDING that cannot go red is §19 Sub-pattern 16 in
 * its purest form: once the gate lands, the flag must flip in the same commit
 * or the proof keeps reporting the two most important checks as soft forever.
 * This test ties the two together so neither can lag or lead the other.
 *
 * It also pins the §14 mirror rule for the two new absolutes at the gate:
 * pushed with overridable:false AND the same reason string added to
 * absoluteReasons, so a blanket override cannot release either. The other two
 * mirror legs — the override endpoint's NEVER_OVERRIDABLE list and the modal's
 * union — are held by blockedCodeMirror.test.ts.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BACKEND = path.resolve(__dirname, "../../..");
const GATE = path.join(BACKEND, "src/services/complianceMonitorService.ts");
const PROOF = path.join(BACKEND, "scripts/_carrier-archive-proof.ts");

/** Blank comments in place so prose cannot satisfy a code assertion. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

const gate = code(fs.readFileSync(GATE, "utf8"));
const proof = fs.readFileSync(PROOF, "utf8");

const push = (c: string) => new RegExp(`blocked_codes\\.push\\(\\{\\s*code:\\s*"${c}"[^}]*overridable:\\s*(true|false)`, "g");
const NEW_CODES = ["CARRIER_ARCHIVED", "CARRIER_NOT_APPROVED"] as const;

describe("archive gate ⇔ proof parity (B2a)", () => {
  it("vacuity tripwire: the matcher sees a known absolute push", () => {
    // If OFAC_MATCH is not found the regex is broken, not the gate.
    expect([...gate.matchAll(push("OFAC_MATCH"))].length, "known push OFAC_MATCH not found — matcher broken").toBe(1);
  });

  it("the proof carries exactly one B2_LANDED flag line", () => {
    const flags = [...proof.matchAll(/^const B2_LANDED = (true|false);$/gm)];
    expect(flags.length, "exactly one `const B2_LANDED = …;` line").toBe(1);
  });

  it("B2_LANDED is true if and only if the gate pushes BOTH codes", () => {
    const landed = /^const B2_LANDED = (true|false);$/m.exec(proof)![1] === "true";
    const has = NEW_CODES.map((c) => [...gate.matchAll(push(c))].length >= 1);
    const gateHasBoth = has.every(Boolean);
    expect(
      landed,
      `B2_LANDED=${landed} but the gate ${gateHasBoth ? "pushes both codes" : `is missing ${NEW_CODES.filter((_, i) => !has[i]).join(", ")}`} — flip the flag in the same commit as the gate`,
    ).toBe(gateHasBoth);
  });

  it("both codes are pushed overridable:false, exactly once each", () => {
    for (const c of NEW_CODES) {
      const m = [...gate.matchAll(push(c))];
      expect(m.length, `${c} pushed once`).toBe(1);
      expect(m[0][1], `${c} must be overridable:false — it is a §14 absolute`).toBe("false");
    }
  });

  it("both reasons are added to absoluteReasons in the same block as their push", () => {
    // The block for each code must contain absoluteReasons.add(reason) between
    // the reason's construction and the push — the partition at the end of
    // complianceCheck keeps only absoluteReasons under a blanket override.
    for (const c of NEW_CODES) {
      const at = gate.indexOf(`code: "${c}"`);
      expect(at, `${c} push present`).toBeGreaterThan(0);
      const blockStart = gate.lastIndexOf("\n  if (", at);
      const block = gate.slice(blockStart, at);
      expect(block, `${c}: absoluteReasons.add(reason) inside its own if-block`).toMatch(/absoluteReasons\.add\(reason\)/);
      expect(block, `${c}: blocked_reasons.push(reason) inside its own if-block`).toMatch(/blocked_reasons\.push\(reason\)/);
    }
  });

  it("both codes are in the BlockedCode union", () => {
    const union = /export interface BlockedCode \{[\s\S]*?code:([\s\S]*?);/.exec(gate)?.[1] ?? "";
    for (const c of NEW_CODES) expect(union, `${c} in BlockedCode.code union`).toContain(`"${c}"`);
  });

  it("the proof has exactly the two soft checks, no third", () => {
    const soft = [...proof.matchAll(/\bokB2\(/g)].length;
    expect(soft, "okB2( call sites in the proof").toBe(2);
  });
});
