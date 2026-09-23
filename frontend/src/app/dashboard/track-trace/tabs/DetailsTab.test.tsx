import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetailsTab } from "./DetailsTab";

/**
 * This renders the real component. A grep for "srlBolNumber" in the source would
 * pass just as happily with the field wired to a label nobody reads, or rendered
 * under a condition that is never true — presence is not function (§19
 * Sub-pattern 16). What matters is what an AE sees in the panel.
 *
 * SRL-121497 is the fixture: srlBolNumber SRL-121497B, bolNumber NULL, both stop
 * dates stored as UTC midnight on 09-24, no windows, no dock contacts. Every
 * value here is the production row.
 */
const load121497 = {
  loadNumber: "SRL-121497",
  srlBolNumber: "SRL-121497B",
  bolNumber: null,
  poNumbers: ["PO1602", "PO1978"],
  equipmentType: "Dry Van 53'",
  commodity: "Wellness Suppliments",
  weight: 3150,
  pieces: 7,
  hazmat: false,
  pickupDate: "2026-09-24T00:00:00.000Z",
  deliveryDate: "2026-09-24T00:00:00.000Z",
  pickupTimeStart: null,
  pickupTimeEnd: null,
  deliveryTimeStart: null,
  deliveryTimeEnd: null,
  originContactName: null,
  destContactName: null,
  appointmentNumber: "15160360",
  loadStops: [],
};

/**
 * `nth` disambiguates labels that legitimately repeat — "Window" appears once
 * under Origin and once under Destination. Defaulting to 0 keeps the unique
 * labels readable.
 */
function valueFor(label: string, nth = 0): string {
  const labelEls = screen.getAllByText(label);
  return labelEls[nth]?.parentElement?.querySelector("div:nth-child(2)")?.textContent ?? "";
}

describe("T&T DetailsTab — the BOL number the driver is holding", () => {
  it("shows SRL's own BOL number, which is what the printed BOL carries", () => {
    render(<DetailsTab load={load121497} />);
    expect(valueFor("BOL #")).toBe("SRL-121497B");
  });

  it("does not print an em-dash where a BOL number exists", () => {
    // The defect: the panel read `bolNumber` (the SHIPPER's reference, NULL on
    // every live load) and showed "—" while the PDF said SRL-121497B.
    render(<DetailsTab load={load121497} />);
    expect(valueFor("BOL #")).not.toBe("—");
  });

  it("keeps the shipper's own reference in its own labelled row", () => {
    render(<DetailsTab load={{ ...load121497, bolNumber: "CUST-88421" }} />);
    expect(valueFor("BOL #")).toBe("SRL-121497B");
    expect(valueFor("Shipper BOL ref")).toBe("CUST-88421");
  });

  it("shows an em-dash for the shipper reference when the customer gave none", () => {
    render(<DetailsTab load={load121497} />);
    expect(valueFor("Shipper BOL ref")).toBe("—");
  });
});

describe("T&T DetailsTab — stop dates and windows (C1, rendered)", () => {
  it("renders the stored calendar date, not the reader's previous day", () => {
    render(<DetailsTab load={load121497} />);
    expect(valueFor("Pickup date")).toBe("Sep 24, 2026");
    expect(valueFor("Delivery date")).toBe("Sep 24, 2026");
  });

  it("renders an em-dash on both stops when no window was stored", () => {
    render(<DetailsTab load={load121497} />);
    expect(valueFor("Window", 0)).toBe("—"); // pickup
    expect(valueFor("Window", 1)).toBe("—"); // delivery
  });

  it("labels a real window local, on the stop it belongs to", () => {
    render(
      <DetailsTab
        load={{ ...load121497, pickupTimeStart: "09:00", pickupTimeEnd: "10:00", deliveryTimeStart: "15:30", deliveryTimeEnd: "16:30" }}
      />,
    );
    expect(valueFor("Window", 0)).toBe("09:00 – 10:00 local");
    expect(valueFor("Window", 1)).toBe("15:30 – 16:30 local");
  });
});
