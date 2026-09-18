import axios from "axios";
import { Sentry } from "@/lib/sentry";

const resolvedBaseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

// Warn loudly in production if falling back to localhost
if (typeof window !== "undefined" && resolvedBaseURL.includes("localhost") && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
  console.error("[SRL] CRITICAL: API URL is localhost but app is running on", window.location.hostname, "— set NEXT_PUBLIC_API_URL environment variable");
}

export const api = axios.create({
  baseURL: resolvedBaseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000, // 30s timeout — Render free tier cold starts can take ~15s
  withCredentials: true, // Send httpOnly cookies with every request
});

// v3.8.bdb — §13.3 Item 275. When the interceptor below sends the browser to
// a login page, the layouts must NOT also issue their own redirect. Two
// navigations to the login page from one 401 was the race that (a) dropped
// the carrier's ?next= deep-link — the interceptor's bare URL won — and (b) on
// Safari aborted the layout's in-flight RSC fetch, which is how carriers
// reached the raw .txt payload before v3.8.bcu. Post-bcu the second
// navigation is merely redundant, but it can still SUPERSEDE this one with a
// reason-less URL on Safari and lose the SignedOutNotice. So: one owner.
//
// The flag is set immediately before the assignment to window.location.href,
// which always navigates — the only thing that can cancel it is a
// beforeunload prompt, and the sole beforeunload in this app (the Academy
// course page) belongs to a child the layouts do not mount until after the
// identity check that reads this flag. A new document starts with it false.
let loginRedirectInFlight = false;

/** True once the 401 interceptor has committed to navigating to a login page. */
export function isLoginRedirectInFlight(): boolean {
  return loginRedirectInFlight;
}

// Note: Auth tokens are managed via httpOnly cookies set by the backend.
// localStorage is no longer used for JWT storage (XSS protection).
// The Bearer header is only used for temporary tokens (TOTP, force-password-change).

api.interceptors.response.use(
  (response) => response,
  (error) => {
    Sentry.addBreadcrumb({
      category: "api",
      message: `${error.config?.method?.toUpperCase()} ${error.config?.url} → ${error.response?.status || "NETWORK_ERROR"}`,
      level: "error",
      data: {
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
      },
    });
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Sprint 54 (v3.8.acc) Item 6 — portal-aware redirect. Pre-Sprint-54
      // the interceptor hardcoded /auth/login regardless of origin portal,
      // so a logged-out carrier clicking "View Tender" in their email and
      // landing on /carrier/dashboard/tenders got bounced to the AE login
      // page (wrong portal). Now we read window.location.pathname to pick
      // the matching portal's login surface. Sub-pattern banked: HTTP
      // interceptors that make routing decisions on responses must read
      // request context (URL path / expected portal) before deciding the
      // target — hardcoded fallbacks erase user origin.
      const code = error.response?.data?.code;
      const path = window.location.pathname;
      const isLoginPage = path.includes("/login") || path.includes("/auth/");
      if (!isLoginPage) {
        const portalLogin = path.startsWith("/carrier/")
          ? "/carrier/login"
          : path.startsWith("/shipper/")
            ? "/shipper/login"
            : path.startsWith("/driver/")
              ? "/driver/login" // v3.8.amz — Driver Academy portal
              : "/auth/login";
        // Arc 34 (2026-08-25) — this used to test `code === "SESSION_TIMEOUT"`,
        // a string NO backend policy has ever emitted. The branch was dead, so
        // anyone signed out for inactivity bounced to the login page with no
        // explanation at all. The emitted codes are the four below; carrying
        // the reason through is the entire point of having distinct ones.
        const SIGNED_OUT_REASON: Record<string, string> = {
          SESSION_IDLE_EXPIRED: "timeout",
          SESSION_ABSOLUTE_EXPIRED: "expired",
          SESSION_REVOKED_POLICY_ROLLOUT: "policy",
          SESSION_REPLACED: "replaced",
        };
        const reason = typeof code === "string" ? SIGNED_OUT_REASON[code] : undefined;
        const params = new URLSearchParams();
        if (reason) params.set("reason", reason);
        // v3.8.bdb — §13.3 Item 275. Carry the deep-link the way the carrier
        // layout does (Sprint 66, v3.8.afu), so a carrier bounced off
        // /carrier/dashboard/tenders lands back on the tender after signing
        // in rather than on the dashboard root. Carrier portal only: it is
        // the one login page that reads ?next=, and it enforces the
        // /carrier/ whitelist itself. URLSearchParams encodes the value the
        // same way encodeURIComponent does, which is what the layout sends.
        if (portalLogin === "/carrier/login") {
          params.set("next", path + window.location.search);
        }
        const query = params.toString();
        loginRedirectInFlight = true;
        window.location.href = query ? `${portalLogin}?${query}` : portalLogin;
      }
    }
    return Promise.reject(error);
  }
);
