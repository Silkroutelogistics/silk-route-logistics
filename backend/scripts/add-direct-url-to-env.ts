// v3.8.alf — Step 2 of ledger reconciliation: derive DIRECT_URL from
// the existing DATABASE_URL in backend/.env (strip `-pooler` from the
// hostname per Neon convention) and append it to the file. Safe to
// run multiple times — checks for existing DIRECT_URL and no-ops if
// already present. Never prints the credential value to stdout.
//
// Per CLAUDE.md §2.2 the local backend/.env should have BOTH
// DATABASE_URL (pooled) + DIRECT_URL (direct). Pre-alf only
// DATABASE_URL was set, blocking the prisma migrate CLI from running.

import * as fs from "fs";
import * as path from "path";

const ENV_PATH = path.join(__dirname, "..", ".env");

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error(`✗ ${ENV_PATH} not found`);
    process.exitCode = 1;
    return;
  }

  const content = fs.readFileSync(ENV_PATH, "utf-8");
  const lines = content.split("\n");

  const dbUrlLine = lines.find((l) => l.startsWith("DATABASE_URL="));
  if (!dbUrlLine) {
    console.error("✗ DATABASE_URL not found in backend/.env");
    process.exitCode = 1;
    return;
  }

  const existingDirectUrl = lines.find((l) => l.startsWith("DIRECT_URL="));
  if (existingDirectUrl) {
    console.log("✓ DIRECT_URL already present in backend/.env — no change made.");
    return;
  }

  const dbUrlValue = dbUrlLine.substring("DATABASE_URL=".length);
  // Strip surrounding quotes if present
  const dbUrl = dbUrlValue.replace(/^["']|["']$/g, "");

  // Parse via URL constructor — handles password-with-special-chars correctly
  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch (err) {
    console.error("✗ Could not parse DATABASE_URL as a URL");
    process.exitCode = 1;
    return;
  }

  // Derive direct hostname: strip `-pooler` from the first hostname segment
  // e.g. ep-green-frog-ajsgv9me-pooler.c-3.us-east-2.aws.neon.tech
  //   →  ep-green-frog-ajsgv9me.c-3.us-east-2.aws.neon.tech
  const pooledHost = parsed.hostname;
  if (!pooledHost.includes("-pooler")) {
    console.error(`✗ DATABASE_URL hostname does not contain "-pooler" — already direct? hostname=${pooledHost}`);
    console.error(`  If this is intentional, manually add DIRECT_URL=${dbUrl} to .env`);
    process.exitCode = 1;
    return;
  }
  const directHost = pooledHost.replace("-pooler", "");

  // Reconstruct the URL with the direct hostname
  parsed.hostname = directHost;
  const directUrl = parsed.toString();

  // Append to .env — preserve trailing newline behavior
  const needsNewline = !content.endsWith("\n");
  const newContent = content + (needsNewline ? "\n" : "") + `\n# v3.8.alf — Direct Neon endpoint for prisma migrate operations (per §2.2 canonical).\n# Derived from DATABASE_URL by stripping "-pooler" from the hostname.\nDIRECT_URL="${directUrl}"\n`;
  fs.writeFileSync(ENV_PATH, newContent, "utf-8");

  console.log(`✓ DIRECT_URL appended to backend/.env`);
  console.log(`  Direct hostname: ${directHost}`);
  console.log(`  (credential value not printed)`);
}

main();
