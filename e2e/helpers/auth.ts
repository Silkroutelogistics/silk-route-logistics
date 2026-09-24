/**
 * E2E auth helper — programmatic JWT mint via httpOnly cookie.
 *
 * Production AE Console login requires email + OTP + TOTP. E2E can't
 * receive emails or scan TOTP QRs, so we bypass via a backend-issued
 * JWT mint endpoint gated behind E2E_BYPASS_OTP env var.
 *
 * Auth is cookie-based (per backend/src/utils/cookies.ts:14 — httpOnly
 * `srl_token` cookie). The /auth/e2e-token endpoint sets the cookie via
 * Set-Cookie header on its response. Playwright's BrowserContext stores
 * the cookie automatically when we call via page.context().request, so
 * subsequent page.goto() requests carry the auth.
 *
 * We also explicitly addCookies() as belt-and-suspenders in case
 * cross-origin Set-Cookie is filtered (frontend on :4200, backend on
 * :3010). Cookies are scoped by hostname (localhost), not port.
 *
 * If E2E_BYPASS_OTP is NOT set on backend, the endpoint 404s — test
 * fails fast, preventing accidental dev-token leakage in prod.
 */
import type { Page } from "@playwright/test";

const ADMIN_EMAIL = "whaider@silkroutelogistics.ai";

/**
 * RETURNS THE TOKEN, and the suite must reuse it rather than mint a second.
 *
 * ADMIN and CEO are capped at ONE concurrent session (MAX_SESSIONS_ADMIN = 1 in
 * middleware/auth.ts) and registerSession evicts FIFO. A second mint for the
 * same admin therefore evicts THIS one, and every request the browser then
 * makes comes back 401 SESSION_REPLACED — the page bounces to login and the
 * board renders no rows, which the suite reports as "element(s) not found" on
 * the load reference (§13.3 Item 301).
 *
 * That was intermittent rather than constant only by accident: jwt.sign is
 * deterministic and `iat` is floored to the second, so two mints inside one
 * second are byte-identical, the hash is already present, and the
 * `!sessions.has(hash)` guard skips the eviction. The suite was relying on two
 * HTTP calls landing in the same clock second. When they straddled a boundary
 * it failed, and the retry — which skips the carrier approval B0 already did,
 * so it reaches the board sooner — usually passed.
 *
 * One admin session is also what a real admin gets. The fix is the suite
 * obeying the policy, not the policy widening for the suite.
 */
export async function loginAsAdmin(page: Page, _baseURL: string, apiURL: string): Promise<string> {
  // Mint token via backend bypass endpoint. Backend sets srl_token
  // cookie via Set-Cookie header — page.context() persists it.
  const response = await page.context().request.post(`${apiURL}/auth/e2e-token`, {
    data: { email: ADMIN_EMAIL },
  });

  if (!response.ok()) {
    throw new Error(
      `E2E auth bypass failed: ${response.status()} — ` +
      `verify backend is running with E2E_BYPASS_OTP=true`
    );
  }

  const body = await response.json();
  if (!body?.token) throw new Error("E2E auth bypass returned no token");

  // Belt-and-suspenders: explicitly add cookie to context.
  // Some Playwright versions filter cross-origin Set-Cookie on
  // page.context().request — direct addCookies guarantees presence.
  await page.context().addCookies([
    {
      name: "srl_token",
      value: body.token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  return body.token as string;
}
