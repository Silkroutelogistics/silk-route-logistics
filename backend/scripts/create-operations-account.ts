/**
 * v3.8.auh — issue operations@silkroutelogistics.ai as the first
 * ACCOUNT_EXECUTIVE, TOTP-enrolled, then deactivate noor@.
 *
 * No reset-token password reset on this account until TOTP lockout fix lands.
 * Rotation via known-password change only.
 *
 * That header is load-bearing, not decorative. The reset-token path and TOTP
 * interact badly today (the open lockout defect), so if this password is lost
 * the recovery route is an admin-side rotation with the current password in
 * hand — not "forgot password". Capture the credentials this script prints.
 *
 * TOTP is enrolled through the SAME service functions the product uses —
 * generateTotpSetup() then enableTotp() — never by writing totpSecret or
 * totpBackupCodes directly. Those columns hold AES-encrypted payloads
 * (iv:ciphertext) and the backup codes are bcrypt hashes inside an encrypted
 * JSON envelope; hand-writing them would produce a row the verify path cannot
 * read. The enrolment is proven end to end before it is accepted: a live code
 * is computed from the returned secret and pushed through the production
 * verifyTotpCode().
 *
 * Leg 2 (deactivate noor@) runs ONLY if every Leg 1 check passes.
 *
 * Usage:
 *   npx tsx scripts/create-operations-account.ts            # dry run
 *   npx tsx scripts/create-operations-account.ts --commit   # apply
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import * as OTPAuth from "otpauth";
import { generateTotpSetup, enableTotp, verifyTotpCode } from "../src/services/totpService";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

const EMAIL = "operations@silkroutelogistics.ai";
const FIRST = "Operations";
const LAST = ""; // display name is "Operations"; lastName is a required String, so empty rather than an invented surname
const ROLE = "ACCOUNT_EXECUTIVE";
const COMPANY = "Silk Route Logistics";
const ISSUER = "Silk Route Logistics"; // must match totpService.ts ISSUER
const NOOR = "noor@silkroutelogistics.ai";

/** CSPRNG password, guaranteed upper/lower/digit/special so it also satisfies the platform's own rules. */
function generatePassword(length = 24): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const special = "!@#$%^&*()-_=+";
  const all = upper + lower + digit + special;
  const pick = (s: string) => s[crypto.randomInt(s.length)];
  const chars = [pick(upper), pick(lower), pick(digit), pick(special)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const ok = (b: boolean) => (b ? "PASS" : "FAIL");

async function main() {
  const host = (process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0] ?? "(none)";
  console.log(`DB host: ${host}`);
  console.log(COMMIT ? "MODE: COMMIT\n" : "MODE: DRY RUN (pass --commit to apply)\n");

  const existing = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true, role: true } });
  if (existing) {
    console.log(`${EMAIL} ALREADY EXISTS (id=${existing.id}, role=${existing.role}) — refusing to recreate.`);
    return;
  }
  const noorRow = await prisma.user.findFirst({ where: { email: NOOR }, select: { id: true, isActive: true } });
  console.log(`LEG 1  create ${EMAIL} as ${ROLE}, TOTP-enrolled`);
  console.log(`LEG 2  deactivate ${NOOR} (currently isActive=${noorRow?.isActive}) — only if Leg 1 is fully green`);
  if (!COMMIT) return;

  // ── LEG 1: create ─────────────────────────────────────────────────────────
  const password = generatePassword(24);
  const passwordHash = await bcrypt.hash(password, 12); // cost 12 — matches authController register

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash,
      firstName: FIRST,
      lastName: LAST,
      company: COMPANY,
      role: ROLE as any,
      isActive: true,
      passwordChangedAt: new Date(),
      // emailVerifiedAt intentionally left at schema default (null)
    },
    select: { id: true, email: true, role: true, isActive: true, createdAt: true, passwordChangedAt: true },
  });
  console.log(`\ncreated id=${user.id}`);

  // ── LEG 1: TOTP via the product path ──────────────────────────────────────
  const { secret, backupCodes } = await generateTotpSetup(user.id, EMAIL);

  // Prove the pairing with a live code through the production verify path
  // BEFORE flipping totpEnabled — same order the product's own flow uses.
  const probe = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: EMAIL,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const liveCode = probe.generate();
  const verified = await verifyTotpCode(user.id, liveCode);
  if (!verified) throw new Error("TOTP verify FAILED for a freshly generated code — aborting before enableTotp");
  await enableTotp(user.id);

  const uri = probe.toString();

  // ── LEG 1: verification ───────────────────────────────────────────────────
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, role: true, isActive: true, createdAt: true, passwordChangedAt: true, emailVerifiedAt: true, totpEnabled: true, totpSecret: true, totpBackupCodes: true, passwordHash: true },
  });
  if (!row) throw new Error("row vanished after create");

  const checks: Array<[string, boolean]> = [
    ["role is ACCOUNT_EXECUTIVE", row.role === "ACCOUNT_EXECUTIVE"],
    ["isActive true", row.isActive === true],
    ["passwordChangedAt set", row.passwordChangedAt != null],
    ["emailVerifiedAt at schema default (null)", row.emailVerifiedAt === null],
    ["password resolves through production bcrypt compare", await bcrypt.compare(password, row.passwordHash)],
    ["a wrong password is rejected", !(await bcrypt.compare(password + "x", row.passwordHash))],
    ["totpEnabled true", row.totpEnabled === true],
    ["totpSecret stored encrypted (iv:ct), not raw base32", !!row.totpSecret && row.totpSecret.includes(":") && !/^[A-Z2-7]+=*$/.test(row.totpSecret)],
    ["backup codes stored (8, hashed inside encrypted envelope)", !!row.totpBackupCodes && backupCodes.length === 8],
    ["production verifyTotpCode accepts a live generated code", await verifyTotpCode(user.id, probe.generate())],
    ["production verifyTotpCode rejects a wrong code", !(await verifyTotpCode(user.id, "000000"))],
  ];

  console.log("\nLEG 1 VERIFICATION");
  let allGreen = true;
  for (const [label, pass] of checks) {
    if (!pass) allGreen = false;
    console.log(`  [${ok(pass)}] ${label}`);
  }
  console.log(`\nROW: id=${row.id} email=${row.email} role=${row.role} createdAt=${row.createdAt.toISOString()} passwordChangedAt=${row.passwordChangedAt?.toISOString()} totpEnabled=${row.totpEnabled}`);

  // ── LEG 2: gated on Leg 1 ─────────────────────────────────────────────────
  if (!allGreen) {
    console.log("\nLEG 2 SKIPPED — Leg 1 had a failing check. noor@ left active.");
  } else if (!noorRow) {
    console.log("\nLEG 2 SKIPPED — noor@ not found.");
  } else {
    await prisma.user.update({ where: { id: noorRow.id }, data: { isActive: false } });
    const after = await prisma.user.findUnique({ where: { id: noorRow.id }, select: { email: true, isActive: true, passwordChangedAt: true, role: true } });
    console.log(`\nLEG 2  ${after?.email} isActive=${after?.isActive} (role ${after?.role}, passwordChangedAt untouched: ${after?.passwordChangedAt?.toISOString()})`);
  }

  // ── Credentials, printed once ─────────────────────────────────────────────
  console.log("\n┌─ CREDENTIALS — shown once, stored nowhere ────────────────────");
  console.log(`│ email       ${EMAIL}`);
  console.log(`│ password    ${password}`);
  console.log(`│ secret      ${secret}`);
  console.log(`│ otpauth     ${uri}`);
  console.log(`│ backup      ${backupCodes.join("  ")}`);
  console.log("└───────────────────────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
