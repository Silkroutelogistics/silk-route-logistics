/**
 * v3.8.bko — the payment-reminder switch's endpoints. Accounting may SEE
 * whether customers are being emailed; only ADMIN/CEO may change it, because
 * turning it on mails every overdue customer on the next run.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-1", email: "u@srl.test", role: req.headers["x-test-role"] ?? "ADMIN" };
      next();
    },
  };
});

import accountingRouter from "../../../src/routes/accounting";
import { prisma } from "../../../src/config/database";
import { AR_REMINDER_SWITCH } from "../../../src/lib/arReminderSwitch";

const mockPrisma = prisma as any;
let server: Server;
let base = "";

beforeEach(async () => {
  vi.clearAllMocks();
  if (!server) {
    const app = express();
    app.use(express.json());
    app.use("/accounting", accountingRouter);
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/accounting/reminder-emails`;
  }
  mockPrisma.cronRegistry.findUnique = vi.fn().mockResolvedValue(null);
  mockPrisma.cronRegistry.upsert = vi.fn().mockImplementation(async ({ update }: any) => ({ enabled: update.enabled, updatedAt: new Date() }));
  mockPrisma.auditLog.create = vi.fn().mockResolvedValue({});
});
afterAll(() => server?.close());

const put = (role: string, body: unknown) =>
  fetch(base, { method: "PUT", headers: { "content-type": "application/json", "x-test-role": role }, body: JSON.stringify(body) });

describe("/accounting/reminder-emails", () => {
  it("GET reads OFF when no row exists, for accounting too", async () => {
    const r = await fetch(base, { headers: { "x-test-role": "ACCOUNTING" } });
    expect(r.status).toBe(200);
    expect((await r.json()).enabled).toBe(false);
  });

  it("an admin can turn it on, and the write targets the switch row", async () => {
    const r = await put("ADMIN", { enabled: true });
    expect(r.status).toBe(200);
    expect((await r.json()).enabled).toBe(true);
    expect(mockPrisma.cronRegistry.upsert.mock.calls[0][0].where).toEqual({ jobName: AR_REMINDER_SWITCH });
    // Who flipped it is on the audit log.
    await vi.waitFor(() => expect(mockPrisma.auditLog.create).toHaveBeenCalled());
  });

  it("accounting cannot change it", async () => {
    const r = await put("ACCOUNTING", { enabled: true });
    expect(r.status).toBe(403);
    expect(mockPrisma.cronRegistry.upsert).not.toHaveBeenCalled();
  });

  it("refuses anything but a boolean", async () => {
    const r = await put("ADMIN", { enabled: "yes" });
    expect(r.status).toBe(400);
    expect(mockPrisma.cronRegistry.upsert).not.toHaveBeenCalled();
  });
});
