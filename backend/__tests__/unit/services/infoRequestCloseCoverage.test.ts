/**
 * Every writer that moves a carrier into a closed state is accounted for.
 *
 * FIXING SIX SITES FIXES SIX SITES. This fails the seventh.
 *
 * That is the lesson carrierStatusPairing.test.ts already banked for the
 * status-pair problem, and it applies here for the same reason: the close is a
 * rule about a TRANSITION, and transitions are written in eleven files by
 * fourteen separate `prisma.carrierProfile.update` calls. A rule enforced by
 * remembering is a rule that lasts until the next person adds a writer.
 *
 * A FROZEN INVENTORY, NOT AN "ALL WIRED" ASSERTION. Some writers genuinely must
 * NOT close requests, and asserting otherwise would be false. Each is listed
 * with its reason, so an exclusion is a decision somebody wrote down rather
 * than a site somebody missed — which from the outside look identical.
 *
 * The scanner finds ASSIGNMENTS, not call shapes. Three earlier versions of the
 * sibling census matched `prisma.carrierProfile.update(` and missed `tx.` writes
 * and nested creates; an assignment does not vary however the write around it
 * is spelled.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "../../../src");

/** Files that write CarrierProfile.onboardingStatus. Mirrors the list in
 *  carrierStatusPairing.test.ts, which is the census this one rides on. */
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

/**
 * Every site that can put a carrier into APPROVED, REJECTED or SUSPENDED, and
 * what this arc decided about it. `wired` means the close runs in the same
 * transaction; anything else must say why not.
 */
/**
 * `writes` FREEZES THE COUNT, and that is the half a per-file check misses.
 *
 * `hasClose` asks whether the FILE mentions the close. `routes/carriers.ts` has
 * three closed-status writes and only one of them needs it — the other two are a
 * DAT create-path where the profile is made in the same handler, so no request
 * can exist yet. `carrierController.ts` is the same shape. Once such a file is
 * marked wired, a FOURTH write added to it inherits the tick for free.
 *
 * Freezing the count means a new write in an already-wired file has to be
 * classified rather than absorbed. §19 Sub-pattern 16: the string being present
 * is not the new site being covered.
 */
const DISPOSITION: Record<string, { wired: boolean; writes: number; why: string }> = {
  "services/approvalService.ts": {
    writes: 1,
    wired: true,
    why: "canonical AE approve — both the AE route and the Compass auto-approve converge here",
  },
  "services/rejectionService.ts": {
    writes: 1,
    wired: true,
    why: "canonical AE reject — had no transaction at all before G1, so the wrap is part of the change rather than an addition to an existing one",
  },
  "controllers/complianceController.ts": {
    writes: 1,
    wired: true,
    why: "AE-initiated manual suspend (POST /compliance/carrier/:id/suspend, ADMIN)",
  },
  "controllers/carrierController.ts": {
    writes: 3,
    wired: true,
    why: "verifyCarrier writes APPROVED or REJECTED from a variable; admin-setup approves an existing profile. The create branch is deliberately not wired — a profile that does not exist yet cannot hold a request",
  },
  "routes/carriers.ts": {
    writes: 3,
    wired: true,
    why: "emergency-approve is a second, unconverged approve path on an existing carrier",
  },
  "services/complianceMonitorService.ts": {
    writes: 7,
    wired: false,
    why: "AUTOMATIC suspensions only. checkAutoReversal reinstates FMCSA-suspended carriers on the next compliance scan and the suspension email tells the carrier so, which makes the state transient. Closing their requests would tell a carrier to stop, reinstate them hours later, and leave the AE to re-raise everything. The APPROVED write in this file is that reversal, arriving from SUSPENDED — the requests are already closed by then",
  },
  "services/ofacScreeningService.ts": {
    writes: 1,
    wired: false,
    why: "OFAC auto-suspend at score >= 90. Arguably not transient, unlike the FMCSA sweeps — recorded as a deliberate omission rather than done, because it is one path in a different service and this rule should arrive at a seam somebody chose",
  },
};

/** Blank comments in place, preserving offsets — the sibling census's idiom, and
 *  the one that survives a comment containing a block-comment delimiter. */
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

const CLOSED = /onboardingStatus:\s*"(APPROVED|REJECTED|SUSPENDED)"/g;

/** Every .ts under a root. The point of the derived census is that it reads
 *  what is there rather than what somebody remembered to list. */
function walkTs(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walkTs(f, out);
    else if (f.endsWith(".ts")) out.push(f);
  }
  return out;
}

/** Blank comments and TEMPLATE literals, offsets preserved. Quoted strings stay,
 *  because the enum literal being matched is one. */
function blankNoise(src: string): string {
  const out = src.split("");
  const BACKTICK = String.fromCharCode(96);
  const ESC = String.fromCharCode(92);
  let i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") { out[i] = " "; i++; } continue; }
    if (c === "/" && d === "*") {
      out[i] = out[i + 1] = " "; i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] !== "\n") out[i] = " "; i++; }
      if (i < src.length) { out[i] = out[i + 1] = " "; i += 2; }
      continue;
    }
    if (c === BACKTICK) {
      out[i] = " "; i++;
      while (i < src.length) {
        if (src[i] === ESC) { out[i] = " "; if (src[i + 1] !== "\n") out[i + 1] = " "; i += 2; continue; }
        if (src[i] === BACKTICK) { out[i] = " "; i++; break; }
        if (src[i] !== "\n") out[i] = " ";
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join("");
}

/** Closed-status writes to CarrierProfile specifically, literal OR variable.
 *  The variable form matters: verifyCarrier writes `onboardingStatus: status`,
 *  which a literal-only pattern cannot see (§19 Sub-pattern 18). */
const ANY_CLOSED = /onboardingStatus\s*:\s*(?:"(?:APPROVED|REJECTED|SUSPENDED)"|[A-Za-z_$][\w$]*)/g;
function carrierClosedWrites(raw: string): number {
  const src = blankNoise(raw);
  let n = 0;
  for (const m of src.matchAll(ANY_CLOSED)) {
    const back = src.slice(Math.max(0, m.index! - 600), m.index!);
    const lastWhere = back.lastIndexOf("where:");
    const lastData = Math.max(back.lastIndexOf("data:"), back.lastIndexOf("create:"), back.lastIndexOf("update:"));
    if (lastData <= lastWhere) continue;
    const cp = back.lastIndexOf("carrierProfile");
    const cu = Math.max(back.lastIndexOf("customer."), back.lastIndexOf("prisma.customer"), back.lastIndexOf("tx.customer"));
    if (cp < 0 || cu > cp) continue;
    n++;
  }
  return n;
}

function scan(rel: string): { closedWrites: number; hasClose: boolean } {
  const src = stripComments(fs.readFileSync(path.join(SRC, rel), "utf8"));
  // A `where:` filter is a read, not a write. Both look like the same
  // assignment, so the enclosing key is what separates them — and getting this
  // wrong in the permissive direction is what makes a census read healthy.
  const closedWrites = [...src.matchAll(CLOSED)].filter((m) => {
    const before = src.slice(Math.max(0, m.index! - 400), m.index!);
    const lastWhere = before.lastIndexOf("where:");
    const lastData = Math.max(before.lastIndexOf("data:"), before.lastIndexOf("create:"), before.lastIndexOf("update:"));
    return lastData > lastWhere;
  }).length;
  return { closedWrites, hasClose: src.includes("closeOpenInfoRequestsForStatus") };
}

describe("the close-on-transition rule is applied or explicitly excused", () => {
  it("every file that writes a closed status has a disposition", () => {
    const undeclared: string[] = [];
    for (const rel of CARRIER_FILES) {
      const { closedWrites } = scan(rel);
      if (closedWrites > 0 && !DISPOSITION[rel]) undeclared.push(`${rel} (${closedWrites} write(s))`);
    }
    expect(
      undeclared,
      `a new file moves carriers into a closed state and says nothing about open info requests.\n` +
        `Wire closeOpenInfoRequestsForStatus into its transaction, or add a DISPOSITION entry saying why not:\n${undeclared.join("\n")}`,
    ).toEqual([]);
  });

  it("every file marked wired actually calls the close", () => {
    const missing: string[] = [];
    for (const [rel, d] of Object.entries(DISPOSITION)) {
      if (!d.wired) continue;
      if (!scan(rel).hasClose) missing.push(rel);
    }
    expect(missing, `marked wired but does not call closeOpenInfoRequestsForStatus:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every file marked excluded genuinely does not call it", () => {
    // Dead permission reads as a considered exception. If an excluded file
    // gains the close, the reason above is now false and should be deleted.
    const stale: string[] = [];
    for (const [rel, d] of Object.entries(DISPOSITION)) {
      if (d.wired) continue;
      if (scan(rel).hasClose) stale.push(rel);
    }
    expect(stale, `marked excluded but now calls the close — update its DISPOSITION reason:\n${stale.join("\n")}`).toEqual([]);
  });

  it("every disposition names a file that exists and gives a reason", () => {
    for (const [rel, d] of Object.entries(DISPOSITION)) {
      expect(fs.existsSync(path.join(SRC, rel)), `stale disposition: ${rel}`).toBe(true);
      expect(d.why.length, `${rel} has no reason`).toBeGreaterThan(30);
    }
  });

  /**
   * THE HAND-KEPT LIST IS NOW A CHECKED CLAIM RATHER THAN AN ASSUMPTION.
   *
   * CARRIER_FILES above, and the identical list in carrierStatusPairing.test.ts,
   * are hardcoded. Both guards therefore share one blind spot: a closed-status
   * write in a file on NEITHER list is invisible to BOTH. Nothing forced the
   * lists to stay complete.
   *
   * This walks every .ts under src/ and asserts the derived writer set is
   * covered by the declared one. Two refinements were needed before it could be
   * trusted, and both were found by running it:
   *
   *   TEMPLATE LITERALS are blanked. A log line reading
   *   `...login blocked - onboardingStatus: ${customer.onboardingStatus}` in
   *   authController counted as a write, because a `data:` for systemLog.create
   *   preceded it. Quoted strings are NOT blanked — the enum literal we are
   *   looking for is itself a quoted string, and blanking those found 1 write
   *   where there are 17.
   *
   *   THE MODEL IS RESOLVED. `onboardingStatus` exists on Customer too, and
   *   customerController writes APPROVED to it. An InfoRequest is keyed to
   *   CarrierProfile (schema.prisma: `carrier CarrierProfile @relation`), so a
   *   Customer write is a different table and out of scope entirely.
   */
  it("no closed-status writer exists outside the declared census", () => {
    const seen: Record<string, number> = {};
    for (const abs of walkTs(SRC)) {
      const rel = path.relative(SRC, abs).split(path.sep).join("/");
      const n = carrierClosedWrites(fs.readFileSync(abs, "utf8"));
      if (n > 0) seen[rel] = n;
    }

    const undeclared = Object.keys(seen).filter((f) => !DISPOSITION[f]).sort();
    expect(
      undeclared,
      "a file outside the declared census writes a closed carrier status. Both this " +
        "guard and carrierStatusPairing.test.ts keep hand-written file lists, so a " +
        "writer here is invisible to both until somebody adds it:\n" + undeclared.join("\n"),
    ).toEqual([]);

    // Vacuity tripwire. A walker that stopped matching would report a clean tree.
    expect(Object.keys(seen).length, "the derived census found nothing at all").toBeGreaterThan(4);

    // And the count per file is frozen, so a new write in an already-wired file
    // cannot inherit that file's tick.
    for (const [rel, d] of Object.entries(DISPOSITION)) {
      expect(
        seen[rel] || 0,
        rel + " gained or lost a closed-status write. Classify it: either wire the " +
          "close into its transaction, or say here why that site does not need it " +
          "(a create-path cannot hold a request), then update `writes`.",
      ).toBe(d.writes);
    }
  });

  it("the scanner sees real writes and is not matching where-clauses", () => {
    // Vacuity tripwire, and a correctness one. approvalService has exactly one
    // closed-status WRITE; complianceMonitorService is full of
    // `where: { onboardingStatus: "APPROVED" }` reads, and a scanner that
    // counted those would report every file as a writer and prove nothing.
    expect(scan("services/approvalService.ts").closedWrites).toBe(1);
    expect(scan("services/rejectionService.ts").closedWrites).toBe(1);
    expect(scan("controllers/complianceController.ts").closedWrites).toBe(1);

    const cppRel = "services/complianceMonitorService.ts";
    const raw = fs.readFileSync(path.join(SRC, cppRel), "utf8");
    expect(raw).toMatch(/where:\s*\{[^}]*onboardingStatus:\s*"APPROVED"/);
    // Those reads are not counted; the real writes in that file are.
    expect(scan(cppRel).closedWrites).toBeGreaterThan(0);
  });
});
