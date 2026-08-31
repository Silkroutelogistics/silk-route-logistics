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
    const mustGuard = Object.entries(pkg.scripts as Record<string, string>).filter(
      ([, v]) => /prisma\s+(migrate|db\s+push)|prisma\/seed\.ts/.test(v),
    );
    // Tripwire: if the scripts are renamed away, this loop would assert nothing.
    expect(mustGuard.length).toBeGreaterThanOrEqual(6);
    for (const [name, cmd] of mustGuard) {
      expect(cmd, `${name} does not run prisma-target-guard before the prisma command`)
        .toContain("prisma-target-guard.ts");
      expect(cmd.indexOf("prisma-target-guard.ts")).toBeLessThan(
        cmd.search(/prisma\s+(migrate|db\s+push)|ts-node prisma\/seed/),
      );
    }
  });

  it("package.json#prisma.seed is routed too — `prisma db seed` bypasses npm scripts", () => {
    expect(pkg.prisma?.seed).toContain("prisma-target-guard.ts");
  });

  it("generate is deliberately NOT guarded — it touches no database", () => {
    expect(pkg.scripts["prisma:generate"]).not.toContain("prisma-target-guard");
  });
});
