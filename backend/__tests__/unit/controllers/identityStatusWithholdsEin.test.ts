/**
 * GET /api/carriers/:id/identity withholds the carrier's full EIN (v3.8.blr).
 *
 * The route returned the whole identity row, so the full EIN went to any AE
 * screen that asked. Nothing in the frontend reads it there: the last four
 * identify the number on screen, and the full one is for the IRS match and the
 * carrier's own executed agreement. Onboarding now captures the EIN, so this
 * route would have become the place it leaked.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/config/database", () => ({
  prisma: { carrierIdentityVerification: { findUnique: vi.fn() } },
}));

import { prisma } from "../../../src/config/database";
import { getIdentityStatus } from "../../../src/controllers/carrierVettingController";

const p = vi.mocked(prisma) as any;
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }) as any;

describe("identity status withholds the full EIN", () => {
  it("drops w9TinFull, keeps the last four, and says whether one is on file", async () => {
    p.carrierIdentityVerification.findUnique.mockResolvedValue({
      carrierId: "cp1", w9TinFull: "987654321", w9TinLastFour: "4321", identityStatus: "PARTIAL",
    });
    const r = res();
    await getIdentityStatus({ params: { id: "cp1" } } as any, r);
    const body = r.json.mock.calls[0][0];
    expect(body).not.toHaveProperty("w9TinFull");
    expect(JSON.stringify(body)).not.toContain("987654321");
    expect(body.w9TinLastFour).toBe("4321");
    expect(body.w9TinOnFile).toBe(true);
    expect(body.identityStatus).toBe("PARTIAL");
  });

  it("reports no EIN on file when there is none", async () => {
    p.carrierIdentityVerification.findUnique.mockResolvedValue({
      carrierId: "cp2", w9TinFull: null, w9TinLastFour: null, identityStatus: "UNVERIFIED",
    });
    const r = res();
    await getIdentityStatus({ params: { id: "cp2" } } as any, r);
    expect(r.json.mock.calls[0][0].w9TinOnFile).toBe(false);
  });
});
