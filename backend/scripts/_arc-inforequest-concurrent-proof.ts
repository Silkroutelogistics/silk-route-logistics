/**
 * Several concurrent info requests on ONE carrier, against a REAL database.
 *
 * Everything else in this arc is unit-level: mocked Prisma, mocked services.
 * A mock cannot tell you whether the schema permits three OPEN rows for one
 * carrier, whether the carrier-side query returns all of them, or whether the
 * last-open detector flips the status at the right moment — those are database
 * properties, and a mock says whatever it was told to.
 *
 * This is the owner's requirement stated as an executable claim: multiple
 * concurrent requests on one carrier are possible, the carrier can see all of
 * them, answering one does not end the conversation, and answering the last one
 * does.
 *
 * Run against a THROWAWAY container only. Outbound must be explicitly empty —
 * not merely unset, because dotenv fills an absent key from backend/.env, which
 * is how a guard once reported "both absent" while holding the production key
 * (§19 Sub-pattern 20).
 *
 * The container is the one `npm run test:e2e:local` leaves running:
 *
 *   cd backend
 *   DATABASE_URL="postgresql://ci:ci@localhost:55440/ci?sslmode=disable" \
 *   DIRECT_URL="postgresql://ci:ci@localhost:55440/ci?sslmode=disable" \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= \
 *   JWT_SECRET=ci-test-secret ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
 *   npx tsx scripts/_arc-inforequest-concurrent-proof.ts
 *
 * Last run 2026-09-05 on v3.8.bap: 19/19, and `[Email] Sent to` count 0.
 *
 * It writes rows and deletes them again. It refuses to start against a
 * non-local DATABASE_URL or with any outbound key set, so the refusal is a
 * property of the script rather than of whoever runs it.
 */
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL || "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("REFUSING: DATABASE_URL is not local. This script writes rows.\n  " + url);
  process.exit(2);
}
for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "QUO_API_KEY"]) {
  if (process.env[k]) {
    console.error(`REFUSING: ${k} is set to a real value. Outbound would be LIVE.`);
    process.exit(2);
  }
}

const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ok   ${label}${detail ? "  — " + detail : ""}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? "  — " + detail : ""}`); }
}

async function main() {
  const stamp = Date.now();
  const { createInfoRequest, cancelInfoRequest, resolveInfoRequest } = await import(
    "../src/services/infoRequestService"
  );

  const ae = await prisma.user.create({
    data: {
      email: `ae-${stamp}@srl.invalid`, passwordHash: "x", firstName: "Ada", lastName: "AE", role: "ADMIN",
    },
  });
  const carrierUser = await prisma.user.create({
    data: {
      email: `carrier-${stamp}@srl.invalid`, passwordHash: "x", firstName: "Sam", lastName: "Carrier", role: "CARRIER",
    },
  });
  const carrier = await prisma.carrierProfile.create({
    data: {
      userId: carrierUser.id,
      companyName: `Concurrent Test ${stamp}`,
      mcNumber: `MC-${stamp}`.slice(0, 20),
      dotNumber: String(stamp).slice(-8),
      onboardingStatus: "REVIEWING",
    },
  });

  console.log("\n[1] three concurrent requests against one carrier");
  const a = await createInfoRequest({ carrierId: carrier.id, createdById: ae.id, category: "COI_UPDATE", message: "Please send an updated COI." });
  const b = await createInfoRequest({ carrierId: carrier.id, createdById: ae.id, category: "W9_UPDATE", message: "Please send a current W-9 form." });
  const c = await createInfoRequest({ carrierId: carrier.id, createdById: ae.id, category: "VOIDED_CHECK", message: "Please send a voided business check." });

  const open = await prisma.infoRequest.count({ where: { carrierId: carrier.id, status: "OPEN" } });
  check("all three rows exist and are OPEN", open === 3, `open=${open}`);
  check("they are distinct rows", new Set([a.id, b.id, c.id]).size === 3);

  const afterCreate = await prisma.carrierProfile.findUnique({ where: { id: carrier.id }, select: { onboardingStatus: true } });
  check("status flipped once to INFO_REQUESTED, not three times", afterCreate?.onboardingStatus === "INFO_REQUESTED", String(afterCreate?.onboardingStatus));

  console.log("\n[2] the carrier can see all three (the portal's own query)");
  const carrierView = await prisma.infoRequest.findMany({
    where: { carrierId: carrier.id, status: "OPEN" },
    orderBy: { createdAt: "asc" },
  });
  check("carrier-side list returns all three", carrierView.length === 3, `got ${carrierView.length}`);

  console.log("\n[3] answering ONE does not end the conversation");
  await resolveInfoRequest({ requestId: a.id, carrierUserId: carrierUser.id, resolvedNote: "COI attached." });
  const afterOne = await prisma.carrierProfile.findUnique({ where: { id: carrier.id }, select: { onboardingStatus: true } });
  const stillOpen = await prisma.infoRequest.count({ where: { carrierId: carrier.id, status: "OPEN" } });
  check("two remain open", stillOpen === 2, `open=${stillOpen}`);
  check("status stays INFO_REQUESTED while any remain", afterOne?.onboardingStatus === "INFO_REQUESTED", String(afterOne?.onboardingStatus));

  console.log("\n[4] a fourth request is still creatable while three are in flight");
  const d = await createInfoRequest({ carrierId: carrier.id, createdById: ae.id, category: "OTHER", message: "One more thing, please." });
  check("fourth request created", !!d.id);
  const openNow = await prisma.infoRequest.count({ where: { carrierId: carrier.id, status: "OPEN" } });
  check("three open again", openNow === 3, `open=${openNow}`);

  console.log("\n[5] cancelling and answering the rest returns the carrier to REVIEWING");
  await cancelInfoRequest({ requestId: d.id, cancelledById: ae.id });
  await resolveInfoRequest({ requestId: b.id, carrierUserId: carrierUser.id, resolvedNote: "W-9 attached." });
  const midway = await prisma.carrierProfile.findUnique({ where: { id: carrier.id }, select: { onboardingStatus: true } });
  check("still INFO_REQUESTED with one left", midway?.onboardingStatus === "INFO_REQUESTED", String(midway?.onboardingStatus));

  await resolveInfoRequest({ requestId: c.id, carrierUserId: carrierUser.id, resolvedNote: "Check attached." });
  const final = await prisma.carrierProfile.findUnique({ where: { id: carrier.id }, select: { onboardingStatus: true } });
  const finalOpen = await prisma.infoRequest.count({ where: { carrierId: carrier.id, status: "OPEN" } });
  check("no open requests remain", finalOpen === 0, `open=${finalOpen}`);
  check("status returns to REVIEWING on the LAST one", final?.onboardingStatus === "REVIEWING", String(final?.onboardingStatus));

  console.log("\n[6] F2 — the three closed statuses are refused, by the database-backed service");
  for (const status of ["APPROVED", "REJECTED", "SUSPENDED"] as const) {
    await prisma.carrierProfile.update({ where: { id: carrier.id }, data: { onboardingStatus: status } });
    const before = await prisma.infoRequest.count({ where: { carrierId: carrier.id } });
    let code = "";
    try {
      await createInfoRequest({ carrierId: carrier.id, createdById: ae.id, category: "OTHER", message: "Should never be written." });
    } catch (e) {
      code = (e as { code?: string }).code || "";
    }
    const after = await prisma.infoRequest.count({ where: { carrierId: carrier.id } });
    check(`${status} refused with CARRIER_NOT_UNDER_REVIEW`, code === "CARRIER_NOT_UNDER_REVIEW", code || "(no throw)");
    check(`${status} wrote no row`, before === after, `${before} -> ${after}`);
  }

  console.log("\n[7] F3 — the label the carrier sees is the shared one");
  const withdrawn = await prisma.infoRequest.findUnique({ where: { id: d.id }, select: { category: true, status: true } });
  const { getCategoryLabel } = await import("../src/services/infoRequestService");
  check("the cancelled OTHER request reads as a noun phrase", getCategoryLabel(withdrawn!.category) === "Additional information", getCategoryLabel(withdrawn!.category));
  check("it was actually CANCELLED", withdrawn!.status === "CANCELLED", withdrawn!.status);

  // Cleanup — this is a throwaway container, but leaving rows behind makes the
  // next run's counts lie.
  await prisma.infoRequest.deleteMany({ where: { carrierId: carrier.id } });
  await prisma.carrierProfile.delete({ where: { id: carrier.id } });
  await prisma.user.deleteMany({ where: { id: { in: [ae.id, carrierUser.id] } } });

  console.log(`\n${pass}/${pass + fail} passed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
