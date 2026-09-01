/**
 * The ONLY thing in this repo that loads the production datasource.
 *
 * WHY IT EXISTS. Until v3.8 commit 12a the production Neon URLs lived in
 * backend/.env, so a raw `npx prisma migrate deploy` typed by a human resolved
 * to PRODUCTION while the shell looked entirely local. That is not hypothetical:
 * it happened on 2026-09-01 at 15:11:07 UTC (§13.3 Item 252). The migration was
 * additive and did no harm, but the rail exists because the next one might not
 * be.
 *
 * The rail is that .env targets the local container and the production pair
 * lives only in .env.production.local, which nothing loads automatically —
 * Prisma reads .env, never .env.*.local. This script is the deliberate act of
 * reaching production, and it is one command with production in its name.
 *
 * ORDER MATTERS. The target guard runs FIRST, against the environment this
 * script has already built, so it reports the host the migration will actually
 * use rather than the one .env would have suggested.
 *
 * ON THE ESCAPE HATCH. The guard's PRISMA_TARGET=production hatch was designed
 * to be typed in front of a command, so that widening the blast radius is a
 * visible act. Setting it here moves that visibility from the flag to the script
 * NAME, which is the trade this rail makes: `npm run prisma:deploy:production`
 * is not something anyone types by accident, and unlike an exported variable it
 * cannot linger in a shell and catch the next command.
 *
 * Render is unaffected. Its build chain calls `npx prisma migrate deploy`
 * directly with the datasource in its own environment, which is that command's
 * job. This script is for a human at a terminal during an incident (§2.2
 * EMERGENCY OVERRIDE).
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import dotenv from "dotenv";
import { evaluate, railBreach, hostOf, isLocalHost } from "./prisma-target-guard";

const BACKEND = path.resolve(__dirname, "..");
const PROD_FILE = path.join(BACKEND, ".env.production.local");
const ENV_FILE = path.join(BACKEND, ".env");

function refuse(lines: string[]): never {
  console.error("");
  console.error("  ┌─ REFUSING TO RUN ────────────────────────────────────────────────");
  for (const l of lines) console.error("  │ " + l);
  console.error("  └──────────────────────────────────────────────────────────────────");
  process.exit(1);
}

if (!fs.existsSync(PROD_FILE)) {
  refuse([
    "backend/.env.production.local does not exist.",
    "",
    "It holds the production DATABASE_URL and DIRECT_URL and is gitignored, so a",
    "fresh clone will not have it. Copy the pair from the Render dashboard.",
  ]);
}

// The rail must be intact before production credentials are loaded at all. If
// .env has been repointed at production then the separation this script depends
// on is already gone, and running would deepen the problem rather than expose it.
const breach = railBreach(ENV_FILE, PROD_FILE);
if (breach) {
  refuse([
    `backend/.env and .env.production.local both resolve to ${breach.host}.`,
    "",
    "The rail is that .env targets the LOCAL container. With both naming one",
    "host, every raw prisma command reaches production too, and this script's",
    "own guarantee — that reaching production is deliberate — is false.",
    "",
    "Point backend/.env back at the local container.",
  ]);
}

// override:true, deliberately. The point of this script is that the production
// pair WINS over whatever .env put in place; without it the values loaded from
// .env earlier in the process would take precedence and this would quietly
// migrate the local container while announcing production.
dotenv.config({ path: PROD_FILE, override: true });

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  refuse([".env.production.local set neither DIRECT_URL nor DATABASE_URL."]);
}
const host = hostOf(url as string);
if (isLocalHost(host)) {
  refuse([
    `.env.production.local resolves to ${host}, which is local.`,
    "",
    "This script exists to reach production. A local target here means the file",
    "has been edited, and running would report a production deploy that never",
    "touched production.",
  ]);
}

// Now the guard, against the environment this script actually built.
process.env.PRISMA_TARGET = "production";
const verdict = evaluate("migrate", process.env, ENV_FILE);
console.log(`[deploy] target host : ${verdict.host}`);
console.log(`[deploy] variable    : ${verdict.key} (from ${verdict.source})`);
if (!verdict.ok) refuse([verdict.reason]);

console.log("[deploy] guard passed. Running prisma migrate deploy against PRODUCTION.\n");
execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: BACKEND, stdio: "inherit", shell: true });
console.log("\n[deploy] done. Verify with: npm run prisma:status:production");
