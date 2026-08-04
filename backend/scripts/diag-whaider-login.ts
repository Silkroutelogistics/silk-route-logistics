/** READ-ONLY: why can't whaider log in? */
import { prisma } from "../src/config/database";
async function main() {
  const users = await prisma.user.findMany({
    where: { email: { contains: "whaider", mode: "insensitive" } },
    select: {
      id: true, email: true, role: true, isActive: true,
      failedLoginAttempts: true, lockedUntil: true,
      passwordChangedAt: true, totpEnabled: true,
      lastLogin: true,
    },
  });
  console.log(`Users matching 'whaider': ${users.length}`);
  for (const u of users) {
    console.log(JSON.stringify(u, null, 2));
    const now = new Date();
    if (u.lockedUntil && u.lockedUntil > now) {
      console.log(`>>> LOCKED for another ${Math.ceil((u.lockedUntil.getTime() - now.getTime()) / 60000)} min`);
    }
    if (u.passwordChangedAt) {
      const ageDays = (now.getTime() - new Date(u.passwordChangedAt).getTime()) / 86_400_000;
      console.log(`>>> password age: ${ageDays.toFixed(0)} days`);
    } else {
      console.log(">>> passwordChangedAt: NULL (password-expiry logic may treat as expired!)");
    }
  }
  // Recent security log entries for this email
  const logs = await prisma.systemLog.findMany({
    where: { logType: "SECURITY", message: { contains: "whaider", mode: "insensitive" } },
    orderBy: { createdAt: "desc" }, take: 10,
    select: { createdAt: true, severity: true, message: true, ipAddress: true },
  });
  console.log(`\nRecent SECURITY log entries: ${logs.length}`);
  for (const l of logs) console.log(`  ${l.createdAt.toISOString()} [${l.severity}] ${l.message}`);

  // Recent OTP rows — is the OTP being created (send path reached)?
  const user = users.find((u) => u.email.toLowerCase() === "whaider@silkroutelogistics.ai") ?? users[0];
  if (user) {
    const otps = await prisma.otpCode.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" }, take: 5,
      select: { createdAt: true, expiresAt: true, consumedAt: true, failedAttempts: true },
    });
    console.log(`\nRecent OTP rows for ${user.email}: ${otps.length}`);
    for (const o of otps) console.log(`  created ${o.createdAt.toISOString()} expires ${o.expiresAt.toISOString()} consumed=${o.consumedAt ? "yes" : "no"} failed=${o.failedAttempts}`);
  }

  // Email log — did the OTP email actually send?
  const emails = await (prisma as any).emailLog?.findMany({
    where: { to: { contains: "whaider", mode: "insensitive" } },
    orderBy: { createdAt: "desc" }, take: 8,
    select: { createdAt: true, subject: true, status: true, error: true },
  }).catch(() => null);
  console.log(`\nRecent email log rows: ${emails?.length ?? "(no emailLog table)"}`);
  for (const e of emails ?? []) console.log(`  ${e.createdAt.toISOString()} [${e.status}] ${e.subject}${e.error ? " ERR: " + e.error : ""}`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("FAILED:", e?.message ?? e); await prisma.$disconnect(); process.exit(1); });
