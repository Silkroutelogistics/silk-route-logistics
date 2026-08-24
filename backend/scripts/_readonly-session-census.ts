/**
 * ARC 34 — read-only census of who the policy rollout will sign out.
 *
 * WRITES NOTHING. Every statement here is a SELECT.
 *
 * There is no direct answer to "how many live sessions exist", because for
 * carrier and shipper the only idle store is an in-memory Map inside the API
 * process, and for staff the staff_sessions table has a reader but no writer —
 * so it is empty by construction. The honest proxy is recent lastLogin: anyone
 * who signed in inside the current absolute window could still be holding a
 * usable token.
 */

require("dotenv").config();

import { prisma } from "../src/config/database";

async function main() {
  const host = (process.env.DATABASE_URL || "").replace(/\/\/[^@]*@/, "//***@");
  console.log(`target: ${host}\n`);

  const now = Date.now();
  const since12h = new Date(now - 12 * 60 * 60 * 1000);
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const staffRows = await prisma.staffSession.count();
  console.log(`staff_sessions rows: ${staffRows}   <- the table the middleware reads`);

  for (const [label, since] of [["12h", since12h], ["24h", since24h], ["7d", since7d]] as const) {
    const rows = await prisma.user.groupBy({
      by: ["role"],
      where: { lastLogin: { gte: since }, isActive: true },
      _count: { _all: true },
    });
    const total = rows.reduce((n, r) => n + r._count._all, 0);
    console.log(`\nsigned in within ${label}: ${total}`);
    for (const r of rows.sort((a, b) => b._count._all - a._count._all)) {
      console.log(`  ${String(r.role).padEnd(12)} ${r._count._all}`);
    }
  }

  // Who, specifically — at this scale the names matter more than the count.
  const recent = await prisma.user.findMany({
    where: { lastLogin: { gte: since24h }, isActive: true },
    select: { email: true, role: true, lastLogin: true },
    orderBy: { lastLogin: "desc" },
    take: 25,
  });
  console.log(`\nthe people a rollout signs out (last 24h, max 25):`);
  for (const u of recent) {
    console.log(`  ${u.lastLogin?.toISOString()}  ${String(u.role).padEnd(12)} ${u.email}`);
  }
  if (recent.length === 0) console.log("  (nobody — the rollout signs out nobody)");

  const drivers = await prisma.driver.count({ where: { trainingSessionId: { not: null } } });
  console.log(`\ndrivers holding a training session: ${drivers}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
