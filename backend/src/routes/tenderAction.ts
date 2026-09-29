import { Router, Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { acceptTender, declineTender } from "../controllers/tenderController";
import { verifyTenderActionToken, TenderActionPayload } from "../lib/tenderActionToken";
import { log } from "../lib/logger";
import { makeCaptureRes } from "../lib/captureResponse";
import { clientIp, clientUserAgent } from "../lib/clientIp";
import { mintOfferSignLink } from "../services/rcSignLinkService";

/**
 * v3.8.als §13.3 Item 142 — magic-link tender accept/decline (no login).
 *
 * PUBLIC router (NOT behind authenticate). The signed token from the
 * tender-offered email IS the authorization. GET shows a confirm page; the
 * POST from it verifies the token, then delegates to the existing acceptTender/declineTender
 * controllers via a response-capturing shim + a synthetic carrier actor —
 * reusing the entire battle-tested accept path (compliance re-check, atomic
 * transaction, shipment creation, auto-RC, notifications, tracking-link
 * fan-out) with ZERO duplication. The controllers' carrier-userId ownership
 * gate is satisfied because the synthetic actor's id is the embedded
 * carrierUserId, which the token signed at offer time.
 *
 * Renders a self-contained branded HTML acknowledgment page (carriers click
 * from an email on any device — no frontend route needed).
 */

const router = Router();

const C = {
  navy: "#0A2540",
  gold: "#BA7517",
  cream: "#FBF7F0",
  success: "#2F7A4F",
  danger: "#9B2C2C",
  warn: "#B07A1A",
};

function renderPage(opts: {
  heading: string;
  body: string;
  accent: string;
  status?: number;
}): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Silk Route Logistics — Tender</title>
<link rel="stylesheet" href="/api/public-assets/brand.css">
</head>
<body><div class="wrap"><div class="card" style="--accent:${opts.accent}">
  <div class="bar"></div>
  <div class="brand">Silk Route Logistics</div>
  <h1>${opts.heading}</h1>
  ${opts.body}
  <div class="foot">Questions? Reply to the tender email or contact operations@silkroutelogistics.ai.</div>
</div></div></body></html>`;
}

function send(res: Response, status: number, html: string) {
  res.status(status).type("html").send(html);
}

// Minimal response shim — captures status + json body so we can delegate to
// the existing controllers (which respond via res.status().json()) and then
// render HTML based on the captured outcome.
// v3.8.axf — moved to lib/captureResponse when the carrier load-board
// self-accept became a second consumer. Two copies would have been two shims
// free to drift.

type Outcome = "accepted" | "declined" | "refused" | "error";
const SAID: Record<Outcome, string> = {
  accepted: "You accepted this tender with this link.",
  declined: "You declined this tender with this link.",
  refused: "You used this link and it could not be processed",
  error: "You used this link and something went wrong on our side.",
};

// Item 330b: a used link says what it did, from the outcome stored on its claim,
// and does nothing again. A claim with no outcome yet is a press still in flight.
function replay(res: Response, row: { reason: string } | null, ref: string, lane: string) {
  const [, outcome, ...msg] = (row?.reason ?? "").split(":");
  const said = SAID[outcome as Outcome];
  const detail = !said ? "Your response is being recorded." : msg.length ? `${said}: ${msg.join(":")}.` : said;
  return send(res, 409, renderPage({
    accent: C.warn,
    heading: "This link was already used",
    body: `<p>${detail} Nothing changed.</p><p>Tender <span class="ref">${ref}</span> (${lane}). Open the carrier portal for its current status.</p><a class="cta" href="https://silkroutelogistics.ai/carrier/login">Open carrier portal</a>`,
  }));
}

// Item 330b: store the outcome on the claim so a replay can report it, and record
// the press with its IP and user agent. Neither write may undo the act (Item 235.5).
async function recordOutcome(req: Request, tokenHash: string, p: TenderActionPayload, tenderId: string, outcome: Outcome, msg?: string) {
  try {
    await prisma.tokenBlacklist.update({ where: { tokenHash }, data: { reason: `tender-action:${outcome}${msg ? `:${msg.slice(0, 300)}` : ""}` } });
  } catch (err) {
    log.error({ err, tenderId }, "[TenderAction] outcome not stored");
  }
  try {
    await prisma.auditLog.create({
      data: {
        userId: p.carrierUserId,
        action: p.action === "accept" ? "TENDER_LINK_ACCEPT" : "TENDER_LINK_DECLINE",
        entity: "LoadTender",
        entityId: tenderId,
        changes: `Tender link ${p.action}: ${outcome}${msg ? ` (${msg})` : ""}`,
        ipAddress: clientIp(req),
        userAgent: clientUserAgent(req),
        details: { outcome },
      },
    });
  } catch (err) {
    log.error({ err, tenderId }, "[TenderAction] press not audited");
  }
}

// Item 330: this link used to act on GET, so anything that fetched it acted: a
// mail scanner, a link preview, a carrier opening it only to look. GET now shows
// what the link will do. Only the POST from its button acts, and it claims the
// token first, so a link acts at most once.
async function respond(req: Request, res: Response, act: boolean) {
  const token = String(req.params.token);
  const payload = verifyTenderActionToken(token);
  if (!payload) {
    return send(res, 400, renderPage({
      accent: C.danger,
      heading: "Link expired or invalid",
      body: `<p>This tender link is no longer valid. It may have expired, or the tender may have already been handled.</p><p>Log in to your carrier portal to view active tenders.</p><a class="cta" href="https://silkroutelogistics.ai/carrier/login">Open carrier portal</a>`,
    }));
  }

  const tender = await prisma.loadTender.findUnique({
    where: { id: payload.tenderId },
    include: {
      carrier: { select: { userId: true, companyName: true } },
      load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
    },
  });

  if (!tender) {
    return send(res, 404, renderPage({
      accent: C.danger,
      heading: "Tender not found",
      body: `<p>We couldn't find this tender. It may have been removed.</p>`,
    }));
  }

  const ref = tender.load.referenceNumber;
  const lane = `${tender.load.originCity}, ${tender.load.originState} → ${tender.load.destCity}, ${tender.load.destState}`;

  // Defense-in-depth: token's carrierUserId must match the tender's carrier.
  if (tender.carrier.userId !== payload.carrierUserId) {
    log.warn({ tenderId: tender.id }, "[TenderAction] token carrierUserId mismatch");
    return send(res, 403, renderPage({
      accent: C.danger,
      heading: "Link invalid",
      body: `<p>This link does not match the tender on file.</p>`,
    }));
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const used = await prisma.tokenBlacklist.findUnique({ where: { tokenHash } });
  if (used) return replay(res, used, ref, lane);

  // Already handled — don't re-run the action; show current state.
  if (tender.status !== "OFFERED") {
    const label = tender.status.charAt(0) + tender.status.slice(1).toLowerCase();
    return send(res, 409, renderPage({
      accent: C.warn,
      heading: "Already handled",
      body: `<p>Tender <span class="ref">${ref}</span> (${lane}) has already been <strong>${label.toLowerCase()}</strong>. No further action is needed.</p><a class="cta" href="https://silkroutelogistics.ai/carrier/login">Open carrier portal</a>`,
    }));
  }

  // ── Item 342 (v3.8.bop) — ACCEPT IS SIGNING, when the offer carries its RC ──
  //
  // The tender went out WITH its rate confirmation, so accepting it is signing
  // that document. This link no longer books the load bare: the GET says so and
  // offers one button, and the POST mints a fresh signing link and 303s to the
  // review-and-sign page, where the one act (accept and sign) happens. The token
  // is NOT claimed here: nothing has been accepted yet, and a carrier who closes
  // the signing page must be able to come back through the same email.
  if (payload.action === "accept") {
    const offerRc = await prisma.rateConfirmation.findFirst({
      where: { tenderId: tender.id, status: "SENT" },
      select: { id: true },
    });
    if (offerRc) {
      if (!act) {
        const rate = tender.offeredRate.toLocaleString("en-US", { style: "currency", currency: "USD" });
        return send(res, 200, renderPage({
          accent: C.navy,
          heading: `Review and sign tender ${ref}`,
          body: `<p>${lane}</p><div class="kv"><span>Offered rate</span><span><strong>${rate}</strong></span></div><p>Accepting this load is signing its rate confirmation. You will read the document, then sign it once to book the load in your name.</p><form method="POST" action="/api/tender-action/${encodeURIComponent(token)}"><button type="submit">Review and sign</button></form>`,
        }));
      }
      const out = await mintOfferSignLink({
        tenderId: tender.id,
        carrierUserId: payload.carrierUserId,
        channel: "tender_email",
        ip: clientIp(req),
        userAgent: clientUserAgent(req),
      });
      if (out.ok) { res.redirect(303, out.link.path); return; }
      const why = out.code === "SIGN_LINK_RATE_LIMITED"
        ? "A new signing page has been opened several times in the last hour for this offer. Try again in an hour, or use the page you already opened."
        : "This offer is no longer open, so there is nothing to sign.";
      return send(res, out.code === "SIGN_LINK_RATE_LIMITED" ? 429 : 409, renderPage({
        accent: C.warn,
        heading: "Could not open the signing page",
        body: `<p>${why}</p><a class="cta" href="https://silkroutelogistics.ai/carrier/login">Open carrier portal</a>`,
      }));
    }
  }

  if (!act) {
    const verb = payload.action === "accept" ? "Accept" : "Decline";
    const rate = tender.offeredRate.toLocaleString("en-US", { style: "currency", currency: "USD" });
    return send(res, 200, renderPage({
      accent: C.navy,
      heading: `${verb} tender ${ref}?`,
      body: `<p>${lane}</p><div class="kv"><span>Offered rate</span><span><strong>${rate}</strong></span></div><form method="POST" action="/api/tender-action/${encodeURIComponent(token)}"><button type="submit">${verb} this tender</button></form><p>Nothing happens until you press the button. The link works once.</p>`,
    }));
  }

  // Claim before acting. tokenHash is unique, so of two presses exactly one
  // inserts. The claim lasts as long as the token itself: blacklistToken's 25h
  // would let a 7-day link act again on day two.
  const exp = (jwt.decode(token) as { exp?: number } | null)?.exp;
  const claim = await prisma.tokenBlacklist.createMany({
    data: [{
      tokenHash,
      userId: payload.carrierUserId,
      reason: "tender-action",
      expiresAt: new Date(exp ? exp * 1000 : Date.now() + 7 * 24 * 3600 * 1000),
    }],
    skipDuplicates: true,
  });
  if (claim.count === 0) {
    return replay(res, await prisma.tokenBlacklist.findUnique({ where: { tokenHash } }), ref, lane);
  }

  // Delegate to the existing controller with a synthetic carrier actor.
  const syntheticReq = {
    params: { id: tender.id },
    user: { id: payload.carrierUserId, email: "", role: "CARRIER" },
    body: {},
  } as unknown as AuthRequest;
  const { shim, state } = makeCaptureRes();

  let threw = false;
  try {
    if (payload.action === "accept") {
      await acceptTender(syntheticReq, shim);
    } else {
      await declineTender(syntheticReq, shim);
    }
  } catch (err) {
    threw = true;
    log.error({ err, tenderId: tender.id, action: payload.action }, "[TenderAction] delegate failed");
  }
  const ok = !threw && state.statusCode >= 200 && state.statusCode < 300;
  const outcome: Outcome = threw ? "error" : !ok ? "refused" : payload.action === "accept" ? "accepted" : "declined";
  const msg = state.body?.error ?? "This tender could not be processed.";
  await recordOutcome(req, tokenHash, payload, tender.id, outcome, outcome === "refused" ? msg : undefined);

  if (threw) {
    return send(res, 500, renderPage({
      accent: C.danger,
      heading: "Something went wrong",
      body: `<p>We couldn't process your response. Please log in to your carrier portal to act on tender <span class="ref">${ref}</span>.</p><a class="cta" href="https://silkroutelogistics.ai/carrier/login">Open carrier portal</a>`,
    }));
  }

  if (ok) {
    if (payload.action === "accept") {
      return send(res, 200, renderPage({
        accent: C.success,
        heading: "Tender accepted — you're booked",
        body: `<p>You've accepted tender <span class="ref">${ref}</span> (${lane}). The load is booked in your name.</p><p>Watch your inbox for the Rate Confirmation and dispatch instructions.</p><a class="cta" href="https://silkroutelogistics.ai/carrier/login">View my loads</a>`,
      }));
    }
    return send(res, 200, renderPage({
      accent: C.navy,
      heading: "Tender declined",
      body: `<p>You've declined tender <span class="ref">${ref}</span> (${lane}). Thanks for the quick response.</p><a class="cta" href="https://silkroutelogistics.ai/carrier/login">View open loads</a>`,
    }));
  }

  // Controller rejected (expired, non-compliant, etc.) — surface its message.
  return send(res, 200, renderPage({
    accent: C.warn,
    heading: "Couldn't process that",
    body: `<p>${msg}</p><p>Log in to your carrier portal for the latest status on tender <span class="ref">${ref}</span>.</p><a class="cta" href="https://silkroutelogistics.ai/carrier/login">Open carrier portal</a>`,
  }));
}

router.get("/:token", (req: Request, res: Response) => respond(req, res, false));
router.post("/:token", (req: Request, res: Response) => respond(req, res, true));

export default router;
