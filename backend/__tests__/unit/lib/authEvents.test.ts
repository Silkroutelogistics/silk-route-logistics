// Auth events are logged, and never leak a secret while doing it.
//
// A read-only diagnostic on 2026-08-19 tried to answer "did anyone hit the
// broken password-reset path" and could not: resets are recorded nowhere.
// auditMiddleware excludes /api/auth outright, requires a 2xx, and requires
// req.user — a reset is unauthenticated and the broken path returned 400.
//
// Logging auth events is the fix; logging the wrong FIELD would be a worse bug
// than the gap, because a reset token in a log line is a live credential sitting
// in a system with looser access control than the database. Hence the grep.

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { logAuthEvent, hashEmail } from "../../../src/lib/authEvents";
import { log } from "../../../src/lib/logger";

const CONTROLLER = path.join(__dirname, "../../../src/controllers/authController.ts");

describe("logAuthEvent", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("emits the event name and a hashed email, never the raw address", () => {
    const spy = vi.spyOn(log, "info").mockImplementation((() => {}) as any);
    logAuthEvent("reset.requested", { email: "Carrier@Example.com" });

    const [payload] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload.authEvent).toBe("reset.requested");
    expect(payload.emailHash).toBe(hashEmail("carrier@example.com"));
    expect(JSON.stringify(payload)).not.toContain("Carrier@Example.com");
    expect(payload).not.toHaveProperty("email");
  });

  it("hashes case- and whitespace-insensitively, so one address is one identity", () => {
    expect(hashEmail("  A@B.com ")).toBe(hashEmail("a@b.com"));
  });

  it("prefers userId when it is known, matching the existing log convention", () => {
    const spy = vi.spyOn(log, "info").mockImplementation((() => {}) as any);
    logAuthEvent("reset.completed", { userId: "u_1" });
    const [payload] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload.userId).toBe("u_1");
  });

  it("returns undefined and never throws — observability cannot change a login outcome", () => {
    vi.spyOn(log, "info").mockImplementation((() => {
      throw new Error("logger exploded");
    }) as any);
    expect(logAuthEvent("login.failed", { userId: "u_1" })).toBeUndefined();
  });

  it("resolves the IP from the request", () => {
    const spy = vi.spyOn(log, "info").mockImplementation((() => {}) as any);
    logAuthEvent("login.failed", { req: { ip: "203.0.113.9", headers: {} } as any });
    const [payload] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload.ip).toBe("203.0.113.9");
  });

  it("survives a request shape it did not expect, and still emits the event", () => {
    // REGRESSION. The first cut of this helper took `ip: extractClientIp(req)`.
    // Arguments evaluate before the callee, so extraction ran OUTSIDE the try
    // below and a request with no `headers` threw straight through — turning a
    // clean 400 into a 500. The pre-existing v3.7.m reset suite went 8-of-9 red
    // and caught it. The event is what matters; the IP is enrichment.
    const spy = vi.spyOn(log, "info").mockImplementation((() => {}) as any);
    expect(() => logAuthEvent("reset.failed", { req: {} as any, reason: "invalid_token" })).not.toThrow();

    const [payload] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload.authEvent).toBe("reset.failed");
    expect(payload.reason).toBe("invalid_token");
    expect(payload).not.toHaveProperty("ip");
  });

  it("omits absent fields rather than emitting nulls", () => {
    const spy = vi.spyOn(log, "info").mockImplementation((() => {}) as any);
    logAuthEvent("otp.failed", {});
    const [payload] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(Object.keys(payload)).toEqual(["authEvent"]);
  });
});

describe("no auth log call site leaks a secret", () => {
  const src = fs.readFileSync(CONTROLLER, "utf8");
  const callSites = [...src.matchAll(/logAuthEvent\([^;]*?\);/gs)].map((m) => m[0]);

  it("instruments the reset flow at all of its outcomes", () => {
    // If this drops, the diagnostic that prompted this file becomes impossible
    // again — which is how the gap survived six months the first time.
    expect(callSites.length).toBeGreaterThanOrEqual(6);
    const joined = callSites.join("\n");
    expect(joined).toContain("reset.requested");
    expect(joined).toContain("reset.completed");
    expect(joined).toContain("reset.failed");
  });

  it("passes only allowlisted keys — a new key cannot appear without this failing", () => {
    // Closed set, mirroring AuthEventFields. Shorthand (`totpCode,`) and a new
    // named key both trip this, which a value-scan alone would miss.
    const ALLOWED = new Set(["userId", "email", "reason", "req", "role"]);
    for (const site of callSites) {
      const literal = site.match(/\{([\s\S]*)\}/);
      if (!literal) continue;
      const keys = literal[1]
        .split(/,(?![^(]*\))/) // commas outside call parens
        .map((s) => s.trim())
        .filter(Boolean)
        .map((frag) => (frag.includes(":") ? frag.slice(0, frag.indexOf(":")) : frag).trim());
      for (const k of keys) {
        expect(ALLOWED.has(k), `unexpected key "${k}" at:\n${site}`).toBe(true);
      }
    }
  });

  it("passes no secret-bearing identifier as a value, however it is named", () => {
    // Substring, not \bword\b: an earlier version of this guard used a word
    // boundary and let `ip: resetToken` through, because camelCase gives no
    // boundary before "Token". Adversarial verification caught it. A guard that
    // reads reassuring and asserts nothing is worse than no guard at all.
    const FORBIDDEN = ["token", "password", "secret", "passcode", "apikey", "totpcode", "pin", "credential"];
    for (const site of callSites) {
      // String literals carry the event name and reason class, never a value.
      const identifiers = site.replace(/"[^"]*"/g, '""').toLowerCase();
      for (const term of FORBIDDEN) {
        expect(identifiers.includes(term), `"${term}" reachable at:\n${site}`).toBe(false);
      }
    }
  });

  it("never passes a raw email variable under an unhashed key", () => {
    for (const site of callSites) {
      expect(site).not.toMatch(/emailHash\s*:/); // hashing is the helper's job, not the caller's
    }
  });
});
