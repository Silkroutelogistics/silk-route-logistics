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

/**
 * The operational consent is its own control, and the label says what it sends.
 *
 * Until 2026-09-23 there was no control at all: operational mail was granted by
 * `isPrimary OR receivesTrackingLink`, so the tracking tag was the only thing
 * that looked like a switch and it governed a different artifact. An AE who
 * turned it off changed nothing, and ten operational emails reached a customer
 * for a load whose tracking link had never been sent.
 */
const opsContact = {
  id: "ct-2",
  name: "Pat Ops",
  email: "pat@example.com",
  phone: null,
  title: null,
  isPrimary: false,
  isBilling: false,
  receivesTrackingLink: false,
  receivesOperationalUpdates: false,
  salesRole: null,
  introducedVia: null,
  doNotContact: false,
};

describe("ContactsPanel operational consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
  });

  it("turning it on PATCHes receivesOperationalUpdates and nothing else", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { contacts: [opsContact] } });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /send load updates/i }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/customers/c-1/contacts/ct-2", {
        receivesOperationalUpdates: true,
      }),
    );
  });

  it("turning it off sends false rather than omitting the field", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { contacts: [{ ...opsContact, receivesOperationalUpdates: true }] },
    });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /load updates on/i }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/customers/c-1/contacts/ct-2", {
        receivesOperationalUpdates: false,
      }),
    );
  });

  it("it is a SEPARATE control from the tracking tag — one does not move the other", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { contacts: [opsContact] } });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /tag for tracking/i }));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    const body = vi.mocked(api.patch).mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["receivesTrackingLink"]);
  });

  it("the label states what it sends, not merely that it is on", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { contacts: [opsContact] } });
    mount();
    const btn = await screen.findByRole("button", { name: /send load updates/i });
    expect(btn.getAttribute("title")).toMatch(/pickup, transit, delivery and delay emails/i);
    expect(screen.getByText(/neither tag implies the other/i)).toBeTruthy();
    expect(screen.getByText(/being Primary sends nothing/i)).toBeTruthy();
  });
});
