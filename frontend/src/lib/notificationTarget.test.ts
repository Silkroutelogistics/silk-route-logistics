import { describe, it, expect } from "vitest";
import { resolveNotificationHref } from "./notificationTarget";

const CARRIER = "/carrier";
const SHIPPER = "/shipper";

describe("resolveNotificationHref — the happy path", () => {
  it("accepts an in-portal path", () => {
    expect(resolveNotificationHref("/carrier/dashboard/my-loads", CARRIER)).toBe(
      "/carrier/dashboard/my-loads",
    );
    expect(resolveNotificationHref("/shipper/dashboard/invoices", SHIPPER)).toBe(
      "/shipper/dashboard/invoices",
    );
  });

  it("keeps query strings and fragments, which carry the load id", () => {
    expect(resolveNotificationHref("/carrier/dashboard/my-loads?id=L123", CARRIER)).toBe(
      "/carrier/dashboard/my-loads?id=L123",
    );
    expect(resolveNotificationHref("/shipper/dashboard/tracking#stop-2", SHIPPER)).toBe(
      "/shipper/dashboard/tracking#stop-2",
    );
  });

  it("accepts the portal root itself", () => {
    expect(resolveNotificationHref("/carrier", CARRIER)).toBe("/carrier");
  });

  it("trims incidental whitespace rather than refusing over it", () => {
    expect(resolveNotificationHref("  /carrier/dashboard/tenders  ", CARRIER)).toBe(
      "/carrier/dashboard/tenders",
    );
  });
});

describe("portal confinement", () => {
  it("refuses an AE console path sent to a carrier", () => {
    // Arc 33 found fourteen action URLs aimed at the wrong portal, including a
    // carrier payment notification pointing at /dashboard/payments. Following
    // it would bounce the carrier off a page their role cannot open, which is
    // a worse outcome than not linking at all.
    expect(resolveNotificationHref("/dashboard/payments", CARRIER)).toBeNull();
    expect(resolveNotificationHref("/accounting/disputes", CARRIER)).toBeNull();
    expect(resolveNotificationHref("/admin/users", CARRIER)).toBeNull();
  });

  it("refuses the other customer-facing portal", () => {
    expect(resolveNotificationHref("/shipper/dashboard/invoices", CARRIER)).toBeNull();
    expect(resolveNotificationHref("/carrier/dashboard/my-loads", SHIPPER)).toBeNull();
  });

  it("does not treat a prefix as a path boundary", () => {
    // "/carrier" must not match "/carriers-something". A bare startsWith would.
    expect(resolveNotificationHref("/carriers", CARRIER)).toBeNull();
    expect(resolveNotificationHref("/carrier-portal/x", CARRIER)).toBeNull();
  });

  it("cannot be smuggled past via the query string", () => {
    // The confinement test runs on the PATH, so a foreign path with a
    // reassuring query string is still refused.
    expect(resolveNotificationHref("/dashboard/loads?next=/carrier", CARRIER)).toBeNull();
  });
});

describe("nothing to open renders inert, and says so with null", () => {
  it("refuses the empty and the placeholder", () => {
    for (const v of ["", "   ", "#", "null", "undefined"]) {
      expect(resolveNotificationHref(v, CARRIER), JSON.stringify(v)).toBeNull();
    }
  });

  it("refuses a missing value in every shape it arrives in", () => {
    expect(resolveNotificationHref(undefined, CARRIER)).toBeNull();
    expect(resolveNotificationHref(null, CARRIER)).toBeNull();
    // Defensive: JSON can hand back a non-string for a field typed as one.
    expect(resolveNotificationHref(42 as unknown as string, CARRIER)).toBeNull();
    expect(resolveNotificationHref({} as unknown as string, CARRIER)).toBeNull();
  });
});

describe("no navigation off-origin", () => {
  it("refuses an absolute URL", () => {
    expect(resolveNotificationHref("https://evil.example/carrier", CARRIER)).toBeNull();
    expect(resolveNotificationHref("http://evil.example", CARRIER)).toBeNull();
  });

  it("refuses a protocol-relative URL, which startsWith('/') lets through", () => {
    // THE ONE A NAIVE GUARD MISSES. "//evil.example/carrier" begins with a
    // slash and is a different origin.
    expect(resolveNotificationHref("//evil.example/carrier", CARRIER)).toBeNull();
    expect(resolveNotificationHref("//evil.example", CARRIER)).toBeNull();
  });

  it("refuses a backslash, which some browsers normalise to a slash", () => {
    expect(resolveNotificationHref("/\\evil.example", CARRIER)).toBeNull();
    expect(resolveNotificationHref("/carrier\\..\\dashboard", CARRIER)).toBeNull();
  });

  it("refuses a javascript: or data: payload", () => {
    expect(resolveNotificationHref("javascript:alert(1)", CARRIER)).toBeNull();
    expect(resolveNotificationHref("data:text/html,<script>", CARRIER)).toBeNull();
  });

  it("refuses a relative path, which resolves against wherever you happen to be", () => {
    expect(resolveNotificationHref("dashboard/my-loads", CARRIER)).toBeNull();
    expect(resolveNotificationHref("../admin", CARRIER)).toBeNull();
  });
});

describe("the guard is not vacuous", () => {
  it("returns a non-null result for at least one input", () => {
    // Every assertion above bar the happy path expects null. If the function
    // were `() => null` all of them would pass, so pin that it can say yes.
    expect(resolveNotificationHref("/carrier/dashboard/documents", CARRIER)).not.toBeNull();
  });
});
