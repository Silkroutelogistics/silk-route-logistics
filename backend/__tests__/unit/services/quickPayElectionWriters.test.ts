/**
 * Quick Pay election — the writer set, and the AE modal boundary.
 *
 * The behavioural half lives in scripts/_arc-qp-election-proof.ts (36 cases
 * against a real database). These are the two properties a DB proof cannot
 * see: that nothing ELSE writes the row, and that the AE rate-confirmation
 * modal does not carry an election field.
 *
 * Both are STRUCTURAL by necessity. A behavioural test cannot observe a writer
 * nobody happened to call, and it cannot observe a form field nobody happened
 * to fill in.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BACKEND = path.resolve(__dirname, "../../..");
const SRC = path.join(BACKEND, "src");
const REPO = path.resolve(BACKEND, "..");

/** Comments stripped, so prose describing a write is not read as one. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const walk = (dir: string, ext: RegExp): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name), ext) : ext.test(e.name) ? [path.join(dir, e.name)] : [],
      )
    : [];

describe("quickPayElection has ONE writer", () => {
  /**
   * The service is the only file permitted to write the table. Everything else
   * goes through `record()` or `voidForTender()`.
   *
   * The reason is the whole point of the row: it exists so a fee deduction can
   * name who chose it. A second writer is a second chance to write one without
   * provenance, and a row with a null decider is worse than no row because it
   * looks like a record.
   */
  const ALLOWED = new Set(["services/quickPayElectionService.ts"]);

  const writers = () => {
    const found: string[] = [];
    for (const f of walk(SRC, /\.ts$/)) {
      const s = strip(fs.readFileSync(f, "utf8"));
      // create / createMany / update / updateMany / upsert / delete on the model.
      if (/(?:prisma|tx|db|client)\s*\.\s*quickPayElection\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)/.test(s)) {
        found.push(path.relative(SRC, f).split(path.sep).join("/"));
      }
    }
    return found.sort();
  };

  it("nothing outside the service writes the table", () => {
    const offenders = writers().filter((f) => !ALLOWED.has(f));
    expect(
      offenders,
      "a second writer of quick_pay_elections — route it through quickPayElectionService.record()",
    ).toEqual([]);
  });

  it("the scanner still finds the sanctioned writer (vacuity tripwire)", () => {
    // A pattern that has stopped matching reports a clean tree forever, and
    // "zero writers" reads identically to "correctly one writer".
    expect(writers()).toContain("services/quickPayElectionService.ts");
  });

  it("the allow-list has no dead entries", () => {
    for (const rel of ALLOWED) {
      expect(fs.existsSync(path.join(SRC, rel)), `${rel} is allow-listed but does not exist`).toBe(true);
    }
  });

  it("the service prices the fee itself rather than accepting one", () => {
    // If a caller could pass feePercent, the §8 ladder would stop being the
    // only source of the number and an election could be recorded off-ladder.
    const svc = strip(fs.readFileSync(path.join(SRC, "services/quickPayElectionService.ts"), "utf8"));
    const iface = svc.slice(svc.indexOf("export interface RecordElectionInput"), svc.indexOf("export type RecordElectionResult"));
    expect(iface, "RecordElectionInput must not accept a fee").not.toMatch(/feePercent\s*[?]?\s*:/);
    expect(svc).toContain("feeForSpeed(input.speed, input.tier)");
  });
});

describe("the AE rate-confirmation modal carries no election field", () => {
  /**
   * The carrier decides how their own load is paid. The AE modal used to send
   * the election in formData, and issuance resolved from it — so an AE could
   * set a fee the carrier had not chosen, and nothing reconciled the two.
   *
   * The ONLY AE write path is ON_BEHALF through `record()`, which demands
   * evidence. This asserts the modal has no back door around that.
   */
  const MODAL = path.join(REPO, "frontend/src/components/loads/RateConfirmationModal.tsx");

  it("the modal file exists (vacuity tripwire)", () => {
    // Without this, a rename would make every assertion below pass over an
    // empty string.
    expect(fs.existsSync(MODAL), "RateConfirmationModal.tsx moved — repoint this guard").toBe(true);
  });

  it("does not put an election into the payload it sends", () => {
    const s = strip(fs.readFileSync(MODAL, "utf8"));
    // A WRITE looks like `quickPaySpeed:` inside the built payload. Reading the
    // value back to DISPLAY the recorded decision is fine and expected, so the
    // assertion is on assignment, not on the identifier appearing at all.
    // Assigning FROM form state is the AE having typed a value. Assigning from
    // `load` is displaying the recorded decision, which is the point of keeping
    // the field at all. That distinction is why this is not a bare identifier
    // search: a read-back is correct and a write is not.
    const writes = [...s.matchAll(/quickPay(?:Speed|FeePercent)\s*:\s*form\./g)].map((m) => m[0]);
    expect(
      writes,
      "the AE modal assigns a Quick Pay election. The carrier elects; the only AE write is ON_BEHALF through record().",
    ).toEqual([]);
  });
});
