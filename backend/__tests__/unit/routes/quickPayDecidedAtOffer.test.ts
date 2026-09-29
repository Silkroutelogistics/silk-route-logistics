/**
 * Item 342 (v3.8.bos) — the carrier's after-accept Quick Pay choice is gone.
 *
 * Quick Pay is the AE's election at offer and the rate confirmation carries it
 * into the carrier's signature, so the portal PUT refuses every speed, before
 * or after the document is issued, and writes nothing. The GET stays so My
 * Loads can show what the load pays. The "Quick Pay is open" notice sent at
 * accept is removed with it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-carrier", email: "c@srl.invalid", role: "CARRIER" };
      next();
    },
    authorize: () => (_req: any, _res: any, next: any) => next(),
  };
});

import carrierPaymentRoutes from "../../../src/routes/carrierPayments";

const db = prisma as any;
const app = express();
app.use(express.json());
app.use("/api/carrier-payments", carrierPaymentRoutes);

const LOAD = {
  id: "load-1", carrierId: "u-carrier", referenceNumber: "121498",
  quickPaySpeed: null, quickPayFeePercent: null, rateConfirmations: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.load.findUnique = vi.fn().mockResolvedValue(LOAD);
  db.load.update = vi.fn();
  db.$transaction = vi.fn();
});

describe("PUT /carrier-payments/loads/:id/quickpay-speed", () => {
  for (const speed of ["STANDARD", "SEVEN_DAY", "SAME_DAY"]) {
    it(`refuses ${speed} with QP_DECIDED_AT_OFFER and writes nothing`, async () => {
      const res = await request(app).put("/api/carrier-payments/loads/load-1/quickpay-speed").send({ speed });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("QP_DECIDED_AT_OFFER");
      expect(res.body.error).toContain("121498");
      expect(db.load.update).not.toHaveBeenCalled();
      expect(db.$transaction).not.toHaveBeenCalled();
    });
  }

  it("another carrier's load is still a 404, not a confirmation it exists", async () => {
    db.load.findUnique = vi.fn().mockResolvedValue({ ...LOAD, carrierId: "u-other" });
    const res = await request(app).put("/api/carrier-payments/loads/load-1/quickpay-speed").send({ speed: "SAME_DAY" });
    expect(res.status).toBe(404);
  });
});

describe("the after-accept notice is gone", () => {
  const SRC = path.resolve(__dirname, "../../../src");
  it("nothing sends or defines notifyQuickPayElectionOpen", () => {
    for (const rel of ["controllers/tenderController.ts", "services/notificationService.ts"]) {
      const code = fs.readFileSync(path.join(SRC, rel), "utf8").replace(/^\s*\/\/.*$/gm, "");
      expect(code, rel).not.toContain("notifyQuickPayElectionOpen");
    }
  });
});
