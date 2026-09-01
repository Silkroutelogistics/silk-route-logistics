/**
 * Read-only companion to prisma-deploy-production.
 *
 * Answering "did that migration land" must not require pointing .env at
 * production, because that is exactly the rail this arc put in place. This
 * loads the production pair the same way the deploy script does, runs the same
 * guard, and then only READS.
 *
 * It is separate from the deploy script rather than a flag on it so that
 * checking state is never one typo away from changing it.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import dotenv from "dotenv";
import { railBreach, hostOf, isLocalHost } from "./prisma-target-guard";

const BACKEND = path.resolve(__dirname, "..");
const PROD_FILE = path.join(BACKEND, ".env.production.local");

if (!fs.existsSync(PROD_FILE)) {
  console.error("backend/.env.production.local does not exist — nothing to read.");
  process.exit(1);
}
const breach = railBreach(path.join(BACKEND, ".env"), PROD_FILE);
if (breach) {
  console.error(`REFUSING: .env and .env.production.local both resolve to ${breach.host}. Point .env back at the local container.`);
  process.exit(1);
}
dotenv.config({ path: PROD_FILE, override: true });
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
if (isLocalHost(hostOf(url))) {
  console.error("REFUSING: .env.production.local resolves to a local host; this would report on the wrong database.");
  process.exit(1);
}
console.log(`[status] production host : ${hostOf(url)}\n`);
process.env.PRISMA_TARGET = "production";
execFileSync("npx", ["prisma", "migrate", "status"], { cwd: BACKEND, stdio: "inherit", shell: true });
