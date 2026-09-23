/**
 * The two credential-shape guards, pinned so they cannot regress silently.
 *
 * Both exist because a guard that watches one half of a pair says nothing about
 * the other half. check-direct-url.js asserted DIRECT_URL is NOT pooled and
 * nothing asserted DATABASE_URL IS -- so the pooled endpoint went missing from
 * backend/.env.production.local and every check still passed (§13.3 Item 303 b1).
 * The census resolver refuses the owner role, which is the property that makes a
 * census unable to write regardless of what any individual script remembers to
 * set; nothing held that refusal in place until this file.
 *
 * Each block carries a CONTROL that must be ACCEPTED. Without one a guard suite
 * can pass by refusing everything, which proves nothing about what it catches.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import { resolveCensusCredential } from "../../../scripts/_census-credential";

const BACKEND = path.resolve(__dirname, "../../..");
const GUARD = path.join(BACKEND, "scripts", "check-direct-url.js");

const NEON_DIRECT = "ep-x-ajs.c-3.us-east-2.aws.neon.tech";
const NEON_POOLED = "ep-x-ajs-pooler.c-3.us-east-2.aws.neon.tech";
const pg = (host: string) => `postgresql://u:p@${host}/db`;

function runGuard(env: Record<string, string | undefined>) {
  const e: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete e[k];
    else e[k] = v;
  }
  const r = spawnSync(process.execPath, [GUARD], { encoding: "utf8", env: e });
  const banner = /❌ (DATABASE_URL|DIRECT_URL)/.exec(r.stderr ?? "")?.[1] ?? null;
  return { code: r.status, banner, stderr: r.stderr ?? "" };
}

describe("check-direct-url.js — both halves of the pair", () => {
  it("CONTROL: pooled DATABASE_URL + direct DIRECT_URL is accepted", () => {
    const r = runGuard({ DATABASE_URL: pg(NEON_POOLED), DIRECT_URL: pg(NEON_DIRECT) });
    expect(r.code).toBe(0);
    expect(r.banner).toBeNull();
  });

  it("refuses a Neon DATABASE_URL that is NOT pooled — the b1 shape", () => {
    const r = runGuard({ DATABASE_URL: pg(NEON_DIRECT), DIRECT_URL: pg(NEON_DIRECT) });
    expect(r.code).toBe(1);
    // The banner matters: a DIRECT_URL banner here would mean the OLD rule
    // fired and the new one is still absent.
    expect(r.banner).toBe("DATABASE_URL");
  });

  it("stays silent for a non-Neon host — CI and the E2E runner have no pooler", () => {
    const local = "postgresql://ci:ci@localhost:5432/ci";
    const r = runGuard({ DATABASE_URL: local, DIRECT_URL: local });
    expect(r.code).toBe(0);
  });

  it("still refuses a pooled DIRECT_URL (the original rule, unchanged)", () => {
    const r = runGuard({ DATABASE_URL: pg(NEON_POOLED), DIRECT_URL: pg(NEON_POOLED) });
    expect(r.code).toBe(1);
    expect(r.banner).toBe("DIRECT_URL");
  });

  it("still refuses an absent DIRECT_URL (the original rule, unchanged)", () => {
    const r = runGuard({ DATABASE_URL: pg(NEON_POOLED), DIRECT_URL: undefined });
    expect(r.code).toBe(1);
    expect(r.banner).toBe("DIRECT_URL");
  });
});

describe("census credential resolver — the role is the enforcement, not the session setting", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "srl-cred-"));
  const write = (name: string, body: string) => {
    const f = path.join(tmp, name);
    fs.writeFileSync(f, body);
    return f;
  };

  afterEach(() => vi.restoreAllMocks());

  /** die() ends the process; make that observable instead of fatal. */
  function resolve(file: string) {
    const exit = vi.spyOn(process, "exit").mockImplementation(((): never => {
      throw new Error("__EXIT__");
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const t = resolveCensusCredential(file);
      return { refused: false as const, user: t.user };
    } catch (e) {
      if ((e as Error).message === "__EXIT__") return { refused: true as const, user: null };
      throw e;
    } finally {
      exit.mockRestore();
    }
  }

  it("CONTROL: a read-only Neon URL is accepted", () => {
    const f = write("ok.env", `DATABASE_URL=postgresql://srl_readonly:p@${NEON_POOLED}/db`);
    const r = resolve(f);
    expect(r.refused).toBe(false);
    expect(r.user).toBe("srl_readonly");
  });

  it("refuses the owner role — a census must not hold a credential that can write", () => {
    const f = write("owner.env", `DATABASE_URL=postgresql://neondb_owner:p@${NEON_POOLED}/db`);
    expect(resolve(f).refused).toBe(true);
  });

  it("refuses a non-Neon host — 'not localhost' would accept the whole internet", () => {
    const f = write("host.env", "DATABASE_URL=postgresql://srl_readonly:p@evil.example.com/db");
    expect(resolve(f).refused).toBe(true);
  });

  it("refuses a file with no DATABASE_URL, and an absent file", () => {
    expect(resolve(write("empty.env", "SOMETHING=1")).refused).toBe(true);
    expect(resolve(path.join(tmp, "does-not-exist.env")).refused).toBe(true);
  });
});
