/**
 * Where a carrier signs a rate confirmation.
 *
 * PUBLIC BY NECESSITY, and the token IS the authorization — the same shape as
 * /tender-action and /ping. A carrier opens this from an email, routinely on a
 * phone, and requiring a portal session first would put a login wall between a
 * carrier and the document we need signed. The token is single-use, expires, and
 * is bound to one rate confirmation, so it authorizes exactly one act.
 *
 * WHY THE PAGE IS RENDERED HERE rather than in the portal. The frontend is a
 * static export (next.config `output: "export"`), so a runtime-token route
 * cannot be enumerated at build time — §13.3 Item 31/156. /tender-action solved
 * this by serving self-contained branded HTML straight from the API, and this
 * follows it rather than inventing a second answer.
 *
 * WHAT IS CAPTURED, and why it is more than a name. §14 records that the RC
 * carried weaker evidence than the master agreements it is governed by. The
 * signature record here is typed name, IP, user agent, server timestamp, and
 * the id of the token redeemed — plus the content hash of the exact bytes the
 * carrier was shown, which is the half that makes the rest mean anything.
 */

import { Router, Request, Response } from "express";
import { prisma } from "../config/database";
import { hashRcSignToken, checkSignToken } from "../lib/rcSignToken";
import { settleTender } from "../services/tenderTransitionService";
import { syncSettlementDocFlags } from "../services/integrationService";
import { extractClientIp } from "../services/geoService";
import { clientUserAgent } from "../lib/clientIp";
import { generateSignatureCertificate } from "../services/signatureCertificateService";
import { uploadFileToPath } from "../services/storageService";
import { getAgreementState, type AgreementReader, type AgreementVerdict } from "../lib/agreementState";
import { recordSecurityEvent } from "../lib/securityAudit";
import { stampCarrierAcceptance } from "../lib/acceptanceEvidence";
import { log } from "../lib/logger";

/**
 * The carrier's My Loads page, where a signed load's bill of lading now is.
 * One constant, imported by carrierLoads for its refusal pages too (the
 * tenderAction precedent: the portal host is fixed, not env-derived).
 */
export const PORTAL_MY_LOADS = "https://silkroutelogistics.ai/carrier/dashboard/my-loads";

const router = Router();

/**
 * The shell, borrowed rather than reinvented.
 *
 * `/api/public-assets/brand.css` already exists for exactly this problem — an
 * API-served page that has to look like SRL — and /ping links it. Writing an
 * inline stack here instead named "Segoe UI" and Roboto, which the typography
 * guard caught: neither is a family the brand skill names, and a signature page
 * in the wrong typeface is the one page where looking unofficial matters most.
 * Serving from 'self' also keeps the CSP intact.
 */
/** Exported for the carrier's portal mint (carrierLoads), whose refusals are
 *  reached by a form-POST navigation and must be a page, not JSON. */
export function rcPage(opts: { title: string; body: string }): string {
  return page(opts);
}

function page(opts: { title: string; body: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${opts.title} · Silk Route Logistics</title>
<link rel="stylesheet" href="/api/public-assets/brand.css">
</head><body class="ping"><div class="card"><div class="rule"></div>${opts.body}
<p class="foot">Silk Route Logistics Inc. · USDOT 4526880 · MC# 1794414<br>
Questions: operations@silkroutelogistics.ai · (269) 220-6760</p></div></body></html>`;
}

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : "$" + Math.round(n).toLocaleString();

/**
 * Ordering here is the design, and it is the same ordering `checkSignToken`
 * uses: a carrier who already signed and re-opens their link must be told the
 * signature landed. Telling them it expired sends them chasing a dispatcher over
 * work that is done.
 */
/**
 * B4a — the token proves who is asking; the LOAD decides whether there is
 * anything left to sign. The cascade voids live RCs and kills their tokens on
 * cancel, so this is the second lock on the same door: a token minted before
 * a cancellation, or one the cascade somehow missed, must still be refused
 * against the load row rather than trusted on its own validity.
 */
export function loadIsDead(load: { status: string; deletedAt: Date | null }): boolean {
  return load.deletedAt !== null || load.status === "CANCELLED" || load.status === "TONU";
}

function refusal(reason: string): { status: number; title: string; body: string } {
  if (reason === "LOAD_NOT_LIVE") {
    return {
      status: 409,
      title: "Load cancelled",
      body: `<h1>This load has been cancelled</h1>
        <p>There is nothing to sign. The rate confirmation you were sent is no longer in force.</p>
        <p>If you have questions about the cancellation, contact your dispatcher or operations@silkroutelogistics.ai.</p>`,
    };
  }
  if (reason === "ALREADY_USED") {
    return {
      status: 409,
      title: "Already signed",
      body: `<h1>This rate confirmation is signed</h1>
        <p>Nothing further is needed. Your signature is on file and the load is confirmed.</p>
        <p>If you need another copy, ask your dispatcher or open the load in your carrier portal.</p>`,
    };
  }
  if (reason === "EXPIRED") {
    return {
      status: 410,
      title: "Link expired",
      body: `<h1>This signing link has expired</h1>
        <p>Signing links are good for a few hours so an unsigned rate confirmation cannot sit open indefinitely.</p>
        <p>Ask your dispatcher to send a new one. <strong>The rate confirmation itself has not changed</strong> — only the link.</p>`,
    };
  }
  return {
    status: 404,
    title: "Link not found",
    body: `<h1>We could not find this signing link</h1>
      <p>It may have been superseded by a newer one. Ask your dispatcher to send the current link.</p>`,
  };
}

/**
 * BCA Commit 2 (v3.8.beh's backstop, §14 AGREEMENT_MISSING) — a rate
 * confirmation is signed UNDER the Broker-Carrier Agreement, so a signature
 * with no executed agreement behind it binds the carrier to a load on terms
 * nobody has agreed to govern it. The tender gate refuses that carrier a tender
 * (absolute, no override) and the RC send path is not gated by ruling D2 — so
 * the one way an unsigned carrier reaches this page is a termination between
 * accept and send, and this is the last lock on the door. It asks
 * `getAgreementState`, the same predicate the gate and the Compass factor use,
 * never its own where-clause.
 */
function agreementRefusal(v: AgreementVerdict): { status: number; title: string; body: string } {
  if (v.state === "TERMINATED") {
    const when = v.terminated?.terminatedAt
      ? new Date(v.terminated.terminatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "";
    return {
      status: 409,
      title: "Agreement terminated",
      body: `<h1>This carrier's Broker-Carrier Agreement was terminated</h1>
        <p>Silk Route Logistics terminated the Broker-Carrier Agreement with this carrier${when ? ` on ${when}` : ""}. A rate confirmation cannot be signed under a terminated agreement, and a new one has to be executed before this link can be used.</p>
        <p>Contact <strong>operations@silkroutelogistics.ai</strong> or (269) 220-6760. Nothing has been recorded.</p>`,
    };
  }
  return {
    status: 409,
    title: "Sign the Broker-Carrier Agreement first",
    body: `<h1>Sign the Broker-Carrier Agreement first</h1>
      <p>A rate confirmation is signed under the Broker-Carrier Agreement, and there is no executed agreement on file for this carrier. Sign it in your carrier portal, then open this link again &mdash; <strong>the link is still good</strong>.</p>
      <a class="cta" href="https://silkroutelogistics.ai/carrier/dashboard/activation">Sign the agreement</a>
      <p class="foot">The rate confirmation itself has not changed, and nothing has been recorded.</p>`,
  };
}

/**
 * The BCA question for the carrier ON THE LOAD. `Load.carrierId` is a User.id
 * and the agreement rows hang off CarrierProfile.id (§13.3 Items 57, 222.4),
 * so the profile is resolved first. A load with no carrier, or a carrier with
 * no profile, has no executed agreement — MISSING, not an error — and the
 * refusal says to sign one, which is also the only thing that can fix it.
 */
async function bcaStateForLoad(carrierUserId: string | null, db: AgreementReader) {
  const profile = carrierUserId
    ? await db.carrierProfile.findUnique({ where: { userId: carrierUserId }, select: { id: true } })
    : null;
  const verdict: AgreementVerdict = profile
    ? await getAgreementState(profile.id, db)
    : { state: "MISSING", signed: null, terminated: null };
  return { profileId: profile?.id ?? null, verdict };
}

async function resolve(token: string) {
  const rc = await prisma.rateConfirmation.findFirst({
    where: { signTokenHash: hashRcSignToken(token) },
    include: {
      load: {
        select: {
          id: true, referenceNumber: true, loadNumber: true,
          originCity: true, originState: true, destCity: true, destState: true,
          pickupDate: true, equipmentType: true, carrierRate: true,
          // B4a — the LOAD decides whether there is anything left to sign.
          status: true, deletedAt: true,
          // BCA Commit 2 — and WHO is signing decides whether they may.
          carrierId: true,
        },
      },
    },
  });
  return rc;
}

/** The form. */
router.get("/:token", async (req: Request, res: Response) => {
  const rc = await resolve(String(req.params.token));
  if (!rc) {
    const r = refusal("NOT_FOUND");
    res.status(r.status).type("html").send(page({ title: r.title, body: r.body }));
    return;
  }
  const v = checkSignToken(rc);
  if (!v.ok) {
    const r = refusal(v.reason);
    res.status(r.status).type("html").send(page({ title: r.title, body: r.body }));
    return;
  }
  if (loadIsDead(rc.load)) {
    const r = refusal("LOAD_NOT_LIVE");
    res.status(r.status).type("html").send(page({ title: r.title, body: r.body }));
    return;
  }
  // Sign-first: a carrier with no executed BCA is shown where to sign it, not
  // the form. The POST decides again inside its transaction; this is so the
  // carrier is told before they type a name, not after.
  const { verdict } = await bcaStateForLoad(rc.load.carrierId, prisma);
  if (verdict.state !== "SIGNED") {
    const r = agreementRefusal(verdict);
    res.status(r.status).type("html").send(page({ title: r.title, body: r.body }));
    return;
  }

  const l = rc.load;
  const lane = `${l.originCity}, ${l.originState} &rarr; ${l.destCity}, ${l.destState}`;
  res.type("html").send(page({
    title: "Sign rate confirmation",
    body: `<h1>Rate confirmation</h1>
      <p>Load ${l.loadNumber ?? l.referenceNumber ?? ""} &middot; ${lane}</p>
      <div class="kv"><span>Equipment</span><span>${l.equipmentType ?? "—"}</span></div>
      <div class="kv"><span>Pickup</span><span>${l.pickupDate ? new Date(l.pickupDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span></div>
      <div class="kv"><span>Total carrier pay</span><span><strong>${money(rc.carrierRate ?? l.carrierRate)}</strong></span></div>
      <p>Review the rate confirmation attached to the email that brought you here. Signing below accepts it as written.</p>
      <form method="POST" action="/api/rc-sign/${encodeURIComponent(String(req.params.token))}">
        <label class="field" for="signerName">Type your full name to sign</label>
        <input type="text" id="signerName" name="signerName" required minlength="2" maxlength="120" autocomplete="name" placeholder="First and last name">
        <div class="consent">
          <input type="checkbox" id="attest" name="attest" value="yes" required>
          <label for="attest">I am authorized to bind this carrier, and I agree that typing my name is my electronic signature on this rate confirmation.</label>
        </div>
        <button type="submit">Sign rate confirmation</button>
      </form>
      <p class="foot">This link signs this rate confirmation once and then stops working.</p>`,
  }));
});

/** The signature. */
router.post("/:token", async (req: Request, res: Response) => {
  const signerName = String((req.body?.signerName ?? "")).trim();
  const attested = String(req.body?.attest ?? "") === "yes";

  const rc = await resolve(String(req.params.token));
  if (!rc) {
    const r = refusal("NOT_FOUND");
    res.status(r.status).type("html").send(page({ title: r.title, body: r.body }));
    return;
  }
  const v = checkSignToken(rc);
  if (!v.ok) {
    const r = refusal(v.reason);
    res.status(r.status).type("html").send(page({ title: r.title, body: r.body }));
    return;
  }
  if (loadIsDead(rc.load)) {
    const r = refusal("LOAD_NOT_LIVE");
    res.status(r.status).type("html").send(page({ title: r.title, body: r.body }));
    return;
  }

  // The attestation is a precondition of the act, not decoration. A signature
  // taken from someone who did not tick it is a signature nobody agreed to give,
  // so it is checked server-side rather than trusted to the `required` attribute.
  if (signerName.length < 2 || !attested) {
    res.status(400).type("html").send(page({
      title: "Signature incomplete",
      body: `<h1>We could not record that signature</h1>
        <p>Both a full name and the authorization checkbox are required. Go back and try again — the link is still good.</p>`,
    }));
    return;
  }

  const signedAt = new Date();
  const signerIp = extractClientIp(req as never);
  const signerUserAgent = clientUserAgent(req as never);

  // THE AGREEMENT IS RE-EVALUATED INSIDE THE TRANSACTION THAT WRITES THE
  // SIGNATURE, on the transaction client, so the state decided on is the state
  // that commits beside the signature — not a read from a moment earlier that
  // the GET already did. A refusal returns before any write: the row is
  // untouched, the token is NOT consumed (the link stays good, because the
  // remedy is to sign the BCA and come back), and the refusal is recorded
  // below as an audit row rather than silently answered.
  //
  // SINGLE USE IS ENFORCED BY THE UPDATE, not by the check above.
  //
  // The check tells a carrier what happened; this is what makes it true. Scoping
  // the write to `signTokenUsedAt: null` means two simultaneous submissions --
  // a double-tap on a phone, a retried request -- resolve to one signature,
  // because the second matches no row. A check-then-write would let both through.
  const outcome = await prisma.$transaction(async (tx) => {
    const { verdict } = await bcaStateForLoad(rc.load.carrierId, tx);
    if (verdict.state !== "SIGNED") return { refused: verdict, claimed: 0 };
    const claimed = await tx.rateConfirmation.updateMany({
      where: { id: rc.id, signTokenUsedAt: null },
      data: {
        signed: true,
        signedAt,
        status: "SIGNED",
        signerName,
        signerIp,
        signerUserAgent,
        signTokenUsedAt: signedAt,
      },
    });
    // C4a — the signature IS an acceptance, and this is the strongest evidence
    // of one the platform has: a single-use link, a typed name, an IP, a user
    // agent, a server timestamp, and a content hash over the exact bytes signed.
    //
    // IDENTITY COMES FROM THE LOAD, NEVER FROM THE TYPED NAME. signerName is a
    // free-text input. It is evidence of who signed and it cannot establish
    // WHICH CARRIER a load belongs to, so the carrier is resolved token ->
    // RateConfirmation -> load.carrierId. byUserId is null because this route is
    // mounted without `authenticate` and has no session at all — the token is
    // the authorization.
    //
    // Only when the signature actually landed: claimed.count is 0 on a replayed
    // link, and a replay must not stamp an acceptance the first submission
    // already recorded.
    if (claimed.count === 1 && rc.load.carrierId) {
      await stampCarrierAcceptance(
        {
          loadId: rc.loadId,
          via: "RC_SIGNATURE",
          carrierUserId: rc.load.carrierId,
          byUserId: null,
          at: signedAt,
        },
        tx as never,
      );
    }
    return { refused: null as AgreementVerdict | null, claimed: claimed.count };
  });

  if (outcome.refused) {
    const reason = outcome.refused.state === "TERMINATED" ? "AGREEMENT_TERMINATED" : "BCA_REQUIRED";
    // The subject of the audit row is the carrier whose signature was refused.
    // audit_logs.userId is a required FK, so a load with no carrier leaves only
    // a log line — there is no user to hang the row on.
    if (rc.load.carrierId) {
      await recordSecurityEvent({
        userId: rc.load.carrierId,
        action: "RC_SIGN_REFUSED",
        note: `Rate confirmation signature refused: ${reason === "BCA_REQUIRED" ? "no executed Broker-Carrier Agreement on file" : "Broker-Carrier Agreement terminated"}`,
        req: req as never,
        details: { reason, rateConfirmationId: rc.id, loadId: rc.loadId, signTokenId: rc.signTokenId ?? null },
      });
    } else {
      log.warn({ rcId: rc.id, loadId: rc.loadId, reason }, "[RC] signature refused on a load with no carrier");
    }
    const r = agreementRefusal(outcome.refused);
    res.status(r.status).type("html").send(page({ title: r.title, body: r.body }));
    return;
  }

  const claimed = { count: outcome.claimed };
  if (claimed.count === 0) {
    const r = refusal("ALREADY_USED");
    res.status(r.status).type("html").send(page({ title: r.title, body: r.body }));
    return;
  }

  // The certificate, and why it is a separate document rather than a stamp on
  // the original.
  //
  // The brief asked for the PDF to be stamped with name, timestamp and hash.
  // Stamping the issued document would change its bytes -- and those bytes are
  // the evidence, because contentHash describes them. A rate confirmation whose
  // hash no longer matches what was signed is worse than one with no stamp at
  // all. PDFKit also cannot append to an existing PDF, so an overlay would mean
  // re-rendering, which is the defect commit 11b just closed.
  //
  // So the signature lives in its own one-page certificate that NAMES the hash
  // of the document it attests to. That is stronger evidence than an overlay: it
  // binds the signature to a specific artifact rather than to a fresh render
  // that happens to resemble it.
  try {
    const doc = generateSignatureCertificate({
      rateConNumber: rc.rateConNumber,
      loadRef: rc.load.loadNumber ?? rc.load.referenceNumber ?? rc.loadId,
      lane: `${rc.load.originCity}, ${rc.load.originState} to ${rc.load.destCity}, ${rc.load.destState}`,
      signerName, signerIp, signerUserAgent, signedAt,
      tokenId: rc.signTokenId,
      contentHash: rc.contentHash,
      carrierRate: rc.carrierRate ?? rc.load.carrierRate ?? null,
    });
    const parts: Buffer[] = [];
    await new Promise<void>((resolve2, reject) => {
      doc.on("data", (c: Buffer) => parts.push(c));
      doc.on("end", resolve2);
      doc.on("error", reject);
    });
    const url = await uploadFileToPath(
      Buffer.concat(parts),
      `rate-confirmations/signed-${rc.id}.pdf`,
      "application/pdf",
    );
    await prisma.rateConfirmation.update({ where: { id: rc.id }, data: { signedUrl: url } });
  } catch (err) {
    // Non-fatal, deliberately. The SIGNATURE is already recorded on the row
    // above, with everything a dispute needs. The certificate is a rendering of
    // that record, and failing to draw it must not undo the act it describes or
    // tell a carrier their signature did not land when it did.
    log.error({ err, rcId: rc.id }, "[RC] signature certificate generation failed");
  }

  // The tender says the terms are executed.
  //
  // Through the transition service so the move gets a history row, and
  // fire-and-forget so a history failure cannot undo a recorded signature.
  const tender = await prisma.loadTender.findFirst({
    where: { loadId: rc.loadId, status: "RC_SENT", deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (tender) {
    settleTender({
      tenderId: tender.id,
      to: "CONFIRMED",
      from: "RC_SENT",
      metadata: { rateConfirmationId: rc.id, signTokenId: rc.signTokenId, contentHash: rc.contentHash },
    }).catch((err) => log.error({ err, rcId: rc.id }, "[RC] CONFIRMED transition failed"));
  }

  // The settlement checklist learns the rate confirmation is signed.
  //
  // docSignedRateCon is recomputed from the SIGNED row this handler just
  // wrote, never flipped, so a second signature attempt is free (v3.8.ath).
  // E3 (2/4): this used to run only from the legacy session-authed sign
  // endpoint, which no carrier could reach from the emailed link -- so every
  // link-signed RC left the settlement reading "not recorded" for a document
  // that was on file. Fire-and-forget: a flag failure must not undo the act.
  syncSettlementDocFlags(rc.loadId).catch((err) =>
    log.error({ err, loadId: rc.loadId }, "[Settlement] doc-flag sync after RC signing failed (non-fatal)"),
  );

  // ── AND NOW THE CUSTOMER IS TOLD ──
  //
  // The signature is the commitment, so this is where the customer learns a
  // carrier is on their load. It used to fire at accept, which announced a
  // carrier who might still be re-offered at a different rate.
  //
  // `trackingLinkAutoSend` still governs whether it happens at all -- only the
  // moment moved -- and the fan-out is idempotent on Load.trackingLinkSent, so
  // a load auto-dispatched (which still announces at accept) and later signed
  // does not announce twice.
  //
  // Fire-and-forget: a mail failure must not tell a carrier their signature did
  // not land when it did.
  prisma.load
    .findUnique({ where: { id: rc.loadId }, select: { trackingLinkAutoSend: true } })
    .then(async (l) => {
      if (l?.trackingLinkAutoSend === false) return;
      const { sendTrackingLinkToCrmContacts } = await import("../services/shipperLoadNotifyService");
      await sendTrackingLinkToCrmContacts(rc.loadId);
    })
    .catch((err) => log.error({ err, loadId: rc.loadId }, "[RC] tracking-link fan-out failed"));

  res.type("html").send(page({
    title: "Signed",
    body: `<h1>Signed &mdash; thank you</h1>
      <p>Your signature is recorded and the load is confirmed. Your bill of lading is now available on My Loads.</p>
      <div class="kv"><span>Signed by</span><span>${signerName.replace(/[<>&]/g, "")}</span></div>
      <div class="kv"><span>Signed at</span><span>${signedAt.toUTCString()}</span></div>
      <a class="cta" href="${PORTAL_MY_LOADS}?load=${encodeURIComponent(rc.loadId)}">Open the load on My Loads</a>
      <p class="foot">Document fingerprint<br><span class="ref">${rc.contentHash ?? "not recorded"}</span></p>`,
  }));
});

export default router;
