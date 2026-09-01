/**
 * The tender lifecycle's remaining invariants, held where they can be held.
 *
 * This is the commit-12b sweep over the gap table in
 * docs/audits/tender-lifecycle-audit.md. Each block names the row it guards and,
 * where the row cannot be closed, says so here as well as in the row — because a
 * guard that quietly asserts something weaker than the row claims is worse than
 * no guard at all.
 *
 * Two shapes appear below. Where the invariant is a VOCABULARY or a WRITER SET,
 * the assertion is structural: those are properties of the source, and a
 * behavioural test cannot see a writer that nobody happened to call. Where the
 * invariant is BEHAVIOUR under real data, it lives in a DB proof under
 * backend/scripts and is referenced rather than duplicated here.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BACKEND = path.resolve(__dirname, "../../..");
const SRC = path.join(BACKEND, "src");

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name))
      : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []);

const read = (rel: string) => fs.readFileSync(path.join(BACKEND, rel), "utf8");

/* ────────────────────────────────────────────────────────────────────────── */
/*  ROW 1 — the state vocabulary                                              */
/* ────────────────────────────────────────────────────────────────────────── */

describe("gap row 1 — the tender state set is closed", () => {
  /**
   * The ratified nine. The audit's target said "7 states" and left COUNTERED and
   * DECLINED undecided; both are real carrier-initiated states and both stayed,
   * which is what makes nine right rather than seven.
   *
   * Frozen deliberately. A tenth state appearing without this list being edited
   * means somebody extended the lifecycle without anyone reconsidering the
   * transitions, the board partition, or what a carrier is told about it.
   */
  const RATIFIED = [
    "OFFERED", "ACCEPTED", "COUNTERED", "DECLINED",
    "RC_SENT", "CONFIRMED", "EXPIRED", "WITHDRAWN", "RELEASED",
  ].sort();

  const enumMembers = () => {
    const schema = fs.readFileSync(path.join(BACKEND, "prisma/schema.prisma"), "utf8");
    const block = schema.match(/enum TenderStatus \{([\s\S]*?)\n\}/);
    if (!block) throw new Error("TenderStatus enum not found in schema.prisma");
    return strip(block[1]).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).sort();
  };

  it("the Prisma enum is exactly the ratified set", () => {
    expect(enumMembers()).toEqual(RATIFIED);
  });

  it("every state the enum has, the transition service can reach", () => {
    // The real drift risk, and it has already bitten twice this arc. A state in
    // the enum that SettleTo does not carry forces callers through an `as never`
    // cast -- and a cast is a promise that the check is unnecessary. That is
    // exactly how RELEASED came to lose its statusReason, and how a default FROM
    // rail naming states the schema did not yet have died only at runtime.
    const svc = strip(read("src/services/tenderTransitionService.ts"));
    const union = svc.match(/export type SettleTo =([\s\S]*?);/);
    expect(union, "SettleTo not found").not.toBeNull();
    const carried = [...union![1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]).sort();
    expect(carried).toEqual(RATIFIED);
  });

  it("the vocabulary is read from the schema, not a copy (vacuity tripwire)", () => {
    // A guard comparing two hand-maintained lists proves only that somebody
    // updated both.
    expect(enumMembers().length).toBe(9);
    expect(fs.readFileSync(path.join(BACKEND, "prisma/schema.prisma"), "utf8")).toContain("enum TenderStatus");
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  ROW 3 — Load.status writers (OPEN, frozen rather than closed)             */
/* ────────────────────────────────────────────────────────────────────────── */

describe("gap row 3 — Load.status writers are frozen, not eliminated", () => {
  /**
   * THIS ROW IS NOT CLOSED, and this guard does not claim it is.
   *
   * The target is that no path writes Load.status directly. Twenty-eight sites
   * across eighteen files do, and §13.3 Item 194's log-first investigation
   * established that enforcing the canonical state machine over them TODAY would
   * break production: the auto-pilot paths legitimately skip BOOKED (§2's
   * ratified dispatch divergence) and fall-off recovery legitimately moves
   * backwards, and the canonical AE map allows neither.
   *
   * So this freezes the population instead. The inventory may SHRINK and never
   * GROW, which stops the problem getting worse while the reconciliation is
   * pending, and makes the next person to add a writer say why.
   */
  const BASELINE_FILES = 18;

  const writerFiles = () => {
    const found = new Set<string>();
    for (const f of walk(SRC)) {
      const s = strip(fs.readFileSync(f, "utf8"));
      for (const m of s.matchAll(/(?:prisma|tx|db|client)\s*\.\s*load\s*\.\s*update(?:Many)?\s*\(/g)) {
        const seg = s.slice(m.index!, m.index! + 800);
        // `status:` or shorthand `status,` / `status }` -- the shorthand form is
        // what made an earlier census in this arc undercount by two (§19
        // Sub-pattern 18).
        if (/\bstatus\s*[:,}]/.test(seg)) {
          found.add(path.relative(SRC, f).split(path.sep).join("/"));
        }
      }
    }
    return found;
  };

  it("the writer population has not grown", () => {
    const files = writerFiles();
    expect(
      files.size,
      `Load.status writers moved from ${BASELINE_FILES} to ${files.size} files.\n` +
        "This inventory may shrink and never grow. If you are adding a writer,\n" +
        "route it through the state machine instead — and if it genuinely cannot\n" +
        "be routed, raise the baseline here WITH the reason.\n" +
        [...files].sort().map((f) => "  " + f).join("\n"),
    ).toBeLessThanOrEqual(BASELINE_FILES);
  });

  it("the scanner still finds writers (vacuity tripwire)", () => {
    // A pattern that has stopped matching reports a clean tree forever, and
    // "zero writers" would read as the row being CLOSED rather than as the
    // instrument being broken.
    expect(writerFiles().size).toBeGreaterThan(10);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  ROW 4 — one live tender per load after an accept (partial)                */
/* ────────────────────────────────────────────────────────────────────────── */

describe("gap row 4 — accepting settles every sibling", () => {
  /**
   * THE ROW IS NOT FULLY CLOSED. Its target is "one live OFFERED per load unless
   * the waterfall is running in parallel", and `waterfall.parallel` does not
   * exist — so the general uniqueness rule has no flag to be conditional on and
   * cannot be asserted without making broadcast tendering illegal.
   *
   * What IS assertable, and is the half that matters operationally, is that
   * accepting one tender leaves no other live. That behaviour is proven against
   * a real database in scripts/_withdraw-consolidation-proof.ts; this guard
   * holds the structural half, which a behavioural proof cannot see: that every
   * accept path routes through the one helper rather than hand-rolling the
   * sibling sweep, which is how the six copies came to disagree about whether
   * COUNTERED counts as live.
   */
  /**
   * DERIVED, not listed. The first version of this guard hardcoded three files
   * and was wrong about one: withTenderController CREATES a load and tenders it,
   * so there are no siblings to settle, and asserting it called the helper was
   * asserting something false about a correct file.
   *
   * A hand-kept list of "the accept paths" is exactly the artefact that goes
   * stale — and a stale list here fails safe in the wrong direction, by omitting
   * the path somebody adds next. So the set is read from the source: a file that
   * settles a tender to ACCEPTED is an accept path, by definition.
   */
  const acceptPaths = () => {
    const found: string[] = [];
    for (const f of walk(SRC)) {
      const s = strip(fs.readFileSync(f, "utf8"));
      if (/to:\s*"ACCEPTED"/.test(s)) found.push(path.relative(SRC, f).split(path.sep).join("/"));
    }
    return found.sort();
  };

  it("every accept path settles siblings through the shared helper", () => {
    const paths = acceptPaths();
    for (const rel of paths) {
      const s = strip(fs.readFileSync(path.join(SRC, rel), "utf8"));
      expect(s, `${rel} accepts a tender without calling withdrawLiveTenders`).toContain("withdrawLiveTenders");
    }
  });

  it("the accept set is not empty (vacuity tripwire)", () => {
    // With no accept path found, the assertion above passes over nothing — which
    // reads identically to every path being correct.
    expect(acceptPaths().length).toBeGreaterThan(0);
  });

  it("no accept path hand-rolls a sibling sweep", () => {
    // The shape being banned: an updateMany over loadTender filtering on
    // OFFERED. Six of these existed and every one of them missed COUNTERED.
    for (const rel of acceptPaths()) {
      const s = strip(fs.readFileSync(path.join(SRC, rel), "utf8"));
      for (const m of s.matchAll(/loadTender\s*\.\s*updateMany\s*\(/g)) {
        const seg = s.slice(m.index!, m.index! + 400);
        expect(
          /"OFFERED"/.test(seg) && /status/.test(seg),
          `${rel} sweeps siblings itself — call withdrawLiveTenders`,
        ).toBe(false);
      }
    }
  });

  it("the helper exists and is the one place the rule lives", () => {
    const svc = read("src/services/tenderTransitionService.ts");
    expect(svc).toContain("export async function withdrawLiveTenders");
    // LIVE must carry COUNTERED. Dropping it is the original defect.
    const live = strip(svc).match(/const LIVE[^=]*=\s*\[([^\]]*)\]/);
    expect(live, "LIVE state list not found").not.toBeNull();
    expect(live![1]).toContain("COUNTERED");
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  ROW 8 — the RC is issued once                                             */
/* ────────────────────────────────────────────────────────────────────────── */

describe("gap row 8 — a re-send reuses the frozen document", () => {
  /**
   * Behaviour proven in scripts/_arc-rc-freeze-proof.ts (the stored object
   * hashes to the recorded hash, and a second send does not change it). This
   * holds the structural half: that the regeneration is GUARDED, so the property
   * cannot regress behind a proof nobody runs in CI.
   *
   * The failure it prevents is subtle and was live for one iteration of commit
   * 11b: re-rendering produces DIFFERENT BYTES for identical terms, because
   * PDFKit output is not reproducible (v3.8.awj). A carrier who signed on Monday
   * and re-opened on Tuesday would hold a document whose hash no longer matched
   * the row.
   */
  it("the send path renders only when nothing is frozen yet", () => {
    const s = strip(read("src/controllers/rateConfirmationController.ts"));
    const send = s.slice(s.indexOf("export async function sendRateConfirmation"));
    expect(send).toContain("alreadyIssued");
    const gen = send.indexOf("generateEnhancedRateConfirmation");
    expect(gen, "the RC generator is not called in the send path at all").toBeGreaterThan(-1);
    // The generator must sit inside the not-yet-issued branch.
    const guardAt = send.indexOf("if (alreadyIssued)");
    expect(guardAt).toBeGreaterThan(-1);
    expect(gen, "the document is generated before the already-issued check").toBeGreaterThan(guardAt);
  });

  it("the content hash is taken from the same buffer that is stored", () => {
    const send = strip(read("src/controllers/rateConfirmationController.ts"));
    expect(send).toContain("hashPdfBytes(pdfBuffer)");
    expect(send).toContain("uploadFileToPath(");
  });

  it("the download serves the stored artifact rather than a fresh render", () => {
    const s = strip(read("src/controllers/rateConfirmationController.ts"));
    const dl = s.slice(s.indexOf("export async function downloadRateConfirmationPdf"));
    expect(dl).toContain("getFileStream");
    expect(dl).toContain("rc.contentHash");
  });
});
