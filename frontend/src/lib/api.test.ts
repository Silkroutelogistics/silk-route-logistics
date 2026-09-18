/**
 * The 401 interceptor in lib/api.ts — where a signed-out user is sent, and
 * what the URL carries (§13.3 Item 275, v3.8.bdb).
 *
 * WHY THESE EXIST. The interceptor hard-navigated to the BARE portal login on
 * every 401 while the carrier layout soft-navigated to the same page WITH the
 * ?next= deep-link. The interceptor's navigation won, so a carrier bounced off
 * /carrier/dashboard/tenders signed in and landed on the dashboard root — the
 * Sprint 66 deep-link had been dead on that path since it shipped. The same
 * double navigation was, on Safari, the most common trigger for the raw RSC
 * payload page (v3.8.bcu). Now the interceptor carries ?next= itself and
 * exposes a flag the layouts read so they do not issue a second navigation.
 *
 * MECHANICS. The interceptor is exercised by invoking axios's registered
 * rejected-handler directly — the same function axios calls on a failed
 * response — rather than by mocking a transport. window.location is replaced
 * with a plain writable object so the assignment to .href can be read back;
 * jsdom otherwise reports "not implemented: navigation" and swallows it. The
 * in-flight flag is MODULE state and stays true once set, so every case gets
 * a fresh module via vi.resetModules() + dynamic import.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/sentry", () => ({ Sentry: { addBreadcrumb: vi.fn() } }));

type Loc = { pathname: string; search: string; hostname: string; href: string };
const realLocation = window.location;

function setLocation(pathname: string, search = ""): Loc {
  const loc: Loc = { pathname, search, hostname: "silkroutelogistics.ai", href: "" };
  Object.defineProperty(window, "location", { value: loc, writable: true, configurable: true });
  return loc;
}

async function freshInterceptor() {
  // The module warns loudly when the API URL is localhost but the page is not;
  // give it a real-looking base so the warning cannot be mistaken for a finding.
  process.env.NEXT_PUBLIC_API_URL = "https://api.silkroutelogistics.ai/api";
  vi.resetModules();
  const mod = await import("@/lib/api");
  const handlers = (mod.api.interceptors.response as unknown as {
    handlers: Array<{ rejected: (e: unknown) => Promise<never> }>;
  }).handlers;
  expect(handlers.length, "the response interceptor must be registered").toBe(1);
  return { reject: handlers[0].rejected, isLoginRedirectInFlight: mod.isLoginRedirectInFlight };
}

function unauthorized(code?: string) {
  return {
    config: { method: "get", url: "/carrier-auth/me" },
    response: { status: 401, statusText: "Unauthorized", data: code ? { code } : {} },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  Object.defineProperty(window, "location", { value: realLocation, writable: true, configurable: true });
});

describe("401 outside a login page", () => {
  it("sends a carrier to /carrier/login WITH the deep-link, and marks the redirect in flight", async () => {
    const loc = setLocation("/carrier/dashboard/tenders");
    const { reject, isLoginRedirectInFlight } = await freshInterceptor();
    expect(isLoginRedirectInFlight()).toBe(false);

    await expect(reject(unauthorized())).rejects.toBeTruthy();

    expect(loc.href).toBe("/carrier/login?next=%2Fcarrier%2Fdashboard%2Ftenders");
    expect(isLoginRedirectInFlight()).toBe(true);
  });

  it("keeps the query string in the deep-link", async () => {
    const loc = setLocation("/carrier/dashboard/my-loads", "?tab=delivered");
    const { reject } = await freshInterceptor();

    await expect(reject(unauthorized())).rejects.toBeTruthy();

    // Decodes to /carrier/dashboard/my-loads?tab=delivered — what the carrier
    // layout would have sent, and what /carrier/login's whitelist accepts.
    const next = new URL(loc.href, "https://x").searchParams.get("next");
    expect(next).toBe("/carrier/dashboard/my-loads?tab=delivered");
  });

  it("carries BOTH the signed-out reason and the deep-link — neither may displace the other", async () => {
    const loc = setLocation("/carrier/dashboard/tenders");
    const { reject } = await freshInterceptor();

    await expect(reject(unauthorized("SESSION_IDLE_EXPIRED"))).rejects.toBeTruthy();

    const url = new URL(loc.href, "https://x");
    expect(url.pathname).toBe("/carrier/login");
    expect(url.searchParams.get("reason")).toBe("timeout");
    expect(url.searchParams.get("next")).toBe("/carrier/dashboard/tenders");
  });

  it("AE and shipper portals keep their bare login (no ?next= — those pages do not read it)", async () => {
    for (const [path, login] of [
      ["/dashboard/loads", "/auth/login"],
      ["/accounting/invoices", "/auth/login"],
      ["/shipper/dashboard/shipments", "/shipper/login"],
      ["/driver/dashboard", "/driver/login"],
    ] as const) {
      const loc = setLocation(path);
      const { reject } = await freshInterceptor();
      await expect(reject(unauthorized())).rejects.toBeTruthy();
      expect(loc.href, path).toBe(login);
    }
  });

  it("still carries the reason on the AE portal", async () => {
    const loc = setLocation("/dashboard/loads");
    const { reject } = await freshInterceptor();
    await expect(reject(unauthorized("SESSION_ABSOLUTE_EXPIRED"))).rejects.toBeTruthy();
    expect(loc.href).toBe("/auth/login?reason=expired");
  });
});

describe("no redirect, no flag", () => {
  it("on a login page — the page is already where a 401 would send it", async () => {
    const loc = setLocation("/carrier/login", "?next=%2Fcarrier%2Fdashboard%2Ftenders");
    const { reject, isLoginRedirectInFlight } = await freshInterceptor();
    await expect(reject(unauthorized())).rejects.toBeTruthy();
    expect(loc.href).toBe("");
    expect(isLoginRedirectInFlight()).toBe(false);
  });

  it("on any non-401 failure", async () => {
    const loc = setLocation("/carrier/dashboard/tenders");
    const { reject, isLoginRedirectInFlight } = await freshInterceptor();
    await expect(
      reject({ config: { method: "get", url: "/x" }, response: { status: 500, data: {} } }),
    ).rejects.toBeTruthy();
    expect(loc.href).toBe("");
    expect(isLoginRedirectInFlight()).toBe(false);
  });
});
