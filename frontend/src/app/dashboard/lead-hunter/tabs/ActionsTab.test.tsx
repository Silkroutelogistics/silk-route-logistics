/**
 * Lead Hunter ActionsTab — lifecycle-gaps B5a.
 *
 * The prospect tab is the ONE surface that can delete a customer (finding #18).
 * Since decision 4 the server refuses a delete with a 409 that names the
 * references and the next action. Before this change the tab swallowed every
 * mutation error — the spinner stopped and nothing was said — so the refusal
 * would have been invisible on the only surface that can trigger it. The
 * remedy the 409 points at (Inactivate) has to be reachable from here too.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = vi.hoisted(() => ({ role: "ADMIN" }));
vi.mock("@/hooks/useAuthStore", () => ({ useAuthStore: () => ({ user: { id: "u1", email: "ae@srl.test", role: auth.role } }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { api } from "@/lib/api";
import { ActionsTab } from "./ActionsTab";

const prospect = { id: "p1", name: "Acme Foods", contactName: "Jo", status: "CONTACTED", onboardingStatus: "PENDING" } as any;

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActionsTab prospect={prospect} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

const refusal = {
  response: {
    status: 409,
    data: {
      error: "CUSTOMER_HAS_REFERENCES",
      message: "Acme Foods cannot be deleted: 2 loads (1 open, 1 history), 1 contact. A customer with history is inactivated, not deleted.",
      remedy: { openLoads: ["SRL-121401"], cancelOpenLoadsFirst: "Cancel this load individually, with a reason code, before inactivating.", inactivate: "POST /customers/p1/inactivate", stopSequencesFirst: false },
    },
  },
};

async function confirmDelete() {
  await userEvent.click(screen.getByRole("button", { name: /^delete…$/i }));
  await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
}

describe("ActionsTab renders the delete refusal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = "ADMIN";
  });

  it("a 409 is shown with its message and the open load to cancel first, and offers Inactivate instead", async () => {
    vi.mocked(api.delete).mockRejectedValue(refusal);
    mount();
    await confirmDelete();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Acme Foods cannot be deleted");
    expect(alert.textContent).toContain("inactivated, not deleted");
    expect(alert.textContent).toContain("Cancel first, each with a reason code: SRL-121401");
    expect(screen.getByRole("button", { name: /inactivate instead/i })).toBeTruthy();
  });

  it("the honest copy: the confirm text no longer promises a cascade", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: /^delete…$/i }));
    const copy = screen.getByText(/Deletes this prospect outright/i).textContent ?? "";
    expect(copy).not.toMatch(/soft-deletes/);
    expect(copy).not.toMatch(/cancels any active loads/);
    expect(copy).toMatch(/inactivated instead/);
  });

  it("a BROKER sees the refusal and is told who can inactivate; no Inactivate control is offered", async () => {
    auth.role = "BROKER";
    vi.mocked(api.delete).mockRejectedValue(refusal);
    mount();
    await confirmDelete();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Inactivation needs an Admin, CEO or Operations role");
    expect(screen.queryByRole("button", { name: /inactivate/i })).toBeNull();
  });
});

describe("ActionsTab can inactivate (ADMIN / CEO / OPERATIONS)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = "OPERATIONS";
  });

  it("posts the reason to the inactivate route, and refuses to submit under 5 characters", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    mount();
    await userEvent.click(screen.getByRole("button", { name: /^inactivate…$/i }));
    const box = screen.getByLabelText(/inactivation reason/i);
    await userEvent.type(box, "dup");
    const confirm = screen.getByRole("button", { name: /confirm inactivate/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(box, "licate import row");
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(confirm);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/customers/p1/inactivate", { reason: "duplicate import row" }));
  });
});
