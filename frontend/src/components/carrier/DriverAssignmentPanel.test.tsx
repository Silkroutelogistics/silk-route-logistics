/**
 * The driver panel reaches the two routes that had no caller, and only with
 * what the carrier changed.
 *
 * Phase 0 of the mandatory-ELD arc.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ api: { patch: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/download", () => ({
  extractApiError: async (_err: unknown, fallback: string) => fallback,
}));

import { api } from "@/lib/api";
import { DriverAssignmentPanel } from "./DriverAssignmentPanel";

const patch = api.patch as unknown as ReturnType<typeof vi.fn>;
const post = api.post as unknown as ReturnType<typeof vi.fn>;

function renderPanel(load: Parameters<typeof DriverAssignmentPanel>[0]["load"]) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DriverAssignmentPanel load={load} />
    </QueryClientProvider>,
  );
}

const button = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("DriverAssignmentPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patch.mockResolvedValue({ data: {} });
  });

  it("shows what the AE entered and keeps Save disabled until something changes", () => {
    renderPanel({ id: "L1", driverName: "Sam Tran", driverPhone: "+12692206760", truckNumber: "T-118" });
    expect((screen.getByLabelText("Driver name") as HTMLInputElement).value).toBe("Sam Tran");
    expect((screen.getByLabelText("Truck #") as HTMLInputElement).value).toBe("T-118");
    expect(button(/^Save$/).disabled).toBe(true);
    expect(screen.getByText("Phone not verified")).toBeTruthy();
  });

  it("Save PATCHes only the fields the carrier changed", async () => {
    renderPanel({ id: "L1", driverName: "Sam Tran", driverPhone: "+12692206760", truckNumber: "T-118" });
    fireEvent.change(screen.getByLabelText("Trailer #"), { target: { value: " R-22 " } });
    expect(button(/^Save$/).disabled).toBe(false);
    fireEvent.click(button(/^Save$/));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith("/carrier-loads/L1/driver", { trailerNumber: "R-22" });
    await waitFor(() => expect(screen.getByText("Driver details saved.")).toBeTruthy());
  });

  it("verifies the handset: start, consent, code, confirm", async () => {
    post.mockImplementation(async (url: string) =>
      url.endsWith("/driver-verify/start")
        ? { data: { ok: true, phone: "+12692206760", consentText: "CONSENT SENTENCE" } }
        : { data: { ok: true, verifiedAt: "2026-09-07T12:00:00.000Z" } },
    );
    renderPanel({ id: "L1", driverName: "Sam Tran", driverPhone: "(269) 220-6760" });

    fireEvent.click(button(/Verify driver phone/));
    await waitFor(() => expect(screen.getByText("CONSENT SENTENCE")).toBeTruthy());
    expect(post).toHaveBeenCalledWith("/carrier-loads/L1/driver-verify/start", {
      driverName: "Sam Tran",
      driverPhone: "(269) 220-6760",
    });

    // The code alone is not enough: the consent tick is the consent.
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    expect(button(/Confirm code/).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(button(/Confirm code/).disabled).toBe(false);

    fireEvent.click(button(/Confirm code/));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/carrier-loads/L1/driver-verify/confirm", { code: "123456", consented: true }),
    );
    await waitFor(() => expect(screen.getByText(/Driver phone verified/)).toBeTruthy());
  });

  it("a proven number reads as verified until the carrier edits it", () => {
    renderPanel({
      id: "L1",
      driverName: "Sam Tran",
      driverPhone: "+12692206760",
      driverPhoneVerified: "+12692206760",
      driverPhoneVerifiedAt: "2026-09-07T12:00:00.000Z",
    });
    expect(screen.getByText("Phone verified")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Driver mobile"), { target: { value: "+12695550100" } });
    expect(screen.getByText("Phone not verified")).toBeTruthy();
  });

  it("cannot verify without a name and a plausible number", () => {
    renderPanel({ id: "L1" });
    expect(button(/Verify driver phone/).disabled).toBe(true);
  });
});
