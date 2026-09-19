/**
 * FacilitiesTab — lifecycle-gaps B5b-2, finding #21. Remove asks first; a
 * refusal from the server (the facility is on a load) is shown, not swallowed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/ui/AddressAutocomplete", () => ({ AddressAutocomplete: () => null }));

import { api } from "@/lib/api";
import { FacilitiesTab } from "./FacilitiesTab";

const facility = { id: "f-1", name: "QCC Distribution Center", address: "1 Dock Rd", city: "Lebanon", state: "NH", zip: "03766", facilityType: "pickup", isPrimary: false };

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FacilitiesTab customerId="c-1" onChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("FacilitiesTab Remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: { facilities: [facility] } });
  });

  it("asks first, and a declined confirm sends nothing", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /remove/i }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('Remove facility "QCC Distribution Center"?');
    expect(api.delete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("a confirmed remove that the server refuses shows the refusal with the load numbers", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.delete).mockRejectedValue({
      response: { status: 409, data: { error: "FACILITY_REFERENCED", message: '"QCC Distribution Center" is on 2 loads and cannot be removed: SRL-121490, SRL-121492. A facility that has been used is edited, not removed.' } },
    });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /remove/i }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/customers/c-1/facilities/f-1"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("SRL-121490, SRL-121492");
    expect(alert.textContent).toContain("edited, not removed");
    vi.restoreAllMocks();
  });
});
