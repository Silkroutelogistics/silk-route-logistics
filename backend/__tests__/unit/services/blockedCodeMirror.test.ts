/**
 * The frontend's BlockedCode union must match the backend's.
 *
 * WHY THIS MATTERS MORE THAN A TYPE MISMATCH USUALLY WOULD. The modal keeps a
 * hand-maintained MIRROR of the backend interface rather than importing it, so
 * TypeScript cannot see the two drift apart. And the modal's fallback for a
 * code it does not recognise is to send NO checkCode — which the backend reads
 * as a BLANKET override, releasing every block on the carrier for 24 hours.
 *
 * So the failure mode is not a red squiggle. It is: someone adds a scoped
 * blocked_code, forgets the mirror, and an AE who meant to waive one check
 * waives all of them — including the ones the codebase explicitly declares
 * un-waivable. Silent, and in the wrong direction.
 *
 * §13.3 Item 233.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const BACKEND = path.join(__dirname, "../../..");
const REPO = path.join(BACKEND, "..");

const BACKEND_FILE = path.join(BACKEND, "src/services/complianceMonitorService.ts");
const MIRROR_FILE = path.join(REPO, "frontend/src/components/loads/OverrideComplianceModal.tsx");

/** Pull the string-literal members of the BlockedCode `code` union. */
function codeUnion(file: string): string[] {
  const src = fs.readFileSync(file, "utf8");
  const i = src.indexOf("interface BlockedCode");
  if (i < 0) throw new Error(`BlockedCode interface not found in ${file}`);
  const body = src.slice(i, src.indexOf("}", i));
  const codeDecl = body.slice(body.indexOf("code:"));
  const upTo = codeDecl.slice(0, codeDecl.indexOf(";"));
  return [...upTo.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]).sort();
}

describe("BlockedCode mirror", () => {
  const backend = codeUnion(BACKEND_FILE);
  const mirror = codeUnion(MIRROR_FILE);

  it("finds a real union on both sides", () => {
    // Tripwire: a parser that silently matched nothing would make the equality
    // assertion below trivially true — two empty arrays are equal.
    expect(backend.length, "backend union should be non-trivial").toBeGreaterThan(2);
    expect(mirror.length, "mirror union should be non-trivial").toBeGreaterThan(2);
    expect(backend).toContain("AUTHORITY_TOO_YOUNG");
  });

  it("is identical to the backend union", () => {
    expect(
      mirror,
      mirror.join() !== backend.join()
        ? `OverrideComplianceModal's BlockedCode mirror has drifted.\n` +
          `  backend: ${backend.join(", ")}\n` +
          `  mirror : ${mirror.join(", ")}\n\n` +
          "This is not cosmetic: the modal sends NO checkCode for a code it does not\n" +
          "recognise, and the backend reads a missing checkCode as a BLANKET override —\n" +
          "so a missing mirror entry turns a scoped waiver into a total one."
        : "",
    ).toEqual(backend);
  });

  /**
   * Scoped codes that are deliberately NOT blocked_codes.
   *
   * v3.8.awx — this category did not exist when the guard was written, and the
   * original rule ("every scoped code is a blocked_code") was right about its
   * reason and wrong about its scope. The reason is that a code releasing
   * nothing mints a useless override. But "releases nothing" and "is not a
   * blocked_code" are not the same statement: an override can be consumed
   * somewhere other than complianceCheck.
   *
   * UNUSUAL_OTP_SMS_DISABLE is consumed by the carrier login path, which
   * suppresses unusual-activity SMS for cross-border carriers who would
   * otherwise hit the gate on every login. It waives a notification, not a
   * compliance block, so it correctly appears in no blocked_codes array.
   *
   * The blanket-fallback risk this file exists to catch does not apply to this
   * category: OverrideComplianceModal maps a blocked_code to a checkCode and is
   * the surface with the un-recognised-code fallback. These are posted
   * explicitly by their own UI, so a missing mirror entry cannot silently widen
   * them into a blanket override.
   *
   * The rule below is stricter than the one it replaces: membership here is not
   * a free pass, it requires PROVING a consumer exists.
   */
  const NON_COMPLIANCE_SCOPED_CODES: Record<string, { consumerFile: string; why: string }> = {
    UNUSUAL_OTP_SMS_DISABLE: {
      consumerFile: "src/routes/carrierAuth.ts",
      why: "carrier login suppresses unusual-activity SMS dispatch while an active override exists",
    },
  };

  it("every scoped code the endpoint accepts either is a blocked_code or has a proven consumer", () => {
    // A code accepted by the endpoint but read by nothing mints overrides that
    // do nothing at all — the failure the allow-list was added to prevent. A
    // blocked_code is read by complianceCheck; anything else has to show its
    // reader, or it is exactly that failure wearing an exemption.
    const ctrl = fs.readFileSync(path.join(BACKEND, "src/controllers/complianceController.ts"), "utf8");
    const m = /const SCOPED_CHECK_CODES\s*=\s*\[([^\]]+)\]/.exec(ctrl);
    expect(m, "SCOPED_CHECK_CODES should exist in complianceController").toBeTruthy();
    const scoped = [...m![1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
    expect(scoped.length).toBeGreaterThan(0);

    for (const c of scoped) {
      const exempt = NON_COMPLIANCE_SCOPED_CODES[c];
      if (!exempt) {
        expect(
          backend,
          `${c} is accepted as a scoped override but is not a BlockedCode, and is not declared as a non-compliance code with a consumer. Either emit it from complianceCheck, or add it to NON_COMPLIANCE_SCOPED_CODES naming the file that reads it.`,
        ).toContain(c);
        continue;
      }
      // Declared non-compliance: prove the named consumer actually reads it.
      const consumer = fs.readFileSync(path.join(BACKEND, exempt.consumerFile), "utf8");
      expect(
        consumer.includes(`"${c}"`),
        `${c} is exempted as a non-compliance scoped code on the grounds that ${exempt.consumerFile} reads it (${exempt.why}), but that file does not mention it. Either the consumer moved or the exemption is stale — a scoped code nothing reads mints overrides that do nothing.`,
      ).toBe(true);
    }
  });

  it("the non-compliance exemption list has no stale entries", () => {
    // An exemption for a code the endpoint no longer accepts is dead permission.
    const ctrl = fs.readFileSync(path.join(BACKEND, "src/controllers/complianceController.ts"), "utf8");
    const m = /const SCOPED_CHECK_CODES\s*=\s*\[([^\]]+)\]/.exec(ctrl);
    const scoped = [...m![1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
    const stale = Object.keys(NON_COMPLIANCE_SCOPED_CODES).filter((c) => !scoped.includes(c));
    expect(stale, stale.length ? `Exemption(s) for code(s) SCOPED_CHECK_CODES no longer accepts: ${stale.join(", ")}. Delete them.` : "").toEqual([]);
  });

  it("no absolute is reachable as a scoped code", () => {
    // Independent of the categories above: the §14 absolutes must never be
    // mintable, whichever list a future code lands on.
    //
    // The count is asserted as well as the overlap. Overlap alone is satisfied
    // by DELETING an entry from NEVER_OVERRIDABLE, which is the direction that
    // quietly makes an absolute waivable again — so the number has to be
    // edited on purpose and §14 updated with it.
    const ctrl = fs.readFileSync(path.join(BACKEND, "src/controllers/complianceController.ts"), "utf8");
    const scoped = [...(/const SCOPED_CHECK_CODES\s*=\s*\[([^\]]+)\]/.exec(ctrl)![1]).matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
    const never = [...(/const NEVER_OVERRIDABLE_CHECK_CODES\s*=\s*\[([^\]]+)\]/.exec(ctrl)![1]).matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
    expect(
      never.length,
      "NEVER_OVERRIDABLE_CHECK_CODES should list the six §14 absolutes. Changing " +
        "this number means changing policy — update §14 in the same commit.",
    ).toBe(6);
    expect(never, "INSURANCE_EXPIRED is absolute as of v3.8.axl").toContain("INSURANCE_EXPIRED");
    const overlap = scoped.filter((c) => never.includes(c));
    expect(overlap, overlap.length ? `Absolute(s) accepted as scoped overrides: ${overlap.join(", ")}` : "").toEqual([]);
  });
});
