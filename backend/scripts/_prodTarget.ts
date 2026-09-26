/**
 * The one way the D1-D5 write scripts reach a database.
 *
 * The URL comes from an env file passed EXPLICITLY (--env-file=...), never
 * from backend/.env, and is placed in process.env before src/config/database is
 * imported. A non-local host needs all three of: PRISMA_TARGET=production (the
 * prisma-target-guard escape hatch), --execute and --target=prod (planWrite).
 * The host is printed masked; the URL never is.
 */
import crypto from "crypto";
import { hostOf, isLocalHost, readFromEnvFile } from "./prisma-target-guard";
import { planWrite } from "./backfill-missing-invoices";

export interface Target { host: string; write: boolean }

/** Pure: refuse unless every signal agrees. */
export function targetVerdict(argv: string[], host: string, prismaTarget: string | undefined): { write: boolean; refuse?: string } {
  const plan = planWrite(argv, host);
  if (!plan.write) return plan;
  if (!isLocalHost(host) && prismaTarget !== "production") {
    return { write: false, refuse: "a non-local write also needs PRISMA_TARGET=production on this invocation." };
  }
  return { write: true };
}

export function openTarget(label: string): Target {
  const fileArg = process.argv.find((a) => a.startsWith("--env-file="));
  if (fileArg) {
    const file = fileArg.slice("--env-file=".length);
    const url = readFromEnvFile(file, "DATABASE_URL");
    if (!url) {
      console.error(`[${label}] REFUSED: ${file} carries no DATABASE_URL.`);
      process.exit(2);
    }
    process.env.DATABASE_URL = url;
    process.env.DIRECT_URL = readFromEnvFile(file, "DIRECT_URL") ?? url;
  }
  const url = process.env.DATABASE_URL ?? "";
  const host = url ? hostOf(url) : "(unset)";
  const v = targetVerdict(process.argv, host, process.env.PRISMA_TARGET);
  if (v.refuse && process.argv.includes("--execute")) {
    console.error(`[${label}] REFUSED: ${v.refuse}`);
    process.exit(2);
  }
  const shown = isLocalHost(host) ? host : `*.neon.tech (endpoint ${crypto.createHash("sha256").update(host).digest("hex").slice(0, 8)})`;
  console.log(`[${label}] target ${shown} · mode ${v.write ? "EXECUTE" : "DRY RUN"}`);
  for (const key of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "QUO_API_KEY"]) {
    if (process.env[key]) {
      console.error(`[${label}] REFUSED: ${key} is set. Pass it empty so nothing is sent.`);
      process.exit(2);
    }
  }
  return { host, write: v.write };
}
