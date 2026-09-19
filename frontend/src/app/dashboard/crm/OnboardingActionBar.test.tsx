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
