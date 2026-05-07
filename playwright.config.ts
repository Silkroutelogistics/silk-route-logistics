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

const BACKEND_PORT = 3010;
const FRONTEND_PORT = 4200;

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
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Frontend: serve the static export from `out/`. CI runs
      // `npm run build` in frontend/ first; locally, user must
      // also build before running tests.
      command: `cd frontend && npx serve -s out -l ${FRONTEND_PORT}`,
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
