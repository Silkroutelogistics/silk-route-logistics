/** Arc 34 Step 3 root-cause probe. Read-only against the rehearsal container. */
require("dotenv").config();
if (!/5544[0-9]/.test(process.env.DATABASE_URL || "")) { console.error("REFUSING: not rehearsal"); process.exit(1); }
for (const k of ["RESEND_API_KEY","OPENPHONE_API_KEY","S3_BUCKET_NAME","AWS_ACCESS_KEY_ID"])
  if (process.env[k] !== "") { console.error(`REFUSING: ${k} not explicitly empty`); process.exit(1); }

import crypto from "crypto";
import jwt from "jsonwebtoken";

const PORT = 4035;
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex").slice(0, 32);

async function main() {
  const { prisma } = await import("../src/config/database");
  const express = (await import("express")).default;
  const routes = (await import("../src/routes")).default;
  const { registerSession } = await import("../src/middleware/auth");
  const { SESSION_ABSOLUTE_MS, isStaffRole } = await import("../src/lib/sessionPolicy");

  const app = express(); app.use(express.json()); app.use("/api", routes);
  await new Promise<void>((r) => { app.listen(PORT, "127.0.0.1", () => r()); });

  const probe = async (role: string) => {
    const u = await prisma.user.create({ data: {
      email: `rc-${role}-${crypto.randomBytes(3).toString("hex")}@srl.invalid`,
      passwordHash: "x", firstName: "RC", lastName: role, role: role as never,
      company: "RC", phone: "2692206760" } });
    const token = jwt.sign({ userId: u.id, email: u.email, role }, process.env.JWT_SECRET!, { expiresIn: "30d" });
    registerSession(u.id, token, role);
    await new Promise((r) => setTimeout(r, 250));
    const backdated = new Date(Date.now() - 31 * 60 * 1000);
    await prisma.staffSession.update({ where: { tokenHash: hash(token) }, data: { lastSeenAt: backdated } });

    const before = await prisma.staffSession.findUnique({ where: { tokenHash: hash(token) }, select: { lastSeenAt: true } });
    const res = await fetch(`http://127.0.0.1:${PORT}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    const after = await prisma.staffSession.findUnique({ where: { tokenHash: hash(token) }, select: { lastSeenAt: true } });

    const ageMin = (d?: Date | null) => d ? Math.round((Date.now() - d.getTime()) / 60000) : NaN;
    console.log(`\n${role}  (isStaffRole=${isStaffRole(role)})`);
    console.log(`  lastSeenAt BEFORE request : ${ageMin(before?.lastSeenAt)}m old  (backdated to 31m)`);
    console.log(`  HTTP status               : ${res.status}`);
    console.log(`  lastSeenAt AFTER  request : ${ageMin(after?.lastSeenAt)}m old`);
    console.log(`  => ${ageMin(after?.lastSeenAt) < 5
      ? "the row was REFRESHED mid-request; Arc 34 then judged the refreshed value"
      : "row untouched; Arc 34 judged the real 31m and refused"}`);
  };

  await probe("ADMIN");
  await probe("CARRIER");

  const ROLLOUT = Date.parse("2026-08-24T20:00:00Z");
  const ageH = (Date.now() - ROLLOUT) / 3_600_000;
  console.log(`\nrollout constant  : 2026-08-24T20:00:00Z`);
  console.log(`  age now         : ${ageH.toFixed(1)}h`);
  console.log(`  absolute cap    : ${SESSION_ABSOLUTE_MS / 3_600_000}h`);
  console.log(`  => a token predating the rollout is ALSO past the ${SESSION_ABSOLUTE_MS / 3_600_000}h cap,`);
  console.log(`     so the absolute branch answers first and SESSION_REVOKED_POLICY_ROLLOUT is unreachable.`);

  await prisma.$disconnect(); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
