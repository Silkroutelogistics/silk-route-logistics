// Migration files check out with LF on every machine (ruled 2026-09-26).
//
// WHY. `prisma migrate deploy` stores the SHA-256 of each migration.sql as it
// read it from disk. With core.autocrlf=true a Windows working copy is CRLF, so
// a migration applied from a Windows shell stores a CRLF hash while Render and
// CI hash the LF file git holds. That happened to
// 20260926140000_invoice_delivery_channel; its stored checksum stays as it is.
// The .gitattributes rule makes the working copy LF whatever autocrlf says.
//
// This asks git itself rather than reading .gitattributes as text, so it fails
// if the rule is dropped, narrowed, or stops matching the directory.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import * as path from "path";

const ROOT = path.join(__dirname, "../../../..");
const MIGRATIONS = "backend/prisma/migrations";

// One row per tracked file: "i/lf    w/crlf  attr/text eol=lf      \t<path>".
// The attr column can contain spaces, so split on the tab, not on whitespace.
const rows = execFileSync("git", ["ls-files", "--eol", "--", MIGRATIONS], { cwd: ROOT, encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const tab = line.indexOf("\t");
    return { info: line.slice(0, tab), file: line.slice(tab + 1) };
  });

describe("migration files check out with LF", () => {
  it("sees the whole migrations directory (vacuity tripwire)", () => {
    expect(rows.length).toBeGreaterThan(80);
    expect(rows.some((r) => r.file.endsWith("migration_lock.toml"))).toBe(true);
  });

  it("every file under migrations resolves eol=lf", () => {
    expect(rows.filter((r) => !/\beol=lf\b/.test(r.info)).map((r) => r.file)).toEqual([]);
  });

  it("every file under migrations is stored with LF in the index", () => {
    expect(rows.filter((r) => !r.info.startsWith("i/lf")).map((r) => r.file)).toEqual([]);
  });
});
