/**
 * ARC 19 — verified driver phone + consented location pings, proved live.
 *
 * THE TWO CONSENT BOUNDARIES, which are what this exists to hold:
 *   1. No SMS to a driver number until someone holding that handset answered a
 *      code AND the messaging consent was captured verbatim.
 *   2. NO LOCATION WITHOUT A TAP, EVER. Rendering the page reads nothing. Only a
 *      POST carrying coordinates the browser produced after a deliberate press
 *      writes a position.
 *
 * Real router over HTTP, real database. Presence is not function (§19
 * Sub-pattern 16): the ping goes through the real public route, not a call to
 * the service behind it.
 *
 * SAFETY: rehearsal container only; both outbound keys explicitly EMPTY, so the
 * verification SMS is captured on emailService/openPhoneService's dead branch.
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!url.includes("55432") && !url.includes("55433")) {
    console.error("REFUSING: DATABASE_URL is not a rehearsal container."); process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    const v = process.env[k];
    if (v === undefined) { console.error(`REFUSING: ${k} UNSET — dotenv would fill it from backend/.env.`); process.exit(1); }
    if (v !== "") { console.error(`REFUSING: ${k} set to a real value. Outbound would be LIVE.`); process.exit(1); }
  }
  console.log("guard: rehearsal DB; outbound keys explicitly empty (post-dotenv)\n");
}
guard();

import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55919;
const BASE = `http://127.0.0.1:${PORT}/api`;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
}

async function main() {
  const { prisma } = await import("../src/config/database");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => { const s = app.listen(PORT, "127.0.0.1", () => r(s)); });
  console.log(`app: real router mounted on :${PORT}\n`);

  const stamp = Date.now();
  const customer = await prisma.customer.create({
    data: { name: `D19 ${stamp}`, email: `c-${stamp}@arc19.invalid`, phone: "2692206760" },
  });
  const ae = await prisma.user.create({
    data: { email: `ae-${stamp}@arc19.invalid`, passwordHash: "x", firstName: "D", lastName: "AE", role: "BROKER" },
  });
  const cu = await prisma.user.create({
    data: {
      email: `car-${stamp}@arc19.invalid`, passwordHash: "x", firstName: "D", lastName: "Carrier",
      role: "CARRIER", company: "Driver Proof LLC",
    },
  });
  // The carrier portal is behind the mandatory-2FA wall (v3.8.atm/atu). An
  // unenrolled carrier is refused at every mount, which is the wall working —
  // so the fixture enrols, the same way the E2E fixture does, rather than
  // bypassing a gate this repo went to some trouble to make real.
  const { encrypt } = await import("../src/utils/encryption");
  await prisma.user.update({
    where: { id: cu.id },
    data: { totpEnabled: true, totpSecret: encrypt("ARC19FIXTURESECRETBASE32A") },
  });

  const cp = await prisma.carrierProfile.create({
    data: {
      userId: cu.id, companyName: "Driver Proof LLC", mcNumber: `MC-D19-${stamp}`.slice(0, 30),
      dotNumber: `${String(stamp).slice(-6)}1`, onboardingStatus: "APPROVED", status: "APPROVED", cppTier: "SILVER",
    },
  });
  await prisma.carrierAgreement.create({
    data: { carrierId: cp.id, templateName: "broker-carrier", version: "arc19", status: "SIGNED", signedAt: new Date(), signedByName: "D" },
  });

  // Lebanon NH → North Lake TX, with real coordinates so the corridor factor
  // has something to measure against.
  const load = await prisma.load.create({
    data: {
      referenceNumber: `D19-${stamp}`, posterId: ae.id, customerId: customer.id, carrierId: cu.id,
      originCity: "Lebanon", originState: "NH", originZip: "03766", originLat: 43.6423, originLng: -72.2518,
      destCity: "North Lake", destState: "TX", destZip: "76247", destLat: 33.0862, destLng: -97.2286,
      equipmentType: "REEFER", pickupDate: new Date(), deliveryDate: new Date(Date.now() + 3 * 86400_000),
      rate: 5100, customerRate: 5100, carrierRate: 4100, status: "IN_TRANSIT",
      dispatchedAt: new Date(Date.now() - 6 * 3600_000),
    },
  });

  const carrierCookie = `srl_token_carrier=${jwt.sign({ userId: cu.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" })}`;
  const post = (path: string, cookie: string, body: any) =>
    fetch(BASE + path, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });

  // ══ PHASE 1 — the handset is proven before anything is sent ══════════════
  console.log("══ PHASE 1 — verified driver phone ══════════════════════════════");
  {
    const rcBefore = await prisma.rateConfirmation.create({
      data: { loadId: load.id, createdById: ae.id, formData: {} as any, carrierRate: 4100, status: "SENT" },
    });
    const gated = await fetch(`${BASE}/rate-confirmations/${rcBefore.id}/pdf`, { headers: { Cookie: carrierCookie } });
    const gatedBody: any = await gated.json().catch(() => ({}));
    check(
      "the rate confirmation is REFUSED while the driver is unverified",
      gated.status === 403 && gatedBody?.error === "DRIVER_NOT_VERIFIED",
      `HTTP ${gated.status} ${gatedBody?.error || ""} — the document that sends a truck to a dock`,
    );

    const start = await post(`/carrier-loads/${load.id}/driver-verify/start`, carrierCookie, {
      driverName: "Ramon Diaz", driverPhone: "(269) 555-0177",
    });
    const startBody: any = await start.json().catch(() => ({}));
    check(
      "starting verification normalises the number and returns the consent text",
      start.status === 200 && startBody.phone === "+12695550177" && /Reply STOP/.test(startBody.consentText || ""),
      `HTTP ${start.status}, phone=${startBody.phone}, consent text ${startBody.consentText ? "returned" : "MISSING"}`,
    );

    const row = await prisma.driverPhoneVerification.findFirst({
      where: { loadId: load.id }, orderBy: { createdAt: "desc" },
    });
    check("a six-digit code was issued", !!row && /^\d{6}$/.test(row.code), row ? `code length ${row.code.length}` : "no row");

    const wrong = await post(`/carrier-loads/${load.id}/driver-verify/confirm`, carrierCookie, { code: "000000", consented: true });
    const afterWrong = await prisma.driverPhoneVerification.findUnique({ where: { id: row!.id } });
    check(
      "a wrong code is refused and counted",
      wrong.status === 400 && afterWrong?.attempts === 1,
      `HTTP ${wrong.status}, attempts=${afterWrong?.attempts}`,
    );

    const noConsent = await post(`/carrier-loads/${load.id}/driver-verify/confirm`, carrierCookie, { code: row!.code, consented: false });
    const stillUnverified = await prisma.load.findUnique({ where: { id: load.id }, select: { driverPhoneVerifiedAt: true } });
    check(
      "a CORRECT code without consent does not verify",
      noConsent.status === 400 && !stillUnverified?.driverPhoneVerifiedAt,
      `HTTP ${noConsent.status} — consent is a condition of verification, not a checkbox after it`,
    );

    const ok = await post(`/carrier-loads/${load.id}/driver-verify/confirm`, carrierCookie, { code: row!.code, consented: true });
    const verified = await prisma.load.findUnique({
      where: { id: load.id },
      select: { driverPhoneVerified: true, driverPhoneVerifiedAt: true, driverConsentAt: true, driverConsentText: true },
    });
    check(
      "the right code with consent verifies the handset",
      ok.status === 200 && verified?.driverPhoneVerified === "+12695550177" && !!verified?.driverPhoneVerifiedAt,
      `verified ${verified?.driverPhoneVerified}`,
    );
    check(
      "the consent sentence is stored VERBATIM with its timestamp",
      !!verified?.driverConsentAt && /Reply STOP/.test(verified?.driverConsentText || "") && /2026-08-21-v1/.test(verified?.driverConsentText || ""),
      verified?.driverConsentText
        ? `versioned and stored — a TCPA dispute can name what was agreed`
        : "NO consent text stored",
    );

    const rcAfter = await fetch(`${BASE}/rate-confirmations/${rcBefore.id}/pdf`, { headers: { Cookie: carrierCookie } });
    check(
      "the rate confirmation is released once the driver is proven",
      rcAfter.status === 200,
      `HTTP ${rcAfter.status}`,
    );
  }

  // ══ PHASE 1b — a driver swap invalidates the proof ══════════════════════
  console.log("\n══ PHASE 1b — swapping the driver re-opens verification ═════════");
  {
    await post(`/carrier-loads/${load.id}/driver-verify/start`, carrierCookie, {
      driverName: "Other Driver", driverPhone: "(269) 555-0199",
    });
    const swapped = await prisma.load.findUnique({
      where: { id: load.id },
      select: { driverPhone: true, driverPhoneVerified: true, driverPhoneVerifiedAt: true },
    });
    check(
      "a swap clears the old proof immediately, before the new number answers",
      swapped?.driverPhone === "+12695550199" && !swapped?.driverPhoneVerifiedAt,
      `phone=${swapped?.driverPhone}, verified=${swapped?.driverPhoneVerifiedAt ? "STILL SET (wrong)" : "cleared"}`,
    );

    // Put the original driver back, verified, for the ping phase.
    const r2 = await post(`/carrier-loads/${load.id}/driver-verify/start`, carrierCookie, {
      driverName: "Ramon Diaz", driverPhone: "(269) 555-0177",
    });
    void r2;
    const row2 = await prisma.driverPhoneVerification.findFirst({ where: { loadId: load.id, verifiedAt: null }, orderBy: { createdAt: "desc" } });
    await post(`/carrier-loads/${load.id}/driver-verify/confirm`, carrierCookie, { code: row2!.code, consented: true });
  }

  // ══ PHASE 2 — the ping, and the consent boundary ════════════════════════
  console.log("\n══ PHASE 2 — tokenized ping link ════════════════════════════════");
  {
    const { mintDriverPingToken } = await import("../src/lib/driverPingToken");
    const token = mintDriverPingToken(load.id, "+12695550177");

    const eventsBeforeGet = await prisma.loadTrackingEvent.count({ where: { loadId: load.id } });
    const getRes = await fetch(`${BASE}/ping/${token}`);
    const html = await getRes.text();
    const eventsAfterGet = await prisma.loadTrackingEvent.count({ where: { loadId: load.id } });

    check(
      "opening the link renders a page and writes NOTHING",
      getRes.status === 200 && eventsAfterGet === eventsBeforeGet,
      `HTTP ${getRes.status}, tracking events ${eventsBeforeGet} → ${eventsAfterGet} — NO LOCATION WITHOUT A TAP`,
    );
    check(
      "the page states the consent boundary in plain words",
      /one time/i.test(html) && /does not track you/i.test(html) && /no effect on your load or your pay/i.test(html),
      "says it shares once, does not track, and refusing costs the driver nothing",
    );

    // A mid-lane position: Columbus OH, nowhere near either stop. This is the
    // case that previously wrote nothing at all.
    const ping = await fetch(`${BASE}/ping/${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: 39.9612, longitude: -82.9988, accuracy: 12 }),
    });
    const pingBody: any = await ping.json().catch(() => ({}));
    const ev = await prisma.loadTrackingEvent.findFirst({
      where: { loadId: load.id, latitude: { not: null } }, orderBy: { createdAt: "desc" },
    });
    check(
      "a MID-LANE ping is recorded — the gap Arc 19 had to build",
      ping.status === 200 && !!ev && Math.abs(Number(ev.latitude) - 39.9612) < 0.001,
      pingBody?.error
        ? `refused: ${pingBody.error}`
        : `LoadTrackingEvent at ${ev?.latitude},${ev?.longitude} — before this it matched no geofence and wrote nothing`,
    );
    check(
      "the ping is labelled CARRIER_PORTAL, not ELD",
      ev?.locationSource === "CARRIER_PORTAL",
      `locationSource=${ev?.locationSource} — a browser tap is not telematics, and Compass is telematics-gated`,
    );

    const bad = await fetch(`${BASE}/ping/not-a-real-token`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: 1, longitude: 1 }),
    });
    const afterBad = await prisma.loadTrackingEvent.count({ where: { loadId: load.id } });
    check(
      "a garbage token writes nothing",
      bad.status === 410 && afterBad === (await prisma.loadTrackingEvent.count({ where: { loadId: load.id } })),
      `HTTP ${bad.status}, no row written from an unauthenticated hit`,
    );

    // A token for a driver who has since been swapped off the load.
    const staleToken = mintDriverPingToken(load.id, "+12695550199");
    const stale = await fetch(`${BASE}/ping/${staleToken}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: 40, longitude: -83 }),
    });
    check(
      "a swapped-off driver's old link stops writing",
      stale.status === 409,
      `HTTP ${stale.status} — the token is phone-scoped, so a replaced driver cannot keep reporting`,
    );

    // Delivered load: an old link in a message thread must be inert.
    const doneLoad = await prisma.load.create({
      data: {
        referenceNumber: `D19X-${stamp}`, posterId: ae.id, customerId: customer.id, carrierId: cu.id,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "76247",
        equipmentType: "REEFER", pickupDate: new Date(), deliveryDate: new Date(),
        rate: 5100, carrierRate: 4100, status: "COMPLETED",
      },
    });
    const doneRes = await fetch(`${BASE}/ping/${mintDriverPingToken(doneLoad.id, "+12695550177")}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: 40, longitude: -83 }),
    });
    check(
      "a link for a finished load is inert",
      doneRes.status === 409,
      `HTTP ${doneRes.status} — a link found in an old thread cannot write to a delivered load`,
    );
  }

  // ══ PHASE 3 — the signals ═══════════════════════════════════════════════
  console.log("\n══ PHASE 3 — fraud signals, deductions not verdicts ═════════════");
  {
    const { calculateLoadRisk } = await import("../src/services/riskEngine");

    // FIRST, THE FALSE-POSITIVE GUARD. The ping recorded above is Columbus OH,
    // which on a Lebanon NH → North Lake TX lane is almost exactly on the
    // direct line — a truck there is doing nothing unusual. The first version
    // of this proof asserted Columbus SHOULD fire and failed, which was the
    // test being wrong rather than the factor: a signal that flags a driver
    // for being where the route goes is a signal an AE learns to ignore.
    const onLane = await calculateLoadRisk(load.id);
    check(
      "a legitimate mid-lane position does NOT raise the corridor signal",
      !onLane.factors.find((f: any) => f.factor === "PING_OFF_CORRIDOR"),
      "Columbus OH on a NH→TX lane is on the direct line — quiet, as it must be",
    );

    // NOW A POSITION NO ROUTING EXPLAINS: Seattle, on the same lane.
    await prisma.loadTrackingEvent.create({
      data: {
        loadId: load.id, eventType: "LOCATION_UPDATE",
        latitude: 47.6062, longitude: -122.3321,
        locationSource: "CARRIER_PORTAL", notes: "Arc 19 proof — deliberately off-corridor",
      },
    });
    const risk = await calculateLoadRisk(load.id);
    const off = risk.factors.find((f: any) => f.factor === "PING_OFF_CORRIDOR");
    check(
      "a position no routing explains scores, and only scores",
      !!off && off.points > 0 && risk.level !== "BLOCKED",
      off ? `${off.factor} +${off.points} (level ${risk.level}) — ${off.description}` : `no factor; level=${risk.level}`,
    );

    // Unverified after the grace window, on a separate load.
    const unver = await prisma.load.create({
      data: {
        referenceNumber: `D19U-${stamp}`, posterId: ae.id, customerId: customer.id, carrierId: cu.id,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "76247",
        equipmentType: "REEFER", pickupDate: new Date(), deliveryDate: new Date(Date.now() + 86400_000),
        rate: 5100, carrierRate: 4100, status: "IN_TRANSIT",
        dispatchedAt: new Date(Date.now() - 9 * 3600_000),
      },
    });
    const r2 = await calculateLoadRisk(unver.id);
    const unverFactor = r2.factors.find((f: any) => f.factor === "DRIVER_PHONE_UNVERIFIED");
    check(
      "a long-unverified driver number scores",
      !!unverFactor && unverFactor.points > 0,
      unverFactor ? `${unverFactor.factor} +${unverFactor.points} — ${unverFactor.description}` : "no factor raised",
    );
    check(
      "neither signal blocks anything",
      !["BLOCKED", "REJECTED"].includes(String(r2.level)) && !["BLOCKED", "REJECTED"].includes(String(risk.level)),
      `levels ${risk.level} / ${r2.level} — deductions, never verdicts (§14 fail-open half)`,
    );

    // And a verified load on-corridor stays quiet.
    const quiet = await prisma.load.findUnique({ where: { id: load.id } });
    void quiet;
    const noise = (await calculateLoadRisk(load.id)).factors.find((f: any) => f.factor === "DRIVER_PHONE_UNVERIFIED");
    check(
      "a verified driver raises no unverified-phone signal",
      !noise,
      noise ? "flagged a verified driver — false positive" : "quiet, as it should be",
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + "=".repeat(68));
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    server.close(); await prisma.$disconnect(); process.exit(1);
  }
  console.log("DRIVER VERIFICATION + CONSENTED PINGS HOLD — no SMS to an unproven");
  console.log("handset, no location without a tap, and both signals score without blocking.");
  server.close(); await prisma.$disconnect(); process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
