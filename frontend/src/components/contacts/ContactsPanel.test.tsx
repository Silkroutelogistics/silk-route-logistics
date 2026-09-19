/**
 * ContactsPanel — lifecycle-gaps B5b-2, finding #22. Remove asks first, and
 * says what removing an operational contact costs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { api } from "@/lib/api";
import { ContactsPanel } from "./ContactsPanel";

const contact = { id: "ct-1", name: "Jo Contact", email: "jo@example.com", phone: null, title: null, isPrimary: true, receivesTrackingLink: true, doNotContact: false };

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ContactsPanel customerId="c-1" />
    </QueryClientProvider>,
  );
}

describe("ContactsPanel Remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: { contacts: [contact] } });
  });

  it("asks first and names the cost; a declined confirm sends nothing", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /^remove$/i }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain("Remove Jo Contact?");
    expect(confirmSpy.mock.calls[0][0]).toContain("operational emails");
    expect(api.delete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("a confirmed remove deletes the contact", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/customers/c-1/contacts/ct-1"));
    vi.restoreAllMocks();
  });
});
