// backend/scripts/reactivate-load-121495.ts is retired for any load the
// cancellation-snapshot migration reached, and made to behave like the
// canonical PUT /loads/:id/uncancel endpoint for the pre-snapshot loads it
// still serves.
//
// STATIC ON PURPOSE. The script writes to a database via
// BACKFILL_DATABASE_URL and CI has none it is safe to point at -- so this
// reads the source text rather than executing it, the same shape
// deployGate.test.ts uses for ci.yml and statusMachineCounters.test.ts uses
// for "the health payload actually reads the cumulative counters". A
// structural assertion cannot prove the script runs correctly; it can prove
// the four required behaviours are present in the code that would run.
//
// COMMENTS ARE STRIPPED before every code-shape assertion. §19 Sub-pattern 17
// (Item 230.3, uncancelLens.ts's own header) is a scanner matching prose that
// merely NAMES a symbol rather than code that USES it -- this file's own
// header prose mentions "recordLifecycleEvent", "createNotification" and
// "cancellationSnapshot" by name in its reasoning, which would satisfy a
// naive `includes()` check without a single line of code changing. Sub-
// pattern 18 (Item 230.3 again, and the tender-lifecycle arc) is the sibling
// failure -- a `key:` pattern that misses object shorthand or a wrapped call
// spanning multiple lines. The assertions below are written against the
// STRIPPED text and, where a call can wrap, tolerate a line break between the
// call name and its arguments.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SCRIPT_PATH = path.join(__dirname, "../../../scripts/reactivate-load-121495.ts");
const RAW = fs.readFileSync(SCRIPT_PATH, "utf8");

/**
 * Strip `//` line comments and `/* ... *\/` block comments, the same walk
 * noLoadRateReads.test.ts and the Arc 16/21 guards use, so a comment
 * mentioning a symbol cannot satisfy a check meant to find code using it.
 */
function stripComments(src: string): string {
  const lines = src.split(/\r?\n/);
  let inBlock = false;
  const out: string[] = [];
  for (const raw of lines) {
    let line = raw;
    if (inBlock) {
      if (line.includes("*/")) {
        inBlock = false;
        line = line.slice(line.indexOf("*/") + 2);
      } else {
        out.push("");
        continue;
      }
    }
    // A line can open and close a block comment more than once; loop until
    // neither remains, mirroring noLoadRateReads.test.ts's single-pass form
    // extended for the (rare) multi-comment-per-line case.
    for (;;) {
      const blockStart = line.indexOf("/*");
      if (blockStart === -1) break;
      const blockEnd = line.indexOf("*/", blockStart + 2);
      if (blockEnd === -1) {
        line = line.slice(0, blockStart);
        inBlock = true;
        break;
      }
      line = line.slice(0, blockStart) + line.slice(blockEnd + 2);
    }
    line = line.replace(/\/\/.*$/, "");
    out.push(line);
  }
  return out.join("\n");
}

const CODE = stripComments(RAW);

/**
 * Does the CODE contain a call to `fnName(` whose opening paren may be on a
 * later line than the identifier -- the wrapped-chain shape Sub-pattern 18
 * exists to catch (`await recordLifecycleEvent({` vs `await\n  record
 * LifecycleEvent(\n    {`). Whitespace, including newlines, between the name
 * and `(` is tolerated; the name itself is matched as a whole identifier so
 * `xRecordLifecycleEventY` cannot satisfy it.
 */
function callsFunction(code: string, fnName: string): boolean {
  const re = new RegExp(`\\b${fnName}\\s*\\(`, "m");
  return re.test(code);
}

describe("reactivate-load-121495.ts refuses any load a snapshot can restore", () => {
  it("selects cancellationSnapshot in its load lookup", () => {
    expect(CODE, "the script must read the column it decides on").toMatch(/cancellationSnapshot:\s*true/);
  });

  it("refuses when the snapshot is present, naming the uncancel endpoint", () => {
    // Not merely "the string PUT /loads/:id/uncancel appears somewhere" --
    // it must appear on the REFUSE path for a non-null snapshot, so the
    // check finds the conditional and the endpoint name within the same
    // neighbourhood of source.
    const guardIdx = CODE.search(/cancellationSnapshot\s*!==\s*null/);
    expect(guardIdx, "no `cancellationSnapshot !== null` check found in code").toBeGreaterThan(-1);
    const window = CODE.slice(guardIdx, guardIdx + 800);
    expect(window, "the snapshot-present branch must call refuse(...)").toMatch(/refuse\(/);
    expect(
      window,
      "the refusal must name the canonical endpoint so an operator knows what to run instead",
    ).toMatch(/PUT \/loads\/:id\/uncancel/);
  });

  it("does NOT restore, sync a shipment, or reissue a token inside the refused branch", () => {
    // A refusal that still fell through to the transaction would be a refusal
    // in name only. The snapshot check must return control to the caller
    // (refuse() itself calls process.exit and is typed `never`) before any
    // `$transaction` call appears later in the same function body.
    const snapshotIdx = CODE.search(/cancellationSnapshot\s*!==\s*null/);
    const transactionIdx = CODE.indexOf("$transaction");
    expect(snapshotIdx).toBeGreaterThan(-1);
    expect(transactionIdx).toBeGreaterThan(-1);
    expect(snapshotIdx, "the snapshot refusal must be written before the transaction it guards").toBeLessThan(
      transactionIdx,
    );
  });
});

describe("reactivate-load-121495.ts writes the canonical audit row for a pre-snapshot restore", () => {
  it("calls recordLifecycleEvent", () => {
    expect(callsFunction(CODE, "recordLifecycleEvent")).toBe(true);
  });

  it("imports recordLifecycleEvent from the real module rather than reimplementing its shape", () => {
    // Item 3's own instruction was "by importing and calling
    // recordLifecycleEvent" -- a script that hand-rolled an AuditTrail.create
    // with the same field names would satisfy every other assertion here
    // while re-creating the dual-writer class lifecycleAudit.ts's header
    // warns against.
    expect(CODE).toMatch(/import\s*\{\s*recordLifecycleEvent\s*\}\s*from\s*"\.\.\/src\/lib\/lifecycleAudit"/);
  });

  it("passes actionDetail LOAD_UNCANCELLED", () => {
    const idx = CODE.indexOf("recordLifecycleEvent(");
    expect(idx, "recordLifecycleEvent call site not found").toBeGreaterThan(-1);
    const call = CODE.slice(idx, idx + 900);
    expect(call).toMatch(/actionDetail:\s*"LOAD_UNCANCELLED"/);
    expect(call, "entityType must be Load").toMatch(/entityType:\s*"Load"/);
  });

  it("is called only after the transaction has committed, matching the endpoint's own ordering", () => {
    // lib/lifecycleAudit.ts's own header: an audit write inside a transaction
    // that then rolled back would leave a row describing an act that never
    // happened. loadController.ts's uncancelLoadHandler calls
    // recordLifecycleEvent AFTER uncancelLoad resolves, not inside it.
    const txIdx = CODE.indexOf("$transaction");
    const auditIdx = CODE.indexOf("recordLifecycleEvent(");
    expect(txIdx).toBeGreaterThan(-1);
    expect(auditIdx).toBeGreaterThan(-1);
    expect(auditIdx, "recordLifecycleEvent must be written after the $transaction block").toBeGreaterThan(txIdx);
  });
});

describe("reactivate-load-121495.ts emits the carrier reinstatement notice", () => {
  it("calls createNotification, imported from the real service", () => {
    expect(callsFunction(CODE, "createNotification")).toBe(true);
    expect(CODE).toMatch(
      /import\s*\{\s*createNotification\s*\}\s*from\s*"\.\.\/src\/services\/notificationService"/,
    );
  });

  it("uses the SAME actionUrl shape as notifyCarrierReinstated", () => {
    // loadController.ts:1560-1571 — `/carrier/dashboard/my-loads?reinstated=${loadId}`.
    // A different query param or path would be a different notice, silently
    // unreadable by whatever the carrier portal renders for this one.
    expect(CODE).toMatch(/\/carrier\/dashboard\/my-loads\?reinstated=\$\{LOAD_ID\}/);
  });

  it("is idempotent on that actionUrl before creating a second notice", () => {
    const urlIdx = CODE.indexOf("/carrier/dashboard/my-loads?reinstated=");
    expect(urlIdx).toBeGreaterThan(-1);
    const window = CODE.slice(Math.max(0, urlIdx - 400), urlIdx + 600);
    expect(window, "a findFirst on actionUrl must guard the create").toMatch(/findFirst\(/);
    expect(window).toMatch(/actionUrl/);
  });

  it("gates the notice on the load actually having a carrier", () => {
    // Anchored to the notice itself. A bare if-load.carrierId regex is ALSO satisfied by the
    // dry-run print block further up, so it stayed green with this whole notice block deleted --
    // a case with no discriminating power for its own name (CLAUDE.md 19 Sub-pattern 16).
    const notice = CODE.indexOf("await createNotification(");
    expect(notice).toBeGreaterThan(-1);
    const guardBefore = CODE.lastIndexOf("if (load.carrierId) {", notice);
    expect(guardBefore).toBeGreaterThan(-1);
    // and it is the notice's own guard, not the dry-run print's a few hundred lines above
    expect(notice - guardBefore).toBeLessThan(600);
  });
});

describe("reactivate-load-121495.ts requires a reason and a resolvable actor", () => {
  it("parses --reason= and refuses below the endpoint's own minimum length", () => {
    expect(CODE).toMatch(/--reason=/);
    // uncancelLoadSchema (validators/load.ts:137) enforces a trimmed minimum
    // of 10. This does not hardcode "10" a second time -- it asserts a
    // MIN_REASON_LENGTH constant is compared against the trimmed reason and
    // that the value is not weaker than 10.
    const constMatch = /MIN_REASON_LENGTH\s*=\s*(\d+)/.exec(CODE);
    expect(constMatch, "MIN_REASON_LENGTH constant not found").not.toBeNull();
    const min = Number(constMatch![1]);
    expect(min, "must not be weaker than the endpoint's own 10-character minimum").toBeGreaterThanOrEqual(10);
    expect(CODE).toMatch(/REASON\.length\s*<\s*MIN_REASON_LENGTH/);
    expect(CODE).toMatch(/\.trim\(\)/);
  });

  it("refuses without a reason", () => {
    const idx = CODE.search(/REASON\.length\s*<\s*MIN_REASON_LENGTH/);
    expect(idx).toBeGreaterThan(-1);
    const window = CODE.slice(idx, idx + 300);
    expect(window, "an under-length reason must reach refuse()").toMatch(/refuse\(/);
  });

  it("parses --actor-email= and resolves it against the database rather than inventing a user id", () => {
    expect(CODE).toMatch(/--actor-email=/);
    expect(CODE, "the actor must be looked up, not fabricated").toMatch(/prisma\.user\.findUnique\(/);
    // The FK is required; a lookup that fails must refuse rather than proceed
    // with a null/undefined actor id.
    const idx = CODE.indexOf("prisma.user.findUnique(");
    const window = CODE.slice(idx, idx + 300);
    expect(window).toMatch(/if\s*\(\s*!actor\s*\)\s*refuse\(/);
  });

  it("refuses without --actor-email at all, before ever querying the database", () => {
    const idx = CODE.search(/if\s*\(\s*!ACTOR_EMAIL\s*\)/);
    expect(idx, "no early guard on an entirely absent --actor-email").toBeGreaterThan(-1);
    const window = CODE.slice(idx, idx + 200);
    expect(window).toMatch(/refuse\(/);
  });

  it("uses the resolved actor's id and email on the audit row, not a literal or an env var", () => {
    const idx = CODE.indexOf("recordLifecycleEvent(");
    const call = CODE.slice(idx, idx + 900);
    expect(call).toMatch(/actor:\s*\{\s*userId:\s*actor!?\.id,\s*email:\s*actor!?\.email\s*\}/);
  });
});

describe("reactivate-load-121495.ts sets the shared client's target before importing it", () => {
  // Item 3's ordering requirement, checked structurally: the assignment to
  // process.env.DATABASE_URL must appear in the source BEFORE the import of
  // "../src/config/database" (or anything that transitively pulls it in),
  // because TypeScript compiles `import` to `require()` at the position
  // written under module:"commonjs" -- not hoisted -- so source order here is
  // execution order.
  it("assigns process.env.DATABASE_URL before the config/database import", () => {
    const assignIdx = RAW.search(/process\.env\.DATABASE_URL\s*=/);
    const importIdx = RAW.search(/from\s+"\.\.\/src\/config\/database"/);
    expect(assignIdx, "no assignment to process.env.DATABASE_URL found").toBeGreaterThan(-1);
    expect(importIdx, "no import of ../src/config/database found").toBeGreaterThan(-1);
    expect(assignIdx, "the assignment must precede the import in source order").toBeLessThan(importIdx);
  });

  it("also propagates DIRECT_URL, matching applyCensusCredential's own reasoning", () => {
    // _census-credential.ts's own header: leaving DIRECT_URL unset would let
    // it fall through to backend/.env's LOCAL container while DATABASE_URL
    // points at the backfill target -- one script, two databases, in the
    // other direction from the problem this file's own header documents.
    expect(RAW).toMatch(/process\.env\.DIRECT_URL\s*=/);
  });

  it("refuses before either assignment when BACKFILL_DATABASE_URL is absent", () => {
    const presenceIdx = RAW.search(/if\s*\(\s*!BACKFILL_URL\s*\)/);
    const assignIdx = RAW.search(/process\.env\.DATABASE_URL\s*=\s*BACKFILL_URL/);
    expect(presenceIdx).toBeGreaterThan(-1);
    expect(assignIdx).toBeGreaterThan(-1);
    expect(presenceIdx).toBeLessThan(assignIdx);
    const window = RAW.slice(presenceIdx, assignIdx);
    expect(window, "the absent-URL branch must exit before assigning anything").toMatch(/process\.exit\(1\)/);
  });
});

describe("reactivate-load-121495.ts keeps its existing guards", () => {
  // Task item 5: do not weaken assertOutboundSilent, the --commit gate, the
  // reference check, or the transaction's moved.count check. Do not change
  // ALLOWED_RESTORE. Each assertion here is the same shape the ORIGINAL
  // script satisfied, so a regression on any one of them fails this file
  // rather than only being caught by re-reading a diff.
  it("still refuses when outbound keys are set", () => {
    expect(CODE).toMatch(/function assertOutboundSilent/);
    expect(CODE).toMatch(/RESEND_API_KEY.*OPENPHONE_API_KEY.*QUO_API_KEY/s);
  });

  it("still defaults to a dry run and only writes on --commit", () => {
    expect(CODE).toMatch(/const COMMIT = process\.argv\.includes\("--commit"\)/);
    expect(CODE).toMatch(/if\s*\(\s*!COMMIT\s*\)\s*\{/);
  });

  it("still refuses a reference-number mismatch", () => {
    expect(CODE).toMatch(/load\.referenceNumber\s*!==\s*LOAD_REF/);
  });

  it("still refuses if the scoped update moves anything other than exactly one row", () => {
    expect(CODE).toMatch(/moved\.count\s*!==\s*1/);
  });

  it("still declines --to=DELIVERED and --to=POD_RECEIVED with the money-paths explanation", () => {
    expect(CODE).toMatch(/RESTORE_STATUS === "DELIVERED"/);
    expect(CODE).toMatch(/RESTORE_STATUS === "POD_RECEIVED"/);
    expect(CODE).toMatch(/autoGenerateInvoice/);
  });

  it("has not renamed ALLOWED_RESTORE's members", () => {
    expect(CODE).toMatch(
      /ALLOWED_RESTORE\s*=\s*\[\s*"BOOKED",\s*"DISPATCHED",\s*"AT_PICKUP",\s*"LOADED",\s*"IN_TRANSIT",\s*"AT_DELIVERY",?\s*\]/,
    );
  });
});

describe("vacuity tripwire", () => {
  // §19 Sub-pattern 16, eleventh-and-onward fire: a scanner that silently
  // matches nothing reports a clean tree indistinguishable from a genuinely
  // clean one. Every describe block above is worthless if this file is
  // somehow reading zero bytes, an empty string, or the wrong path.
  it("actually read a non-trivial file", () => {
    expect(RAW.length, "the script file appears empty or unreadable").toBeGreaterThan(4000);
  });

  it("finds a known-present anchor string untouched by this arc, proving the read is real", () => {
    // A line that has been in this script since before C2 and is not part of
    // any assertion above -- if comment-stripping or the file path were
    // broken, this would fail exactly like everything else, which is the
    // point: an unrelated known-good anchor is what separates "the scanner
    // broke" from "the file changed".
    expect(RAW).toMatch(/cmuct8gnk001vma2db2hbgrsj/);
    expect(RAW).toMatch(/SHP-2026-010/);
  });

  it("comment-stripping actually removes a comment, so it cannot be silently inert", () => {
    const sample = stripComments('const x = 1; // recordLifecycleEvent mentioned only in a comment\nconst y = 2;');
    expect(sample).not.toMatch(/recordLifecycleEvent/);
    expect(sample).toMatch(/const y = 2;/);
    const blockSample = stripComments("/* createNotification named here too */\nconst z = 3;");
    expect(blockSample).not.toMatch(/createNotification/);
    expect(blockSample).toMatch(/const z = 3;/);
  });

  it("a prose-only mention of the two functions in the header comment does not, by itself, satisfy the code-shape checks", () => {
    // The header block above literally contains the words
    // "recordLifecycleEvent" and "createNotification" in prose. If
    // callsFunction() or the import-regexes matched comments, this test's own
    // fixture -- a file with the words in a comment and NO matching code --
    // would report a false positive. Prove the negative directly.
    const commentOnly = stripComments(
      "// this script should eventually call recordLifecycleEvent and createNotification\nconst noop = true;",
    );
    expect(callsFunction(commentOnly, "recordLifecycleEvent")).toBe(false);
    expect(callsFunction(commentOnly, "createNotification")).toBe(false);
  });
});
