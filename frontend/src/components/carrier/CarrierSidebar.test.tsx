// carrier-portal-upgrade M1/M4 — the carrier sidebar shows a locked page as locked,
// and its menu button is usable on a phone.
//
// A locked nav item must not be a link (no navigation, so no request reaches its
// endpoint from the UI), must say "Available soon", and must explain itself on
// TAP because a phone has no hover. One route is locked by mocking the flag file:
// none is locked in production today, and the rendering still has to be proven.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/carrier/dashboard" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/lib/carrierPortalFeatures", () => ({
  lockedFeatureForPath: (p: string) =>
    p === "/carrier/dashboard/messaging" ? { enabled: false, reason: "Messages open with the next release.", route: p } : null,
}));

import { CarrierSidebar } from "./CarrierSidebar";

describe("a locked nav item", () => {
  it("is not a link, says Available soon, and explains itself on tap", () => {
    render(<CarrierSidebar />);
    expect(document.querySelector('a[href="/carrier/dashboard/messaging"]')).toBeNull();
    const item = screen.getByRole("button", { name: /Messages: Available soon/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByText("Messages open with the next release.")).toBeNull();
    fireEvent.click(item);
    expect(screen.getByText("Messages open with the next release.")).toBeTruthy();
  });

  it("leaves unlocked items as links, and marks the current page", () => {
    render(<CarrierSidebar />);
    expect(document.querySelector('a[href="/carrier/dashboard/my-loads"]')).not.toBeNull();
    expect(document.querySelector('a[href="/carrier/dashboard"]')?.getAttribute("aria-current")).toBe("page");
  });
});

describe("the mobile menu button", () => {
  it("is named and reports whether the menu is open", () => {
    render(<CarrierSidebar />);
    const btn = screen.getByRole("button", { name: "Open menu" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(screen.getByRole("button", { name: "Close menu" }).getAttribute("aria-expanded")).toBe("true");
  });
});
