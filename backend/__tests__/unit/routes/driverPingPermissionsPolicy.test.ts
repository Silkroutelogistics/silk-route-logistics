/**
 * The driver ping page may ask the browser for a position; nothing else may.
 *
 * middleware/security.ts sets Permissions-Policy geolocation=() on every
 * response, and routes/driverPing.ts renders a page whose one button calls
 * navigator.geolocation.getCurrentPosition. Under that header the browser
 * refused the call before the driver ever saw a prompt, so the only location
 * channel SRL has (Arc 19) was dead from the day it shipped, and its failure
 * read as a driver declining to share. The page's own response now allows
 * geolocation for its origin; the global header is unchanged elsewhere.
 *
 * This exercises the real middleware and the real router over HTTP, because
 * a text assertion that a setHeader call exists would be green with the call
 * in the wrong branch (section 19 Sub-pattern 16).
 *
 * Phase 0 of the mandatory-ELD arc.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-ping-header";

// The GET never reaches the service; the POST cases below stop at validation.
// Mocked so this test does not load the geofence and detention chain.
vi.mock("../../../src/services/driverPingService", () => ({
  recordDriverPing: vi.fn(),
}));

import { securityHeaders } from "../../../src/middleware/security";
import driverPingRouter from "../../../src/routes/driverPing";
import { mintDriverPingToken } from "../../../src/lib/driverPingToken";
import { recordDriverPing } from "../../../src/services/driverPingService";

const GLOBAL = "camera=(), microphone=(), geolocation=()";
const PING_PAGE = "camera=(), microphone=(), geolocation=(self)";

let app: express.Express;
let token: string;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use(securityHeaders);
  app.use("/api/ping", driverPingRouter);
  app.get("/api/control", (_req, res) => { res.json({ ok: true }); });
  token = mintDriverPingToken("load-ping-1", "+12692206760");
});

describe("Permissions-Policy on the driver ping page", () => {
  it("the valid-token page allows geolocation for its own origin, and nothing else", async () => {
    const r = await request(app).get(`/api/ping/${token}`);
    expect(r.status).toBe(200);
    expect(r.headers["permissions-policy"]).toBe(PING_PAGE);
    expect(r.text).toContain("Share my location once");
  });

  it("an invalid or expired token still gets the global header", async () => {
    const r = await request(app).get("/api/ping/not-a-token");
    expect(r.status).toBe(410);
    expect(r.headers["permissions-policy"]).toBe(GLOBAL);
  });

  it("every other route still carries geolocation=()", async () => {
    const r = await request(app).get("/api/control");
    expect(r.status).toBe(200);
    expect(r.headers["permissions-policy"]).toBe(GLOBAL);
  });

  it("the POST that records a position is not a page and keeps the global header", async () => {
    const r = await request(app).post(`/api/ping/${token}`).send({});
    expect(r.status).toBe(400);
    expect(r.headers["permissions-policy"]).toBe(GLOBAL);
    expect(recordDriverPing).not.toHaveBeenCalled();
  });

  it("the global middleware itself is unchanged", () => {
    const set: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { set[k] = v; } } as any;
    securityHeaders({} as any, res, () => {});
    expect(set["Permissions-Policy"]).toBe(GLOBAL);
  });
});
