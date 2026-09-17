/**
 * B3b (2026-09-17) — the All Activity tab renders what the API sends.
 *
 * The page's AuditLog interface said `details: string | null` for the prose
 * note while the API field has always been `changes`, so `log.details || "—"`
 * rendered "—" on every row of All Activity (the Login Activity tab used the
 * right key, which is why the note showed there). Since B3a the API ALSO
 * sends a real `details` object — the structured half — so the two are now
 * distinct columns and both must render.
 *
 * Adversarially verified at authoring: reverting the cell to `log.details ||
 * "—"` turns the note case red; dropping the summary line turns the details
 * case red.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "./page";
import { summarizeDetails } from "@/lib/auditDetails";

// The page graph (icons, query hooks, the chart imports) takes ~20s to compile
// cold under jsdom; the default 5s reads as a render failure.
vi.setConfig({ testTimeout: 30_000 });

const LOGS = [
  {
    id: "r1", userId: "u1", action: "LOGIN", entity: "Session", entityId: null, ipAddress: "203.0.113.9", createdAt: "2026-09-17T12:57:59Z",
    changes: "Carrier login via OTP",
    details: { authMethod: "PASSWORD", otpChannel: "EMAIL", mfaUsed: false, device: "Chrome on Windows" },
    user: { firstName: "CJ", lastName: "Master", email: "cj@example.invalid" },
  },
  {
    id: "r2", userId: "u2", action: "UPDATE", entity: "Carrier", entityId: "c1", ipAddress: null, createdAt: "2026-09-17T12:00:00Z",
    changes: "Marked as test",
    details: null,
    user: { firstName: "Ops", lastName: "Desk", email: "ops@example.invalid" },
  },
];

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey[0] === "audit-logs") return { data: { logs: LOGS, total: 2, page: 1, totalPages: 1 }, isLoading: false };
    if (queryKey[0] === "audit-stats") return { data: { byAction: [{ action: "LOGIN", count: 1 }], byEntity: [{ entity: "Session", count: 1 }], timeline: [] } };
    return { data: undefined, isLoading: false };
  },
}));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

describe("summarizeDetails", () => {
  it("is null for a row that predates the column", () => {
    expect(summarizeDetails(null)).toBeNull();
    expect(summarizeDetails(undefined)).toBeNull();
  });
  it("reads as one line an AE can scan", () => {
    expect(summarizeDetails({ device: "Chrome on Windows", otpChannel: "EMAIL", mfaUsed: false })).toBe("Chrome on Windows · code by email · no 2FA");
    expect(summarizeDetails({ device: "Safari on iOS", otpChannel: "EMAIL+SMS", mfaUsed: true })).toBe("Safari on iOS · code by email + SMS · 2FA");
  });
});

describe("the All Activity tab", () => {
  it("renders the prose note from `changes` — not the key the API never had", () => {
    render(<Page />);
    expect(screen.getByText("Carrier login via OTP")).toBeTruthy();
    expect(screen.getByText("Marked as test")).toBeTruthy();
  });

  it("renders the structured summary beneath the note, only where the row carries one", () => {
    render(<Page />);
    const summaries = screen.getAllByTestId("audit-details");
    expect(summaries).toHaveLength(1);
    expect(summaries[0].textContent).toBe("Chrome on Windows · code by email · no 2FA");
  });
});
