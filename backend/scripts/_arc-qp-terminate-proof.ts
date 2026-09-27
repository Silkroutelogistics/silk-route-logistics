// v3.8.blt — proof that terminating a Quick Pay Agreement switches Quick Pay
// off in the same transaction, against a REAL Postgres, by calling the real
// handler (terminateAgreement) with the app's own client.
//
// The unit tests mock Prisma, including $transaction. What a mock cannot show
// is that the interactive transaction runs on the extended client, that the
// SIGNED count sees the row the same transaction just terminated, and that a
// second signed row really does keep Quick Pay on.
//
// Local containers only; the handler writes. Outbound: the handler sends no
// email, only an in-app notification row.
//
//   DATABASE_URL=postgresql://ci:ci@127.0.0.1:<port>/ci ENCRYPTION_KEY=<64 hex> \
//     npx tsx scripts/_arc-qp-terminate-proof.ts
const url = process.env.DATABASE_URL ?? "";
const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
if (!["127.0.0.1", "localhost"].includes(host)) {
  console.error(`REFUSING: DATABASE_URL host is "${host}". This proof writes rows and runs on a local container only.`);
  process.exit(1);
}

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

(async () => {
  const { prisma } = await import("../src/config/database");
  const { terminateAgreement } = await import("../src/controllers/carrierVettingController");
  const run = `qp-term-${Date.now()}`;

  const call = async (carrierId: string, agreementId: string) => {
    let status = 200;
    let body: any = null;
    const res: any = {
      status(c: number) { status = c; return res; },
      json(b: any) { body = b; return res; },
    };
    await terminateAgreement(
      { params: { id: carrierId, agreementId }, body: { reason: "Proof: reversing a test signature" }, user: { id: "proof-admin", role: "ADMIN" }, headers: {} } as any,
      res,
    );
    return { status, body };
  };

  const made: { users: string[]; profiles: string[] } = { users: [], profiles: [] };
  const carrier = async (tag: string) => {
    const user = await prisma.user.create({
      data: { email: `${run}-${tag}@srl.invalid`, passwordHash: "x", firstName: "Qp", lastName: "Proof", role: "CARRIER" },
    });
    const profile = await prisma.carrierProfile.create({
      data: {
        userId: user.id, companyName: `${run} ${tag} LLC`,
        quickPayEnabled: true, quickPayAgreedAt: new Date(), quickPayVersion: "SRL-QPA-2026-R6",
        quickPayAgreedFromIp: "203.0.113.9", quickPayAgreedFromUserAgent: "proof",
      },
    });
    made.users.push(user.id);
    made.profiles.push(profile.id);
    return profile;
  };
  const signed = (carrierId: string, version: string, templateName = "quick-pay") =>
    prisma.carrierAgreement.create({
      data: { carrierId, templateName, version, status: "SIGNED", signedAt: new Date(), signedByName: "Proof Signer" },
    });

  try {
    // 1. One signed Quick Pay Agreement: terminating it switches Quick Pay off.
    const a = await carrier("single");
    const qpA = await signed(a.id, "SRL-QPA-2026-R6");
    const r1 = await call(a.id, qpA.id);
    const pa = await prisma.carrierProfile.findUnique({ where: { id: a.id } });
    const rowA = await prisma.carrierAgreement.findUnique({ where: { id: qpA.id } });
    check("the handler answers 200", r1.status === 200, `status ${r1.status}`);
    check("the agreement is TERMINATED, not deleted", rowA?.status === "TERMINATED");
    check("quickPayEnabled is false", pa?.quickPayEnabled === false);
    check("agreed-at, version and the agreed-from fields are cleared",
      pa?.quickPayAgreedAt === null && pa?.quickPayVersion === null &&
      pa?.quickPayAgreedFromIp === null && pa?.quickPayAgreedFromUserAgent === null);
    check("the response says Quick Pay was switched off", r1.body?.quickPayDisabled === true);

    // 2. Two signed rows: ending the older one leaves the newer in force.
    const b = await carrier("double");
    const older = await signed(b.id, "SRL-QPA-2026-R5-old");
    await signed(b.id, "SRL-QPA-2026-R6");
    const r2 = await call(b.id, older.id);
    const pb = await prisma.carrierProfile.findUnique({ where: { id: b.id } });
    check("with another signed agreement in force, Quick Pay stays on",
      pb?.quickPayEnabled === true && pb?.quickPayVersion === "SRL-QPA-2026-R6");
    check("and the response says so", r2.body?.quickPayDisabled === false);

    // 3. A Broker-Carrier termination never touches Quick Pay.
    const c = await carrier("bca");
    const bca = await signed(c.id, "SRL-BCA-2026-R3", "broker-carrier");
    await signed(c.id, "SRL-QPA-2026-R6");
    await call(c.id, bca.id);
    const pc = await prisma.carrierProfile.findUnique({ where: { id: c.id } });
    check("terminating the BCA leaves Quick Pay exactly as it was",
      pc?.quickPayEnabled === true && pc?.quickPayVersion === "SRL-QPA-2026-R6");

    // 4. The carrier was told the Quick Pay truth, not the BCA one.
    const note = await prisma.notification.findFirst({
      where: { userId: made.users[0] }, orderBy: { createdAt: "desc" },
    });
    check("the Quick Pay notice says Quick Pay is off and loads can still be accepted",
      !!note?.message.includes("Quick Pay is off") && !!note?.message.includes("You can still accept loads") &&
      !note?.message.includes("not be able to accept new loads"));
    check("and it promises no fee only on loads delivered from now on (v3.8.blx)",
      !!note?.message.includes("loads delivered from now on") && !note?.message.includes("any load not yet paid"));

    // 5. The carrier who still holds a signed agreement is told nothing changed.
    const noteB = await prisma.notification.findFirst({
      where: { userId: made.users[1] }, orderBy: { createdAt: "desc" },
    });
    check("the carrier still holding a signed agreement is told Quick Pay is unchanged (v3.8.blx)",
      !!noteB?.message.includes("Quick Pay is unchanged") && !noteB?.message.includes("Quick Pay is off"));

    // 6. v3.8.blx — two terminations of one carrier's two signed rows, sent
    //    together. Before the row lock each counted the other's row as still
    //    SIGNED and both left Quick Pay on with nothing in force. Several
    //    carriers, so an interleaving that happens to serialize cannot hide it.
    const RACES = 6;
    const racers = [];
    for (let i = 0; i < RACES; i++) {
      const c = await carrier(`race${i}`);
      const x = await signed(c.id, "SRL-QPA-2026-R5-old");
      const y = await signed(c.id, "SRL-QPA-2026-R6");
      racers.push({ c, x, y });
    }
    const results = await Promise.all(racers.flatMap(({ c, x, y }) => [call(c.id, x.id), call(c.id, y.id)]));
    check("every concurrent termination answered 200", results.every((r) => r.status === 200),
      results.map((r) => r.status).join(","));
    let stuck = 0;
    for (const { c } of racers) {
      const pr = await prisma.carrierProfile.findUnique({ where: { id: c.id } });
      const left = await prisma.carrierAgreement.count({ where: { carrierId: c.id, templateName: "quick-pay", status: "SIGNED" } });
      if (left === 0 && pr?.quickPayEnabled !== false) stuck++;
    }
    check("after both rows end together, Quick Pay is off for every carrier", stuck === 0,
      `${stuck} of ${RACES} left on with no signed agreement`);
    check("and exactly one of each pair reported switching it off",
      racers.every((_, i) => [results[2 * i], results[2 * i + 1]].filter((r) => r.body?.quickPayDisabled === true).length === 1));
  } finally {
    await prisma.notification.deleteMany({ where: { userId: { in: made.users } } });
    await prisma.carrierAgreement.deleteMany({ where: { carrierId: { in: made.profiles } } });
    await prisma.carrierProfile.deleteMany({ where: { id: { in: made.profiles } } });
    await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    await prisma.$disconnect();
  }
  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
