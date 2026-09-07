/**
 * The four ELD read endpoints answer 501 until a provider is connected.
 *
 * They used to serve eldService, which invented positions (random noise around
 * a city centroid), speeds, headings and duty statuses, and reported three
 * providers as connected with a comment reading "Simulated". A simulated
 * position on an operations screen is indistinguishable from a real one, so
 * the honest answer while nothing is connected is a plain refusal.
 *
 * Phase 0 of the mandatory-ELD arc.
 */
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  getHOSData,
  getELDOverview,
  getDriverLocation,
  getAllLocations,
  ELD_NOT_CONNECTED_MESSAGE,
} from "../../../src/controllers/eldController";

function res() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
}

const HANDLERS = { getHOSData, getELDOverview, getDriverLocation, getAllLocations };

describe("ELD read endpoints while no provider is connected", () => {
  for (const [name, handler] of Object.entries(HANDLERS)) {
    it(`${name} returns 501 with a plain message`, async () => {
      const r = res();
      await handler({ params: { id: "d-1" } } as any, r);
      expect(r.status).toHaveBeenCalledWith(501);
      const body = r.json.mock.calls[0][0];
      expect(body.error).toBe("ELD_NOT_CONNECTED");
      expect(body.message).toBe(ELD_NOT_CONNECTED_MESSAGE);
      expect(body.message).toMatch(/no longer returns simulated/i);
    });
  }

  it("the simulated service is gone, not merely unreferenced", () => {
    // Deleting the import while leaving the file would keep a module that
    // invents positions one require() away from a dashboard.
    const sim = path.join(__dirname, "../../../src/services/eldService.ts");
    expect(fs.existsSync(sim)).toBe(false);
  });

  it("nothing in backend/src imports the simulated service", () => {
    const root = path.join(__dirname, "../../../src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.ts$/.test(e.name) && fs.readFileSync(p, "utf8").includes("services/eldService")) offenders.push(p);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
