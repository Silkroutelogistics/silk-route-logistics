import { Router, Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { acceptTender, declineTender } from "../controllers/tenderController";
import { verifyTenderActionToken } from "../lib/tenderActionToken";
import { log } from "../lib/logger";

/**
 * v3.8.als §13.3 Item 142 — magic-link tender accept/decline (no login).
 *
 * PUBLIC router (NOT behind authenticate). The signed token from the
 * tender-offered email IS the authorization. This endpoint verifies the
 * token, then delegates to the existing acceptTender/declineTender
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
<style>
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; background:${C.cream}; color:${C.navy}; }
  .wrap { max-width:520px; margin:8vh auto; padding:0 20px; }
  .card { background:#fff; border:1px solid rgba(10,37,64,0.10); border-radius:12px; padding:32px; box-shadow:0 8px 24px rgba(10,37,64,0.10); }
  .bar { height:4px; border-radius:4px 4px 0 0; background:${opts.accent}; margin:-32px -32px 24px; }
  h1 { font-size:20px; margin:0 0 12px; color:${opts.accent}; }
  p { font-size:15px; line-height:1.6; color:#3A4A5F; margin:0 0 12px; }
  .ref { font-family:"SF Mono",ui-monospace,Menlo,monospace; font-size:13px; color:${C.navy}; background:${C.cream}; padding:2px 6px; border-radius:4px; }
  .foot { margin-top:24px; font-size:13px; color:#6B7685; }
  a.cta { display:inline-block; margin-top:8px; background:${C.gold}; color:#fff; text-decoration:none; padding:10px 20px; border-radius:6px; font-weight:bold; font-size:14px; }
  .brand { font-size:12px; color:#6B7685; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:20px; }
</style></head>
<body><div class="wrap"><div class="card">
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
function makeCaptureRes() {
  const state: { statusCode: number; body: any } = { statusCode: 200, body: null };
  const shim: any = {
    status(code: number) { state.statusCode = code; return shim; },
    json(b: any) { state.body = b; return shim; },
    send(b: any) { state.body = b; return shim; },
  };
  return { shim: shim as Response, state };
}

router.get("/:token", async (req: Request, res: Response) => {
  const payload = verifyTenderActionToken(String(req.params.token));
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

  // Already handled — don't re-run the action; show current state.
  if (tender.status !== "OFFERED") {
    const label = tender.status.charAt(0) + tender.status.slice(1).toLowerCase();
    return send(res, 409, renderPage({
      accent: C.warn,
      heading: "Already handled",
      body: `<p>Tender <span class="ref">${ref}</span> (${lane}) has already been <strong>${label.toLowerCase()}</strong>. No further action is needed.</p><a class="cta" href="https://silkroutelogistics.ai/carrier/login">Open carrier portal</a>`,
    }));
  }

  // Delegate to the existing controller with a synthetic carrier actor.
  const syntheticReq = {
    params: { id: tender.id },
    user: { id: payload.carrierUserId, email: "", role: "CARRIER" },
    body: {},
  } as unknown as AuthRequest;
  const { shim, state } = makeCaptureRes();

  try {
    if (payload.action === "accept") {
      await acceptTender(syntheticReq, shim);
    } else {
      await declineTender(syntheticReq, shim);
    }
  } catch (err) {
    log.error({ err, tenderId: tender.id, action: payload.action }, "[TenderAction] delegate failed");
    return send(res, 500, renderPage({
      accent: C.danger,
      heading: "Something went wrong",
      body: `<p>We couldn't process your response. Please log in to your carrier portal to act on tender <span class="ref">${ref}</span>.</p><a class="cta" href="https://silkroutelogistics.ai/carrier/login">Open carrier portal</a>`,
    }));
  }

  if (state.statusCode >= 200 && state.statusCode < 300) {
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
  const msg = state.body?.error ?? "This tender could not be processed.";
  return send(res, 200, renderPage({
    accent: C.warn,
    heading: "Couldn't process that",
    body: `<p>${msg}</p><p>Log in to your carrier portal for the latest status on tender <span class="ref">${ref}</span>.</p><a class="cta" href="https://silkroutelogistics.ai/carrier/login">Open carrier portal</a>`,
  }));
});

export default router;
