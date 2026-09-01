/**
 * §21.1's "not built" list must not claim something that IS built.
 *
 * THE FAILURE THIS EXISTS FOR. v3.8.asb built the carrier-side pilot request
 * endpoint and applied the pilot migration. §21.1's "Ratified-pending — NOT
 * built" list was never updated, and for two weeks it said:
 *
 *   "There is no carrier-side request endpoint. The only way to ask is the
 *    onboarding tick... Until POST /carrier-auth/quickpay-request lands, the
 *    portal routes those carriers to operations@."
 *
 * On 2026-08-31 that was read as current, quoted to Wasi as a live gap, and was
 * one step from justifying a rebuild of an endpoint that already existed and was
 * already wired to the portal.
 *
 * A "NOT built" list is the most dangerous documentation to leave stale, because
 * it is read exactly when somebody is deciding whether to build something. A
 * stale entry there does not merely misinform — it commissions duplicate work.
 *
 * §19 Sub-pattern 15 (backlog-row-drift): a doc's claim about code is a signal,
 * never authority. This turns the specific claims into assertions against source
 * so the drift fails CI instead of costing a sprint.
 *
 * CORRECTION HISTORY IS PRESERVED, NOT FORBIDDEN. The struck-through form
 * (~~...~~) is how this repo records what a section used to say, so the check
 * targets LIVE claims only — a claim inside strikethrough is history and must
 * keep working.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const REPO = join(__dirname, "../../../../");
const read = (p: string) => readFileSync(join(REPO, p), "utf8").replace(/\r\n/g, "\n");

const claudeMd = read("CLAUDE.md");
const carrierAuth = read("backend/src/routes/carrierAuth.ts");

/** §21.1 only — a claim elsewhere in the file is not this section's business. */
const section = (() => {
  const start = claudeMd.indexOf("### §21.1");
  const end = claudeMd.indexOf("### §21.2");
  return start >= 0 && end > start ? claudeMd.slice(start, end) : "";
})();

/** Strip ~~struck~~ spans: those are correction history, not live claims. */
const liveClaims = section.replace(/~~[\s\S]*?~~/g, "");

function frontendCalls(path: string): boolean {
  let found = false;
  const walk = (dir: string) => {
    if (found) return;
    for (const name of readdirSync(dir)) {
      if (found) return;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      if (readFileSync(p, "utf8").includes(path)) found = true;
    }
  };
  walk(join(REPO, "frontend/src"));
  return found;
}

describe("§21.1 pilot claims match the code", () => {
  it("the section was located and parsed (tripwire)", () => {
    // Without this, a renamed heading would make every assertion below pass
    // against an empty string — the vacuous-pass shape this file is about.
    expect(section.length, "§21.1 not found in CLAUDE.md").toBeGreaterThan(500);
    expect(liveClaims.length, "live-claim text parsed empty").toBeGreaterThan(200);
  });

  it("the carrier-side pilot request endpoint EXISTS", () => {
    expect(carrierAuth).toContain('router.post("/quickpay-pilot-request"');
  });

  it("and the portal actually calls it", () => {
    // Built-but-orphaned would make the doc's claim arguably true in spirit.
    expect(
      frontendCalls("/carrier-auth/quickpay-pilot-request"),
      "no frontend caller found for the pilot request endpoint",
    ).toBe(true);
  });

  it("so §21.1 must NOT still claim there is no such endpoint", () => {
    expect(
      liveClaims,
      "§21.1 claims the carrier-side request endpoint is missing, but it exists and is wired",
    ).not.toMatch(/there is no carrier-side request endpoint/i);
  });

  it("the pilot migration is live, not pending, so §21.1 must not call it unapplied", () => {
    const pending = join(REPO, "backend/prisma/_pending_migrations");
    const live = readdirSync(join(REPO, "backend/prisma/migrations"));
    const name = "20260816120000_document_numbers_quickpay_pilot_accessorial_uniqueness";
    expect(live, "the pilot migration is not in the live migrations dir").toContain(name);
    if (existsSync(pending)) {
      expect(readdirSync(pending), "the pilot migration is sitting in _pending_migrations").not.toContain(name);
    }
    expect(
      liveClaims,
      "§21.1 still calls the pilot migration unapplied",
    ).not.toMatch(/migration is authored but NOT applied/i);
  });

  it("the claim that IS still true stays stated — approval alone does not enable", () => {
    // The inverse risk: correcting a stale list by deleting all of it. This one
    // was verified true and must survive, or the next reader assumes approval
    // switches Quick Pay on and starts debugging the wrong thing.
    expect(liveClaims).toMatch(/Approval does not switch Quick Pay on/i);
    // And the code half of it: approve must not write the enable flag.
    const controller = read("backend/src/controllers/carrierController.ts");
    const approveIdx = controller.indexOf("quickpay/approve");
    expect(approveIdx, "approve endpoint comment not found").toBeGreaterThan(0);
    const approveBody = controller.slice(approveIdx, approveIdx + 3000);
    expect(approveBody, "approve now writes quickPayEnabled — §21.1 needs updating").not.toContain(
      "quickPayEnabled: true",
    );
  });
});
