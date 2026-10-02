// carrier-portal-upgrade G18/G19/G20 — one mapper for carrier-facing statuses,
// derived from the DB enums, plus the tender-history page that now uses it.
//
// The census reads backend/prisma/schema.prisma, so an enum value added in
// the schema fails here until it has a label, and a label for a value the
// enum lacks (a label-only state, banned by owner default 2) fails too.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { LOAD_STATUS, CARRIER_PAY_STATUS, TENDER_STATUS, statusDisplay } from "./carrierStatus";
import { CarrierBadge } from "@/components/carrier/CarrierBadge";

const { history } = vi.hoisted(() => ({ history: { value: [] as any[] } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { tenders: history.value }, isLoading: false, isError: false }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

import TenderHistoryPage from "@/app/carrier/dashboard/tender-history/page";

function enumValues(name: string): string[] {
  const schema = fs.readFileSync(path.join(__dirname, "../../../backend/prisma/schema.prisma"), "utf8");
  const m = schema.match(new RegExp(`^enum ${name} \\{([\\s\\S]*?)^\\}`, "m"));
  if (!m) throw new Error(`enum ${name} not found in schema.prisma`);
  return m[1]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"))
    .map((l) => l.split(/\s+/)[0]);
}

describe("census against schema.prisma", () => {
  it.each([
    ["LoadStatus", LOAD_STATUS],
    ["CarrierPayStatus", CARRIER_PAY_STATUS],
    ["TenderStatus", TENDER_STATUS],
  ] as const)("%s: every value has a label, and no label is for a value the enum lacks", (name, map) => {
    const values = enumValues(name);
    expect(values.length).toBeGreaterThan(5); // the parser found the enum, not an empty block
    expect(Object.keys(map).sort()).toEqual([...values].sort());
  });
});

describe("the badge", () => {
  it("shows the money problems a carrier must not miss in danger red", () => {
    for (const s of ["DISPUTED", "REJECTED"]) expect(statusDisplay("pay", s).tone).toBe("danger");
    render(<CarrierBadge status="DISPUTED" />);
    expect(screen.getByText("Disputed").className).toMatch(/9B2C2C/);
  });

  it("names a TONU load instead of rendering it as plain grey", () => {
    render(<CarrierBadge status="TONU" />);
    expect(screen.getByText("TONU").className).not.toMatch(/F5EEE0/);
  });

  it("keeps a tender CONFIRMED apart from a load CONFIRMED", () => {
    expect(statusDisplay("tender", "CONFIRMED").tone).toBe("success");
    expect(statusDisplay("load", "CONFIRMED").tone).toBe("info");
  });

  it("still renders a value nobody has mapped yet, in its own words", () => {
    expect(statusDisplay("load", "SOMETHING_NEW")).toEqual({ label: "Something new", tone: "neutral" });
  });
});

describe("tender history", () => {
  const TZ = process.env.TZ;
  beforeEach(() => { process.env.TZ = "America/Los_Angeles"; });
  afterEach(() => { if (TZ === undefined) delete process.env.TZ; else process.env.TZ = TZ; });

  const row = {
    id: "t1", status: "WITHDRAWN", statusReason: null, declineReason: null,
    tenderRate: 2400, offeredRate: 2400, counterRate: null, createdAt: "2026-10-01T15:00:00Z", at: "2026-10-01T15:00:00Z",
    load: { referenceNumber: "SRL-1", loadNumber: "121498", originCity: "Kalamazoo", originState: "MI", destCity: "Dallas", destState: "TX", equipmentType: "DRY_VAN", pickupDate: "2026-10-05T00:00:00.000Z", distance: 1100 },
  };

  it("shows a UTC-midnight pickup date as its own day west of UTC (G16)", () => {
    history.value = [row];
    render(<TenderHistoryPage />);
    expect(screen.getAllByText(/Oct 5, 2026/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Oct 4, 2026/)).toBeNull();
  });

  it("renders cards for a phone and a table for a desktop, and no em dash placeholder", () => {
    history.value = [{ ...row, tenderRate: null, load: { ...row.load, pickupDate: null } }];
    const { container } = render(<TenderHistoryPage />);
    expect(screen.getByTestId("tender-history-cards").className).toMatch(/\bmd:hidden\b/);
    expect(container.querySelector("table")!.parentElement!.className).toMatch(/\bhidden md:block\b/);
    expect(container.textContent).not.toContain("—");
  });
});
