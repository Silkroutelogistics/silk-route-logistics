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
  "carrier/dashboard/security",
  "carrier/dashboard/scorecard",
  "carrier/dashboard/revenue",
  "carrier/dashboard/loadboard",
  "carrier/dashboard/my-loads",
  "carrier/dashboard/available-loads",
  "carrier/dashboard/messaging",
];
const PAGES: string[] = (process.env.CARRIER_PORTAL_PAGES || COVERED.join(","))
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean)
  // Git Bash rewrites a leading-slash value into a Windows path (MSYS path
  // conversion), so accept the pages without one and add it here.
  .map((p) => "/" + p.slice(Math.max(0, p.indexOf("carrier/"))));

// Mobile first and ascending (owner ruling, FINISH-2 G3): each page's fresh load
// is at WIDTHS[0], the phone width carriers use, and it then resizes up.
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

// Each visit costs two reads on that same limiter (/carrier-auth/me and
// /carrier-auth/activation-status, both real; nothing here caches them). One
// visit per page per width emptied it at about 40 visits, and the lifecycle
// shipper mint got 429 (FINISH-2 G3, measured: ratelimit-policy 100;w=900,
// remaining 0). So each page is loaded ONCE and measured at every width by
// resizing. The carrier portal's responsiveness is CSS only (no JS reads the
// width), so a resize lays the page out as a fresh load at that width would.
for (const path of PAGES) {
  test(`${path} at ${WIDTHS.join(", ")}px`, async ({ page }) => {
    // The fresh load lands on the phone width; the larger widths are resizes.
    expect(WIDTHS[0], "the first width is the phone width").toBe(380);
    expect([...WIDTHS], "widths ascend").toEqual([...WIDTHS].sort((a, b) => a - b));
    await page.setViewportSize({ width: WIDTHS[0], height: 800 });
    await signInAsCarrier(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/") + "$"));

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      // Settled, by condition: every CSS transition the resize started has finished.
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

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
    }
  });
}

// FINISH-2 G3 — Messages, unlocked. (M1 locked it; the redirect itself is held by
// lockedFeatures.test.tsx with a mocked route.) A carrier reaches SRL staff only
// (the staff-only messaging fix, messageScope.test.ts): the seeded shipper's company name finds nobody, and "silk" finds
// staff and nothing else. Through the page, not the API, so the page is what is proven.
const SRL_STAFF_ROLES = ["ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING", "AE", "ACCOUNT_EXECUTIVE"];
for (const width of WIDTHS) {
  test.describe(`Messages at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("is open, and its search finds SRL staff only", async ({ page }) => {
      await signInAsCarrier(page);
      await page.goto("/carrier/dashboard/messaging");
      await expect(page).toHaveURL(/\/carrier\/dashboard\/messaging$/);
      await page.getByRole("button", { name: "New message" }).click();
      const search = page.getByRole("textbox", { name: "Search SRL staff" });

      const searchFor = async (term: string) => {
        const res = page.waitForResponse((r) => r.url().includes(`/messages/users?search=${term}`) && r.request().method() === "GET");
        await search.fill(term);
        const r = await res;
        expect(r.ok(), `user search "${term}": ${r.status()}`).toBeTruthy();
        return (await r.json()) as { role: string; email: string }[];
      };

      const shipperSide = await searchFor("acmemfg");
      expect(shipperSide.map((u) => u.email), "a carrier must not find a shipper").toEqual([]);

      const staff = await searchFor("silk");
      expect(staff.length, "a carrier must find the SRL team").toBeGreaterThan(0);
      for (const u of staff) expect(SRL_STAFF_ROLES, `${u.email} is ${u.role}`).toContain(u.role);
      await expect(page.getByRole("button", { name: new RegExp(staff[0].email.replace(/[.@]/g, "\\$&")) })).toBeVisible();
      await page.screenshot({ path: `test-results/carrier-portal/${width}-messages.png` });
    });
  });
}

// Owner check 1 (F2 Training): at 380px the sticky Driver column takes at most
// ~40% of the viewport, and the course cells scroll under it. The seed has no
// training courses, so the summary is answered with a fixture (3 drivers x 6
// courses): the property under test is layout, not data. Playwright has no
// swipe primitive, so the horizontal scroll is programmatic, in a touch-enabled
// context.
const TRAINING_FIXTURE = {
  courses: Array.from({ length: 6 }, (_, i) => ({ id: "c" + i, slug: "course-" + i, title: "Course number " + (i + 1), category: "Safety" })),
  drivers: Array.from({ length: 3 }, (_, i) => ({
    id: "d" + i, firstName: "Driver", lastName: "Number" + (i + 1), activated: true, passedCount: 0, progress: {},
  })),
  summary: { driverCount: 3, courseCount: 6, passedCells: 0, totalCells: 18, pctTrained: 0 },
};
for (const width of WIDTHS) {
  test.describe(`training matrix at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, hasTouch: true });

    test("the Driver column stays narrow and the cells scroll under it", async ({ page }) => {
      await signInAsCarrier(page);
      await page.route("**/carrier-drivers/training-summary", (route) => route.fulfill({ json: TRAINING_FIXTURE }));
      await page.goto("/carrier/dashboard/training");
      const sticky = page.getByTestId("sticky-driver");
      await expect(sticky).toBeVisible();
      const matrix = page.getByTestId("training-matrix");

      const before = (await sticky.boundingBox())!;
      if (width < 768) expect(before.width, "sticky Driver column width at " + width + "px").toBeLessThanOrEqual(width * 0.4);

      const docOverflow = await page.evaluate(() => (document.scrollingElement || document.documentElement).scrollWidth - window.innerWidth);
      expect(docOverflow, "the page itself must not scroll sideways").toBeLessThanOrEqual(1);

      // Under md a site-wide rule (globals.css, `table { display: block; overflow-x: auto }`)
      // makes the TABLE the scroll container, not its wrapper; measure the real one.
      const scroller = matrix.locator("table");
      const overflows = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth);
      if (width < 768) {
        expect(overflows, "the matrix should overflow its own box on a phone").toBe(true);
        const firstCourse = page.locator("thead th").nth(1);
        const courseBefore = (await firstCourse.boundingBox())!;
        await scroller.evaluate((el) => el.scrollBy({ left: 220 }));
        // By condition, not a fixed delay: the scroll has landed.
        await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
        const after = (await sticky.boundingBox())!;
        const courseAfter = (await firstCourse.boundingBox())!;
        expect(Math.round(after.x), "the sticky column stays put").toBe(Math.round(before.x));
        expect(courseAfter.x, "course cells move left").toBeLessThan(courseBefore.x - 100);
        expect(courseAfter.x, "and pass under the sticky column").toBeLessThan(after.x + after.width);
      }
      await page.screenshot({ path: `test-results/carrier-portal/${width}-training-matrix.png` });
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
