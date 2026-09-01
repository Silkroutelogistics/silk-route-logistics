/**
 * The signing token, and the properties that make it evidence rather than a link.
 *
 * The behavioural half asserts the two orderings that decide what a carrier is
 * told, because those are the design and not an implementation detail.
 *
 * The structural half asserts the secret never reaches the database. That is
 * not something a unit test can observe by calling the function, so it is
 * asserted over the source of every writer: a row that yields a working signing
 * link is a row that lets anyone who can read the table sign on a carrier's
 * behalf.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  mintRcSignToken, hashRcSignToken, checkSignToken, hashPdfBytes, rcSignUrl,
} from "../../../src/lib/rcSignToken";

describe("minting", () => {
  it("the stored hash is not the secret", () => {
    const m = mintRcSignToken();
    expect(m.tokenHash).not.toBe(m.token);
    expect(m.tokenHash).toBe(hashRcSignToken(m.token));
  });

  it("two tokens are never the same", () => {
    const a = mintRcSignToken(), b = mintRcSignToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenId).not.toBe(b.tokenId);
  });

  it("expiry matches the SLA an AE is chased on", () => {
    // One number for both. An AE told the RC is overdue at the same moment the
    // carrier's link dies is an AE chasing something still fixable; two numbers
    // means chasing a carrier whose link expired hours ago.
    const before = Date.now();
    const m = mintRcSignToken();
    const hours = (m.expiresAt.getTime() - before) / 3600_000;
    expect(hours).toBeGreaterThan(3.9);
    expect(hours).toBeLessThan(4.2);
  });

  it("the link carries the secret, not the id", () => {
    const m = mintRcSignToken();
    expect(rcSignUrl(m.token)).toContain(m.token);
    expect(rcSignUrl(m.token)).not.toContain(m.tokenHash);
  });
});

describe("what a carrier is told when the link does not work", () => {
  const live = { signTokenHash: "h", signTokenUsedAt: null, signTokenExpiresAt: new Date(Date.now() + 3600_000) };

  it("a good token is good", () => {
    expect(checkSignToken(live)).toEqual({ ok: true });
  });

  it("already signed outranks expired", () => {
    // A carrier who signed and clicks their old link must be told the signature
    // landed. "Expired" sends them chasing an AE over work that is done.
    const both = { signTokenHash: "h", signTokenUsedAt: new Date(), signTokenExpiresAt: new Date(Date.now() - 1) };
    expect(checkSignToken(both)).toEqual({ ok: false, reason: "ALREADY_USED" });
  });

  it("single use is enforced by the row, not by a blacklist", () => {
    expect(checkSignToken({ ...live, signTokenUsedAt: new Date() }).ok).toBe(false);
  });

  it("expiry is exclusive at the boundary", () => {
    const now = new Date();
    expect(checkSignToken({ ...live, signTokenExpiresAt: now }, now).ok).toBe(false);
  });

  it("an RC that was never issued a token is NOT_FOUND, not EXPIRED", () => {
    expect(checkSignToken({ signTokenHash: null, signTokenUsedAt: null, signTokenExpiresAt: null }))
      .toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("the content hash", () => {
  it("the same bytes hash the same and different bytes do not", () => {
    const a = Buffer.from("%PDF-1.4 rate confirmation");
    expect(hashPdfBytes(a)).toBe(hashPdfBytes(Buffer.from("%PDF-1.4 rate confirmation")));
    expect(hashPdfBytes(a)).not.toBe(hashPdfBytes(Buffer.from("%PDF-1.4 rate confirmatioN")));
  });

  it("is 64 hex characters", () => {
    expect(hashPdfBytes(Buffer.from("x"))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the secret never reaches the database", () => {
  const SRC = path.resolve(__dirname, "../../../src");

  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(path.join(dir, e.name))
        : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []);

  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  // RHS values that CANNOT name a variable, and so can never be a write.
  //
  // Two non-write positions read identically to an assignment: a type
  // annotation (`signTokenHash: string | null` in a parameter) and a Prisma
  // SELECT (`select: { signTokenHash: true }`). Every entry here is either a
  // reserved word or a type name, so excluding them cannot hide a real writer.
  const NOT_A_WRITE = new Set([
    "string", "Date", "number", "boolean", "null", "undefined", "any", "unknown",
    "true", "false",
  ]);

  it("no writer persists signTokenHash from anything but the hash helper", () => {
    // The failure this prevents is a one-character slip -- `signTokenHash:
    // token` instead of `signTokenHash: tokenHash` -- which compiles, passes
    // every behavioural test, and puts a working signing link in a column that
    // support staff and any read-only report can see.
    const offenders: string[] = [];
    for (const f of files(SRC)) {
      const src = strip(fs.readFileSync(f, "utf8"));
      for (const m of src.matchAll(/signTokenHash\s*:\s*([A-Za-z0-9_.]+)/g)) {
        const rhs = m[1];
        // A type annotation reads identically to an assignment to this regex --
        // `signTokenHash: string | null` in a parameter is not a write. Excluded
        // by RHS, which is sound because none of these can name a value: a
        // variable called `string` would not survive review, let alone compile
        // in the position that matters. Stated rather than hidden, because the
        // guard is blind to a variable that happens to bear one of these names.
        if (NOT_A_WRITE.has(rhs)) continue;
        const okRhs = /tokenHash$/.test(rhs) || /^hashRcSignToken/.test(rhs);
        if (!okRhs) offenders.push(`${path.relative(SRC, f)} -> signTokenHash: ${rhs}`);
      }
    }
    expect(offenders, "a raw token stored in signTokenHash is a signing link anyone with table access can use").toEqual([]);
  });

  it("the scan reaches real files (vacuity tripwire)", () => {
    // A walk that has stopped matching reports a clean tree forever.
    const all = files(SRC);
    expect(all.length).toBeGreaterThan(200);
    expect(all.some((f) => f.endsWith(path.join("lib", "rcSignToken.ts")))).toBe(true);
  });
});
