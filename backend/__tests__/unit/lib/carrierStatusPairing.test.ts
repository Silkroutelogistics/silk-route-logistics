/**
 * The two CarrierProfile status enums move together, or this fails.
 *
 * THE CLASS, NOT THE INSTANCES. Twenty writers set `onboardingStatus` and left
 * `status` at its @default(NEW), against the schema's own instruction that the
 * two be kept in step. Four compliance sweeps filtered on `status` alone, so a
 * carrier approved through approvalService — the canonical path — was invisible
 * to the sanctions rescan and the insurance-expiry sweep, permanently.
 *
 * Fixing twenty sites fixes twenty sites. This fails the twenty-first.
 *
 * WHY IT SCANS FOR ASSIGNMENTS RATHER THAN WRITE CALLS. Three earlier versions
 * of the census matched the write and read inside it, and each shape had a
 * blind spot:
 *
 *   `prisma.carrierProfile.update(`  missed $transaction writes (`tx.`)
 *   any-client + `.carrierProfile.`  missed NESTED writes, where the profile is
 *                                    created through its parent as
 *                                    user.create({ carrierProfile: { create } })
 *
 * Each fix revealed the next gap, which is the signal to stop matching call
 * shapes. An assignment does not vary: `onboardingStatus:` reads the same
 * however the write around it is spelled. So find the assignment and brace-walk
 * OUT to its own object literal.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { pairedApplicationStatus } from "../../../src/lib/carrierOperational";

const SRC = path.join(__dirname, "../../../src");

/**
 * Carrier-side files only.
 *
 * Customer carries an `onboardingStatus` too and its `status` is a free-form
 * display string ("Active"), not CarrierApplicationStatus — pairing there would
 * write nonsense into a different model's column.
 */
const CARRIER_FILES = [
  "controllers/carrierController.ts",
  "controllers/complianceController.ts",
  "services/approvalService.ts",
  "services/complianceMonitorService.ts",
  "services/infoRequestService.ts",
  "services/ofacScreeningService.ts",
  "services/onboardingLifecycleService.ts",
  "services/rejectionService.ts",
  "routes/carriers.ts",
  "routes/carrierAuth.ts",
  "services/carrierVettingService.ts",
];

/** Blank comments in place, preserving offsets. */
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

function enclosingObject(src: string, i: number): { start: number; end: number } | null {
  let depth = 0;
  let start = -1;
  for (let k = i; k >= 0; k--) {
    const c = src[k];
    if (c === "}" || c === ")" || c === "]") depth++;
    else if (c === "{" || c === "(" || c === "[") {
      if (depth === 0) {
        if (c !== "{") return null;
        start = k;
        break;
      }
      depth--;
    }
  }
  if (start === -1) return null;
  depth = 0;
  for (let k = start; k < src.length; k++) {
    const c = src[k];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (depth === 0) return { start, end: k };
    }
  }
  return null;
}

/** Inside data:/create:/update:/upsert: rather than where:. */
function isWrite(src: string, objStart: number): boolean {
  const before = src.slice(Math.max(0, objStart - 200), objStart);
  const d = Math.max(
    before.lastIndexOf("data:"),
    before.lastIndexOf("create:"),
    before.lastIndexOf("update:"),
    before.lastIndexOf("upsert:"),
  );
  return d > before.lastIndexOf("where:");
}

interface Finding { file: string; line: number; value: string; paired: boolean }

function scanCarrierWriters(): Finding[] {
  const out: Finding[] = [];
  for (const rel of CARRIER_FILES) {
    const p = path.join(SRC, rel);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8").split("\r\n").join("\n");
    const masked = stripComments(text);
    const re = /\bonboardingStatus\s*:\s*("(\w+)"|[A-Za-z_$][\w$.]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked))) {
      const obj = enclosingObject(masked, m.index);
      if (!obj || !isWrite(masked, obj.start)) continue;
      const body = masked.slice(obj.start, obj.end + 1);
      out.push({
        file: rel,
        line: text.slice(0, m.index).split("\n").length,
        value: m[1],
        paired: /(?:^|[{,\s])status\s*:/.test(body),
      });
    }
  }
  return out;
}

describe("CarrierProfile status pairing", () => {
  const writers = scanCarrierWriters();

  it("finds a realistic number of writers, so an empty pass is impossible", () => {
    // The §19 Sub-pattern 16 failure, in a guard whose whole job is a count: a
    // broken scanner reports zero unpaired writers and looks like success.
    expect(writers.length, "the scanner should find real carrier writers").toBeGreaterThan(15);
  });

  it("sees the canonical approve path, which three earlier scanners missed", () => {
    // approvalService.approveCarrier writes through `tx.carrierProfile.update`
    // inside a $transaction. A scanner keyed on `prisma.` does not see it, and
    // it is the single most important writer in the set — the one whose gap
    // made normally-approved carriers invisible to the sanctions rescan.
    const approve = writers.filter((w) => w.file === "services/approvalService.ts");
    expect(approve.length, "approvalService must be in scope").toBeGreaterThan(0);
  });

  it("sees nested creates, where the profile is written through its parent", () => {
    // registerCarrier writes user.create({ data: { carrierProfile: { create } } }).
    // A scanner keyed on `.carrierProfile.<op>(` does not see that either.
    const reg = writers.filter((w) => w.file === "controllers/carrierController.ts");
    expect(reg.length, "carrierController must be in scope").toBeGreaterThan(2);
  });

  it("every carrier writer sets BOTH enums", () => {
    const unpaired = writers.filter((w) => !w.paired);
    expect(
      unpaired.map((w) => `${w.file}:${w.line}  onboardingStatus: ${w.value}`),
      unpaired.length
        ? "These writers set onboardingStatus and leave status stale.\n\n" +
          "Four compliance sweeps filter on `status` — a carrier written this way\n" +
          "is invisible to the sanctions rescan and the insurance-expiry sweep.\n\n" +
          "Add the paired value: status: pairedApplicationStatus(<value>), or the\n" +
          "literal from lib/carrierOperational's table."
        : "",
    ).toEqual([]);
  });

  it("the pairings written are the ones the resolver would choose", () => {
    // Catches a hand-edit that pairs APPROVED with REVIEW, which nothing else
    // would notice until a sweep quietly skipped somebody.
    const mismatches: string[] = [];
    for (const rel of CARRIER_FILES) {
      const p = path.join(SRC, rel);
      if (!fs.existsSync(p)) continue;
      const masked = stripComments(fs.readFileSync(p, "utf8").split("\r\n").join("\n"));
      const re = /\bonboardingStatus\s*:\s*"(\w+)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(masked))) {
        const obj = enclosingObject(masked, m.index);
        if (!obj || !isWrite(masked, obj.start)) continue;
        const body = masked.slice(obj.start, obj.end + 1);
        const sib = /(?:^|[{,\s])status\s*:\s*"(\w+)"/.exec(body);
        if (!sib) continue;
        const want = pairedApplicationStatus(m[1]);
        if (want && sib[1] !== want) {
          mismatches.push(`${rel}: onboardingStatus "${m[1]}" paired with "${sib[1]}", expected "${want}"`);
        }
      }
    }
    expect(mismatches, mismatches.join("\n  ")).toEqual([]);
  });
});

describe("pairedApplicationStatus covers the whole onboarding enum", () => {
  it("maps every OnboardingStatus value", () => {
    // If the enum gains a value, this fails rather than letting a writer pair
    // it with null and leave status stale by omission.
    const schema = fs.readFileSync(path.join(SRC, "../prisma/schema.prisma"), "utf8");
    const block = /enum OnboardingStatus \{([\s\S]*?)\}/.exec(schema);
    expect(block, "should have found the enum").not.toBeNull();
    const values = block![1]
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, "").trim())
      .filter((l) => /^[A-Z_]+$/.test(l));

    expect(values.length, "should have parsed real enum values").toBeGreaterThan(3);
    const unmapped = values.filter((v) => pairedApplicationStatus(v) === null);
    expect(unmapped, `unmapped OnboardingStatus values: ${unmapped.join(", ")}`).toEqual([]);
  });
});
