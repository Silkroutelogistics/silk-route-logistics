/**
 * Arc 14 — first-load dress rehearsal, document chain.
 *
 * Seeds the real BKN scenario into a throwaway container and drives the REAL
 * download controllers with a captured response, so every PDF comes off the
 * production data path rather than a hand-built fixture. A fixture would prove
 * the renderer works; this proves the renderer works ON THIS LOAD.
 *
 * NEVER run against production: it writes rows. It refuses to start unless
 * DATABASE_URL points at the rehearsal container port.
 *
 * Outbound is neutralised by ABSENCE, not by mocking — RESEND_API_KEY and
 * OPENPHONE_API_KEY are unset in the rehearsal env, so emailService takes its
 * `[Email][NoAPI]` log branch and openPhoneService throws before any network
 * call. Verified in-process below and printed, because "I assume it is
 * sandboxed" is exactly the assumption worth checking before writing rows.
 */

import fs from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "..", ".rehearsal-arc14");

function guard() {
  // ARC 15 CORRECTION — this guard was WRONG and it reported success.
  //
  // It read process.env at module top, which is BEFORE the first
  // `await import("../src/config/database")` pulls in config/env and runs
  // dotenv.config(). dotenv does not override an already-set variable, but
  // RESEND_API_KEY was never set by the rehearsal env file at all — so dotenv
  // filled it from backend/.env, which holds the PRODUCTION key. The guard had
  // already printed "both absent" by then.
  //
  // Nothing was ever sent (verified: zero "[Email] Sent to" lines across both
  // rehearsals, and autoGenerateInvoice's "AE notify" is a Notification row, not
  // an email). But that was luck about which code paths ran, not the control
  // working — and a safety control that is green for the wrong reason is the
  // §19 Sub-pattern 16 failure mode aimed at the most expensive possible target.
  //
  // Two changes: load dotenv HERE so we inspect the env the app will actually
  // see, and require the keys to be explicitly EMPTY rather than merely unset.
  // An empty string survives dotenv (it counts as set) and is falsy where the
  // code branches on it — emailService builds no client, openPhoneService throws
  // before any network call.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();

  const url = process.env.DATABASE_URL || "";
  if (!/:(55432|55433)\//.test(url) && !url.includes("55432") && !url.includes("55433")) {
    console.error("REFUSING: DATABASE_URL is not a rehearsal container (:55432/:55433).");
    console.error("   got:", url.replace(/:[^:@]*@/, ":***@"));
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    const v = process.env[k];
    if (v === undefined) {
      console.error(`REFUSING: ${k} is UNSET, which dotenv will fill from backend/.env.`);
      console.error(`   Set ${k}= (explicitly empty) in the rehearsal env instead.`);
      process.exit(1);
    }
    if (v !== "") {
      console.error(`REFUSING: ${k} is set to a real value. Outbound would be LIVE.`);
      process.exit(1);
    }
  }
  console.log("guard: rehearsal DB confirmed; RESEND_API_KEY and OPENPHONE_API_KEY explicitly empty (post-dotenv)");
}
guard();

/** A Response that captures a piped PDF instead of sending it. */
function captureRes() {
  const chunks: Buffer[] = [];
  let status = 200;
  let json: any = null;
  const res: any = {
    setHeader: () => res,
    status: (c: number) => { status = c; return res; },
    json: (b: any) => { json = b; return res; },
    write: (c: Buffer) => { chunks.push(Buffer.from(c)); return true; },
    end: (c?: Buffer) => { if (c) chunks.push(Buffer.from(c)); res._done = true; },
    on: () => res,
    once: () => res,
    emit: () => true,
    removeListener: () => res,
  };
  res._done = false;
  return {
    res,
    result: () => ({ status, json, buf: Buffer.concat(chunks) }),
    settled: () =>
      new Promise<void>((resolve) => {
        const t = setInterval(() => {
          if (res._done || status >= 400) { clearInterval(t); resolve(); }
        }, 40);
        setTimeout(() => { clearInterval(t); resolve(); }, 25000);
      }),
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { prisma } = await import("../src/config/database");

  // ── the scenario ──────────────────────────────────────────────────────────
  // Beekeepers Naturals: wellness CPG, so reefer with a temperature spec.
  // Lebanon NH → North Lake TX.
  const bkn = await prisma.customer.create({
    data: {
      name: "Beekeepers Naturals",
      email: "ap@beekeepersnaturals.invalid",
      phone: "(603) 555-0142",
      address: "12 Etna Road", city: "Lebanon", state: "NH", zip: "03766",
      status: "ACTIVE", onboardingStatus: "APPROVED",
      paymentTerms: "NET_30",
      vertical: "WELLNESS",
    } as any,
  });

  const carrierUser = await prisma.user.create({
    data: {
      email: "dispatch@rehearsalcarrier.invalid",
      passwordHash: "$2a$12$rehearsalonlyhashnotarealpasswordvaluehere000000000",
      firstName: "Dale", lastName: "Vasquez", role: "CARRIER",
      company: "Vasquez Cold Chain LLC", phone: "(214) 555-0188",
    } as any,
  });

  const carrier = await prisma.carrierProfile.create({
    data: {
      userId: carrierUser.id,
      companyName: "Vasquez Cold Chain LLC",
      mcNumber: "MC-998877", dotNumber: "3344556",
      onboardingStatus: "APPROVED", status: "APPROVED",
      isTestAccount: true,
      contactEmail: "dispatch@rehearsalcarrier.invalid",
      contactPhone: "(214) 555-0188",
      tier: "SILVER", cppTier: "SILVER",
    } as any,
  });

  const broker = await prisma.user.create({
    data: {
      email: "rehearsal-ae@srl.invalid",
      passwordHash: "$2a$12$rehearsalonlyhashnotarealpasswordvaluehere000000000",
      firstName: "Wasi", lastName: "Haider", role: "ADMIN",
    } as any,
  });

  const load = await prisma.load.create({
    data: {
      referenceNumber: "SRL-140001",
      loadNumber: "SRL-140001",
      posterId: broker.id,
      customerId: bkn.id,
      carrierId: carrierUser.id, // Load.carrierId -> User.id (LoadTender.carrierId -> CarrierProfile.id; 00a713.3 Item 57)
      status: "BOOKED",
      equipmentType: "Reefer 53'",
      commodity: "Raw honey and propolis wellness products, palletized",
      weight: 28400,
      pieces: 22,
      temperatureControlled: true,
      tempMin: 34, tempMax: 46, tempSetpoint: 38, reeferContinuous: true,
      originCompany: "Beekeepers Naturals — Lebanon Production",
      originAddress: "12 Etna Road", originCity: "Lebanon", originState: "NH", originZip: "03766",
      originContactName: "Marissa Boone", originContactPhone: "(603) 555-0142",
      destCompany: "North Lake Distribution Center",
      destAddress: "1450 Cleveland Gibbs Road", destCity: "North Lake", destState: "TX", destZip: "76262",
      destContactName: "Errol Pyne", destContactPhone: "(940) 555-0119",
      pickupDate: new Date("2026-08-25T08:00:00Z"),
      deliveryDate: new Date("2026-08-27T14:00:00Z"),
      rate: 4850, customerRate: 4850, carrierRate: 4100,
      distance: 1932,
      poNumbers: ["BKN-77413"],
      isTestAccount: true,
    } as any,
  });

  console.log(`seeded: customer=${bkn.name} carrier=${carrier.companyName} load=${load.referenceNumber}`);

  const produced: Array<{ name: string; file: string; bytes: number; note: string }> = [];

  // ── 1. EXECUTED BCA ───────────────────────────────────────────────────────
  {
    const { getAgreement } = await import("../src/data/agreements");
    const { generateAgreementBuffer } = await import("../src/services/agreementPdfService");
    const bca: any = getAgreement("broker-carrier");
    const buf = await generateAgreementBuffer(bca, {
      signature: {
        signedByName: "Dale Vasquez",
        signedByTitle: "Owner",
        signedAt: new Date("2026-08-21T15:04:00Z"),
        signerIp: "203.0.113.44",
        signedFromUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
        version: bca.version,
        carrierName: "Vasquez Cold Chain LLC",
      },
      // carrier identity is a SEPARATE option from signature — passing it inside
      // the signature block is why the first rehearsal run showed no carrier name.
      carrier: { legalName: "Vasquez Cold Chain LLC", mcNumber: "MC-998877", dotNumber: "3344556" },
    } as any);
    const f = path.join(OUT, "1-BCA-executed.pdf");
    fs.writeFileSync(f, buf);
    produced.push({ name: "Executed BCA", file: f, bytes: buf.length, note: `version ${bca.version}` });
  }

  // ── 2. RATE CONFIRMATION (real controller) ────────────────────────────────
  {
    const rc = await prisma.rateConfirmation.create({
      data: {
        loadId: load.id,
        createdById: broker.id,
        status: "SENT",
        formData: {
          carrierName: "Vasquez Cold Chain LLC",
          carrierMcNumber: "MC-998877",
          carrierDotNumber: "3344556",
          carrierContact: "Dale Vasquez",
          carrierPhone: "(214) 555-0188",
          lineHaul: 3850, fuelSurcharge: 250,
          totalCarrierPay: 4100,
          rateType: "FLAT",
          equipmentType: "Reefer 53'",
          tempSetpoint: 38, tempContinuous: true,
          pickupNumber: "BKN-PU-4471",
          poNumber: "BKN-77413",
          paymentTier: "STANDARD",
        },
        carrierRate: 3850, fuelSurcharge: 250, totalCharges: 4100,
      } as any,
    });
    const { downloadRateConfirmationPdf } = await import("../src/controllers/rateConfirmationController");
    const cap = captureRes();
    await downloadRateConfirmationPdf(
      { params: { id: rc.id }, user: { id: broker.id, role: "ADMIN", email: broker.email } } as any,
      cap.res,
    );
    await cap.settled();
    const r = cap.result();
    const f = path.join(OUT, "2-rate-confirmation.pdf");
    if (r.buf.length) fs.writeFileSync(f, r.buf);
    produced.push({
      name: "Rate Confirmation", file: f, bytes: r.buf.length,
      note: r.buf.length ? `rateConNumber=${(rc as any).rateConNumber ?? "(none)"}` : `FAILED status=${r.status} ${JSON.stringify(r.json)}`,
    });
  }

  // ── 3. BOL (real controller) ──────────────────────────────────────────────
  {
    const { downloadBOLFromLoad } = await import("../src/controllers/pdfController");
    const cap = captureRes();
    await downloadBOLFromLoad(
      { params: { loadId: load.id }, user: { id: broker.id, role: "ADMIN", email: broker.email } } as any,
      cap.res,
    );
    await cap.settled();
    const r = cap.result();
    const f = path.join(OUT, "3-BOL.pdf");
    if (r.buf.length) fs.writeFileSync(f, r.buf);
    produced.push({
      name: "BOL v2.9", file: f, bytes: r.buf.length,
      note: r.buf.length ? "from load" : `FAILED status=${r.status} ${JSON.stringify(r.json)}`,
    });
  }

  // ── 4. CUSTOMER INVOICE ───────────────────────────────────────────────────
  {
    const { autoGenerateInvoice } = await import("../src/services/invoiceService");
    let inv: any = null;
    try {
      inv = await autoGenerateInvoice(load.id);
    } catch (e: any) {
      console.log("  autoGenerateInvoice threw:", e?.message);
    }
    if (!inv) {
      const found = await prisma.invoice.findFirst({ where: { loadId: load.id } });
      inv = found;
    }
    if (inv) {
      const full = await prisma.invoice.findUnique({
        where: { id: inv.id },
        // mirrors invoiceController:319 exactly, so the renderer receives the
        // same shape production hands it.
        include: { load: { include: { customer: true } }, user: { select: { firstName: true, lastName: true, company: true } }, lineItems: { orderBy: { sortOrder: "asc" } } } as any,
      });
      const { generateInvoicePdf } = await import("../src/services/pdfService");
      const buf = await generateInvoicePdf(full as any);
      const f = path.join(OUT, "4-invoice.pdf");
      fs.writeFileSync(f, buf);
      produced.push({
        name: "Customer Invoice", file: f, bytes: buf.length,
        note: `invoiceNumber=${(full as any)?.invoiceNumber} srlDocNumber=${(full as any)?.srlDocNumber ?? "(none)"} total=${(full as any)?.totalAmount}`,
      });
    } else {
      produced.push({ name: "Customer Invoice", file: "(none)", bytes: 0, note: "AUTO-GENERATION DID NOT PRODUCE AN INVOICE" });
    }
  }

  console.log("\n─── produced ───");
  for (const p of produced) {
    console.log(`  ${p.bytes ? "OK  " : "FAIL"} ${p.name.padEnd(20)} ${String(p.bytes).padStart(7)} bytes  ${p.note}`);
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ load: load.referenceNumber, produced }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => { console.error("REHEARSAL FAILED:", e); process.exit(1); });
