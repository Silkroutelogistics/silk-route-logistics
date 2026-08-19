// No handler may read a body field its schema does not declare.
//
// validateBody replaces req.body with the Zod result and Zod strips unknown
// keys, so an undeclared field is `undefined` at runtime with no type error and
// no runtime error. Two live bugs came from exactly this:
//
//   tonuFaultSide — a 422 gate required it, the schema did not declare it, so
//                   the gate rejected every TONU including valid ones. TONU was
//                   impossible to record (v3.8.asr).
//   totpCode      — password reset gates on it for TOTP users and the schema
//                   did not declare it, so a TOTP-enabled user could never
//                   reset their password: the frontend resent the code
//                   (ResetPasswordForm.tsx:62) and the backend answered
//                   requires2FA forever (Arc 4 Phase 1).
//
// This generalises the single-schema test that shipped with the first fix.
// Imports the scanner rather than shelling out to it — a subprocess made this
// slow and fragile, and a test that cannot run is not a guard.

import { describe, it, expect } from "vitest";
import { scanDrift } from "../../../scripts/audit-schema-drift";

const result = scanDrift();

describe("schema drift — every field a handler reads is declared", () => {
  it("has NO undeclared reads anywhere in the route surface", () => {
    const detail = result.undeclared
      .map((f) => `  ${f.route}  ${f.file}:${f.line}  schema=${f.schema}\n    undeclared: ${f.undeclared.join(", ")}`)
      .join("\n");
    // If this fails: declare the field, or stop reading it. A field read but
    // not declared is always undefined, which is never what anyone meant.
    expect(result.undeclared.length, `\n${detail}`).toBe(0);
  });

  it("actually scanned a meaningful surface", () => {
    // A green run over an empty set proves nothing. If the scanner silently
    // stops resolving routes, this catches it rather than reporting clean.
    expect(result.clean).toBeGreaterThan(20);
  });

  it("does not regress into mass-unresolvable", () => {
    // Some routes genuinely cannot be resolved by a text scanner (handler
    // passed through a wrapper, body forwarded into a service). A sudden jump
    // means the parser broke, not that the code changed.
    expect(result.unresolvable).toBeLessThan(15);
  });
});
