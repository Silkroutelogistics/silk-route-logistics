/**
 * carrier-portal-upgrade M4 — the carrier portal at a phone width and a desktop width.
 *
 * Owner ruling M4: no horizontal page scroll, the header usable, at 380 and 1280.
 * This signs in as the seeded APPROVED carrier (TOTP-enrolled and BCA-signed by
 * seed.ts, so no wall intercepts), marks the welcome tour seen so it does not
 * cover the page, and visits each page at both widths.
 *
 * Two properties per page and width:
 *   1. no horizontal page scroll: the document is no wider than the viewport;
 *   2. the header bell is the topmost element at its own centre. A fixed bar
 *      painted over the header passes a visibility check and fails this one,
 *      which is the point.
 *
 * PAGES grows one entry per page that a slice made responsive, so the spec is
 * green on every commit and says exactly which pages are covered. A screenshot
 * of every visit goes to test-results/carrier-portal/ for the owner's review.
 */
import { test, expect, type Page } from "@playwright/test";

// The runner sets E2E_API_URL to the backend it started (e2ePortParity.test.ts).
const API = process.env.E2E_API_URL || "http://localhost:3110/api";
const CARRIER_EMAIL = "test-carrier@srl.invalid";

/** Pages whose layout a slice in this arc made responsive. */
const COVERED = [
  "carrier/dashboard/tenders",
  "carrier/dashboard/tender-history",
  "carrier/dashboard/drivers",
  "carrier/dashboard/training",
  "carrier/dashboard/compliance",
  "carrier/dashboard/payments",
  "carrier/dashboard/documents",
  "carrier/dashboard/messaging",
  "carrier/dashboard/settings",
  "carrier/dashboard/scorecard",
  "carrier/dashboard/revenue",
  "carrier/dashboard/loadboard",
];
const PAGES: string[] = (process.env.CARRIER_PORTAL_PAGES || COVERED.join(","))
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean)
  // Git Bash rewrites a leading-slash value into a Windows path (MSYS path
  // conversion), so accept the pages without one and add it here.
  .map((p) => "/" + p.slice(Math.max(0, p.indexOf("carrier/"))));

const WIDTHS = [380, 1280] as const;

// One token for the whole run: /auth/e2e-token is rate limited, and minting one
// per test hit 429 on the 26th visit of the first run.
let token: string | undefined;

async function signInAsCarrier(page: Page) {
  if (!token) {
    const res = await page.context().request.post(`${API}/auth/e2e-token`, { data: { email: CARRIER_EMAIL } });
    expect(res.ok(), `e2e-token for ${CARRIER_EMAIL}: ${res.status()}`).toBeTruthy();
    token = (await res.json()).token as string;
  }
  await page.context().addCookies([
    { name: "srl_token", value: token, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
  ]);
  // The tour opens for a carrier who has never seen it and would cover the page.
  await page.context().request.post(`${API}/carrier-auth/portal-tour/complete`, { headers: { Authorization: `Bearer ${token}` } });
}

for (const width of WIDTHS) {
  test.describe(`carrier portal at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const path of PAGES) {
      test(`${path}`, async ({ page }) => {
        await signInAsCarrier(page);
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/") + "$"));

        const name = `${width}-${path.split("/").filter(Boolean).slice(2).join("-") || "dashboard"}`;
        await page.screenshot({ path: `test-results/carrier-portal/${name}.png`, fullPage: true });

        // The layout is an overflow-hidden shell whose <main> scrolls, so the
        // DOCUMENT never scrolls sideways and measuring it alone passed every page
        // in the first run while content overflowed inside <main>. Both are measured.
        const overflow = await page.evaluate(() => {
          const doc = document.scrollingElement || document.documentElement;
          const main = document.querySelector("main");
          return {
            doc: doc.scrollWidth - window.innerWidth,
            main: main ? main.scrollWidth - main.clientWidth : 0,
          };
        });
        expect(overflow.doc, `document wider than the viewport on ${path} at ${width}px`).toBeLessThanOrEqual(1);
        expect(overflow.main, `horizontal scroll inside <main> on ${path} at ${width}px`).toBeLessThanOrEqual(1);

        const bell = page.getByRole("button", { name: /^Notifications/ });
        await expect(bell).toBeVisible();
        const onTop = await bell.evaluate((b) => {
          const r = b.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!hit && b.contains(hit);
        });
        expect(onTop, `something is painted over the bell on ${path} at ${width}px`).toBe(true);
      });
    }
  });
}
