/**
 * SuspendCarrierModal — lifecycle-gaps B5b. The AE side of the suspend
 * endpoint: a reason of at least 5 characters is required before the button
 * enables, the post carries it, and a refusal from the server is shown rather
 * than swallowed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { api } from "@/lib/api";
import { SuspendCarrierModal } from "./SuspendCarrierModal";

function mount(onDone = vi.fn(), onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SuspendCarrierModal carrierId="cp-1" carrierName="Peace Transport" onClose={onClose} onDone={onDone} />
    </QueryClientProvider>,
  );
  return { onDone, onClose };
}

describe("SuspendCarrierModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a 5-character reason, then posts it to the compliance suspend route", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    const { onDone } = mount();
    const box = screen.getByLabelText(/reason/i);
    const btn = screen.getByRole("button", { name: /suspend carrier/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await userEvent.type(box, "dupe");
    expect(btn.disabled).toBe(true);
    await userEvent.type(box, " registration");
    expect(btn.disabled).toBe(false);
    await userEvent.click(btn);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/compliance/carrier/cp-1/suspend", { reason: "dupe registration" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("a server refusal is rendered, and the modal stays open", async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { status: 400, data: { error: "A reason of at least 5 characters is required to suspend a carrier." } } });
    const { onDone, onClose } = mount();
    await userEvent.type(screen.getByLabelText(/reason/i), "Repeated no-shows");
    await userEvent.click(screen.getByRole("button", { name: /suspend carrier/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("at least 5 characters");
    expect(onDone).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says what suspension does and does not do", () => {
    mount();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("blocks every new tender");
    expect(dialog.textContent).toContain("Loads already in flight stay with them and are paid normally");
  });
});
