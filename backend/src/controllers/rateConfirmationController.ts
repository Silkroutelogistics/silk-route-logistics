import { Response } from "express";
import { prisma } from "../config/database";
import { syncSettlementDocFlags } from "../services/integrationService";
import { AuthRequest } from "../middleware/auth";
import {
  createRateConfirmationSchema,
  updateRateConfirmationSchema,
  sendRateConfirmationSchema,
  signRateConfirmationSchema,
  sendToShipperSchema,
} from "../validators/rateConfirmation";
import { generateEnhancedRateConfirmation, generateShipperLoadConfirmation } from "../services/pdfService";
import { sendRateConfirmationEmail, sendEmail, wrap } from "../services/emailService";
import { resolveLoadStem, withDocumentNumber } from "../lib/documentNumber";
import { resolveIssuedElection } from "../services/autoRateConfirmationService";
import { log } from "../lib/logger";

/**
 * formData for the renderer, with this RC's own document number folded in.
 *
 * The number is NOT stored inside formData — that would be a second copy of a
 * @unique column and they would drift. It lives only in `rateConNumber` and is
 * injected here at render time, so every render path prints the same number and
 * regenerating a PDF reproduces it exactly.
 */
function renderFormData(rc: { rateConNumber: string | null; formData: unknown }): Record<string, any> {
  return { ...(rc.formData as Record<string, any>), rateConNumber: rc.rateConNumber };
}

export async function createRateConfirmation(req: AuthRequest, res: Response) {
  const { loadId, formData } = createRateConfirmationSchema.parse(req.body);

  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  const stem = resolveLoadStem(load);

  // Allocate the RC's document number at CREATION, never at render. A re-issue
  // is a new RateConfirmation row for the same load, so this is exactly where
  // SRL-121485R2 gets assigned. withDocumentNumber makes that safe when two AEs
  // re-issue at once: both compute R2, the @unique column admits one, the loser
  // rescans and takes R3. Numbers are never reused.
  //
  // A load with no stem cannot be numbered. That is unreachable for loads created
  // after the numbering fix, so it falls back to an unnumbered RC rather than
  // failing the request outright.
  const build = (rateConNumber: string | null) =>
    prisma.rateConfirmation.create({
      data: {
        loadId,
        rateConNumber,
        formData: formData as any,
        createdById: req.user!.id,
        carrierRate: formData.lineHaulRate,
        fuelSurcharge: formData.fuelSurcharge,
        accessorialTotal: formData.accessorials?.reduce((sum: number, a: { amount: number }) => sum + a.amount, 0),
        totalCharges: formData.totalCharges,
      },
    });

  const rc = stem
    ? await withDocumentNumber("RATE_CONFIRMATION", stem, build)
    : await build(null);

  res.status(201).json(rc);
}

export async function getRateConfirmationsByLoad(req: AuthRequest, res: Response) {
  const rcs = await prisma.rateConfirmation.findMany({
    where: { loadId: req.params.loadId },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(rcs);
}

export async function getRateConfirmationById(req: AuthRequest, res: Response) {
  const rc = await prisma.rateConfirmation.findUnique({
    where: { id: req.params.id },
    include: {
      load: {
        include: {
          poster: { select: { firstName: true, lastName: true, company: true, phone: true } },
          carrier: { select: { firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { mcNumber: true, dotNumber: true } } } },
          customer: true,
          // Sprint 48 (Item 108) — tender expiration banner data path.
          // Latest tender only; banner filters by status + expiry in renderer.
          tenders: {
            orderBy: { createdAt: "desc" },
            take: 1,
            where: { status: { in: ["OFFERED", "ACCEPTED"] } },
            select: { expiresAt: true, status: true },
          },
        },
      },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });

  if (!rc) { res.status(404).json({ error: "Rate confirmation not found" }); return; }
  res.json(rc);
}

export async function updateRateConfirmation(req: AuthRequest, res: Response) {
  const existing = await prisma.rateConfirmation.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Rate confirmation not found" }); return; }
  if (existing.status !== "DRAFT") { res.status(400).json({ error: "Only draft rate confirmations can be edited" }); return; }

  const { formData } = updateRateConfirmationSchema.parse(req.body);

  const rc = await prisma.rateConfirmation.update({
    where: { id: req.params.id },
    data: {
      formData: formData as any,
      carrierRate: formData?.lineHaulRate,
      fuelSurcharge: formData?.fuelSurcharge,
      accessorialTotal: formData?.accessorials?.reduce((sum: number, a: { amount: number }) => sum + a.amount, 0),
      totalCharges: formData?.totalCharges,
    },
  });

  res.json(rc);
}

/**
 * Issue a rate confirmation: send it to the carrier and freeze what it says.
 *
 * SENDING IS ISSUING, and issuing is the moment Quick Pay Agreement §3 cl.3
 * records the fee on the load. Everything about the Quick Pay election that
 * matters happens in this one handler, in this order:
 *
 *   1. resolve the elected speed and fee as a PAIR from the draft's formData
 *   2. refuse the whole send, 422, if they contradict each other
 *   3. print the resolved pair on the PDF, so the document and the frozen
 *      number are the same number
 *   4. freeze the pair onto the Load in the same update that opens the carrier
 *      portal's view of the document
 *
 * Step 4 is the one that used to happen at draft creation, seconds after tender
 * accept, with nothing anywhere requiring the draft to be sent at all. See the
 * note above resolveIssuedElection in autoRateConfirmationService for why that
 * charged carriers under documents they had never been shown.
 */
export async function sendRateConfirmation(req: AuthRequest, res: Response) {
  const { recipientEmail, recipientName, message } = sendRateConfirmationSchema.parse(req.body);

  const rc = await prisma.rateConfirmation.findUnique({
    where: { id: req.params.id },
    include: {
      load: {
        include: {
          // carrierProfile.tier prices the election: §8 says the speed decides
          // how fast and the tier decides how much, so the freeze cannot be
          // resolved without it.
          carrier: { select: { firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { mcNumber: true, dotNumber: true, tier: true } } } },
          customer: true,
          // Sprint 49 (Item 119) — poster relation for AE header sub-line.
          poster: { select: { firstName: true, lastName: true, phone: true } },
          tenders: {
            orderBy: { createdAt: "desc" },
            take: 1,
            where: { status: { in: ["OFFERED", "ACCEPTED"] } },
            select: { expiresAt: true, status: true },
          },
        },
      },
    },
  });

  if (!rc) { res.status(404).json({ error: "Rate confirmation not found" }); return; }

  // ── Step 1 + 2: resolve the election, refuse a contradictory one ──
  //
  // Refused BEFORE the PDF is built and long before the email goes out, so a
  // rate confirmation whose Quick Pay terms do not hang together is never seen
  // by a carrier at all. The AE gets the reason and a one-field fix.
  // The tier that priced the document wins, ahead of the carrier's tier today.
  //
  // This used to resolve the other way round, live tier first, which finalize
  // has never done. The two disagreed on the same data and the disagreement
  // blocked a legitimate re-send: a Silver carrier elects 7-day at 3%, the rate
  // confirmation issues at 3%, the carrier advances to Gold, and an AE re-sending
  // THE SAME DOCUMENT got 422 QP_FEE_ABOVE_LADDER, because 3% sits above Gold's
  // 2% rung. Finalize accepts that identical pair and its comment already carries
  // the reasoning: a carrier who advanced between send and finalize must not have
  // their already-issued load re-read against a ladder it was never priced on.
  // The same is true of the send that issued it.
  //
  // It also makes ONE send self-consistent. The stamp below is
  // `fd.carrierPaymentTier ?? …`, so a draft already carrying SILVER kept printing
  // SILVER while the fee beside it was being priced off the live GOLD ladder. The
  // document said one tier and was charged on another. Now both read the same
  // value, so what is printed is what was priced.
  //
  // fd.carrierPaymentTier is only ever a Caravan tier: autoRC writes the carrier's
  // tier there, this handler restamps it, and the AE modal has never sent the
  // field at all. It is never the legacy PaymentTier reporting label.
  const fd = (rc.formData as Record<string, any>) || {};
  const carrierTier = fd.carrierPaymentTier ?? rc.load.carrier?.carrierProfile?.tier ?? "SILVER";
  const election = resolveIssuedElection(fd, carrierTier);
  if (!election.ok) {
    res.status(422).json({ error: election.error, code: election.code });
    return;
  }

  // ── Step 3: the document states what will be charged ──
  //
  // The resolved pair is written back into formData before the PDF is rendered
  // and is persisted with the SENT status below, so the number frozen on the
  // load, the number stored on the rate confirmation, and the number on the
  // page a carrier signs are one number with one origin.
  const issuedFormData: Record<string, any> = {
    ...fd,
    // The tier resolved above, which already prefers whatever the draft was
    // stamped with. So an already-drafted document never changes what it prints,
    // and the tier recorded here is by construction the tier the fee beside it
    // was priced on. finalizeRateConfirmation re-anchors on this same field, and
    // so does a re-send, which is why a later promotion cannot re-read an issued
    // load against a ladder it was never priced on.
    carrierPaymentTier: carrierTier,
    quickPayFeePercent: election.feePercent,
    quickPaySpeed: election.speed,
    // v3.8.asb — quickPayCellValue deleted here too. See the note in
    // autoRateConfirmationService: the renderer measures its own cell and never
    // read this, and the string it produced would have overprinted TERMS.
  };

  // Generate PDF buffer
  const pdfDoc = generateEnhancedRateConfirmation(rc.load, { ...issuedFormData, rateConNumber: rc.rateConNumber });
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", resolve);
    pdfDoc.on("error", reject);
  });
  const pdfBuffer = Buffer.concat(chunks);

  // Send email with PDF attachment
  await sendRateConfirmationEmail(
    recipientEmail,
    recipientName || "Carrier",
    rc.load.referenceNumber,
    pdfBuffer,
    message,
  );

  // Update status to SENT, storing the exact formData that was rendered.
  await prisma.rateConfirmation.update({
    where: { id: rc.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      sentToEmail: recipientEmail,
      formData: issuedFormData as any,
    },
  });

  // ── Step 4: the freeze ──
  //
  // rateConfirmationPdfUrl is what makes the document visible in the carrier
  // portal, and the Quick Pay pair is what every charge path reads. They are
  // written in ONE statement because they describe the same event: SRL issued
  // this rate confirmation. A load can no longer carry a fee whose document the
  // carrier was never shown, because there is no other writer of
  // Load.quickPayFeePercent that runs before this one.
  //
  // v3.8.ajt B1 — Wire Load.rateConfirmationPdfUrl on send.
  // Pre-ajt the schema field existed but was NEVER populated by any write
  // path, so the carrier-portal RC download link at /carrier/dashboard/
  // my-loads gated on this field was invisible despite the endpoint
  // existing. The link points at the existing authenticated GET endpoint
  // at routes/rateConfirmations.ts; carrier's httpOnly cookie auths it
  // automatically when the link is clicked from the portal.
  //
  // §13.3 Item 170 closed by this change — the endpoint was shipped in
  // v3.8.aji-era work but the carrier could never reach it.
  await prisma.load.update({
    where: { id: rc.loadId },
    data: {
      rateConfirmationPdfUrl: `/api/rate-confirmations/${rc.id}/pdf`,
      quickPayFeePercent: election.feePercent,
      quickPaySpeed: election.speed,
    },
  });

  log.info(
    {
      rcId: rc.id,
      loadId: rc.loadId,
      tier: carrierTier,
      quickPaySpeed: election.speed,
      quickPayFeePercent: election.feePercent,
    },
    "[RC] Issued — Quick Pay election frozen onto the load",
  );

  res.json({ success: true, message: "Rate confirmation sent successfully" });
}

export async function downloadRateConfirmationPdf(req: AuthRequest, res: Response) {
  const rc = await prisma.rateConfirmation.findUnique({
    where: { id: req.params.id },
    include: {
      load: {
        include: {
          carrier: { select: { id: true, firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { mcNumber: true, dotNumber: true } } } },
          customer: true,
          // Sprint 49 (Item 119) — poster relation for AE header sub-line.
          poster: { select: { firstName: true, lastName: true, phone: true } },
          tenders: {
            orderBy: { createdAt: "desc" },
            take: 1,
            where: { status: { in: ["OFFERED", "ACCEPTED"] } },
            select: { expiresAt: true, status: true },
          },
        },
      },
    },
  });

  if (!rc) { res.status(404).json({ error: "Rate confirmation not found" }); return; }

  // v3.8.ajv C1 — Carrier ownership gate. Pre-ajv the endpoint was
  // authorized to CARRIER role (per routes/rateConfirmations.ts:24) but
  // had no per-record check that the logged-in CARRIER actually owns
  // the load. Result: any logged-in carrier could enumerate RC IDs
  // (cuid format) and download any other carrier's full RC PDF —
  // including carrier cost, fuel surcharge, accessorials, and margin.
  // Direct financial-espionage vector.
  //
  // Fix: when req.user.role === "CARRIER", require rc.load.carrierId
  // matches the requester. AE-side roles (BROKER/ADMIN/CEO/DISPATCH/
  // OPERATIONS/ACCOUNTING) bypass — they need to download any carrier's
  // RC during normal review workflow.
  if (req.user!.role === "CARRIER" && rc.load.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not authorized to download this rate confirmation" });
    return;
  }

  // ARC 19 — and the driver handset on this load must be PROVEN first.
  //
  // The rate confirmation is the document that sends a truck to a shipper.
  // Issuing it against a number nobody has confirmed means that when the load
  // goes quiet, dispatch is calling a handset that may never have existed. The
  // check is on the carrier path only: AE-side roles need to read the RC while
  // they are arranging the verification. §13.3 Item 225.
  if (req.user!.role === "CARRIER") {
    const { isDriverPhoneVerified } = await import("../services/driverVerificationService");
    if (!(await isDriverPhoneVerified(rc.loadId))) {
      res.status(403).json({
        error: "DRIVER_NOT_VERIFIED",
        message:
          "Confirm the driver mobile number before downloading the rate confirmation. We text a code " +
          "to the driver; entering it proves we can reach the person hauling this load.",
        action: { href: "/carrier/dashboard/my-loads", label: "Verify the driver" },
      });
      return;
    }
  }

  const doc = generateEnhancedRateConfirmation(rc.load, renderFormData(rc));
  // Filename now carries the RC's own number, so a re-issue downloads as
  // SRL-121485R2.pdf instead of overwriting the original in the AE's downloads
  // folder under an identical name.
  const filename = `${rc.rateConNumber || `RC-${rc.load.referenceNumber}`}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);
}

/**
 * Sign a rate confirmation — stores signer details and sets signed=true.
 */
export async function signRateConfirmation(req: AuthRequest, res: Response) {
  const { signerName, signerTitle, ipAddress } = signRateConfirmationSchema.parse(req.body);

  // v3.8.ajv C2 — Include load.carrierId in the lookup so we can verify
  // ownership before allowing sign. Pre-ajv the endpoint was authorized
  // to CARRIER role (per routes/rateConfirmations.ts:25) but had no
  // per-record check that the logged-in CARRIER actually owns the load.
  // Result: any logged-in carrier could sign any other carrier's RC,
  // falsifying commitment + corrupting audit trail (carrierSignature
  // field stores the wrong signer name).
  const rc = await prisma.rateConfirmation.findUnique({
    where: { id: req.params.id },
    include: { load: { select: { carrierId: true } } },
  });
  if (!rc) { res.status(404).json({ error: "Rate confirmation not found" }); return; }
  if (rc.signed) { res.status(400).json({ error: "Rate confirmation already signed" }); return; }

  // Carrier-only ownership gate. AE roles bypass — AE may need to
  // "mark as signed on behalf" for operational cases (carrier emailed
  // a wet signature outside the portal). Carrier role MUST own.
  if (req.user!.role === "CARRIER" && rc.load.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not authorized to sign this rate confirmation" });
    return;
  }

  const existingFormData = (rc.formData as Record<string, any>) || {};
  const updatedFormData = {
    ...existingFormData,
    carrierSignature: signerName,
    carrierSignTitle: signerTitle,
    carrierSignDate: new Date().toISOString(),
    carrierSignIP: ipAddress || req.ip,
  };

  const updated = await prisma.rateConfirmation.update({
    where: { id: req.params.id },
    data: {
      signed: true,
      signedAt: new Date(),
      status: "SIGNED",
      formData: updatedFormData as any,
    },
  });

  // v3.8.ath — a signed rate confirmation is the source event for the
  // docSignedRateCon column on the settlement checklist. Recomputed rather than
  // flipped, so signing twice is free.
  if (rc.loadId) {
    syncSettlementDocFlags(rc.loadId).catch((e) =>
      log.error({ err: e, loadId: rc.loadId }, "[Settlement] doc-flag sync after RC signing failed (non-fatal)"),
    );
  }

  res.json(updated);
}

/**
 * Send a shipper-facing Load Confirmation PDF (no carrier cost info).
 */
export async function sendToShipper(req: AuthRequest, res: Response) {
  const { recipientEmail, recipientName, message } = sendToShipperSchema.parse(req.body);

  const rc = await prisma.rateConfirmation.findUnique({
    where: { id: req.params.id },
    include: {
      load: {
        include: {
          carrier: { select: { firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { mcNumber: true, dotNumber: true } } } },
          customer: true,
        },
      },
    },
  });

  if (!rc) { res.status(404).json({ error: "Rate confirmation not found" }); return; }

  // Generate shipper PDF (no carrier cost)
  const pdfDoc = generateShipperLoadConfirmation(rc.load, rc.formData as Record<string, any>);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", resolve);
    pdfDoc.on("error", reject);
  });
  const pdfBuffer = Buffer.concat(chunks);

  const html = wrap(`
    <h2 style="color:#0f172a">Load Confirmation — ${rc.load.referenceNumber}</h2>
    <p>Hi ${recipientName || ""},</p>
    ${message ? `<p>${message}</p>` : ""}
    <p>Please find the attached Load Confirmation for load <strong>${rc.load.referenceNumber}</strong>.</p>
    <p>This document confirms the load details and schedule for your shipment.</p>
    <p>If you have any questions, please contact your account representative.</p>
  `);

  await sendEmail(
    recipientEmail,
    `Load Confirmation: ${rc.load.referenceNumber} — Silk Route Logistics`,
    html,
    [{ filename: `LC-${rc.load.referenceNumber}.pdf`, content: pdfBuffer }],
  );

  res.json({ success: true, message: "Load confirmation sent to shipper" });
}

/**
 * Finalize a rate confirmation — sets status to FINALIZED and updates the Load.
 */
export async function finalizeRateConfirmation(req: AuthRequest, res: Response) {
  const rc = await prisma.rateConfirmation.findUnique({
    where: { id: req.params.id },
    include: {
      load: {
        include: {
          // The Caravan tier, for the Quick Pay pair below. NOT
          // Load.carrierPaymentTier — that column is the legacy PaymentTier
          // reporting label (FLASH / PRIORITY / …), which carries no price.
          carrier: { select: { carrierProfile: { select: { tier: true } } } },
        },
      },
    },
  });
  if (!rc) { res.status(404).json({ error: "Rate confirmation not found" }); return; }
  if (rc.status === "FINALIZED") { res.status(400).json({ error: "Already finalized" }); return; }

  const fd = (rc.formData as Record<string, any>) || {};

  // Update RC status
  await prisma.rateConfirmation.update({
    where: { id: rc.id },
    data: { status: "FINALIZED" },
  });

  // Update the Load with financial & dispatch fields from the RC
  const loadUpdate: Record<string, unknown> = {};

  if (fd.customerRate !== undefined) loadUpdate.customerRate = fd.customerRate;
  if (fd.lineHaulRate !== undefined) loadUpdate.carrierRate = fd.lineHaulRate;
  if (fd.rateType) loadUpdate.rateType = fd.rateType;
  if (fd.fuelSurcharge !== undefined) loadUpdate.fuelSurcharge = fd.fuelSurcharge;
  if (fd.fuelSurchargeType) loadUpdate.fuelSurchargeType = fd.fuelSurchargeType;
  if (fd.totalCharges !== undefined) loadUpdate.totalCarrierPay = fd.totalCharges;
  // v3.8.asb — DELETED, do not restore. This copied fd.carrierPaymentTier
  // straight onto Load.carrierPaymentTier, which is `PaymentTier?`
  // (FLASH | EXPRESS | PRIORITY | PARTNER | ELITE | STANDARD). Since v3.8.asb,
  // sendRateConfirmation stamps a CARAVAN tier (SILVER | GOLD | PLATINUM) into
  // fd.carrierPaymentTier because that is what prices the load. Those are two
  // different vocabularies in one field name, so finalizing any rate
  // confirmation that had been sent first threw a Prisma enum error and 500'd.
  //
  // tsc could not see it: `loadUpdate` is Record<string, unknown>, so the
  // assignment type-checks and only fails at the database.
  //
  // The Caravan tier is already carried where it belongs — in the RC formData
  // (which is what the document printed) and via the carrier's own profile.
  // Load.carrierPaymentTier stays the legacy reporting label and is written by
  // the paths that own that vocabulary, not from a rate confirmation.
  if (fd.assignmentType) loadUpdate.assignmentType = fd.assignmentType;
  if (fd.driverName) loadUpdate.driverName = fd.driverName;
  if (fd.driverPhone) loadUpdate.driverPhone = fd.driverPhone;
  if (fd.truckNumber) loadUpdate.truckNumber = fd.truckNumber;
  if (fd.trailerNumber) loadUpdate.trailerNumber = fd.trailerNumber;
  if (fd.carrierDispatcherName || fd.dispatcherName) loadUpdate.carrierDispatcherName = fd.carrierDispatcherName || fd.dispatcherName;
  if (fd.carrierDispatcherPhone || fd.dispatcherPhone) loadUpdate.carrierDispatcherPhone = fd.carrierDispatcherPhone || fd.dispatcherPhone;
  if (fd.isMultiStop !== undefined) loadUpdate.isMultiStop = fd.isMultiStop;
  if (fd.stops) loadUpdate.stops = fd.stops;
  if (fd.extraStopPay !== undefined) loadUpdate.extraStopPay = fd.extraStopPay;
  if (fd.accessorials) loadUpdate.accessorials = fd.accessorials;
  if (fd.customTerms) loadUpdate.termsConditions = fd.customTerms;
  if (fd.specialInstructions) loadUpdate.specialInstructions = fd.specialInstructions;
  if (fd.pickupInstructions) loadUpdate.pickupInstructions = fd.pickupInstructions;
  if (fd.deliveryInstructions) loadUpdate.deliveryInstructions = fd.deliveryInstructions;

  // ── The Quick Pay pair, and only after the document has actually been sent ──
  //
  // This line used to copy fd.quickPayFeePercent onto the Load and never
  // fd.quickPaySpeed, which is half an election: the delivery path then read a
  // frozen fee next to whatever speed happened to be on the load, and a
  // mismatched pair prices a carrier's pay date and their fee off two different
  // facts. They move together here or not at all.
  //
  // Gated on sentAt because finalizing is not issuing. FINALIZED is an internal
  // status; nothing about it puts a document in a carrier's hands. Finalizing a
  // draft that was never sent must not record a fee, or it reopens exactly the
  // hole the send-path freeze closes. In the ordinary flow the rate confirmation
  // was sent first and this is a no-op that restates what send already froze.
  //
  // Anchored on fd.carrierPaymentTier — the tier PRINTED on the document —
  // ahead of the carrier's tier today. This is reproducing what SRL issued, not
  // pricing the load fresh, and a carrier who advanced Silver to Gold between
  // send and finalize must not have their already-issued load re-read against a
  // ladder it was never priced on.
  if (rc.sentAt) {
    const issued = resolveIssuedElection(fd, fd.carrierPaymentTier ?? rc.load.carrier?.carrierProfile?.tier);
    if (issued.ok) {
      loadUpdate.quickPayFeePercent = issued.feePercent;
      loadUpdate.quickPaySpeed = issued.speed;
    } else {
      // Unreachable through the send path, which refuses to issue a
      // contradictory pair. Leave the frozen values alone rather than write
      // half of a pair we cannot resolve.
      log.warn(
        { rcId: rc.id, loadId: rc.loadId, code: issued.code },
        "[RC] Finalize left the Quick Pay election untouched — the stored pair does not resolve",
      );
    }
  } else if (fd.quickPayFeePercent !== undefined || fd.quickPaySpeed !== undefined) {
    log.warn(
      { rcId: rc.id, loadId: rc.loadId },
      "[RC] Finalize skipped the Quick Pay election — this rate confirmation was never sent, so nothing was issued",
    );
  }

  // Recalculate margins if we have both rates (guard against division by zero)
  const custRate = (fd.customerRate ?? rc.load.customerRate ?? rc.load.rate) as number;
  const carrRate = fd.lineHaulRate ?? rc.load.carrierRate;
  if (custRate && custRate > 0 && carrRate && carrRate > 0) {
    loadUpdate.grossMargin = custRate - carrRate;
    loadUpdate.marginPercent = Math.round(((custRate - carrRate) / custRate) * 10000) / 100;
  }
  const dist = rc.load.distance;
  if (dist && dist > 0) {
    if (custRate) loadUpdate.revenuePerMile = Math.round((custRate / dist) * 100) / 100;
    if (carrRate) loadUpdate.costPerMile = Math.round((carrRate / dist) * 100) / 100;
    if (custRate && carrRate) loadUpdate.marginPerMile = Math.round(((custRate - carrRate) / dist) * 100) / 100;
  }

  // Update load status to TENDERED or DISPATCHED
  const currentStatus = rc.load.status;
  if (["POSTED", "BOOKED", "CONFIRMED"].includes(currentStatus)) {
    loadUpdate.status = "TENDERED";
    loadUpdate.tenderedAt = new Date();
    loadUpdate.tenderedById = req.user!.id;
  } else if (currentStatus === "TENDERED") {
    loadUpdate.status = "DISPATCHED";
  }

  const updatedLoad = await prisma.load.update({
    where: { id: rc.loadId },
    data: loadUpdate,
  });

  res.json({ rateConfirmation: { id: rc.id, status: "FINALIZED" }, load: updatedLoad });
}
