/**
 * OnboardingActionBar — lifecycle-gaps B5a, finding #17.
 *
 * Inactivate is offered on EVERY active customer, not only an APPROVED one, and
 * the "Reject" stub that sent an AE to the Neon SQL editor is gone. The first
 * two cases render the real component; the third reads the source so the stub
 * cannot be re-added under another name.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "fs";
import path from "path";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { OnboardingActionBar } from "./OnboardingActionBar";

function mount(customer: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OnboardingActionBar customer={customer as any} onChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("OnboardingActionBar offers Inactivate on every active state", () => {
  it("a PENDING customer gets Approve + Inactivate, and no Reject", async () => {
    mount({ id: "c1", name: "Acme Foods", onboardingStatus: "PENDING", isActive: true, userId: null });
    expect(screen.getByRole("button", { name: /approve/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /inactivate/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /reject/i })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /inactivate/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Inactivate Acme Foods");
  });

  it("an APPROVED customer still gets Inactivate (unchanged)", () => {
    mount({ id: "c2", name: "Bison Co", onboardingStatus: "APPROVED", isActive: true, userId: "u1" });
    expect(screen.getByRole("button", { name: /inactivate/i })).toBeTruthy();
  });

  it("an inactive customer gets Reactivate and nothing else (unchanged)", () => {
    mount({ id: "c3", name: "Gone LLC", onboardingStatus: "APPROVED", isActive: false, inactivationReason: "closed" });
    expect(screen.getByRole("button", { name: /reactivate/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^inactivate$/i })).toBeNull();
  });
});

describe("the Neon-SQL stub cannot come back (source guard)", () => {
  const src = fs.readFileSync(path.join(__dirname, "OnboardingActionBar.tsx"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("no control sends an AE to flip a column by hand", () => {
    expect(code).not.toMatch(/Neon/);
    expect(code).not.toMatch(/SQL editor/);
    expect(code).not.toMatch(/TodoModal/);
    expect(code).not.toMatch(/not yet wired/);
  });

  it("vacuity tripwire: the file still renders the Inactivate modal", () => {
    expect(code).toMatch(/<InactivateModal/);
    expect((code.match(/<InactivateModal/g) ?? []).length, "one mount per active branch").toBeGreaterThanOrEqual(2);
  });
});

// v3.8.bhb — the portal invite goes to a contact picked from the LIVE contact
// list. The incident: a contact deleted from the list still received the invite
// because the button posted nothing and the server read Customer.email.
describe("Send portal invite — recipient comes from the contact list only", () => {
  it("offers only contacts with an email that are not Do Not Contact, and posts the chosen contactId", async () => {
    const { api } = await import("@/lib/api");
    (api.get as any).mockResolvedValue({
      data: {
        contacts: [
          { id: "ct-ops", name: "Jane Ops", email: "jane@bee.test", doNotContact: false },
          { id: "ct-dnc", name: "No Mail", email: "nomail@bee.test", doNotContact: true },
          { id: "ct-noemail", name: "Phone Only", email: null, doNotContact: false },
        ],
      },
    });
    (api.post as any).mockResolvedValue({ data: { ok: true, sentTo: "jane@bee.test" } });

    mount({ id: "c9", name: "Beekeepers", onboardingStatus: "APPROVED", isActive: true, userId: null, email: "accountspayable@bee.test" });
    await userEvent.click(screen.getByRole("button", { name: /send portal invite/i }));

    const select = (await screen.findByRole("combobox", { name: /invite recipient/i })) as HTMLSelectElement;
    const offered = Array.from(select.options).map((o) => o.value).filter(Boolean);
    expect(offered).toEqual(["ct-ops"]);
    // The customer record's own email is never offered as a recipient.
    expect(select.textContent).not.toContain("accountspayable@bee.test");

    const send = screen.getByRole("button", { name: /^send invite$/i }) as HTMLButtonElement;
    expect(send.disabled, "nothing is sent until a contact is chosen").toBe(true);

    await userEvent.selectOptions(select, "ct-ops");
    await userEvent.click(send);
    expect(api.post).toHaveBeenCalledWith("/customers/c9/send-portal-invite", { contactId: "ct-ops" });
  });

  it("with no eligible contact, says so and offers no send button", async () => {
    const { api } = await import("@/lib/api");
    (api.get as any).mockResolvedValue({ data: { contacts: [] } });
    (api.post as any).mockClear();

    mount({ id: "c10", name: "Beekeepers", onboardingStatus: "APPROVED", isActive: true, userId: null, email: "accountspayable@bee.test" });
    await userEvent.click(screen.getByRole("button", { name: /send portal invite/i }));
    expect(await screen.findByText(/no invite was sent/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^send invite$/i })).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });
});
