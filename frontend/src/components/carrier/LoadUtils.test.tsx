// carrier-portal-upgrade G28/M5 — the clickable card a keyboard can use, and the
// carrier utilities: copy, rate per mile, maps, and a reachable SRL rep.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CarrierCard } from "./CarrierCard";
import { CopyButton, RateWithRpm, RepContact, MapsLink, ratePerMile } from "./LoadUtils";

beforeEach(() => vi.clearAllMocks());

describe("CarrierCard (G28)", () => {
  it("a clickable card is a focusable button that answers Enter and Space", () => {
    const onClick = vi.fn();
    render(<CarrierCard onClick={onClick} label="Load SRL-1. Show details">x</CarrierCard>);
    const card = screen.getByRole("button", { name: "Load SRL-1. Show details" });
    expect(card.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("says which card is selected", () => {
    render(<CarrierCard onClick={() => {}} selected label="chosen">x</CarrierCard>);
    expect(screen.getByRole("button", { name: "chosen" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("a plain card is not a button", () => {
    render(<CarrierCard>plain</CarrierCard>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("rate per mile", () => {
  it("is shown beside the rate when the distance is known", () => {
    render(<RateWithRpm amount={2400} miles={800} />);
    expect(screen.getByText("($3.00/mi)")).toBeTruthy();
  });

  it("is left out when either side is missing, rather than printing $NaN or Infinity", () => {
    expect(ratePerMile(2400, 0)).toBeNull();
    expect(ratePerMile(null, 800)).toBeNull();
    const { container } = render(<RateWithRpm amount={2400} miles={null} />);
    expect(container.textContent).not.toMatch(/\/mi|NaN|Infinity/);
  });
});

describe("the SRL rep", () => {
  it("is tap-to-call and tap-to-email when the server sent the contact", () => {
    render(<RepContact rep={{ firstName: "Ann", lastName: "Ruiz", phone: "2695550101", email: "ann@srl.invalid" }} />);
    expect(screen.getByRole("link", { name: "Call Ann Ruiz" }).getAttribute("href")).toBe("tel:2695550101");
    expect(screen.getByRole("link", { name: "Email Ann Ruiz" }).getAttribute("href")).toBe("mailto:ann@srl.invalid");
  });

  it("falls back to the SRL main line, so no load is without a number to call", () => {
    render(<RepContact rep={{}} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("tel:+12692206760");
  });
});

describe("copy and maps", () => {
  it("copies without also choosing the card it sits on", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onCard = vi.fn();
    render(<CarrierCard onClick={onCard} label="card"><CopyButton value="SRL-121498" label="load number" /></CarrierCard>);
    fireEvent.click(screen.getByRole("button", { name: "Copy load number" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("SRL-121498"));
    expect(onCard).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "load number copied" })).toBeTruthy();
  });

  it("opens a stop in maps", () => {
    render(<MapsLink address="Kalamazoo, MI 49001">Kalamazoo</MapsLink>);
    const a = screen.getByRole("link", { name: "Open Kalamazoo, MI 49001 in maps" });
    expect(a.getAttribute("href")).toContain(encodeURIComponent("Kalamazoo, MI 49001"));
    expect(a.getAttribute("rel")).toContain("noopener");
  });
});
