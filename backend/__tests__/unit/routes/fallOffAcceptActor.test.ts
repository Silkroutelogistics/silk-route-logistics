/**
 * Carrier-archive recut B2c (2026-09-21) — a carrier accepts a fall-off
 * recovery as themselves.
 *
 * POST /api/automation/fall-off-accept/:loadId read
 * `req.body.carrierUserId || req.user.id`, and its authorize list includes
 * CARRIER — so a carrier session could put ANY user id on the load (Phase A
 * row B). B2b's gate inside assignCarrier refuses an ineligible one; an
 * eligible colleague, competitor or ex-driver is not the gate's to refuse.
 * Now a CARRIER's accept is bound to req.user.id, and a carrier who sends the
 * field at all is told 403 rather than silently ignored.
 *
 * Real router, real express, the recovery service mocked at its seam so what
 * is under test is WHO the route names, not what recovery does with the name.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.setConfig({ testTimeout: 30_000 });

const actor = vi.hoisted(() => ({ user: { id: "u-carrier", email: "c@srl.test", role: "CARRIER" } as { id: string; email: string; role: string } }));

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => { req.user = { ...actor.user }; next(); },
    authorize: () => (_req: any, _res: any, next: any) => next(),
  };
});

const recovery = vi.hoisted(() => ({ handleFallOffAcceptance: vi.fn() }));
vi.mock("../../../src/services/fallOffRecovery", () => ({
  executeFallOffRecovery: vi.fn(),
  handleFallOffAcceptance: recovery.handleFallOffAcceptance,
}));

async function app() {
  const automation = (await import("../../../src/routes/automation")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/automation", automation);
  return a;
}

beforeEach(() => {
  recovery.handleFallOffAcceptance.mockReset();
  recovery.handleFallOffAcceptance.mockResolvedValue({ eventId: "ev1", recovered: true });
});

describe("fall-off-accept names the carrier by session, not by body (B2c)", () => {
  it("a CARRIER with no body is accepted as themselves", async () => {
    actor.user = { id: "u-carrier", email: "c@srl.test", role: "CARRIER" };
    const r = await request(await app()).post("/api/automation/fall-off-accept/L1").send({});
    expect(r.status).toBe(200);
    expect(recovery.handleFallOffAcceptance).toHaveBeenCalledWith("L1", "u-carrier");
  });

  it("a CARRIER who names another user is refused 403 and recovery is not called", async () => {
    actor.user = { id: "u-carrier", email: "c@srl.test", role: "CARRIER" };
    const r = await request(await app()).post("/api/automation/fall-off-accept/L1").send({ carrierUserId: "u-someone-else" });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("CARRIER_ACCEPTS_AS_SELF");
    expect(recovery.handleFallOffAcceptance).not.toHaveBeenCalled();
  });

  it("a CARRIER who sends their OWN id in the body is still refused — the field is not a carrier's to send", async () => {
    actor.user = { id: "u-carrier", email: "c@srl.test", role: "CARRIER" };
    const r = await request(await app()).post("/api/automation/fall-off-accept/L1").send({ carrierUserId: "u-carrier" });
    expect(r.status).toBe(403);
    expect(recovery.handleFallOffAcceptance).not.toHaveBeenCalled();
  });

  it("an AE recording a named carrier's acceptance still passes the body id through (unchanged)", async () => {
    actor.user = { id: "u-ae", email: "ae@srl.test", role: "DISPATCH" };
    const r = await request(await app()).post("/api/automation/fall-off-accept/L1").send({ carrierUserId: "u-named-carrier" });
    expect(r.status).toBe(200);
    expect(recovery.handleFallOffAcceptance).toHaveBeenCalledWith("L1", "u-named-carrier");
  });

  it("an AE with no body id falls back to their own id (unchanged, and gated downstream by assignCarrier)", async () => {
    actor.user = { id: "u-ae", email: "ae@srl.test", role: "ADMIN" };
    const r = await request(await app()).post("/api/automation/fall-off-accept/L1").send({});
    expect(r.status).toBe(200);
    expect(recovery.handleFallOffAcceptance).toHaveBeenCalledWith("L1", "u-ae");
  });
});
