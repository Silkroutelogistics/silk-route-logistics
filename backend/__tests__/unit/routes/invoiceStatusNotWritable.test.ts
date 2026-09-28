/**
 * v3.8.bno — ruling 2026-09-27, 6: an invoice's status is not writable through
 * any edit or request-body path. Only the aging job, payment posting, send and
 * void set it. A write that names `status` is refused with 400.
 *
 * The real router is mounted. Auth passes everyone through as ADMIN and every
 * controller answers 200 with its own name, so each case is about what the
 * router lets reach a handler, not about what the handler then does.
 */
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../../src/middleware/auth", () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { id: "u-1", role: "ADMIN" }; next(); },
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../../src/middleware/audit", () => ({ auditLog: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../../../src/controllers/invoiceController", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(real).map(([name, v]) =>
    [name, typeof v === "function" ? (_req: any, res: any) => res.status(200).json({ reached: name }) : v]));
});

import invoiceRoutes from "../../../src/routes/invoices";

const app = express();
app.use(express.json());
app.use("/api/invoices", invoiceRoutes);

const WRITES: Array<[string, "post" | "put" | "patch", string, string]> = [
  ["create", "post", "/api/invoices", "createInvoice"],
  ["generate from a load", "post", "/api/invoices/generate/load-1", "generateInvoiceFromLoad"],
  ["replace line items", "put", "/api/invoices/inv-1/line-items", "updateInvoiceLineItems"],
  ["submit for factoring", "post", "/api/invoices/inv-1/factor", "submitForFactoring"],
  ["record a payment", "patch", "/api/invoices/inv-1/mark-paid", "markInvoicePaid"],
];

describe("/invoices — status cannot be written from a request body", () => {
  it.each(WRITES)("%s: a body naming status is refused with 400 and reaches no handler", async (_n, verb, url) => {
    const res = await request(app)[verb](url).send({ status: "OVERDUE", amount: 100 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVOICE_STATUS_NOT_WRITABLE");
    expect(res.body.reached).toBeUndefined();
  });

  it.each(WRITES)("%s: the same write without status still reaches its handler", async (_n, verb, url, handler) => {
    const res = await request(app)[verb](url).send({ amount: 100 });
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe(handler);
  });

  it("a status of null is still a status", async () => {
    const res = await request(app).post("/api/invoices").send({ status: null });
    expect(res.status).toBe(400);
  });

  it("PATCH /:id/status and POST /batch/status are gone: 400 with a status, 404 without", async () => {
    expect((await request(app).patch("/api/invoices/inv-1/status").send({ status: "APPROVED" })).status).toBe(400);
    expect((await request(app).post("/api/invoices/batch/status").send({ ids: ["inv-1"], status: "PAID" })).status).toBe(400);
    expect((await request(app).patch("/api/invoices/inv-1/status").send({})).status).toBe(404);
    expect((await request(app).post("/api/invoices/batch/status").send({ ids: ["inv-1"] })).status).toBe(404);
  });

  it("a status filter on a read is left alone", async () => {
    const res = await request(app).get("/api/invoices?status=OVERDUE");
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe("getInvoices");
  });
});
