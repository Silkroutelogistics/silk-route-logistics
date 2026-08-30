/**
 * Brand assets for the backend-rendered public pages.
 *
 * WHY THIS EXISTS. The tender magic-link landing and the driver location-ping
 * page each shipped their CSS in an inline `<style>` block, and driverPing its
 * behaviour in an inline `<script>`. The platform CSP sets:
 *
 *   style-src-elem  'self' https://fonts.googleapis.com     ← no 'unsafe-inline'
 *   script-src      'self' <sentry> <jsdelivr>              ← no 'unsafe-inline'
 *   style-src-attr  'unsafe-inline'                         ← attributes only
 *
 * `'unsafe-inline'` was removed from style-src on 2026-02-23 (e89ce0bd), three
 * months before tenderAction.ts was written and six before driverPing.ts. Both
 * pages were BORN BLOCKED: measured in a browser, the `<style>` element is in
 * the HTML and ZERO stylesheets reach the CSSOM, so they rendered as raw
 * Times New Roman. driverPing's button did nothing at all, because its script
 * was blocked on the same principle.
 *
 * Serving both from `'self'` is what the deployed policy already permits. The
 * CSP is UNCHANGED by this file — nothing is widened, no hash or nonce
 * machinery is introduced, and `'unsafe-inline'` stays gone.
 *
 * The content lives here as string constants rather than as files on disk,
 * deliberately: an asset under src/ has to be copied into dist/ by the build
 * chain, and this repo has shipped a missing-asset-at-runtime defect twice that
 * way (§2.2, the cp -r trailing-dot lesson). A constant cannot be left behind
 * by a build step.
 *
 * The ONE per-page dynamic value — the tender page's accent colour — rides on a
 * `--accent` custom property set through an inline style ATTRIBUTE, which
 * style-src-attr allows.
 */

import { Router, Request, Response } from "express";

const router = Router();

/** Long cache: both files are static and versioned by deploy, not by URL. */
const CACHE = "public, max-age=3600";

/**
 * Shared brand stylesheet. Tokens and type per the srl-brand-design skill —
 * Playfair Display for display, DM Sans for body, SF Mono for references, and
 * the navy/gold/cream palette. Faces come from Google Fonts, which the CSP
 * already allows for style-src-elem and font-src.
 */
const BRAND_CSS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap');

:root {
  --navy: #0A2540;
  --gold: #C5A572;
  --gold-dark: #BA7517;
  --cream: #FBF7F0;
  --cream-2: #F5EEE0;
  --fg-2: #3A4A5F;
  --fg-3: #6B7685;
  /* Overridden per page through an inline style attribute. */
  --accent: var(--gold-dark);
  --font-display: 'Playfair Display', Georgia, 'Times New Roman', serif;
  --font-body: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'SF Mono', Menlo, Consolas, monospace;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--cream);
  color: var(--navy);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.55;
}

h1 { font-family: var(--font-display); font-weight: 700; margin: 0 0 12px; }
p  { color: var(--fg-2); margin: 0 0 12px; }

/* ── tender magic-link landing ─────────────────────────────────────────── */
.wrap { max-width: 520px; margin: 8vh auto; padding: 0 20px; }
.card {
  background: #fff;
  border: 1px solid rgba(10, 37, 64, 0.10);
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 8px 24px rgba(10, 37, 64, 0.10);
}
.bar {
  height: 4px;
  border-radius: 4px 4px 0 0;
  background: var(--accent);
  margin: -32px -32px 24px;
}
.card h1 { font-size: 20px; color: var(--accent); }
.ref {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--navy);
  background: var(--cream);
  padding: 2px 6px;
  border-radius: 4px;
}
.foot { margin-top: 24px; font-size: 13px; color: var(--fg-3); }
a.cta {
  display: inline-block;
  margin-top: 8px;
  background: var(--gold-dark);
  color: #fff;
  text-decoration: none;
  padding: 10px 20px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 14px;
}
.brand {
  font-size: 12px;
  color: var(--fg-3);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 20px;
}

/* ── driver location ping ──────────────────────────────────────────────── */
body.ping { display: flex; justify-content: center; padding: 24px; }
body.ping .card { width: 100%; max-width: 460px; border: 1px solid var(--cream-2); padding: 24px; box-shadow: none; }
body.ping h1 { font-size: 20px; margin: 0 0 6px; color: var(--navy); }
.rule { height: 3px; background: var(--gold); border-radius: 2px; margin: 0 0 18px; width: 56px; }
.lane {
  background: var(--cream);
  border: 1px solid var(--cream-2);
  border-radius: 8px;
  padding: 12px;
  margin: 0 0 18px;
  font-size: 15px;
  color: var(--navy);
}
button {
  width: 100%;
  padding: 15px;
  font-size: 17px;
  font-weight: 600;
  font-family: var(--font-body);
  border: 0;
  border-radius: 8px;
  background: var(--gold-dark);
  color: #fff;
  cursor: pointer;
}
button:disabled { opacity: .5; cursor: default; }
.consent {
  font-size: 13px;
  color: var(--fg-2);
  background: var(--cream);
  border: 1px solid var(--cream-2);
  border-radius: 8px;
  padding: 12px;
  margin: 16px 0 0;
}
.ok  { color: #2F7A4F; font-weight: 600; }
.bad { color: #9B2C2C; font-weight: 600; }
`;

/**
 * The driver ping page's one-tap geolocation handler, lifted verbatim out of
 * the inline block it could never run from. It POSTs to `location.pathname`,
 * so it stays token-agnostic and this single file serves every ping link.
 */
const DRIVER_PING_JS = `(function () {
  var b = document.getElementById('go'), m = document.getElementById('msg');
  if (!b || !m) return;
  b.onclick = function () {
    if (!navigator.geolocation) {
      m.className = 'bad';
      m.textContent = 'This browser cannot share location. Please reply to the text instead.';
      return;
    }
    b.disabled = true;
    m.textContent = 'Getting your position…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      fetch(location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        })
      })
        .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
        .then(function (o) {
          if (o.s === 200) {
            m.className = 'ok';
            m.textContent = 'Thank you — dispatch has your position. You can close this page.';
          } else {
            m.className = 'bad';
            m.textContent = (o.j && o.j.error) || 'We could not record that. Please reply to the text instead.';
            b.disabled = false;
          }
        })
        .catch(function () {
          m.className = 'bad';
          m.textContent = 'Network problem. Please try again in a moment.';
          b.disabled = false;
        });
    }, function () {
      m.className = 'bad';
      m.textContent = 'Your phone did not allow location sharing. Nothing was sent. You can reply to the text instead.';
      b.disabled = false;
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };
})();
`;

router.get("/brand.css", (_req: Request, res: Response) => {
  res.type("text/css").set("Cache-Control", CACHE).send(BRAND_CSS);
});

router.get("/driver-ping.js", (_req: Request, res: Response) => {
  res.type("application/javascript").set("Cache-Control", CACHE).send(DRIVER_PING_JS);
});

export default router;
export { BRAND_CSS, DRIVER_PING_JS };
