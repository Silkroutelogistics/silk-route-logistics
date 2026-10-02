// The "run now" endpoint is gone (health-digest arc B5). It called
// runRegisteredJob, whose handler map was filled only by registerCronJob, which
// had no callers — so every request answered 500 "No handler registered" and
// wrote an audit row claiming a manual trigger. No UI ever called it.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-1", email: "u@srl.test", role: "ADMIN" };
      next();
    },
  };
});

import monitoringRouter from "../../../src/routes/monitoring";
import { prisma } from "../../../src/config/database";

let server: Server;
let base = "";

beforeAll(async () => {
  (prisma as any).cronRegistry.findMany = vi.fn().mockResolvedValue([]);
  const app = express();
  app.use(express.json());
  app.use("/monitoring", monitoringRouter);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/monitoring`;
});
afterAll(() => server?.close());

describe("/monitoring/crons/:name/run", () => {
  it("control: the router is mounted and the cron list still answers", async () => {
    expect((await fetch(`${base}/crons`)).status).toBe(200);
  });

  it("is gone: POST returns 404 for an admin", async () => {
    const r = await fetch(`${base}/crons/health-digest/run`, { method: "POST" });
    expect(r.status).toBe(404);
  });
});
