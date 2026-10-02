// carrier-portal-upgrade F2 (M5) — the 2FA enrollment screen.
//
// White on #BA7517 is about 3.7:1 and fails AA at this size, so the primary
// actions use the portal's dark-gold primary button. The setup-key copy button
// was about 34px; it is a named 44px target.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, post } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import SecurityPage from "./page";

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><SecurityPage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { enrolled: false, emailVerified: true, required: true } });
  post.mockResolvedValue({ data: { qrCode: "data:image/png;base64,AAAA", manualKey: "JBSWY3DPEHPK3PXP", appHint: "Any authenticator app" } });
});

describe("Security", () => {
  it("uses the AA primary button to begin setup", async () => {
    mount();
    const begin = await screen.findByRole("button", { name: "Begin setup" });
    expect(begin.className).toMatch(/bg-\[#854F0B\]/);
    expect(begin.className).not.toMatch(/bg-\[#BA7517\]/);
  });

  it("makes the setup-key copy button a named 44px target", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Begin setup" }));
    const copy = await screen.findByRole("button", { name: "Copy setup key" });
    expect(copy.className).toMatch(/\bh-11\b/);
    expect(copy.className).toMatch(/\bw-11\b/);
  });
});
