import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetailsTab } from "./DetailsTab";

/**
 * The waterfall panel and the Track & Trace panel describe the same load to the
 * same AE. This one showed the dock contact's name without their phone, and
 * neither appointment — so an AE who opened a load here saw strictly less than
 * an AE who opened it there, with nothing to indicate the difference.
 *
 * Rendered, not grepped: a source search for "pickupAppointment" passes just as
 * happily with the row behind a condition that is never true (§19 Sub-pattern 16).
 */
const load = {
  loadNumber: "SRL-121474",
  srlBolNumber: "SRL-121474B",
  bolNumber: null,
  equipmentType: "Dry Van 53'",
  commodity: "Wellness Supplements",
  weight: 3150,
  pieces: 7,
  pallets: 7,
  hazmat: false,
  originContactName: "Carlos",
  originContactPhone: "(972) 490-3300",
  destContactName: "Brynn",
  destContactPhone: "(502) 219-3219",
  pickupDate: "2026-09-24T00:00:00.000Z",
  deliveryDate: "2026-09-25T00:00:00.000Z",
  pickupTimeStart: "09:00",
  pickupTimeEnd: "10:00",
  deliveryTimeStart: "15:30",
  deliveryTimeEnd: "16:30",
  pickupAppointment: "PU-4471",
  deliveryAppointment: "15160360",
};

/** `nth` disambiguates labels that legitimately repeat across Origin/Destination. */
function valueFor(label: string, nth = 0): string {
  const els = screen.getAllByText(label);
  return els[nth]?.parentElement?.querySelector("div:nth-child(2)")?.textContent ?? "";
}

describe("waterfall DetailsTab — parity with the T&T panel", () => {
  it("shows each appointment on its own side, named", () => {
    render(<DetailsTab load={load} />);
    expect(valueFor("Pickup Appt #")).toBe("PU-4471");
    expect(valueFor("Delivery Appt #")).toBe("15160360");
  });

  it("falls back to the legacy column for a load created before the split", () => {
    render(
      <DetailsTab
        load={{ ...load, pickupAppointment: null, deliveryAppointment: null, appointmentNumber: "15160360" }}
      />,
    );
    expect(valueFor("Delivery Appt #")).toBe("15160360");
    expect(valueFor("Pickup Appt #")).toBe("—");
  });

  it("shows the dock contact's phone, not just their name", () => {
    render(<DetailsTab load={load} />);
    expect(valueFor("Phone", 0)).toBe("(972) 490-3300");
    expect(valueFor("Phone", 1)).toBe("(502) 219-3219");
  });

  it("shows pallets", () => {
    render(<DetailsTab load={load} />);
    expect(valueFor("Pallets")).toBe("7");
  });

  it("renders the stored calendar date and the window, labelled local", () => {
    render(<DetailsTab load={load} />);
    expect(valueFor("Pickup")).toBe("Sep 24, 2026");
    expect(valueFor("Delivery")).toBe("Sep 25, 2026");
    expect(valueFor("Window", 0)).toBe("09:00 – 10:00 local");
    expect(valueFor("Window", 1)).toBe("15:30 – 16:30 local");
  });
});
