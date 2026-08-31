/**
 * xff-drift — no source file may read X-Forwarded-For except lib/clientIp.ts.
 *
 * On the font-drift pattern: a CI-resident guard over the whole tree, so the
 * class cannot come back one call site at a time.
 *
 * WHY THE HEADER IS BANNED RATHER THAN DISCOURAGED. It is client-writable, and
 * every one of the seventeen reads this replaced took it FIRST with `req.ip`
 * only as a fallback — so a request carrying a forged header had that header
 * persisted as the caller's address, including on signed agreements. There is no
 * correct way to read it here: with `trust proxy` set, Express has already
 * consumed it into `req.ip`, and lib/clientIp decides the rest.
 *
 * SUB-PATTERN 16. A guard that only counts matches can pass while pointed at the
 * wrong tree, so this asserts its own reach: it must see a realistic number of
 * files AND must still find the header inside the one file allowed to mention it.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");
const ALLOWED = path.join("lib", "clientIp.ts");
const PATTERN = /x-forwarded-for/i;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("xff-drift", () => {
  const files = walk(SRC);

  it("sees the source tree it is meant to police", () => {
    // Vacuity tripwire: an empty or tiny corpus would make every other
    // assertion here pass without checking anything.
    expect(files.length, "walk found too few files to be policing the backend").toBeGreaterThan(150);
    expect(files.some((f) => f.endsWith(ALLOWED)), "lib/clientIp.ts not found").toBe(true);
  });

  it("the allowed file DOES mention the header — so the matcher demonstrably works", () => {
    // Without this, a broken regex would report a clean tree and look identical
    // to a healthy one.
    const allowed = files.find((f) => f.endsWith(ALLOWED))!;
    expect(PATTERN.test(fs.readFileSync(allowed, "utf8"))).toBe(true);
  });

  it("no other source file reads or mentions X-Forwarded-For", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (f.endsWith(ALLOWED)) continue;
      const text = fs.readFileSync(f, "utf8");
      text.split("\n").forEach((line, i) => {
        if (PATTERN.test(line)) offenders.push(`${path.relative(SRC, f)}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
    expect(
      offenders,
      `X-Forwarded-For must not be read outside lib/clientIp.ts — use clientIp(req).\n` +
      `It is client-writable, and reading it directly is how every executed agreement\n` +
      `before v3.8.awk came to carry a forged-or-edge address as the signer's IP.\n\n` +
      offenders.join("\n"),
    ).toEqual([]);
  });
});
