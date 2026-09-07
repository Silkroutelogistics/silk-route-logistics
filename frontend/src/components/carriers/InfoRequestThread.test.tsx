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

const { queryResult, refetch } = vi.hoisted(() => ({
  refetch: vi.fn(),
  queryResult: { value: { data: undefined as unknown, isLoading: false, isError: false, refetch: (() => {}) as () => void } },
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
  overrides: {
    isAdmin?: boolean;
    canRequestInfo?: boolean;
    onRequestInfo?: (() => void) | undefined;
    // The two states the component used to return from ABOVE the guard. A
    // pending or failed GET carried the CTA away with it, so they need to be
    // reachable from here or the fix is untested.
    isLoading?: boolean;
    isError?: boolean;
  } = {},
) {
  const settled = !overrides.isLoading && !overrides.isError;
  queryResult.value = {
    data: settled ? { requests } : undefined,
    isLoading: overrides.isLoading ?? false,
    isError: overrides.isError ?? false,
    refetch,
  };
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
  queryResult.value = { data: undefined, isLoading: false, isError: false, refetch };
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

  it("explains the block on a populated list rather than showing an empty corner", () => {
    // ABSENCE ALONE WAS THE ORIGINAL DEFECT. A test that only asserts the
    // button is missing passes just as happily when it is missing for the
    // wrong reason, which is the state this arc opened with. Assert the
    // sentence, and the populated branch has to say the same thing the empty
    // one does.
    setup([requestFixture("OPEN")], { canRequestInfo: false });
    expect(cta()).toHaveLength(0);
    expect(screen.getByText(/available while an application is under review/i)).toBeInTheDocument();
  });

  it("withholds it for that same status on an empty list, and says which state is blocking", () => {
    setup([], { canRequestInfo: false });
    expect(cta()).toHaveLength(0);
    expect(screen.getByText(/available while an application is under review/i)).toBeInTheDocument();
  });

  it("stays reachable while the thread is still loading", () => {
    // Raising a request does not depend on reading the history.
    setup([], { isLoading: true });
    expect(screen.getByText(/loading info-request thread/i)).toBeInTheDocument();
    expect(cta()).toHaveLength(1);
  });

  it("stays reachable when the thread fails to load, and offers a way back", async () => {
    setup([], { isError: true });
    expect(cta()).toHaveLength(1);
    const retry = screen.getByRole("button", { name: /retry/i });
    await userEvent.setup().click(retry);
    expect(refetch).toHaveBeenCalled();
  });

  it("explains the block in the failed state too, instead of a bare dead end", () => {
    setup([], { isError: true, canRequestInfo: false });
    expect(cta()).toHaveLength(0);
    expect(screen.getByText(/available while an application is under review/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("withholds it when no opener was passed, on a populated list", () => {
    // The prop is optional. A button wired to nothing is worse than no button.
    setup([requestFixture("OPEN")], { onRequestInfo: undefined });
    expect(cta()).toHaveLength(0);
  });
});

describe("the status gate fails closed", () => {
  // The caller mirrors the carrier's status into canRequestInfo, and the server
  // refuses APPROVED / REJECTED / SUSPENDED with a 409. A mount that FORGETS the
  // prop must get no button — not a button the server will refuse — so the
  // default answers "may I?" with "you did not say", and that is a no. `setup()`
  // above always passes the prop, deliberately: these cases mount the component
  // without it, because the default is the thing under test.
  function mountWithoutTheProp(requests: ReturnType<typeof requestFixture>[]) {
    queryResult.value = { data: { requests }, isLoading: false, isError: false, refetch };
    render(<InfoRequestThread carrierId="carrier-1" isAdmin onRequestInfo={vi.fn()} />);
  }

  it("withholds the CTA from an admin when the caller never said the status allows it", () => {
    mountWithoutTheProp([requestFixture("OPEN")]);
    expect(cta()).toHaveLength(0);
    // And still explains the absence. The note states the RULE, not this
    // carrier's state, so it is true whether the prop is false or missing.
    expect(screen.getByText(/available while an application is under review/i)).toBeInTheDocument();
  });

  it("withholds it on an empty list too", () => {
    mountWithoutTheProp([]);
    expect(cta()).toHaveLength(0);
    expect(screen.getByText(/available while an application is under review/i)).toBeInTheDocument();
  });

  it("every mount in the app passes the prop explicitly", () => {
    // Fail-closed protects the mount that forgets. This protects the reader:
    // a mount relying on the default would render the gated note against a
    // carrier who is under review, silently, forever. Every mount has to say
    // what it knows.
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const root = path.join(__dirname, "..", "..");
    const files: string[] = [];
    (function walk(dir: string) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f);
        else if (f.endsWith(".tsx") && !f.endsWith(".test.tsx")) files.push(f);
      }
    })(root);
    const mounts: string[] = [];
    const bare: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      let i = src.indexOf("<InfoRequestThread");
      while (i >= 0) {
        const end = src.indexOf("/>", i);
        const element = src.slice(i, end < 0 ? src.length : end);
        const rel = path.relative(root, f);
        mounts.push(rel);
        if (!/canRequestInfo=/.test(element)) bare.push(rel);
        i = src.indexOf("<InfoRequestThread", i + 1);
      }
    }
    expect(mounts.length, "no mount found — the walk is not reaching the app").toBeGreaterThan(0);
    expect(bare, `mounts relying on the fail-closed default:\n${bare.join("\n")}`).toEqual([]);
  });
});
