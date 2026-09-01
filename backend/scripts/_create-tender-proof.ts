/**
 * Commit-6 proof: createTender is the single writer, and it survives a caller's
 * transaction.
 *
 * THE BUG THIS EXISTS TO CATCH. createTender writes two rows: the tender, and
 * the LoadActivity transition that carries a foreign key to it. When a caller
 * passes a transaction client, the tender insert enrols in that transaction —
 * but if the transition write goes to the SHARED client instead, it references
 * a tender row nothing outside the transaction can see yet, and Postgres
 * rejects the foreign key.
 *
 * TypeScript cannot see that: both calls compile. A mocked Prisma cannot either:
 * a mock has no foreign keys and returns whatever it is told. Only a real
 * database shows it, which is why this script exists.
 *
 * Local-only. Run with outbound keys explicitly EMPTY (§19 Sub-pattern 20):
 *   RESEND_API_KEY= OPENPHONE_API_KEY= npx tsx scripts/_create-tender-proof.ts
 */
import { prisma } from "../src/config/database";
import { createTender, tenderTtlMinutes } from "../src/services/tenderCreationService";
import { getTenderActivity } from "../src/services/loadActivityService";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  — " + d : ""}`); }
};

async function main() {
  const stamp = Date.now();
  const poster = await prisma.user.create({
    data: { email: `ct-p-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "BROKER" },
  });
  const cu = await prisma.user.create({
    data: { email: `ct-c-${stamp}@srl.invalid`, passwordHash: "x", firstName: "C", lastName: "Co", role: "CARRIER" },
  });
  const profile = await prisma.carrierProfile.create({ data: { userId: cu.id, companyName: `CT ${stamp}` } });
  const mkLoad = (n: string) => prisma.load.create({
    data: {
      referenceNumber: `CT-${stamp}-${n}`, posterId: poster.id, status: "POSTED",
      originCity: "Lebanon", originState: "NH", originZip: "03766",
      destCity: "North Lake", destState: "TX", destZip: "75568",
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
      equipmentType: "Reefer", rate: 4100,
    },
  });

  // ── 1. plain create: tender + its transition row ────────────────────────
  const l1 = await mkLoad("a");
  const t1 = await createTender({ loadId: l1.id, carrierProfileId: profile.id, offeredRate: 4000 });
  ok("defaults to OFFERED", t1.status === "OFFERED", t1.status);
  const h1 = await getTenderActivity(t1.id);
  ok("writes an opening transition row", h1.length === 1, String(h1.length));
  ok("the transition is scoped to this tender", h1[0]?.tenderId === t1.id);
  ok("and records the arrow", /→ OFFERED/.test(h1[0]?.description ?? ""), h1[0]?.description);

  // ── 2. TTL default and bounds ──────────────────────────────────────────
  const ttlMins = Math.round((t1.expiresAt.getTime() - t1.createdAt.getTime()) / 60000);
  ok(`expiry defaults to TENDER_TTL_MINUTES (${tenderTtlMinutes()}m)`, Math.abs(ttlMins - tenderTtlMinutes()) <= 1, `${ttlMins}m`);
  const prev = process.env.TENDER_TTL_MINUTES;
  process.env.TENDER_TTL_MINUTES = "1";      ok("a too-small env value clamps up to 15", tenderTtlMinutes() === 15, String(tenderTtlMinutes()));
  process.env.TENDER_TTL_MINUTES = "999999"; ok("a runaway env value clamps down to 10080", tenderTtlMinutes() === 10080, String(tenderTtlMinutes()));
  process.env.TENDER_TTL_MINUTES = "abc";    ok("a non-numeric env value falls back to 120", tenderTtlMinutes() === 120, String(tenderTtlMinutes()));
  if (prev === undefined) delete process.env.TENDER_TTL_MINUTES; else process.env.TENDER_TTL_MINUTES = prev;

  // ── 3. THE ONE THAT MATTERS — inside a caller's transaction ────────────
  // The transition row FKs to the tender. If it is written on the shared client
  // while the tender is uncommitted, Postgres rejects it.
  const l2 = await mkLoad("b");
  let txThrew: string | null = null;
  let t2id: string | null = null;
  try {
    const t2 = await prisma.$transaction(async (tx) => {
      const t = await createTender({ loadId: l2.id, carrierProfileId: profile.id, offeredRate: 4200 }, tx);
      await tx.load.update({ where: { id: l2.id }, data: { status: "TENDERED" } });
      return t;
    });
    t2id = t2.id;
  } catch (e) { txThrew = e instanceof Error ? e.message : String(e); }
  ok("createTender enrols in a caller's transaction without an FK violation", txThrew === null, txThrew ?? "");
  if (t2id) {
    const h2 = await getTenderActivity(t2id);
    ok("the transition row committed WITH the transaction", h2.length === 1, String(h2.length));
    const l2after = await prisma.load.findUnique({ where: { id: l2.id }, select: { status: true } });
    ok("and the sibling write in the same transaction landed", l2after!.status === "TENDERED");
  } else { fail += 2; console.log("  FAIL  (transaction assertions skipped — create threw)"); }

  // ── 4. atomicity: a failing sibling takes the tender AND its history ────
  const l3 = await mkLoad("c");
  let threw = false;
  try {
    await prisma.$transaction(async (tx) => {
      await createTender({ loadId: l3.id, carrierProfileId: profile.id, offeredRate: 4300 }, tx);
      await tx.load.update({ where: { id: "no-such-load-" + stamp }, data: { status: "TENDERED" } });
    });
  } catch { threw = true; }
  ok("a failing sibling aborts the transaction", threw);
  ok("no tender survives the rollback", (await prisma.loadTender.count({ where: { loadId: l3.id } })) === 0);
  ok("and no orphan transition row survives it either",
     (await prisma.loadActivity.count({ where: { loadId: l3.id } })) === 0);

  // ── 5. the settled-ACCEPTED exception (bid accept) ─────────────────────
  const l4 = await mkLoad("d");
  const now = new Date();
  const t4 = await createTender({
    loadId: l4.id, carrierProfileId: profile.id, offeredRate: 4400,
    status: "ACCEPTED", respondedAt: now, expiresAt: now, reason: "bid_accepted",
  });
  ok("a settled ACCEPTED row is allowed for bid-accept", t4.status === "ACCEPTED");
  ok("and carries its respondedAt — it did not go unanswered", t4.respondedAt !== null);
  const h4 = await getTenderActivity(t4.id);
  ok("its transition records the reason", (h4[0]?.metadata as any)?.reason === "bid_accepted");

  // cleanup
  await prisma.loadActivity.deleteMany({ where: { load: { referenceNumber: { startsWith: `CT-${stamp}` } } } });
  await prisma.loadTender.deleteMany({ where: { load: { referenceNumber: { startsWith: `CT-${stamp}` } } } });
  await prisma.load.deleteMany({ where: { referenceNumber: { startsWith: `CT-${stamp}` } } });
  await prisma.carrierProfile.delete({ where: { id: profile.id } });
  await prisma.user.deleteMany({ where: { id: { in: [cu.id, poster.id] } } });

  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
