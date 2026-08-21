/**
 * Arc 15 — prove the mandatory-2FA wall actually gates.
 *
 * WHY THIS EXISTS. The mount-parity test asserted the string
 * "requireTotpEnrolled" appeared on each carrier mount line. It did, on all six,
 * and the wall gated exactly one of them — because the gate short-circuits on
 * `!req.user` and every carrier router calls `authenticate` INTERNALLY, after
 * the mount chain had already run. Presence is not function, and removing the
 * string to "adversarially verify" that guard could never have shown it.
 *
 * So this asks the only question worth asking: with a real session for a real
 * CARRIER who has NOT enrolled, does each carrier mount refuse?
 *
 * The session is minted directly rather than driven through registration —
 * registration requires multipart document uploads and is a different domain's
 * concern. Isolating the gate is the point.
 */

import jwt from "jsonwebtoken";

const BASE = "http://127.0.0.1:5055/api";

async function probe(path: string, cookie: string) {
  const r = await fetch(BASE + path, { headers: { Cookie: cookie } });
  let body: any = null;
  try { body = JSON.parse(await r.text()); } catch { /* non-JSON is fine */ }
  return { status: r.status, code: body?.code };
}

async function main() {
  const { prisma } = await import("../src/config/database");
  const stamp = Date.now();

  const user = await prisma.user.create({
    data: {
      email: `gateproof${stamp}@example.test`,
      passwordHash: "$2a$12$rehearsalonlyhashnotarealpasswordvaluehere000000000",
      firstName: "Gate", lastName: "Proof", role: "CARRIER",
      company: "Gate Proof Carrier LLC",
      emailVerifiedAt: new Date(),
      totpEnabled: false,          // ← the whole point
    } as any,
  });

  await prisma.carrierProfile.create({
    data: {
      userId: user.id,
      companyName: "Gate Proof Carrier LLC",
      mcNumber: `MC-${900000 + (stamp % 90000)}`,
      dotNumber: `${7000000 + (stamp % 900000)}`,
      onboardingStatus: "APPROVED", status: "APPROVED",
      isTestAccount: true,
      tier: "SILVER", cppTier: "SILVER",
    } as any,
  });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET as string, {
    algorithm: "HS256", expiresIn: "1h",
  });
  const cookie = `srl_token_carrier=${token}`;

  console.log(`subject: CARRIER, APPROVED, totpEnabled=false, session minted\n`);

  const gated = [
    "/carrier-loads/my-loads",
    "/carrier-compliance/overview",
    "/carrier-payments/",
    "/carrier-drivers/",
    "/carrier-tenders/active",
  ];
  const exempt = [
    "/carrier-auth/application-status",
    "/carrier-auth/totp/status",
  ];

  let failures = 0;

  console.log("─── must REFUSE an unenrolled carrier ───");
  for (const p of gated) {
    const r = await probe(p, cookie);
    const ok = r.status === 403 && r.code === "TOTP_ENROLLMENT_REQUIRED";
    if (!ok) failures++;
    console.log(`  ${ok ? "GATED    " : "NOT GATED"} ${String(r.status).padEnd(4)} ${p}`);
  }

  console.log("\n─── must REMAIN REACHABLE (or the wall is a lockout) ───");
  for (const p of exempt) {
    const r = await probe(p, cookie);
    const blocked = r.status === 403 && r.code === "TOTP_ENROLLMENT_REQUIRED";
    if (blocked) failures++;
    console.log(`  ${blocked ? "WRONGLY GATED" : "reachable    "} ${String(r.status).padEnd(4)} ${p}`);
  }

  console.log(`\n${failures === 0 ? "WALL HOLDS" : `WALL DOES NOT HOLD — ${failures} mount(s) wrong`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
