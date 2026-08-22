/**
 * Stage 1 — rotate whaider@silkroutelogistics.ai's password, DB-direct.
 *
 * The in-product path (PATCH /api/auth/password) was attempted twice and did
 * not write: three-field triangulation showed passwordHash still matching the
 * seed literal with passwordChangedAt and updatedAt both frozen at
 * 2026-08-12T09:31:13.06x, while OTP + AuditLog rows proved the logins around
 * those attempts DID reach production. So the account has been authenticating
 * on the literal committed at prisma/seed.ts:17, which remains in git history.
 *
 * Writes passwordHash + passwordChangedAt ONLY. TOTP columns are read for the
 * byte-identity proof and never written. Nothing else on the row is touched.
 *
 * NOT the reset-token path — that is refused on TOTP-enabled accounts until the
 * lockout defect is fixed. This is a direct hash write.
 *
 * The new plaintext is printed ONCE to stdout and stored nowhere.
 *
 * Usage:
 *   npx tsx scripts/rotate-whaider-password.ts            # dry run
 *   npx tsx scripts/rotate-whaider-password.ts --commit   # apply
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { validatePassword } from "../src/utils/passwordPolicy";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const EMAIL = "whaider@silkroutelogistics.ai";
const SEED_LITERAL = "Wasishah3089$";

/**
 * 24 chars derived from crypto.randomBytes with REJECTION SAMPLING.
 *
 * randomBytes % charset.length is biased whenever the charset does not divide
 * 256 evenly; rejecting bytes above the largest usable multiple removes that
 * bias while keeping randomBytes as the entropy source. Composition is forced
 * so the result satisfies validatePassword, and the result is checked against
 * the real policy function before it is used.
 */
function pickFrom(charset: string): string {
  const limit = 256 - (256 % charset.length);
  for (;;) {
    const b = crypto.randomBytes(1)[0];
    if (b < limit) return charset[b % charset.length];
  }
}

function generatePassword(length = 24): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const special = "!@#$%^&*()-_=+";
  const all = upper + lower + digit + special;

  const chars = [pickFrom(upper), pickFrom(lower), pickFrom(digit), pickFrom(special)];
  while (chars.length < length) chars.push(pickFrom(all));

  // Fisher-Yates, also over rejection-sampled bytes.
  for (let i = chars.length - 1; i > 0; i--) {
    const limit = 256 - (256 % (i + 1));
    let b: number;
    do { b = crypto.randomBytes(1)[0]; } while (b >= limit);
    const j = b % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const ok = (b: boolean) => (b ? "PASS" : "FAIL");

async function main() {
  console.log(`DB host: ${(process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0]}`);
  console.log(COMMIT ? "MODE: COMMIT\n" : "MODE: DRY RUN (pass --commit to apply)\n");

  const before = await prisma.user.findFirst({
    where: { email: EMAIL },
    select: { id: true, role: true, passwordHash: true, passwordChangedAt: true, updatedAt: true, totpEnabled: true, totpSecret: true, totpBackupCodes: true },
  });
  if (!before) throw new Error(`${EMAIL} not found`);

  console.log("PRE-ROTATION");
  console.log(`  hash prefix        ${before.passwordHash.slice(0, 20)}...`);
  console.log(`  seed literal works ${await bcrypt.compare(SEED_LITERAL, before.passwordHash)}`);
  console.log(`  passwordChangedAt  ${before.passwordChangedAt?.toISOString()}`);
  console.log(`  updatedAt          ${before.updatedAt.toISOString()}`);
  console.log(`  totpEnabled        ${before.totpEnabled} (secret len ${before.totpSecret?.length})`);
  if (!COMMIT) return;

  const password = generatePassword(24);
  const policy = validatePassword(password);
  if (!policy.valid) throw new Error(`generated password failed the real policy: ${policy.errors.join("; ")}`);

  const passwordHash = await bcrypt.hash(password, 12); // cost 12 — matches authController.ts:133
  await prisma.user.update({
    where: { id: before.id },
    data: { passwordHash, passwordChangedAt: new Date() },
  });

  const after = await prisma.user.findUnique({
    where: { id: before.id },
    select: { passwordHash: true, passwordChangedAt: true, updatedAt: true, totpEnabled: true, totpSecret: true, totpBackupCodes: true, role: true, isActive: true },
  });
  if (!after) throw new Error("row vanished");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const checks: Array<[string, boolean]> = [
    ["generated password satisfies validatePassword", policy.valid],
    ["passwordHash differs from pre-rotation capture", after.passwordHash !== before.passwordHash],
    ["seed literal NO LONGER authenticates", !(await bcrypt.compare(SEED_LITERAL, after.passwordHash))],
    ["new plaintext DOES authenticate", await bcrypt.compare(password, after.passwordHash)],
    ["passwordChangedAt moved into today", !!after.passwordChangedAt && after.passwordChangedAt >= today],
    ["updatedAt moved into today", after.updatedAt >= today],
    ["totpEnabled still true", after.totpEnabled === true],
    ["totpSecret byte-identical", after.totpSecret === before.totpSecret],
    ["totpSecret still 86-char iv:ciphertext", after.totpSecret?.length === 86 && after.totpSecret.includes(":")],
    ["totpBackupCodes byte-identical", after.totpBackupCodes === before.totpBackupCodes],
    ["role/isActive unchanged", after.role === before.role && after.isActive === true],
  ];

  console.log("\nVERIFICATION");
  let green = true;
  for (const [label, pass] of checks) { if (!pass) green = false; console.log(`  [${ok(pass)}] ${label}`); }

  console.log("\nPOST-ROTATION");
  console.log(`  hash prefix        ${after.passwordHash.slice(0, 20)}...`);
  console.log(`  passwordChangedAt  ${after.passwordChangedAt?.toISOString()}`);
  console.log(`  updatedAt          ${after.updatedAt.toISOString()}`);

  const staff = ["ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING", "ACCOUNT_EXECUTIVE", "AE"];
  const rows = await prisma.user.findMany({ where: { role: { in: staff as any } }, select: { email: true, role: true, isActive: true } });
  console.log(`\nCENSUS  users=${await prisma.user.count()}  activeStaff=${rows.filter((r) => r.isActive).map((r) => `${r.email.split("@")[0]}(${r.role})`).join(", ")}`);

  if (green) {
    console.log("\n┌─ NEW PASSWORD — shown once, stored nowhere ───────────────────");
    console.log(`│ ${EMAIL}`);
    console.log(`│ ${password}`);
    console.log("└───────────────────────────────────────────────────────────────");
  } else {
    console.log("\nA CHECK FAILED — password intentionally NOT printed. Investigate before retrying.");
  }
}

main()
  .catch((e) => { console.error("ERROR:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
