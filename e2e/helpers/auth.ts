/**
 * E2E auth helper — programmatic JWT mint
 *
 * Production AE Console login requires email + OTP + TOTP. E2E can't
 * receive emails or scan TOTP QRs, so we bypass via a backend-issued
 * JWT mint endpoint gated behind E2E_BYPASS_OTP env var.
 *
 * Backend flow: when E2E_BYPASS_OTP === "true", a dev-only endpoint
 * /api/auth/e2e-token returns a signed JWT for the seeded admin user.
 * We then store it in the page's localStorage under the same key the
 * production auth flow uses (matches useAuthStore zustand persist).
 *
 * If E2E_BYPASS_OTP is NOT set, this helper throws and the test
 * fails fast — preventing accidental dev-token leakage in prod
 * environments.
 */
import type { Page } from "@playwright/test";

const ADMIN_EMAIL = "whaider@silkroutelogistics.ai";

export async function loginAsAdmin(page: Page, baseURL: string, apiURL: string): Promise<void> {
  // Mint token via backend bypass endpoint (only available when
  // E2E_BYPASS_OTP=true is set on backend process).
  const response = await page.request.post(`${apiURL}/auth/e2e-token`, {
    data: { email: ADMIN_EMAIL },
  });

  if (!response.ok()) {
    throw new Error(
      `E2E auth bypass failed: ${response.status()} — ` +
      `verify backend is running with E2E_BYPASS_OTP=true`
    );
  }

  const { token, user } = await response.json();
  if (!token) throw new Error("E2E auth bypass returned no token");

  // Set token + user in localStorage matching useAuthStore zustand persist
  // shape. The store key is "srl-auth" per frontend/src/hooks/useAuthStore.ts.
  await page.goto(baseURL);
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem(
        "srl-auth",
        JSON.stringify({
          state: { token, user, isAuthenticated: true },
          version: 0,
        })
      );
    },
    { token, user }
  );
}
