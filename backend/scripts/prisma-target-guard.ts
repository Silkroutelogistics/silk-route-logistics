/**
 * PRISMA TARGET GUARD — fail-closed preflight for every schema-touching command.
 *
 * WHY, AND WHAT THE ACTUAL TRAP IS.
 *
 * An audit reported that "the Prisma CLI ignores an exported DATABASE_URL and
 * resolves to Neon". That was WRONG, and the truth is worse for being quieter.
 *
 * Prisma's CLI loads .env with a plain `dotenv.config({ path })` and NO
 * `override`, so an exported variable DOES win. What actually happened is that
 * `prisma migrate status` reads `directUrl`, not `url`:
 *
 *     prisma/schema.prisma:26   url       = env("DATABASE_URL")
 *     prisma/schema.prisma:27   directUrl = env("DIRECT_URL")
 *
 * Exporting only DATABASE_URL therefore points the RUNTIME at localhost while
 * every migrate command still goes to production through DIRECT_URL — and the
 * shell looks, to the person typing it, exactly like a local setup. The host
 * Prisma printed in that session had no `-pooler` in it, which is DIRECT_URL's
 * hostname and not DATABASE_URL's. That is the whole tell, and it is one
 * character wide.
 *
 * So this guard resolves THE SAME VARIABLE the command class will use, through
 * the same precedence, and refuses anything that is not local.
 *
 * PRECEDENCE, as the CLI applies it:
 *   1. process.env wins        (dotenv.config() without override)
 *   2. then backend/.env
 *   3. .env.production is NOT read by Prisma — it is a Next.js convention
 *   4. there is no prisma.config.ts in this repo
 *
 * ESCAPE HATCH: PRISMA_TARGET=production, set explicitly on that one
 * invocation. Deliberately not a persisted setting — it has to be typed, in
 * front of the command whose blast radius it is widening.
 *
 * Runnable:  npx tsx scripts/prisma-target-guard.ts [migrate|push|seed]
 */
import fs from "fs";
import path from "path";

/** Which datasource variable a given command class actually resolves. */
export type CommandClass = "migrate" | "push" | "seed";

export function variableFor(cls: CommandClass): "DIRECT_URL" | "DATABASE_URL" {
  // migrate + db push honour datasource.directUrl when the schema declares it
  // (schema.prisma:27). Seeding runs as an ordinary app process and uses url.
  return cls === "seed" ? "DATABASE_URL" : "DIRECT_URL";
}

/** Parse a dotenv file just far enough to read one key. No expansion. */
export function readFromEnvFile(file: string, key: string): string | undefined {
  if (!fs.existsSync(file)) return undefined;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    if (line.slice(0, eq).trim() !== key) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return undefined;
}

/** The value the CLI will actually see, by the precedence documented above. */
export function resolveUrl(
  cls: CommandClass,
  env: NodeJS.ProcessEnv,
  envFile: string,
): { key: string; url?: string; source: "process.env" | ".env" | "unset" } {
  const key = variableFor(cls);
  if (env[key]) return { key, url: env[key], source: "process.env" };
  const fromFile = readFromEnvFile(envFile, key);
  if (fromFile) return { key, url: fromFile, source: ".env" };

  // A migrate command with no DIRECT_URL falls back to the datasource url.
  if (key === "DIRECT_URL") {
    if (env.DATABASE_URL) return { key: "DATABASE_URL (DIRECT_URL unset)", url: env.DATABASE_URL, source: "process.env" };
    const db = readFromEnvFile(envFile, "DATABASE_URL");
    if (db) return { key: "DATABASE_URL (DIRECT_URL unset)", url: db, source: ".env" };
  }
  return { key, source: "unset" };
}

export function hostOf(url: string): string {
  try {
    // Strip credentials before parsing so a password with @ or / cannot break it.
    return new URL(url).host;
  } catch {
    const at = url.split("@");
    return (at[at.length - 1] || "").split("/")[0] || "(unparseable)";
  }
}

export function isLocalHost(host: string): boolean {
  const h = host.split(":")[0].toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
}

export interface Verdict {
  ok: boolean;
  host: string;
  key: string;
  source: string;
  reason: string;
}

export function evaluate(cls: CommandClass, env: NodeJS.ProcessEnv, envFile: string): Verdict {
  const { key, url, source } = resolveUrl(cls, env, envFile);
  if (!url) {
    return { ok: false, host: "(none)", key, source, reason: `${key} resolves to nothing. A schema command with no target is not safe to run.` };
  }
  const host = hostOf(url);
  if (isLocalHost(host)) {
    return { ok: true, host, key, source, reason: "local target" };
  }
  if (env.PRISMA_TARGET === "production") {
    return { ok: true, host, key, source, reason: "non-local, explicitly overridden with PRISMA_TARGET=production" };
  }
  return {
    ok: false,
    host,
    key,
    source,
    reason: `${key} points at a NON-LOCAL host and PRISMA_TARGET=production was not set for this invocation.`,
  };
}

/**
 * THE PRODUCTION RAIL, and the one way it can be silently undone.
 *
 * Since v3.8 commit 12a the production datasource lives ONLY in
 * .env.production.local, and backend/.env points at the local container. That
 * is what makes a raw `npx prisma migrate deploy` safe by construction rather
 * than by the typist remembering a rule -- which is the failure that put a
 * migration on production at 15:11:07 on 2026-09-01 (§13.3 Item 252).
 *
 * The rail has exactly one failure mode: somebody pastes the production URL
 * back into .env, at which point both files name the same host and the
 * separation is gone while every command still looks fine. So the guard checks
 * for it, and treats agreement between the two files as the alarm.
 *
 * Returns null when the rail is intact or when there is nothing to compare.
 */
export function railBreach(
  envFile: string,
  prodFile: string,
): { host: string } | null {
  if (!fs.existsSync(prodFile)) return null;
  for (const key of ["DIRECT_URL", "DATABASE_URL"]) {
    const a = readFromEnvFile(envFile, key);
    const b = readFromEnvFile(prodFile, key);
    if (!a || !b) continue;
    const ha = hostOf(a);
    // Local on both sides is not a breach -- it is a developer who has pointed
    // the production file at a container, which is harmless.
    if (isLocalHost(ha)) continue;
    if (ha === hostOf(b)) return { host: ha };
  }
  return null;
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */
// `require` is undefined under vitest ESM; this block is CLI-only.
const isCli = typeof require !== "undefined" && typeof module !== "undefined" && require.main === module;
if (isCli) {
  const cls = (process.argv[2] as CommandClass) || "migrate";
  const envFile = path.resolve(__dirname, "..", ".env");
  const prodFile = path.resolve(__dirname, "..", ".env.production.local");

  // Checked BEFORE the verdict. A breach makes the verdict meaningless: if
  // .env has been repointed at production then "local target" is a sentence
  // about the wrong database.
  const breach = railBreach(envFile, prodFile);
  if (breach) {
    console.error("");
    console.error("  ┌─ REFUSING TO RUN — PRODUCTION RAIL BREACHED ─────────────────────");
    console.error(`  │ backend/.env and .env.production.local both resolve to`);
    console.error(`  │   ${breach.host}`);
    console.error("  │");
    console.error("  │ The rail is that .env targets the LOCAL container and the");
    console.error("  │ production datasource lives only in .env.production.local. With");
    console.error("  │ both naming one host, a raw `npx prisma` reaches production while");
    console.error("  │ the shell looks entirely local — which is how a migration landed");
    console.error("  │ on Neon by accident (§13.3 Item 252).");
    console.error("  │");
    console.error("  │ Point backend/.env back at the local container.");
    console.error("  └──────────────────────────────────────────────────────────────────");
    process.exit(1);
  }

  const v = evaluate(cls, process.env, envFile);

  console.log(`[prisma-target-guard] command class : ${cls}`);
  console.log(`[prisma-target-guard] variable used : ${v.key}  (from ${v.source})`);
  console.log(`[prisma-target-guard] target host   : ${v.host}`);

  if (v.ok) {
    console.log(`[prisma-target-guard] OK — ${v.reason}`);
    process.exit(0);
  }

  console.error("");
  console.error("  ┌─ REFUSING TO RUN ────────────────────────────────────────────────");
  console.error(`  │ ${v.reason}`);
  console.error("  │");
  console.error(`  │ Resolved ${v.key} -> ${v.host}`);
  console.error("  │");
  console.error("  │ If you meant LOCAL: export the variable this command class reads.");
  console.error(`  │   ${variableFor(cls)}=postgresql://srl:srl_local_dev@localhost:5433/srl_e2e`);
  console.error("  │");
  console.error("  │ Note migrate and db push read DIRECT_URL, not DATABASE_URL");
  console.error("  │ (prisma/schema.prisma:27). Overriding only DATABASE_URL leaves");
  console.error("  │ migrate pointed at production while the shell looks local.");
  console.error("  │");
  console.error("  │ If you really meant PRODUCTION, say so on this one command:");
  console.error("  │   PRISMA_TARGET=production npm run <script>");
  console.error("  └──────────────────────────────────────────────────────────────────");
  process.exit(1);
}
