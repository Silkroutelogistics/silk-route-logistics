/**
 * Drawer render proof — measures every AE drawer at three viewports.
 *
 * Written for the drawer-conformance arc (docs/audits/drawer-conformance-audit.md).
 * The audit that preceded it rendered nothing; this is the instrument that closes
 * that gap, and it is committed so the after-state can be re-measured rather than
 * re-argued.
 *
 * It reports GEOMETRY, not opinion: drawer width as rendered, as a percentage of
 * the content area, plus the six interaction-contract behaviours probed live. It
 * cannot judge whether a layout looks right — that stays a human call.
 *
 * PREREQUISITES (this does not start them, and says so rather than hanging):
 *   1. A seeded local Postgres.
 *   2. Backend on :3010 with NODE_ENV=test and E2E_BYPASS_OTP=true, pointed at it,
 *      with RESEND_API_KEY / OPENPHONE_API_KEY / AWS_ACCESS_KEY_ID / S3_BUCKET_NAME
 *      / GEMINI_API_KEY all explicitly EMPTY. Empty, not absent — dotenv backfills
 *      an absent key from backend/.env, which holds production credentials.
 *   3. Frontend built with NEXT_PUBLIC_API_URL=http://localhost:3010/api and served
 *      on :4000. The URL is baked at build time; setting it on the serve command
 *      does nothing.
 *
 * Usage:  node e2e/render-proof.mjs [--label before|after]
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const FRONTEND = "http://localhost:4000";
const API = "http://localhost:3010/api";
const ADMIN = "whaider@silkroutelogistics.ai";
const VIEWPORTS = [1440, 1920, 2560];
const LABEL = (process.argv.includes("--label") ? process.argv[process.argv.indexOf("--label") + 1] : "run") || "run";
const OUT = path.join(process.cwd(), "e2e", "render-proof-out", LABEL);

// The drawer is found by its slide-in animation class, which every one of the
// seven carries both before and after the width change. Keying on the width
// class instead would make the proof stop finding drawers the moment the width
// is the thing being changed.
const DRAWER = ".animate-slide-in-right";

// Each surface names the text its own list rows carry. A single generic
// selector was tried first and opened only three of six — the pages genuinely
// differ (CRM lists companies, loads lists statuses, carriers lists MC numbers),
// so the strategy is per-surface rather than a cleverer regex.
//
// `then` handles surfaces where the first click reveals the real rows: the load
// board groups by lane, so a lane must be expanded before a load can be opened.
const SURFACES = [
  { key: "carriers",    url: "/dashboard/carriers",    rowText: /MC-/ },
  { key: "crm",         url: "/dashboard/crm",         rowText: /SHIPPER|CARRIER/ },
  { key: "lead-hunter", url: "/dashboard/lead-hunter", rowText: /Prospect Co|@/ },
  { key: "track-trace", url: "/dashboard/track-trace", rowText: /→|SRL-|REF-/ },
  { key: "waterfall",   url: "/dashboard/waterfall",   rowText: /→|SRL-|L\d{4}/ },
  { key: "loads",       url: "/dashboard/loads",       rowText: /→ \d+ loads?|→ 1 load/, then: /POSTED|BOOKED|AT DELIVERY|IN TRANSIT|DISPATCHED|DELIVERED/ },
];

async function mintToken() {
  const r = await fetch(`${API}/auth/e2e-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN }),
  });
  if (!r.ok) throw new Error(`e2e-token ${r.status} — is the backend up with E2E_BYPASS_OTP=true?`);
  const j = await r.json();
  if (!j.token) throw new Error("e2e-token returned no token");
  return j.token;
}

/** Open a surface's drawer by clicking a row that matches that surface's own text. */
async function openDrawer(page, surface) {
  const click = async (re) => {
    for (const sel of ["main button", "main [class*='cursor-pointer']", "main tbody tr"]) {
      const el = page.locator(sel).filter({ hasText: re }).first();
      if (await el.count().catch(() => 0)) {
        await el.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(900);
        return true;
      }
    }
    return false;
  };
  await click(surface.rowText);
  if (await page.locator(DRAWER).count()) return true;
  // Load board: the first click expanded a lane; the loads inside it are the rows.
  if (surface.then) {
    await click(surface.then);
    if (await page.locator(DRAWER).count()) return true;
  }
  return false;
}

async function measure(page) {
  return page.evaluate((sel) => {
    const drawer = document.querySelector(sel);
    const main = document.querySelector("main");
    if (!drawer || !main) return null;
    const dw = drawer.getBoundingClientRect().width;
    const mw = main.getBoundingClientRect().width;
    // Load board only: the list narrows to the strip the overlay leaves.
    const list = main.querySelector(".space-y-3");
    const lw = list ? Math.round(list.getBoundingClientRect().width) : null;
    // The dialog role may sit on the panel or on a wrapper above it.
    const dialog = drawer.closest('[role="dialog"]') || drawer.querySelector('[role="dialog"]');
    return {
      viewport: window.innerWidth,
      contentWidth: Math.round(mw),
      drawerWidth: Math.round(dw),
      pctOfContent: +((dw / mw) * 100).toFixed(1),
      listWidth: lw,
      listPlusDrawer: lw ? Math.round(lw + dw) : null,
      contract: {
        roleDialog: !!dialog,
        ariaModal: !!(dialog && dialog.getAttribute("aria-modal") === "true"),
        scrollLock: getComputedStyle(document.body).overflow === "hidden",
      },
    };
  }, DRAWER);
}

/** ESC and backdrop-click are behaviours, so they are exercised, not inspected. */
async function probeEscape(page) {
  if (!(await page.locator(DRAWER).count())) return null;
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  return (await page.locator(DRAWER).count()) === 0;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await mintToken();
  const browser = await chromium.launch();
  const results = [];

  for (const width of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
    await ctx.addCookies(["srl_token_ae", "srl_token"].map((name) => ({
      name, value: token, domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax",
    })));
    const page = await ctx.newPage();

    for (const s of SURFACES) {
      const row = { label: LABEL, viewport: width, surface: s.key };
      try {
        await page.goto(`${FRONTEND}${s.url}`, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(2500);
        const opened = await openDrawer(page, s);
        row.opened = opened;
        if (opened) {
          Object.assign(row, await measure(page));
          await page.screenshot({ path: path.join(OUT, `${s.key}-${width}.png`) });
          row.escapeCloses = await probeEscape(page);
        }
      } catch (e) {
        row.error = String(e.message || e).slice(0, 120);
      }
      results.push(row);
      console.log(
        `${String(width).padEnd(5)} ${s.key.padEnd(13)} ` +
        (row.opened
          ? `drawer=${String(row.drawerWidth).padEnd(5)} content=${String(row.contentWidth).padEnd(5)} ${String(row.pctOfContent).padEnd(5)}%  ` +
            `dialog=${row.contract.roleDialog ? "Y" : "N"} aria=${row.contract.ariaModal ? "Y" : "N"} ` +
            `lock=${row.contract.scrollLock ? "Y" : "N"} esc=${row.escapeCloses ? "Y" : "N"}`
          : `NOT OPENED ${row.error || ""}`)
      );
    }
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "measurements.json"), JSON.stringify(results, null, 2));
  const opened = results.filter((r) => r.opened).length;
  console.log(`\n${opened}/${results.length} drawers opened · screenshots + measurements.json in ${OUT}`);
  // A run where nothing opened is a broken harness, not a passing proof.
  if (opened === 0) process.exit(1);
})().catch((e) => { console.error("RENDER PROOF FAILED:", e.message); process.exit(1); });
