/**
 * Tender fan-out — who is allowed to declare a load PARALLEL.
 *
 * The rule the flag exists for: a SEQUENTIAL load has at most one tender in a
 * LIVE state (OFFERED or COUNTERED) at a time, so it cannot be accepted twice.
 * Behaviour is proven in scripts/_arc-tender-fanout-proof.ts (14 cases against a
 * real database).
 *
 * These are the structural halves. A behavioural proof cannot see a writer
 * nobody happened to call, and the danger here is not a bad broadcast -- it is a
 * SECOND path quietly flipping a load to PARALLEL and thereby disabling the rule
 * for it. One escape hatch is a policy; two is an accident waiting.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : [],
  );
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");

describe("only broadcast may declare a load PARALLEL", () => {
  const ALLOWED = new Set(["services/broadcastTenderService.ts"]);

  const parallelWriters = () => {
    const found: string[] = [];
    for (const f of walk(SRC)) {
      const s = strip(fs.readFileSync(f, "utf8"));
      if (/tenderFanout:\s*"PARALLEL"/.test(s)) found.push(rel(f));
    }
    return found.sort();
  };

  it("nothing outside launchBroadcast sets PARALLEL", () => {
    const offenders = parallelWriters().filter((f) => !ALLOWED.has(f));
    expect(
      offenders,
      "a second path declares a load PARALLEL. That disables the one-live-tender " +
        "rule for it, so the load can be accepted twice. If a new path genuinely " +
        "fans out, add it here WITH the reason.",
    ).toEqual([]);
  });

  it("broadcast still sets it (vacuity tripwire)", () => {
    // If nobody sets PARALLEL, the assertion above passes over nothing -- and
    // broadcast would be silently refused its own second tender.
    expect(parallelWriters()).toContain("services/broadcastTenderService.ts");
  });

  it("broadcast declares the fan-out BEFORE it creates tenders", () => {
    // Ordering is load-bearing rather than stylistic: createTender reads the
    // flag, so setting it after the first tender would refuse the second.
    const s = strip(fs.readFileSync(path.join(SRC, "services/broadcastTenderService.ts"), "utf8"));
    const flag = s.indexOf('tenderFanout: "PARALLEL"');
    const create = s.indexOf("createTender(");
    expect(flag, "broadcast no longer sets the flag").toBeGreaterThan(-1);
    expect(create, "broadcast no longer creates tenders").toBeGreaterThan(-1);
    expect(flag, "the flag must be set before the tenders are created").toBeLessThan(create);
  });
});

describe("the uniqueness rule is enforced where tenders are made", () => {
  const svc = () => strip(fs.readFileSync(path.join(SRC, "services/tenderCreationService.ts"), "utf8"));

  it("createTender checks the fan-out before creating", () => {
    const s = svc();
    const check = s.indexOf("tenderFanout");
    const create = s.indexOf("loadTender.create(");
    expect(check, "the fan-out check is gone from createTender").toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(-1);
    expect(check, "the check must run before the row is written").toBeLessThan(create);
  });

  it("LIVE includes COUNTERED, not just OFFERED", () => {
    // The omission that let six hand-rolled sibling sweeps disagree with each
    // other before v3.8.axj. A countered tender is still a live offer.
    const s = svc();
    const seg = s.slice(s.indexOf("tenderFanout"), s.indexOf("loadTender.create("));
    expect(seg, "the live-state check must treat COUNTERED as live").toContain("COUNTERED");
  });

  it("the refusal carries a code and the live tender id", () => {
    // The error handler masks err.message in production, so a bare throw would
    // reach an AE as "Internal server error". The code and the id are what make
    // the refusal actionable.
    const s = svc();
    expect(s).toContain("SEQUENTIAL_TENDER_CONFLICT");
    expect(s).toMatch(/liveTenderId\s*=/);
    expect(s).toMatch(/status\s*=\s*409/);
  });
});
