/** READ-ONLY: which test accounts are still usable, and what gates will they hit? */
import { prisma } from "../src/config/database";
const EXPIRY_DAYS = 60;
async function main() {
  const emails = ["shipper@acmemfg.com", "wasihaider3089@gmail.com", "test-carrier@srl.invalid", "noor@silkroutelogistics.ai", "dispatch@silkroutelogistics.ai", "accounting@silkroutelogistics.ai"];
  const now = Date.now();
  for (const email of emails) {
    const u = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, role: true, isActive: true, lockedUntil: true, failedLoginAttempts: true, passwordChangedAt: true, createdAt: true, totpEnabled: true },
    });
    if (!u) { console.log(`✗ ${email} — NO USER`); continue; }
    const base = u.passwordChangedAt ?? u.createdAt;
    const age = Math.floor((now - new Date(base).getTime()) / 86_400_000);
    const expired = age >= EXPIRY_DAYS;
    let linkage = "";
    if (u.role === "SHIPPER") {
      const c = await prisma.customer.findFirst({ where: { userId: u.id }, select: { name: true, onboardingStatus: true, deletedAt: true, isActive: true } });
      linkage = c ? `customer="${c.name}" status=${c.onboardingStatus} deleted=${c.deletedAt ? "YES" : "no"} active=${c.isActive}` : "NO LINKED CUSTOMER";
    } else if (u.role === "CARRIER") {
      const p = await prisma.carrierProfile.findFirst({ where: { userId: u.id }, select: { companyName: true, onboardingStatus: true, deletedAt: true, isTestAccount: true } });
      linkage = p ? `carrier="${p.companyName}" status=${p.onboardingStatus} deleted=${p.deletedAt ? "YES" : "no"} test=${p.isTestAccount}` : "NO CARRIER PROFILE";
      const agr = p ? await prisma.carrierAgreement.count({ where: { status: "SIGNED", templateName: "broker-carrier" } }) : 0;
      linkage += ` bcaSignedAnywhere=${agr}`;
    }
    console.log(`${u.isActive ? "✓" : "✗"} ${u.email} role=${u.role} active=${u.isActive} locked=${u.lockedUntil && u.lockedUntil > new Date() ? "YES" : "no"} totp=${u.totpEnabled} pwAge=${age}d${expired ? " (EXPIRED->force-change)" : ""} ${linkage}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("FAILED:", e?.message ?? e); await prisma.$disconnect(); process.exit(1); });
