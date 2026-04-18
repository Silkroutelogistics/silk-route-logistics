// One-time cleanup: remove duplicate Communication NOTE rows created by the
// Lead Hunter "Mark Not Interested" button before the idempotency fix.
//
// Grouping key: (entityType, entityId, body, metadata.source)
// Window: duplicates within 60 seconds of the earliest record in the group
// Behavior: keep earliest, delete later duplicates
// Idempotent: safe to run multiple times; subsequent runs find 0 duplicates.
//
// Usage (from backend/): npx ts-node src/scripts/dedupe-communication-notes.ts

import { prisma } from "../config/database";

const WINDOW_MS = 60_000;

async function main() {
  const notes = await prisma.communication.findMany({
    where: { type: "NOTE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, entityType: true, entityId: true, body: true, metadata: true, createdAt: true, subject: true },
  });

  const groups = new Map<string, typeof notes>();
  for (const n of notes) {
    const source = n.metadata && typeof n.metadata === "object" ? (n.metadata as any).source ?? "" : "";
    const key = `${n.entityType}|${n.entityId}|${n.body ?? ""}|${source}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(n);
    else groups.set(key, [n]);
  }

  // Burst-based dedupe: within a group, a "burst" is a run where each row is
  // within WINDOW_MS of the previous kept row. Keep the first of each burst,
  // delete the rest. Legitimate repeat actions > 60s apart survive.
  const toDelete: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    let lastKept = group[0];
    for (let i = 1; i < group.length; i++) {
      const delta = group[i].createdAt.getTime() - lastKept.createdAt.getTime();
      if (delta <= WINDOW_MS) {
        toDelete.push(group[i].id);
      } else {
        lastKept = group[i];
      }
    }
  }

  // Sanity check: count Lear's "Marked Not Interested" notes before + after.
  const lear = await prisma.customer.findFirst({
    where: { name: { contains: "Lear", mode: "insensitive" } },
    select: { id: true, name: true },
  });

  const learBefore = lear
    ? await prisma.communication.count({
        where: {
          entityType: "SHIPPER",
          entityId: lear.id,
          type: "NOTE",
          subject: "Marked Not Interested from Replies inbox",
        },
      })
    : 0;

  console.log(`[dedupe-notes] scanned ${notes.length} NOTE rows across ${groups.size} groups`);
  console.log(`[dedupe-notes] duplicate candidates found: ${toDelete.length}`);
  if (lear) console.log(`[dedupe-notes] ${lear.name}: ${learBefore} 'Marked Not Interested' NOTE(s) before`);

  if (toDelete.length === 0) {
    console.log("[dedupe-notes] nothing to delete");
    await prisma.$disconnect();
    return;
  }

  const deleted = await prisma.communication.deleteMany({ where: { id: { in: toDelete } } });
  console.log(`[dedupe-notes] deleted ${deleted.count} duplicate row(s)`);

  if (lear) {
    const learAfter = await prisma.communication.count({
      where: {
        entityType: "SHIPPER",
        entityId: lear.id,
        type: "NOTE",
        subject: "Marked Not Interested from Replies inbox",
      },
    });
    console.log(`[dedupe-notes] ${lear.name}: ${learAfter} 'Marked Not Interested' NOTE(s) after (was ${learBefore})`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[dedupe-notes] failed:", err);
  process.exit(1);
});
