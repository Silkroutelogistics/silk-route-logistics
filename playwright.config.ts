/**
 * Playwright Test Config — Sprint 37 (v3.8.aaq)
 *
 * Single-worker E2E smoke that walks one full load lifecycle and
 * asserts brand-skill conformance on the generated PDFs.
 *
 * Why single-worker: the lifecycle test mutates a shared DB
 * (TRUNCATE + reseed before run). Parallel workers would race on
 * shared state. Sprint 37 ships ONE test; later sprints can split
 * into independent specs with per-test transactional isolation.
 *
 * Why static-export + serve (not next dev): Cloudflare Pages serves
 * static HTML in production per next.config.ts `output: "export"`.
 * Serving the same `out/` directory in CI matches deploy reality
 * more closely than the dev server's hot-reload runtime, and avoids
 * dev-server flakiness in CI.
 *
 * Web servers orchestrated via webServer config — playwright auto-
 * starts both backend + frontend before tests, kills them after.
 */
import { defineConfig } from "@playwright/test";

// v3.8.bae — DEDICATED E2E PORTS, off the dev-server range.
//
// These were :3010 and :4000, and :3010 is what `npm run dev` binds. So a dev
// server left running blocked every e2e run, and the runner — correctly —
// refused rather than killing a process it did not start. That happened three
// times in one session and cost a push each time.
//
// Moving to :3110 and :4100 makes the collision impossible rather than
// survivable. The runner's port-ownership check is unchanged: it still refuses
// a port it does not own and names the pid, because the point was never the
// specific number, it was not stopping somebody else's process.
const BACKEND_PORT = 3110;
// FRONTEND PORT AND CORS ARE ONE DECISION, NOT TWO.
//
// server.ts allows :3000, :5173 and :4000 in non-production and nothing else,
// which is why this was pinned to :4000 in Sprint 37d — it had been :4200, CORS
// blocked every frontend→backend request, the auth cookie never propagated, and
// B4 timed out waiting for a load row that could not render.
//
// :4100 is not on that list either, so moving the port alone would reproduce
// that failure exactly. The backend webServer below therefore passes
// CORS_ORIGIN, which server.ts merges into allowedOrigins — the mechanism that
// already exists for staging and preview origins. No production source changes:
// the hardcoded list is untouched and still governs everything else.
const FRONTEND_PORT = 4100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  timeout: 60_000,

  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  webServer: [
    {
      // Backend: Prisma + Express. Seeds DB before listening.
      command: "cd backend && npm run dev",
      port: BACKEND_PORT,
      env: {
        PORT: String(BACKEND_PORT),
        NODE_ENV: "test",
        E2E_BYPASS_OTP: "true",
        // The frontend origin is not on server.ts's hardcoded non-production
        // allowlist. Without this every cross-origin request is blocked and
        // the failure looks like a broken test, not a CORS one.
        CORS_ORIGIN: `http://localhost:${FRONTEND_PORT}`,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Frontend: serve the static export from `out/`. CI runs
      // `npm run build` in frontend/ first; locally, user must
      // also build before running tests.
      //
      // v3.8.aar Sprint 37e — DROP `-s` flag. `serve -s` is SPA-fallback
      // mode (every unknown route → /index.html). Next.js `output: "export"`
      // emits flat .html files (`dashboard/loads.html`), NOT SPA-style
      // `dashboard/loads/index.html`. With `-s`, hitting /dashboard/loads
      // (no extension) falls back to / (homepage), bouncing the test on B4
      // ("load not visible"). Without `-s`, `serve` uses cleanUrls by
      // default — maps /dashboard/loads → dashboard/loads.html, matching
      // Cloudflare Pages prod behavior.
      command: `cd frontend && npx serve out -l ${FRONTEND_PORT}`,
      port: FRONTEND_PORT,
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${BACKEND_PORT}/api`,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
