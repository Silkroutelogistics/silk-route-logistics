/**
 * ReverseCancellationModal — C6b, and the two adversarial cases that belong to
 * the surface rather than to the policy.
 *
 * "NEITHER MAY APPEAR AFTER 72H" IS TESTED AS A REFUSAL, NOT AS A CLIENT-SIDE
 * CLOCK. The window deliberately is not duplicated here: the modal asks the
 * server what would happen, and a load outside the window comes back
 * canReverse:false with the reason. Re-implementing the rule in the browser is
 * how the two come to disagree, and the one that matters is the server's.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "fs";
import path from "path";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { api } from "@/lib/api";
import ReverseCancellationModal from "./ReverseCancellationModal";

const ALLOWED = {
  canReverse: true,
  restoreTo: "DISPATCHED",
  unhide: false,
  willRestore: {
    shipments: 1, trackingLink: true, shipperTrackingLinks: 1,
    tenders: 2, carrierPays: 1, shipperCredit: true,
  },
  rateConfirmationsToReissue: [{ id: "rc1", status: "SENT" }],
};

function mount(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReverseCancellationModal loadId="load-1" reference="SRL-121500" onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe("ReverseCancellationModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists what will be restored, and names the same tracking link", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: ALLOWED } as never);
    mount();
    await screen.findByText(/what will be restored/i);
    expect(screen.getByText(/DISPATCHED/)).toBeTruthy();
    expect(screen.getByText(/same link/i), "the dialog does not say the link is the same one").toBeTruthy();
    expect(screen.getByText(/2 tender\(s\), with no new offer sent/i)).toBeTruthy();
  });

  it("names what will NOT be restored — the AE finds out here, not from a carrier", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: ALLOWED } as never);
    mount();
    await screen.findByText(/what will not be restored/i);
    expect(screen.getByText(/cannot be\s+un-voided/i)).toBeTruthy();
  });

  it("requires a reason of at least 10 characters before it will act", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: ALLOWED } as never);
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } } as never);
    mount();
    await screen.findByLabelText(/why are you reversing/i);
    const btn = screen.getByRole("button", { name: /reverse cancellation/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(/why are you reversing/i), "too short");
    expect(btn.disabled, "acted on a nine-character reason").toBe(true);

    await userEvent.type(screen.getByLabelText(/why are you reversing/i), " but now long enough");
    await waitFor(() => expect(btn.disabled).toBe(false));

    await userEvent.click(btn);
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [url, body] = vi.mocked(api.put).mock.calls[0];
    expect(url).toBe("/loads/load-1/uncancel");
    expect((body as { reason: string }).reason).toContain("long enough");
  });

  it("adversarial — past the window it shows the refusal and offers no way to act", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        canReverse: false,
        code: "UNCANCEL_WINDOW_EXPIRED",
        message: "Cancellations can be reversed for 72 hours. This one was cancelled 99 hours ago, so the window has closed.",
      },
    } as never);
    mount();

    await screen.findByText(/the window has closed/i);
    // No reason box and no enabled action: the refusal is the whole content.
    expect(screen.queryByLabelText(/why are you reversing/i)).toBeNull();
    const btn = screen.getByRole("button", { name: /reverse cancellation/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(api.put).not.toHaveBeenCalled();
  });

  it("shows a cancel that predates the snapshot as unreversible, with the server's own wording", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { canReverse: false, code: "NO_SNAPSHOT", message: "It cannot be reversed automatically. Re-create the load." },
    } as never);
    mount();
    await screen.findByText(/cannot be reversed automatically/i);
    expect(screen.queryByLabelText(/why are you reversing/i)).toBeNull();
  });

  it("surfaces a server refusal on submit rather than a generic message", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: ALLOWED } as never);
    vi.mocked(api.put).mockRejectedValue({
      response: { data: { error: "This load has been tendered again since it was cancelled.", code: "LOAD_RETENDERED" } },
    } as never);
    mount();
    await screen.findByLabelText(/why are you reversing/i);
    await userEvent.type(screen.getByLabelText(/why are you reversing/i), "shipper re-confirmed the pickup");
    await userEvent.click(screen.getByRole("button", { name: /reverse cancellation/i }));
    await screen.findByText(/tendered again since it was cancelled/i);
  });
});

describe("the board gates — read from source", () => {
  const page = fs.readFileSync(
    path.resolve(__dirname, "../../app/dashboard/loads/page.tsx"),
    "utf8",
  );

  it("finds the page (vacuity tripwire)", () => {
    expect(page.length).toBeGreaterThan(5000);
    expect(page).toContain("ReverseCancellationModal");
  });

  it("adversarial — the tab is behind the role gate", () => {
    const line = page.split("\n").find((l) => l.includes('tabBtn("reversible"'));
    expect(line, "the Cancelled (72h) tab is not rendered at all").toBeTruthy();
    expect(line, "the tab is rendered without the ADMIN/CEO gate").toContain("canReverse &&");
  });

  it("adversarial — the button is behind the same gate", () => {
    const i = page.indexOf("setShowReverse(true)");
    expect(i, "the reverse button is not wired").toBeGreaterThan(-1);
    const guard = page.slice(Math.max(0, i - 400), i);
    expect(guard, "the button is rendered without the ADMIN/CEO gate").toContain("canReverse &&");
    expect(guard, "the button is offered on loads that are not cancelled").toContain('load.status === "CANCELLED"');
  });

  it("canReverse is ADMIN and CEO, and nothing else", () => {
    const line = page.split("\n").find((l) => l.includes("const canReverse"));
    expect(line).toBeTruthy();
    expect(line).toContain('["ADMIN", "CEO"]');
    for (const role of ["BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"]) {
      expect(line, "canReverse admits " + role).not.toContain(role);
    }
  });

  it("the window is NOT re-implemented in the client", () => {
    // Duplicating 72 in the browser is how the tab and the server come to
    // disagree about when a load stops being reversible.
    // Comments stripped FIRST. The guard beside the button explains that the
    // window is deliberately not checked here, and says 72 while doing so — so
    // the unstripped version of this check failed against correct source on its
    // first run. A scanner that reads prose as code is not a scanner.
    const code = page
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    const i = code.indexOf("setShowReverse(true)");
    expect(i, "the scanner lost the button — it is broken, not the page").toBeGreaterThan(-1);
    const around = code.slice(Math.max(0, i - 800), i + 200);
    expect(around).not.toMatch(/\b72\b/);
    expect(around).not.toMatch(/3_?600_?000/);
  });
});
