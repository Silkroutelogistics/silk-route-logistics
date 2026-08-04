import { prisma } from "../src/config/database";
async function main() {
  const carriers = await prisma.carrierProfile.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true, companyName: true, mcNumber: true, onboardingStatus: true, isTestAccount: true, deletedAt: true, user: { select: { id: true, email: true, isActive: true, passwordChangedAt: true, createdAt: true, totpEnabled: true } } },
  });
  for (const c of carriers) {
    console.log(`${c.companyName ?? "(no name)"} mc=${c.mcNumber} status=${c.onboardingStatus} test=${c.isTestAccount} deletedAt=${c.deletedAt?.toISOString().slice(0,10)} user=${c.user ? `${c.user.email} active=${c.user.isActive}` : "NONE"}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e?.message); await prisma.$disconnect(); process.exit(1); });
