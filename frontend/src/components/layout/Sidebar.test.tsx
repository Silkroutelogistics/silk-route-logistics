// Which employees can see which pages.
//
// The sidebar gates by swapping whole arrays, not by a per-item role check:
// `getNav` sends ADMIN and CEO to the grouped `aeViewGroups` and everyone else
// to the flat `employeeNav`. Nothing at an entry's definition site says which
// audience it is for, so adding a page to the grouped array alone makes it
// CEO-visible silently — by accident rather than by decision.
//
// That is exactly what happened to Tender Analytics and the Driver Academy.
// Carrier Bench avoided it only because its own commit noticed the trap and
// added the entry to both arrays.
//
// A structural rule cannot fix this, because "should a BROKER see Tagging
// Rules?" is a judgment, not a pattern. What can be held is the specific
// decision already taken: these pages are for the whole desk. So this renders
// the real component as each non-admin employee role and asserts they are
// there — the §19 Sub-pattern 16 shape, exercising the boundary rather than
// asserting that a string appears in a file.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

const mockUser = { role: "BROKER" as string | undefined };

vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/overview" }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined }) }));
vi.mock("@/hooks/useAuthStore", () => ({
  useAuthStore: (sel?: any) => {
    const state = { user: mockUser.role ? { role: mockUser.role, email: "e@srl.test" } : null };
    return typeof sel === "function" ? sel(state) : state;
  },
}));
vi.mock("@/hooks/useViewMode", () => ({ useViewMode: () => ({ viewMode: "ae", setViewMode: vi.fn() }) }));
vi.mock("@/components/ui/Logo", () => ({ Logo: () => <div /> }));
vi.mock("@/components/ui/VersionFooter", () => ({ VersionFooter: () => <div /> }));
vi.mock("@/components/ui/ThemePanel", () => ({ ThemeGearButton: () => <div /> }));
vi.mock("@/components/ui/CommandPalette", () => ({ CommandPaletteTrigger: () => <div /> }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn().mockResolvedValue({ data: {} }) } }));

/** Every employee role that is NOT routed to the grouped admin nav. */
const NON_ADMIN_EMPLOYEES = ["BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING", "ACCOUNT_EXECUTIVE"];

/** Pages the desk runs on. Each was, or nearly was, gated to CEO by accident. */
const DESK_PAGES = ["Carrier Bench", "Tender Analytics", "Driver Academy"];

function renderAs(role: string) {
  mockUser.role = role;
  const { unmount } = render(<Sidebar />);
  return unmount;
}

describe("the desk pages are visible to the desk", () => {
  beforeEach(() => {
    mockUser.role = "BROKER";
  });

  for (const role of NON_ADMIN_EMPLOYEES) {
    it(`${role} sees all three`, () => {
      const unmount = renderAs(role);
      try {
        for (const label of DESK_PAGES) {
          expect(
            screen.queryByText(label),
            `${role} cannot see "${label}" — it is in aeViewGroups only, which renders for ADMIN and CEO`,
          ).not.toBeNull();
        }
      } finally {
        unmount();
      }
    });
  }

  it("a CARRIER sees none of them", () => {
    // The inverse. Without this, moving every entry into one ungated array
    // would satisfy the assertions above and quietly hand the AE console to
    // carriers — a test that only checks presence can be passed by removing
    // the gate entirely.
    const unmount = renderAs("CARRIER");
    try {
      for (const label of DESK_PAGES) {
        expect(screen.queryByText(label), `a CARRIER must not see "${label}"`).toBeNull();
      }
    } finally {
      unmount();
    }
  });

  it("renders a real sidebar, not an empty shell", () => {
    // Vacuity tripwire. If the mocks broke and the component rendered nothing,
    // queryByText would return null everywhere and the CARRIER case above would
    // pass for the wrong reason.
    const unmount = renderAs("BROKER");
    try {
      expect(screen.queryByText("Load Board"), "the nav should actually render").not.toBeNull();
    } finally {
      unmount();
    }
  });
});
