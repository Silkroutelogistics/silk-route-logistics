// The Request Info CTA, and the branch it used to fall out of.
//
// THE BUG THIS HOLDS. The CTA lived only inside the `requests.length === 0`
// early return, so it vanished the moment any row existed. Not just an open one
// — a request answered and closed weeks ago hid it too, which is why the third
// case below is a resolved request and the fourth is a cancelled one. Neither
// state is covered by the way the symptom was reported, and both were broken.
//
// WHY IT IS TESTED BY ROLE AND NOT BY CLASS NAME. `getByRole("button", { name })`
// is the same question a person asks — is there a control here that says Request
// Info — so it keeps passing through a restyle and stops passing if the control
// is unreachable. A className assertion would survive the button being rendered
// with no accessible name, which is the failure worth catching.
//
// The guard-parity cases at the end are the load-bearing half. The defect was
// two renders of one control asking different questions; a test that only
// proved the button appears would not notice a branch quietly re-acquiring a
// gate the other one lacks.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { queryResult } = vi.hoisted(() => ({
  queryResult: { value: { data: undefined as unknown, isLoading: false, isError: false } },
}));

// Only useQuery decides what this component renders. useMutation belongs to the
// per-card Cancel button and useQueryClient to its invalidation — both are
// stubbed rather than exercised, so a failure here is about the CTA and not
// about the cancel path.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => queryResult.value,
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), patch: vi.fn() } }));
vi.mock("@/lib/download", () => ({ apiHref: (p: string) => p }));

import { InfoRequestThread } from "./InfoRequestThread";

type Status = "OPEN" | "RESOLVED" | "CANCELLED";

function requestFixture(status: Status) {
  return {
    id: `req-${status.toLowerCase()}`,
    category: "COI_UPDATE",
    categoryLabel: "Updated Certificate of Insurance (COI)",
    message: "Please provide an updated Certificate of Insurance.",
    status,
    resolvedNote: status === "RESOLVED" ? "Attached, thanks." : null,
    resolvedAt: status === "RESOLVED" ? "2026-09-01T10:00:00.000Z" : null,
    cancelledAt: status === "CANCELLED" ? "2026-09-01T10:00:00.000Z" : null,
    createdAt: "2026-08-30T10:00:00.000Z",
    createdBy: { id: "u1", firstName: "Ada", lastName: "Byron", email: "ada@srl.invalid" },
    cancelledBy: status === "CANCELLED" ? { id: "u1", firstName: "Ada", lastName: "Byron" } : null,
    attachments: [],
  };
}

function setup(
  requests: ReturnType<typeof requestFixture>[],
  overrides: { isAdmin?: boolean; canRequestInfo?: boolean; onRequestInfo?: (() => void) | undefined } = {},
) {
  queryResult.value = { data: { requests }, isLoading: false, isError: false };
  const onRequestInfo = "onRequestInfo" in overrides ? overrides.onRequestInfo : vi.fn();
  render(
    <InfoRequestThread
      carrierId="carrier-1"
      isAdmin={overrides.isAdmin ?? true}
      onRequestInfo={onRequestInfo}
      canRequestInfo={overrides.canRequestInfo ?? true}
    />,
  );
  return { onRequestInfo };
}

const cta = () => screen.queryAllByRole("button", { name: /request info/i });

beforeEach(() => {
  queryResult.value = { data: undefined, isLoading: false, isError: false };
});

describe("the Request Info CTA is reachable in every list state", () => {
  it("renders with no requests at all", () => {
    setup([]);
    expect(cta()).toHaveLength(1);
  });

  it("renders with one open request", () => {
    // The reported symptom.
    setup([requestFixture("OPEN")]);
    expect(cta()).toHaveLength(1);
  });

  it("renders with one resolved request", () => {
    // Broader than the symptom: a closed request hid the button too, so a
    // carrier whose only ask was answered had no way to be asked again.
    setup([requestFixture("RESOLVED")]);
    expect(cta()).toHaveLength(1);
  });

  it("renders with one cancelled request", () => {
    setup([requestFixture("CANCELLED")]);
    expect(cta()).toHaveLength(1);
  });

  it("renders once, not twice, when several requests are open", () => {
    // Several concurrent open requests is the state the owner asked for and the
    // one the server has always permitted — no unique constraint, no count
    // check. One control, not one per row.
    setup([requestFixture("OPEN"), requestFixture("RESOLVED"), requestFixture("CANCELLED")]);
    expect(cta()).toHaveLength(1);
  });

  it("opens the modal from the populated list, which is where it used to be absent", async () => {
    const { onRequestInfo } = setup([requestFixture("OPEN")]);
    await userEvent.setup().click(screen.getByRole("button", { name: /request info/i }));
    expect(onRequestInfo).toHaveBeenCalledTimes(1);
  });

  it("keeps the ordering hint that explains why a closed request can sit on top", () => {
    // Making room for the button by deleting "Newest first" would trade one
    // confusion for another: without it, a resolved request above an open one
    // reads as a sorting bug.
    setup([requestFixture("OPEN")]);
    expect(screen.getByText("Newest first")).toBeInTheDocument();
  });
});

describe("both branches ask the identical question", () => {
  it("shows nothing to a non-admin on a populated list", () => {
    setup([requestFixture("OPEN")], { isAdmin: false });
    expect(cta()).toHaveLength(0);
  });

  it("shows nothing to a non-admin on an empty list either", () => {
    setup([], { isAdmin: false });
    expect(cta()).toHaveLength(0);
    expect(screen.getByText(/an admin can request additional documents/i)).toBeInTheDocument();
  });

  it("withholds it for a status the frontend excludes, on a populated list", () => {
    setup([requestFixture("OPEN")], { canRequestInfo: false });
    expect(cta()).toHaveLength(0);
  });

  it("withholds it for that same status on an empty list, and says which state is blocking", () => {
    setup([], { canRequestInfo: false });
    expect(cta()).toHaveLength(0);
    expect(screen.getByText(/available while an application is under review/i)).toBeInTheDocument();
  });

  it("withholds it when no opener was passed, on a populated list", () => {
    // The prop is optional. A button wired to nothing is worse than no button.
    setup([requestFixture("OPEN")], { onRequestInfo: undefined });
    expect(cta()).toHaveLength(0);
  });
});
