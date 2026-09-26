// v3.8.blr — proof that the carrier's EIN is stored encrypted and read back in
// clear by every reader that needs it, against a REAL Postgres.
//
// The subject is the Prisma extension in config/database.ts, which is not
// reachable by a unit test (the suite mocks the client). Before this commit it
// encrypted `args.data` only, and an upsert carries its payload in
// `create` / `update` — the exact shape registration uses to store the EIN. So
// the claim to prove is that an UPSERT writes ciphertext.
//
// The write is the same call registration makes (prisma.carrierIdentityVerification
// .upsert with w9TinFull + w9TinLastFour), through the app's own client, so the
// extension under test is the one in the build. The raw column is then read
// with a BARE PrismaClient, which has no extension and sees the stored bytes.
//
// Local containers only. Outbound keys are irrelevant here: nothing sends.
//
//   DATABASE_URL=postgresql://ci:ci@127.0.0.1:<port>/ci ENCRYPTION_KEY=<64 hex> \
//     npx tsx scripts/_arc-ein-proof.ts
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
if (!["127.0.0.1", "localhost"].includes(host)) {
  console.error(`REFUSING: DATABASE_URL host is "${host}". This proof writes rows and runs on a local container only.`);
  process.exit(1);
}
if (!process.env.ENCRYPTION_KEY) {
  console.error("REFUSING: ENCRYPTION_KEY is unset, so the extension would throw rather than encrypt.");
  process.exit(1);
}

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

(async () => {
  const { prisma, decryptStoredValue } = await import("../src/config/database");
  const bare = new PrismaClient({ datasourceUrl: url });
  const run = `ein-proof-${Date.now()}`;
  // Nine digits that appear nowhere else in the database.
  const EIN = "987654321";

  const user = await bare.user.create({
    data: { email: `${run}@srl.invalid`, passwordHash: "x", firstName: "Ein", lastName: "Proof", role: "CARRIER" },
  });
  const profile = await bare.carrierProfile.create({ data: { userId: user.id, companyName: `${run} LLC` } });

  try {
    // 1. The registration write: an upsert with no row yet (the create branch).
    await prisma.carrierIdentityVerification.upsert({
      where: { carrierId: profile.id },
      create: { carrierId: profile.id, w9TinFull: EIN, w9TinLastFour: EIN.slice(-4) },
      update: { w9TinFull: EIN, w9TinLastFour: EIN.slice(-4) },
    });
    let raw = await bare.carrierIdentityVerification.findUnique({ where: { carrierId: profile.id } });
    check("create branch stores ciphertext", !!raw?.w9TinFull?.startsWith("enc:") && !raw.w9TinFull.includes(EIN),
      `stored prefix "${raw?.w9TinFull?.slice(0, 7)}", length ${raw?.w9TinFull?.length}`);
    check("the last four stay readable (chameleon + display)", raw?.w9TinLastFour === "4321");

    // 2. The same call again, now hitting the update branch.
    await prisma.carrierIdentityVerification.upsert({
      where: { carrierId: profile.id },
      create: { carrierId: profile.id, w9TinFull: EIN, w9TinLastFour: EIN.slice(-4) },
      update: { w9TinFull: EIN, w9TinLastFour: EIN.slice(-4) },
    });
    raw = await bare.carrierIdentityVerification.findUnique({ where: { carrierId: profile.id } });
    check("update branch stores ciphertext", !!raw?.w9TinFull?.startsWith("enc:") && !raw.w9TinFull.includes(EIN));
    check("encrypted once, not twice", (raw?.w9TinFull?.match(/enc:/g) ?? []).length === 1);

    // 3. Model-level read (loadCarrierIdentity, tinMatchService) decrypts.
    const viaModel = await prisma.carrierIdentityVerification.findUnique({
      where: { carrierId: profile.id }, select: { w9TinFull: true },
    });
    check("a model-level read returns the EIN in clear", viaModel?.w9TinFull === EIN);

    // 4. A nested include (carrierVettingService) does NOT decrypt on its own —
    //    which is why the vetting call site decrypts explicitly.
    const nested = await prisma.carrierProfile.findUnique({
      where: { id: profile.id }, include: { identityVerification: true },
    });
    const nestedTin = nested?.identityVerification?.w9TinFull ?? "";
    check("a nested include still holds ciphertext (the reason for the explicit decrypt)", nestedTin.startsWith("enc:"));
    check("decryptStoredValue recovers it", decryptStoredValue(nestedTin) === EIN);

    // 5. A plaintext value written before encryption reads back unchanged.
    await bare.carrierIdentityVerification.update({ where: { carrierId: profile.id }, data: { w9TinFull: EIN } });
    const legacy = await prisma.carrierIdentityVerification.findUnique({
      where: { carrierId: profile.id }, select: { w9TinFull: true },
    });
    check("a legacy plaintext row still reads (production holds none; defensive)", legacy?.w9TinFull === EIN);
  } finally {
    await bare.carrierIdentityVerification.deleteMany({ where: { carrierId: profile.id } });
    await bare.carrierProfile.delete({ where: { id: profile.id } });
    await bare.user.delete({ where: { id: user.id } });
    await bare.$disconnect();
    await prisma.$disconnect();
  }
  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
