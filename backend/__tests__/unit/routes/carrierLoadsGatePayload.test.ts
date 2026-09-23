/**
 * C6a — the carrier portal is sent the two facts its BOL gate reads, and none
 * of the evidence behind them.
 *
 * The backend gate is `carrierAcceptedAt OR a signed rate confirmation` (bgs).
 * The portal mirrored the OLD gate (a tender at CONFIRMED) because neither
 * fact was in its payload — the list enumerates its select explicitly, so a
 * column added to Load does not arrive here by itself.
 *
 * Read from SOURCE rather than by driving the route: the property is which
 * fields the query asks for, and a mocked Prisma returns whatever the mock is
 * told to regardless of the select. Driving it would prove the mock, not the
 * query.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "../../../src/routes/carrierLoads.ts");
const raw = fs.readFileSync(SRC, "utf8");

/** Line comments then block comments — a "//" inside a block must not eat the file. */
const src = raw
  .split(/\r?\n/)
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of a named route handler, brace-matched from its opening. */
function queryAfter(marker: string): string {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error(`marker not found: ${marker}`);
  // Far enough to cover the select/include block without running into the next route.
  return src.slice(i, i + 3000);
}

describe("the gate facts reach the carrier", () => {
  it("the my-loads LIST selects carrierAcceptedAt", () => {
    // It enumerates its select, so this had to be added by hand. Before C6 the
    // strip mirrored a gate the backend had stopped using.
    expect(queryAfter('router.get("/my-loads"')).toMatch(/carrierAcceptedAt:\s*true/);
  });

  it("the my-loads LIST selects signed-rate-confirmation presence", () => {
    expect(queryAfter('router.get("/my-loads"')).toMatch(/rateConfirmations:\s*signedRcPresence/);
  });

  it("the DETAIL selects signed-rate-confirmation presence", () => {
    // carrierAcceptedAt already arrives here: the detail uses `include`, so
    // every Load scalar comes back. The signed half was the gap, and the BOL
    // button reads this payload.
    expect(queryAfter('router.get("/:id"')).toMatch(/rateConfirmations:\s*signedRcPresence/);
  });
});

describe("presence is all that travels", () => {
  it("the shared selector asks for the id and nothing else", () => {
    const m = src.match(/const signedRcPresence\s*=\s*\{[\s\S]*?\}\s*as const;/);
    expect(m, "signedRcPresence not found").toBeTruthy();
    const sel = m![0];

    expect(sel).toMatch(/where:\s*\{\s*signed:\s*true\s*\}/);
    expect(sel).toMatch(/select:\s*\{\s*id:\s*true\s*\}/);

    // The evidence stays on the AE side. A carrier is shown their own document;
    // they are not shown the IP SRL recorded, the hash of the bytes, or the
    // storage key — that is SRL's evidence ABOUT them.
    for (const leak of ["signerIp", "signerName", "signerUserAgent", "contentHash", "signedUrl"]) {
      expect(sel, `${leak} must not be selected for a carrier`).not.toContain(leak);
    }
  });

  it("no carrier route selects signature evidence anywhere", () => {
    // Widened beyond the one selector on purpose: the rule is about the
    // SURFACE, not about one query that happens to be written correctly today.
    for (const leak of ["signerIp", "signerUserAgent", "signedUrl"]) {
      expect(src, `${leak} must not appear in a carrier route`).not.toContain(leak);
    }
  });

  it("reads a real file — the tripwire, so a broken path cannot pass vacuously", () => {
    expect(raw.length).toBeGreaterThan(5000);
    expect(src).toContain('router.get("/my-loads"');
    expect(src).toContain('router.get("/:id"');
  });
});
