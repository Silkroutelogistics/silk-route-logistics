import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { verifyDriverPingToken } from "../lib/driverPingToken";
import { recordDriverPing } from "../services/driverPingService";
import { log } from "../lib/logger";

/**
 * PUBLIC router — deliberately NOT behind `authenticate`.
 *
 * A driver is not a platform user. They receive a text with a link and tap it
 * on the roadside; there is no session to carry and no password to hold. The
 * signed, load-scoped, expiring token IS the authorisation, the same shape as
 * the tender-action magic link (§13.3 Item 142).
 *
 * TWO RULES GOVERN EVERYTHING HERE.
 *
 * **No location without a tap, ever.** The GET renders a page; it never reads a
 * position. Only a POST carrying coordinates the browser produced after the
 * driver pressed a button writes anything. The browser's own permission prompt
 * is a second gate we do not control and cannot bypass, which is exactly why the
 * design leans on it. There is a test that fails if a GET ever writes.
 *
 * **An unauthenticated hit writes nothing but a validated ping.** A bad or
 * expired token produces a log line and an HTML page — no row, no counter, no
 * DB write of any kind. Otherwise the endpoint is a free write amplifier for
 * anyone who finds the URL shape. Rate limits sit in front regardless.
 */

const router = Router();

/** Generous enough for a driver retrying in bad signal; useless for a scraper. */
const pingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a few minutes." },
});

/** Escapes text interpolated into the pages below. */
function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

function page(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · Silk Route Logistics</title>
<link rel="stylesheet" href="/api/public-assets/brand.css">
</head><body class="ping"><div class="card"><div class="rule"></div>${bodyHtml}
<p class="foot">Silk Route Logistics Inc. · USDOT 4526880 · MC# 1794414<br>
Questions: operations@silkroutelogistics.ai · (269) 220-6760</p></div></body></html>`;
}

const expiredPage = page(
  "Link expired",
  `<h1>This link has expired</h1>
   <p>Location links stop working after a while, and after the load is delivered.
      If we still need your position, dispatch will text you a new one.</p>
   <p>Nothing was shared.</p>`,
);

// ── GET /api/ping/:token — render the page. NEVER reads a position. ────────
router.get("/:token", pingLimiter, (req: Request, res: Response) => {
  const payload = verifyDriverPingToken(String(req.params.token));
  if (!payload) {
    // Log line only. No DB write from an unauthenticated hit.
    log.info({ ip: req.ip }, "[DriverPing] GET with an invalid or expired token");
    res.status(410).type("html").send(expiredPage);
    return;
  }

  // Deliberately no load lookup here either — rendering a page for a valid
  // token should not disclose lane detail until the driver acts, and should not
  // cost a query per scan of a forwarded link.
  res.type("html").send(
    page(
      "Share your location",
      `<h1>Share your location</h1>
       <p>Dispatch at Silk Route Logistics is asking where you are right now so we can update the
          shipper and stop calling you.</p>
       <div class="lane">This shares your position <strong>one time</strong>, right now.
          It does not track you, and it stops nothing on your phone.</div>
       <button id="go">Share my location once</button>
       <p id="msg" style="margin-top:14px"></p>
       <div class="consent">Tapping the button sends your current position to Silk Route Logistics
          for this load only. We do not receive your location at any other time, and you can ignore
          this message with no effect on your load or your pay.</div>
       <script src="/api/public-assets/driver-ping.js" defer></script>`,
    ),
  );
});

// ── POST /api/ping/:token — the only write. ───────────────────────────────
router.post("/:token", pingLimiter, async (req: Request, res: Response) => {
  const payload = verifyDriverPingToken(String(req.params.token));
  if (!payload) {
    log.info({ ip: req.ip }, "[DriverPing] POST with an invalid or expired token");
    res.status(410).json({ error: "This link has expired. Nothing was shared." });
    return;
  }

  const latitude = Number(req.body?.latitude);
  const longitude = Number(req.body?.longitude);
  const accuracy = req.body?.accuracy != null ? Number(req.body.accuracy) : null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    res.status(400).json({ error: "No position was included." });
    return;
  }

  const result = await recordDriverPing({
    loadId: payload.loadId,
    phone: payload.phone,
    latitude,
    longitude,
    accuracyMeters: accuracy,
  });

  if (!result.ok) {
    // Reasons here are about the LOAD (delivered, driver swapped), not about
    // the token — safe to state plainly, and a driver who is told "this load is
    // no longer in transit" stops retrying.
    res.status(409).json({ error: result.reason || "We could not record that." });
    return;
  }

  res.json({ ok: true, geofence: result.geofenceHit });
});

export default router;
