// carrier-portal-upgrade M1 — Settings no longer offers saves that cannot happen.
//
// "Save" (contact phone) PUT /carrier-auth/profile and "Save Preferences" PUT
// /carrier-auth/notifications. Neither route exists, and no column stores the
// notification choices, so both failed on every click. Owner ruling M1: locked,
// not removed. The lock explains itself and no request reaches either endpoint.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { put, get } = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: { put, get, post: vi.fn(), patch: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { enrolled: true, required: true } }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/carrier/CarrierWelcomeTour", () => ({ CarrierWelcomeTour: () => null }));
vi.mock("@/hooks/useCarrierAuth", () => ({
  useCarrierAuth: () => ({
    user: { firstName: "Ana", lastName: "Ruiz", email: "ana@carrier.invalid", phone: "2695550100", carrierProfile: { companyName: "Ruiz Freight", mcNumber: "MC-1", dotNumber: "2", tier: "SILVER", equipmentTypes: [], operatingRegions: [] } },
    changePassword: vi.fn(),
  }),
}));

import CarrierSettingsPage from "./page";

beforeEach(() => vi.clearAllMocks());

describe("Settings", () => {
  it("shows the phone as a tap-to-call link with a locked edit, and no phone input", () => {
    render(<CarrierSettingsPage />);
    expect(document.querySelector('input[type="tel"]')).toBeNull();
    expect(document.querySelector('a[href="tel:2695550100"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Edit phone: Available soon/ }));
    expect(screen.getByRole("tooltip").textContent).toMatch(/SRL team/);
  });

  it("lists the notices instead of offering toggles that cannot be saved", () => {
    render(<CarrierSettingsPage />);
    expect(screen.queryByText(/Save Preferences/)).toBeNull();
    expect(screen.getByRole("button", { name: /Choose notices: Available soon/ })).toBeTruthy();
    expect(screen.getByText("Load status updates")).toBeTruthy();
  });

  it("sends nothing to either missing route, even when the locks are tapped", () => {
    render(<CarrierSettingsPage />);
    for (const b of screen.getAllByRole("button", { name: /Available soon/ })) fireEvent.click(b);
    expect(put).not.toHaveBeenCalled();
  });

  it("uses no contraction in its error copy", async () => {
    render(<CarrierSettingsPage />);
    fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "abcdefgh" } });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), { target: { value: "abcdefgX" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Passwords do not match");
  });
});
