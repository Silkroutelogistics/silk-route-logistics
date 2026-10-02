// carrier-portal-upgrade G30/M4/M5 — the driver roster on a phone and for a keyboard.
//
// The five row actions were ~26px icon-only buttons named only by `title`,
// which a screen reader does not reliably announce. The roster table became
// cards under 768px by CSS (each cell labelled through data-label).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get, patch, del } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, patch, post: vi.fn(), delete: del } }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

import DriversPage from "./page";

const DRIVER = {
  id: "d1", firstName: "Luis", lastName: "Ortega", email: "luis@carrier.invalid", phone: "2695550199",
  licenseType: "CDL-A", licenseNumber: "X1", licenseState: "MI", licenseExpiry: "2027-05-01T00:00:00.000Z",
  medicalCardExpiry: "2027-01-01T00:00:00.000Z", status: "AVAILABLE", trainingInviteSentAt: "2026-09-01T00:00:00Z", trainingPinSetAt: "2026-09-02T00:00:00Z",
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DriversPage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { drivers: [DRIVER], active: 1, inactive: 0 } });
  patch.mockResolvedValue({ data: {} });
});

describe("Drivers", () => {
  it("names every icon-only row action and makes it a 44px target (G30)", async () => {
    mount();
    for (const name of ["Reset PIN & re-invite", "Edit driver", "Deactivate driver", "Delete driver"]) {
      const b = await screen.findByRole("button", { name });
      expect(b.className, name).toMatch(/\bh-11\b/);
      expect(b.className, name).toMatch(/\bw-11\b/);
    }
  });

  it("labels each roster cell, so the row reads as a card under 768px (M4)", async () => {
    const { container } = mount();
    await screen.findByText("Luis Ortega");
    const labels = Array.from(container.querySelectorAll("td[data-label]")).map((td) => td.getAttribute("data-label"));
    expect(labels).toEqual(["Driver", "Phone", "License", "License expiry", "Medical card", "Training", "Status", "Actions"]);
    expect(container.querySelector("table")!.className).toMatch(/\bblock md:table\b/);
  });

  it("deactivates only after the carrier confirms (M5)", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate driver" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
