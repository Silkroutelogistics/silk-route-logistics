// v3.8.ale — Sanity check: confirm the Prisma client is hitting Neon
// prod (not a local dev DB). Read-only. Prints user count + a few
// known prod fixture markers. Safe to delete after sprint.

import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const userCount = await prisma.user.count();
    const carrierCount = await prisma.carrierProfile.count();
    const knownTestCarriers = await prisma.carrierProfile.count({
      where: { mcNumber: { in: ["MC-1794414", "MC-156588", "MC-596655"] } },
    });
    // Pull connection host from env (read-only)
    const dbUrl = process.env.DATABASE_URL || "";
    const host = dbUrl.match(/@([^/]+)/)?.[1] || "(unparseable)";
    console.log(`Connection host: ${host}`);
    console.log(`User count: ${userCount}`);
    console.log(`CarrierProfile count: ${carrierCount}`);
    console.log(`Known test-carrier MC#s found: ${knownTestCarriers} (of 3 expected per v3.8.aim seed)`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
