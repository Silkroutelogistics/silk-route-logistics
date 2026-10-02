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
  "carrier/dashboard",
  "carrier/dashboard/tenders",
  "carrier/dashboard/tender-history",
  "carrier/dashboard/drivers",
  "carrier/dashboard/training",
  "carrier/dashboard/compliance",
  "carrier/dashboard/payments",
  "carrier/dashboard/documents",
  "carrier/dashboard/settings",
  "carrier/dashboard/scorecard",
  "carrier/dashboard/revenue",
  "carrier/dashboard/loadboard",
  "carrier/dashboard/my-loads",
  "carrier/dashboard/available-loads",
];
const PAGES: string[] = (process.env.CARRIER_PORTAL_PAGES || COVERED.join(","))
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean)
  // Git Bash rewrites a leading-slash value into a Windows path (MSYS path
  // conversion), so accept the pages without one and add it here.
  .map((p) => "/" + p.slice(Math.max(0, p.indexOf("carrier/"))));

const WIDTHS = [380, 1280] as const;

// One token and one tour-complete for the whole worker. /api/auth and
// /api/carrier-auth share one limiter (server.ts authLimiter, 100 per 15 min per
// IP), and the lifecycle spec runs after this one: posting both per test spent
// that budget and starved its shipper mint (429) in the M3 run.
let token: string | undefined;
let tourMarked = false;

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
  if (!tourMarked) {
    await page.context().request.post(`${API}/carrier-auth/portal-tour/complete`, { headers: { Authorization: `Bearer ${token}` } });
    tourMarked = true;
  }
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

// M1 — a locked page. Messages is locked by owner ruling: its sidebar entry
// shows a lock and the route sends the carrier to the Dashboard.
for (const width of WIDTHS) {
  test.describe(`a locked page at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("Messages redirects to the Dashboard and reads as locked", async ({ page }) => {
      await signInAsCarrier(page);
      await page.goto("/carrier/dashboard/messaging");
      await expect(page).toHaveURL(/\/carrier\/dashboard$/);
      if (width < 1024) await page.getByRole("button", { name: "Open menu" }).click();
      const item = page.getByRole("button", { name: /Messages: Available soon/ });
      await expect(item).toBeVisible();
      // aria-disabled: Playwright will not click it (actionability), a finger will.
      await item.dispatchEvent("click");
      await expect(page.getByText(/Messages are not open yet/)).toBeVisible();
      await page.screenshot({ path: `test-results/carrier-portal/${width}-messages-locked.png` });
    });
  });
}

// M3 — the welcome tour, replayed from Settings. On a phone it is a bottom sheet
// (its card ends at the bottom edge); on a desktop it is a centred card. Neither
// may make the page scroll sideways.
for (const width of WIDTHS) {
  test.describe(`welcome tour at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("replays from Settings and sits where it should", async ({ page }) => {
      await signInAsCarrier(page);
      await page.goto("/carrier/dashboard/settings");
      await page.getByTestId("replay-tour").click();
      const tour = page.getByTestId("carrier-welcome-tour");
      await expect(tour).toBeVisible();
      await page.screenshot({ path: `test-results/carrier-portal/${width}-tour.png` });

      const card = await tour.locator(":scope > div").boundingBox();
      expect(card).not.toBeNull();
      if (width < 768) {
        expect(Math.round(card!.y + card!.height), "the sheet should end at the bottom edge").toBe(800);
        expect(Math.round(card!.width)).toBe(width);
      } else {
        expect(card!.y, "the card should float, not sit on the bottom edge").toBeGreaterThan(0);
        expect(card!.y + card!.height).toBeLessThan(800);
      }
      const docOverflow = await page.evaluate(() => (document.scrollingElement || document.documentElement).scrollWidth - window.innerWidth);
      expect(docOverflow).toBeLessThanOrEqual(1);

      await page.getByTestId("tour-next").click();
      await expect(page.getByTestId("tour-back")).toBeVisible();
    });
  });
}
