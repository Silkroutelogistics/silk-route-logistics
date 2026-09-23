/**
 * The one place a read-only census resolves its production credential.
 *
 * WHY THIS EXISTS. Before it, seven census scripts each carried their own copy
 * of "which file do I load and what am I allowed to talk to". Seven copies is
 * seven places for the next credential rotation to drift, and the rotation on
 * 2026-09-22 is what surfaced it: the owner password moved, a read-only role
 * `srl_readonly` was created, and nothing pointed at the new role.
 *
 * WHAT CHANGED, AND WHY IT IS STRONGER. A census used to reach production as
 * `neondb_owner` -- the role that can write everything -- and was kept harmless
 * by `SET default_transaction_read_only = on`, which is a SESSION setting the
 * script asks for itself. Three of the seven never asked for it at all; they
 * were read-only by the author's discipline and nothing else.
 *
 * Now the credential itself cannot write. `srl_readonly` holds SELECT on the
 * public schema and no INSERT/UPDATE/DELETE anywhere, so a stray write is
 * refused by Postgres with 42501 regardless of what the script remembered to
 * set. The session setting stays as the second layer, not the first.
 *
 * THE GUARDS ARE POSITIVE, NOT MERELY "NOT LOCALHOST". The old scripts refused
 * a local host, which accepts any other host in the world. These assert the
 * host IS Neon and the user IS NOT the owner -- so pasting the owner URL into
 * the read-only file is refused rather than silently granting write access to
 * every census on the machine.
 *
 * NEVER PRINTS A SECRET. Host and user only.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

const BACKEND = path.resolve(__dirname, "..");

/** The read-only census credential. Gitignored; nothing loads it automatically. */
export const CENSUS_ENV_FILE = path.join(BACKEND, ".env.production.readonly");

/** The owner role. A census must never run as this. */
const OWNER_ROLE = "neondb_owner";

export interface CensusTarget {
  url: string;
  host: string;
  user: string;
}

function die(msg: string, ...more: string[]): never {
  console.error("REFUSING: " + msg);
  for (const m of more) console.error("  " + m);
  process.exit(1);
}

function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

/**
 * Resolve the read-only production credential, or refuse.
 *
 * Does NOT touch process.env -- see applyCensusCredential for the callers that
 * hand their URL to the shared Prisma singleton rather than passing it in.
 */
export function resolveCensusCredential(file: string = CENSUS_ENV_FILE): CensusTarget {
  const CENSUS_ENV_FILE_ = file;
  if (!fs.existsSync(CENSUS_ENV_FILE_)) {
    die(
      "backend/.env.production.readonly not found.",
      "A census reads production as the srl_readonly role. Put that role's",
      "connection string in that file as DATABASE_URL=...  It is gitignored.",
      "Note the exact name: a Windows 'Save as' that appends .txt will not be found.",
    );
  }

  const env = parseEnvFile(CENSUS_ENV_FILE_);
  const url = env.DATABASE_URL ?? "";
  if (!url) die("backend/.env.production.readonly carries no DATABASE_URL.");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return die("the DATABASE_URL in backend/.env.production.readonly does not parse as a URL.");
  }

  const host = parsed.hostname;
  const user = parsed.username;

  // Positive host assertion. "not localhost" would accept anything else.
  if (!host.endsWith("neon.tech")) {
    die(
      `the census target is not a Neon host (got a host ending "${host.slice(-12)}").`,
      "A census reads SRL production, which is Neon. Anything else is a misconfiguration.",
    );
  }

  // The credential must not be able to write, whatever the script forgets to set.
  if (user === OWNER_ROLE) {
    die(
      `backend/.env.production.readonly carries the OWNER role (${OWNER_ROLE}).`,
      "That role can write every table. Put the srl_readonly connection string there.",
      "This is the rail breach in reverse: the read-only file holding the owner credential.",
    );
  }
  if (!user) die("the DATABASE_URL in backend/.env.production.readonly names no user.");

  return { url, host, user };
}

/**
 * Resolve, and also place the credential in process.env for the scripts that
 * reach production through the shared Prisma singleton (src/config/database)
 * rather than passing `datasourceUrl` themselves.
 *
 * Both DATABASE_URL and DIRECT_URL are set to the read-only URL deliberately.
 * Leaving DIRECT_URL alone would let it fall through to backend/.env -- the
 * LOCAL container -- so a census would hold production in one variable and
 * localhost in the other. A census never migrates; if one ever tried, the
 * read-only role refuses it, which is the direction we want to fail in.
 *
 * dotenv.config() does not override an already-set variable, so calling this
 * BEFORE importing src/config/database is what makes the singleton connect to
 * the census target.
 */
export function applyCensusCredential(file: string = CENSUS_ENV_FILE): CensusTarget {
  const t = resolveCensusCredential(file);
  process.env.DATABASE_URL = t.url;
  process.env.DIRECT_URL = t.url;
  return t;
}

/**
 * One line naming the target, with the endpoint MASKED.
 *
 * A census prints where it went so a reader can tell production from a
 * container, and it must do that without pasting a connection endpoint into a
 * transcript, a CI log or a pasted report. The short digest is stable, so two
 * runs against the same endpoint match and two against different ones do not,
 * which is all a reader needs.
 */
export function announceCensusTarget(t: CensusTarget, label = "census"): void {
  const digest = crypto.createHash("sha256").update(t.host).digest("hex").slice(0, 8);
  console.log(`[${label}] target : *.neon.tech (endpoint ${digest}, pooled=${t.host.includes("-pooler")})`);
  console.log(`[${label}] role   : ${t.user} (read-only; writes refused by the database)`);
}
