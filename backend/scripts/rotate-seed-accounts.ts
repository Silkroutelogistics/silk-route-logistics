/**
 * v3.8.auf Leg 1 — retire the shared seed credential on the three live staff
 * accounts that still hold it.
 *
 * All four staff accounts were created by prisma/seed.ts in one batch on
 * 2026-02-19 and share ONE bcrypt hash of a literal that is committed in this
 * repository. whaider@ rotated on 2026-08-12; noor@, dispatch@ and accounting@
 * still carry passwordChangedAt = null, i.e. they have never changed it.
 *
 *   noor@       -> rotate to a fresh CSPRNG password (real person, keeps access)
 *   dispatch@   -> isActive = false (fictional seed persona "Marcus Johnson")
 *   accounting@ -> isActive = false (fictional seed persona "Priya Patel")
 *
 * Deactivate rather than delete: both personas sit on FK-referenced seed rows,
 * and isActive=false is already a hard block at authController login
 * ("Account has been deactivated") — so it closes the credential without
 * risking a cascade. They can be reactivated if the aliases are ever given to
 * real people.
 *
 * The generated password is printed ONCE to stdout and written nowhere else —
 * no file, no SystemLog, no audit row. Capture it at run time or rotate again.
 *
 * Usage:
 *   npx tsx scripts/rotate-seed-accounts.ts            # dry run (default)
 *   npx tsx scripts/rotate-seed-accounts.ts --commit   # apply
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import "dotenv/config";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

const ROTATE = "noor@silkroutelogistics.ai";
const DEACTIVATE = ["dispatch@silkroutelogistics.ai", "accounting@silkroutelogistics.ai"];

/**
 * CSPRNG password with guaranteed composition (upper/lower/digit/special), so
 * it also satisfies the platform's own strong-password rules if this account
 * later changes it through the app.
 *
 * Uses crypto.randomInt rather than randomBytes + modulo: both draw from the
 * same CSPRNG, but modulo over a raw byte introduces bias when the charset
 * size does not divide 256. Ambiguous glyphs (O/0, I/l/1) are excluded so the
 * value can be read aloud or retyped without error.
 */
function generatePassword(length = 24): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const special = "!@#$%^&*()-_=+";
  const all = upper + lower + digit + special;
  const pick = (set: string) => set[crypto.randomInt(set.length)];

  const chars = [pick(upper), pick(lower), pick(digit), pick(special)];
  while (chars.length < length) chars.push(pick(all));

  // Fisher-Yates so the guaranteed-class characters are not always in front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function main() {
  const host = (process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0] ?? "unknown";
  console.log(`DB host: ${host}`);
  console.log(COMMIT ? "MODE: COMMIT (writes will be applied)\n" : "MODE: DRY RUN (no writes; pass --commit to apply)\n");

  // ── Rotate ────────────────────────────────────────────────────────────────
  const noor = await prisma.user.findFirst({
    where: { email: ROTATE },
    select: { id: true, email: true, role: true, isActive: true, passwordChangedAt: true },
  });

  if (!noor) {
    console.log(`ROTATE  ${ROTATE}: NOT FOUND — skipped`);
  } else {
    console.log(`ROTATE  ${noor.email} (${noor.role}) passwordChangedAt=${noor.passwordChangedAt ?? "null"}`);
    if (COMMIT) {
      const pw = generatePassword(24);
      const passwordHash = await bcrypt.hash(pw, 12); // cost 12 — matches authController.ts register
      await prisma.user.update({
        where: { id: noor.id },
        data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
      });
      console.log("\n  ┌─ NEW PASSWORD (shown once, stored nowhere) ─────────────");
      console.log(`  │  ${noor.email}`);
      console.log(`  │  ${pw}`);
      console.log("  └─────────────────────────────────────────────────────────\n");
    }
  }

  // ── Deactivate ────────────────────────────────────────────────────────────
  for (const email of DEACTIVATE) {
    const u = await prisma.user.findFirst({
      where: { email },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!u) {
      console.log(`DISABLE ${email}: NOT FOUND — skipped`);
      continue;
    }
    console.log(`DISABLE ${u.email} (${u.role}) isActive ${u.isActive} -> false`);
    if (COMMIT) {
      await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
    }
  }

  // ── Verify ────────────────────────────────────────────────────────────────
  if (COMMIT) {
    console.log("\nPOST-STATE:");
    const rows = await prisma.user.findMany({
      where: { email: { in: [ROTATE, ...DEACTIVATE] } },
      select: { email: true, role: true, isActive: true, passwordChangedAt: true },
      orderBy: { email: "asc" },
    });
    rows.forEach((r) =>
      console.log(`  ${r.email.padEnd(36)} ${r.role.padEnd(11)} isActive=${String(r.isActive).padEnd(5)} passwordChangedAt=${r.passwordChangedAt ?? "null"}`),
    );
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
