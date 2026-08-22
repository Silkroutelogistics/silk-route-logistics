/**
 * The SSO callback must write the staff_sessions row the session policy reads.
 *
 * This is the test the previous commit deferred. It matters more than it looks:
 * Legs 3 and 6 were each individually correct and did not meet — the callback
 * wrote no row, so every SSO login fell through the policy's fail-closed branch
 * to the 24h cap and remember-me would have appeared to work for a day.
 *
 * Asserted here: the row exists, carries the right rememberMe, and is keyed
 * with the SAME truncated hash the middleware looks up by. That last one is the
 * silent-failure mode — a plain sha256 would write a row nothing can find.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyIdToken = vi.fn();
const getToken = vi.fn();
const generateAuthUrl = vi.fn(() => "https://accounts.google.com/o/oauth2/v2/auth?mock=1");

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
    getToken = getToken;
    generateAuthUrl = generateAuthUrl;
  },
}));

vi.mock("../../../src/config/env", async (orig) => {
  const actual = (await orig()) as any;
  return {
    env: {
      ...actual.env,
      GOOGLE_SSO_CLIENT_ID: "test-sso-client-id",
      GOOGLE_SSO_CLIENT_SECRET: "test-sso-secret",
      GOOGLE_SSO_REDIRECT_URI: "https://api.test/api/auth/sso/google/callback",
      SSO_SUCCESS_REDIRECT: "https://app.test/dashboard/overview",
      SSO_FAILURE_REDIRECT: "https://app.test/auth/login",
    },
  };
});

import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import ssoRouter from "../../../src/routes/ssoAuth";
import { getTokenHash } from "../../../src/middleware/auth";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;

function app() {
  const a = express();
  a.use(cookieParser());
  a.use("/api/auth/sso", ssoRouter);
  return a;
}

const STAFF = {
  id: "u-ops",
  email: "operations@silkroutelogistics.ai",
  role: "ACCOUNT_EXECUTIVE",
  isActive: true,
  googleSub: "google-sub-123",
};

function goodToken() {
  verifyIdToken.mockResolvedValue({
    getPayload: () => ({
      sub: "google-sub-123",
      email: "operations@silkroutelogistics.ai",
      email_verified: true,
      hd: "silkroutelogistics.ai",
      iss: "https://accounts.google.com",
      name: "Operations",
    }),
  });
  getToken.mockResolvedValue({ tokens: { id_token: "mock-id-token" } });
}

/** Drive /google to obtain a real state cookie, then present it at the callback. */
async function ssoLogin(remember: boolean) {
  const a = app();
  const start = await request(a).get(`/api/auth/sso/google${remember ? "?remember=1" : ""}`);
  const cookies: string[] = (start.headers["set-cookie"] as unknown as string[]) || [];
  const jar = cookies.map((c) => c.split(";")[0]).join("; ");
  const state = decodeURIComponent(
    cookies.find((c) => c.startsWith("srl_sso_state="))!.split(";")[0].split("=")[1],
  );
  return request(a).get(`/api/auth/sso/google/callback?code=abc&state=${encodeURIComponent(state)}`).set("Cookie", jar);
}

beforeEach(() => {
  verifyIdToken.mockReset();
  getToken.mockReset();
  mockPrisma.user.findFirst.mockReset();
  mockPrisma.user.findFirst.mockResolvedValue(STAFF);
  mockPrisma.user.update.mockReset();
  mockPrisma.user.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockReset();
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.staffSession.upsert = vi.fn().mockResolvedValue({});
  mockPrisma.authEvent.create.mockReset();
  mockPrisma.authEvent.create.mockResolvedValue({});
  goodToken();
});

describe("SSO callback writes the staff_sessions row", () => {
  it("with remember-me -> rememberMe true", async () => {
    const res = await ssoLogin(true);
    expect(res.status).toBe(302);
    expect(mockPrisma.staffSession.upsert).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.staffSession.upsert.mock.calls[0][0];
    expect(arg.create.rememberMe).toBe(true);
    expect(arg.create.userId).toBe(STAFF.id);
  });

  it("without remember-me -> rememberMe false", async () => {
    const res = await ssoLogin(false);
    expect(res.status).toBe(302);
    const arg = mockPrisma.staffSession.upsert.mock.calls[0][0];
    expect(arg.create.rememberMe).toBe(false);
  });

  it("keys the row with the SAME truncated hash the middleware looks up by", async () => {
    await ssoLogin(true);
    const arg = mockPrisma.staffSession.upsert.mock.calls[0][0];
    const key = arg.where.tokenHash;

    // 32 chars, not a full 64-char sha256. A plain sha256 here would write a
    // row the middleware could never find — the silent 24h-fallback bug.
    expect(key).toHaveLength(32);
    expect(arg.create.tokenHash).toBe(key);

    // And it is genuinely getTokenHash of the token that was set as the cookie.
    const setCookie: string[] = (await ssoLogin(true)).headers["set-cookie"] as unknown as string[];
    const authCookie = setCookie.find((c) => c.startsWith("srl_token_ae="));
    expect(authCookie).toBeTruthy();
    const token = decodeURIComponent(authCookie!.split(";")[0].split("=")[1]);
    const latest = mockPrisma.staffSession.upsert.mock.calls.at(-1)![0];
    expect(latest.where.tokenHash).toBe(getTokenHash(token));
  });

  it("sets a 30d Max-Age with remember-me and a session cookie without", async () => {
    const withR: string[] = (await ssoLogin(true)).headers["set-cookie"] as unknown as string[];
    const auth1 = withR.find((c) => c.startsWith("srl_token_ae="))!;
    expect(auth1).toMatch(/Max-Age=2592000/); // 30d

    const withoutR: string[] = (await ssoLogin(false)).headers["set-cookie"] as unknown as string[];
    const auth2 = withoutR.find((c) => c.startsWith("srl_token_ae="))!;
    expect(auth2).not.toMatch(/Max-Age=/); // session cookie
  });
});

describe("SSO callback refuses without minting a session", () => {
  it("unknown identity -> no session row, no cookie", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = await ssoLogin(true);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("sso_error=unknown_identity");
    expect(mockPrisma.staffSession.upsert).not.toHaveBeenCalled();
    // No auto-provisioning.
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("wrong domain -> refused", async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "s", email: "outsider@gmail.com", email_verified: true,
        hd: undefined, iss: "https://accounts.google.com",
      }),
    });
    const res = await ssoLogin(true);
    expect(res.headers.location).toContain("sso_error=wrong_domain");
    expect(mockPrisma.staffSession.upsert).not.toHaveBeenCalled();
  });

  it("state mismatch -> refused before any token exchange", async () => {
    const a = app();
    await request(a).get("/api/auth/sso/google");
    const res = await request(a)
      .get("/api/auth/sso/google/callback?code=abc&state=tampered")
      .set("Cookie", "srl_sso_state=something-else");
    expect(res.headers.location).toContain("sso_error=bad_state");
    expect(getToken).not.toHaveBeenCalled();
  });
});
