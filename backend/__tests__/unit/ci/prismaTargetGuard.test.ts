/**
 * The Prisma target guard refuses a non-local database unless told, once,
 * explicitly.
 *
 * WHY THIS EXISTS, AND WHY THE SECOND CASE IS THE IMPORTANT ONE.
 *
 * An audit reported "the Prisma CLI ignores an exported DATABASE_URL and
 * resolves to Neon." That diagnosis was wrong. Prisma loads .env with a plain
 * `dotenv.config({ path })` and no `override`, so an exported variable does win.
 *
 * What actually happens is that migrate and db push read `directUrl`
 * (prisma/schema.prisma:27), not `url`. Exporting only DATABASE_URL points the
 * RUNTIME at localhost while every migrate command still reaches production
 * through DIRECT_URL — and the shell looks local to whoever typed it. The only
 * visible tell was one substring in a hostname: the printed host had no
 * `-pooler`, which is DIRECT_URL's host and not DATABASE_URL's.
 *
 * So `refuses when ONLY DATABASE_URL is overridden` is the case that encodes the
 * real trap. If someone later "simplifies" the guard to read DATABASE_URL for
 * every command class, that test goes red and this comment explains why.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import {
  evaluate,
  variableFor,
  hostOf,
  isLocalHost,
  readFromEnvFile,
} from "../../../scripts/prisma-target-guard";

const NEON_POOLED = "postgresql://u:p@ep-green-frog-ajsgv9me-pooler.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require";
const NEON_DIRECT = "postgresql://u:p@ep-green-frog-ajsgv9me.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require";
const LOCAL = "postgresql://srl:srl_local_dev@localhost:5433/srl_e2e?sslmode=disable";

/** A .env carrying the shape this repo actually has: both vars, both Neon. */
function neonEnvFile(): string {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ptg-")), ".env");
  fs.writeFileSync(f, `DATABASE_URL=${NEON_POOLED}\nDIRECT_URL="${NEON_DIRECT}"\n`);
  return f;
}

describe("prisma target guard — which variable each command class reads", () => {
  it("migrate and push resolve DIRECT_URL; seed resolves DATABASE_URL", () => {
    // This mapping is the guard's whole correctness claim. schema.prisma:27
    // declares directUrl, and migrate honours it.
    expect(variableFor("migrate")).toBe("DIRECT_URL");
    expect(variableFor("push")).toBe("DIRECT_URL");
    expect(variableFor("seed")).toBe("DATABASE_URL");
  });

  it("process.env beats the .env file, matching dotenv-without-override", () => {
    const envFile = neonEnvFile();
    const v = evaluate("migrate", { DIRECT_URL: LOCAL }, envFile);
    expect(v.source).toBe("process.env");
    expect(v.host).toBe("localhost:5433");
  });
});

describe("prisma target guard — refusal", () => {
  it("REFUSES a Neon-shaped host with no override", () => {
    const v = evaluate("migrate", {}, neonEnvFile());
    expect(v.ok).toBe(false);
    expect(v.host).toContain("neon.tech");
    expect(v.reason).toMatch(/NON-LOCAL/);
  });

  it("REFUSES when ONLY DATABASE_URL is overridden — the actual trap", () => {
    // The shell looks local. It is not: migrate reads DIRECT_URL, which is
    // still Neon. This is the case the audit misdiagnosed.
    const v = evaluate("migrate", { DATABASE_URL: LOCAL }, neonEnvFile());
    expect(v.ok, "overriding DATABASE_URL alone must NOT satisfy a migrate guard").toBe(false);
    expect(v.key).toBe("DIRECT_URL");
    expect(v.host).toContain("neon.tech");
    expect(v.host).not.toContain("-pooler"); // it is the direct host, not the pooled one
  });

  it("REFUSES when the variable resolves to nothing at all", () => {
    const empty = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ptg-")), ".env");
    fs.writeFileSync(empty, "# nothing here\n");
    const v = evaluate("migrate", {}, empty);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/resolves to nothing/);
  });
});

describe("prisma target guard — permission", () => {
  it("PERMITS a Neon host when PRISMA_TARGET=production is set for that invocation", () => {
    const v = evaluate("migrate", { PRISMA_TARGET: "production" }, neonEnvFile());
    expect(v.ok).toBe(true);
    expect(v.host).toContain("neon.tech");
    expect(v.reason).toMatch(/explicitly overridden/);
  });

  it("PERMITS localhost and 127.0.0.1 without any override", () => {
    for (const url of [LOCAL, "postgresql://u:p@127.0.0.1:5432/x"]) {
      const v = evaluate("migrate", { DIRECT_URL: url }, neonEnvFile());
      expect(v.ok, `${url} should be permitted`).toBe(true);
    }
  });

  it("does not treat a lookalike hostname as local", () => {
    // "localhost.evil.com" and "notlocalhost" must not pass a substring check.
    for (const h of ["localhost.evil.com", "notlocalhost", "127.0.0.1.evil.com"]) {
      expect(isLocalHost(h), `${h} must not be treated as local`).toBe(false);
    }
  });
});

describe("prisma target guard — parsing", () => {
  it("extracts the host even when the password contains @ or /", () => {
    expect(hostOf("postgresql://user:p%40ss%2Fword@localhost:5433/db")).toBe("localhost:5433");
    expect(hostOf(NEON_DIRECT)).toBe("ep-green-frog-ajsgv9me.c-3.us-east-2.aws.neon.tech");
  });

  it("reads quoted and unquoted .env values, and ignores comments", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ptg-")), ".env");
    fs.writeFileSync(f, `# DATABASE_URL=postgresql://decoy@evil/x\nDATABASE_URL=${LOCAL}\nDIRECT_URL="${NEON_DIRECT}"\n`);
    expect(readFromEnvFile(f, "DATABASE_URL")).toBe(LOCAL);
    expect(readFromEnvFile(f, "DIRECT_URL")).toBe(NEON_DIRECT); // quotes stripped
    expect(readFromEnvFile(f, "NOT_THERE")).toBeUndefined();
  });
});

describe("prisma target guard — the npm scripts actually route through it", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf8"),
  );

  it("every schema-touching script calls the guard first", () => {
    // Schema-MUTATING commands only. The seed is deliberately excluded — the
    // dedicated case below records why chaining it was actively harmful.
    const mustGuard = Object.entries(pkg.scripts as Record<string, string>).filter(
      ([, v]) => /prisma\s+(migrate|db\s+push)/.test(v),
    );
    // Tripwire: if the scripts are renamed away, this loop would assert nothing.
    expect(mustGuard.length).toBeGreaterThanOrEqual(5);
    for (const [name, cmd] of mustGuard) {
      expect(cmd, `${name} does not run prisma-target-guard before the prisma command`)
        .toContain("prisma-target-guard.ts");
      expect(cmd.indexOf("prisma-target-guard.ts")).toBeLessThan(
        cmd.search(/prisma\s+(migrate|db\s+push)/),
      );
    }
  });

  it("the seed is NOT chained through the guard — Prisma runs it without a shell", () => {
    // This assertion is INVERTED from how it first shipped, because how it
    // shipped broke CI. `prisma db seed` does not run its command through a
    // shell, so `guard && ts-node seed.ts` was tokenised and the guard was
    // handed "&&", "npx", "ts-node", "prisma/seed.ts" as ARGUMENTS. It read
    // argv[2]="seed", passed, exited 0 — and the real seed never ran. Prisma
    // reported "The seed command has been executed." 25ms later. No fixtures
    // existed, so /api/auth/e2e-token 404'd and the E2E suite failed.
    //
    // The seed does not need the chain. prisma/seed.ts calls its own
    // assertNotProduction() at the top of main(), before the TRUNCATE, and it
    // fails CLOSED on an absent DATABASE_URL. That is strictly stronger here,
    // and it cannot be defeated by how the command is invoked.
    expect(pkg.prisma?.seed).toBe("npx ts-node prisma/seed.ts");
    expect(pkg.scripts["prisma:seed"]).toBe("npx ts-node prisma/seed.ts");
  });

  it("the seed's own guard is CALLED before the TRUNCATE, not merely defined", () => {
    // Presence is not function (§19 Sub-pattern 16). A definition with no call
    // site protects nothing, and a call after the TRUNCATE protects nothing.
    //
    // Anchor on the EXECUTED statement, not the word. The first draft of this
    // case searched for "TRUNCATE" and matched the header comment's phrase
    // "before the TRUNCATE below" at byte 677 — prose, 2.4kB above the code it
    // describes. A guard satisfied by a comment about itself is the same
    // failure it is written to prevent.
    const seed = fs.readFileSync(path.resolve(__dirname, "../../../prisma/seed.ts"), "utf8");
    const call = seed.search(/^\s*assertNotProduction\(\);/m);
    const truncate = seed.indexOf("$executeRawUnsafe(`TRUNCATE TABLE");
    expect(call, "assertNotProduction() is never called").toBeGreaterThan(-1);
    expect(truncate, "seed no longer executes TRUNCATE — re-check this guard's placement").toBeGreaterThan(-1);
    expect(call, "the guard must run BEFORE the TRUNCATE executes").toBeLessThan(truncate);
  });

  it("generate is deliberately NOT guarded — it touches no database", () => {
    expect(pkg.scripts["prisma:generate"]).not.toContain("prisma-target-guard");
  });
});
