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

  it("every scoped code the endpoint accepts is a real blocked_code", () => {
    // The allow-list and the union are separate declarations; a code accepted
    // by the endpoint but never emitted would mint overrides that release
    // nothing, which is the failure the allow-list was added to prevent.
    const ctrl = fs.readFileSync(path.join(BACKEND, "src/controllers/complianceController.ts"), "utf8");
    const m = /const SCOPED_CHECK_CODES\s*=\s*\[([^\]]+)\]/.exec(ctrl);
    expect(m, "SCOPED_CHECK_CODES should exist in complianceController").toBeTruthy();
    const scoped = [...m![1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
    expect(scoped.length).toBeGreaterThan(0);
    for (const c of scoped) {
      expect(backend, `${c} is accepted as a scoped override but is not a BlockedCode`).toContain(c);
    }
  });
});
