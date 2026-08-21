// Mandatory carrier 2FA — the boundary, not the redirect (Arc 11 B1-ENROLLMENT).
//
// The portal layout also sends an unenrolled carrier to the enrollment screen,
// but that runs in a browser the carrier controls. This is the part that holds
// when someone calls the API directly, which is the only version of "mandatory"
// that means anything.
//
// The brief's instruction was to walk the MIDDLEWARE across every portal route
// rather than assert one page, because a gate mounted on five routers out of six
// looks identical to a gate mounted on all six until someone finds the sixth.

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { user: { findUnique: vi.fn() } },
}));
vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));

import { requireTotpEnrolled } from "../../../src/middleware/requireTotpEnrolled";

function ctx(overrides: any = {}) {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  const next = vi.fn();
  const req: any = {
    user: { id: "u1", role: "CARRIER", email: "c@x.com" },
    path: "/loads",
    ...overrides,
  };
  return { req, res, next };
}

describe("the gate", () => {
  beforeEach(() => vi.resetAllMocks());

  it("blocks an unenrolled carrier", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ totpEnabled: false });
    const { req, res, next } = ctx();

    await requireTotpEnrolled(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe("TOTP_ENROLLMENT_REQUIRED");
    expect(next).not.toHaveBeenCalled();
  });

  it("lets an enrolled carrier through", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ totpEnabled: true });
    const { req, res, next } = ctx();

    await requireTotpEnrolled(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("tells the carrier where to go, rather than only that they cannot pass", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ totpEnabled: false });
    const { req, res, next } = ctx();

    await requireTotpEnrolled(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.action.href).toContain("/carrier/dashboard");
    expect(body.error).toMatch(/authenticator/i);
  });

  it("does not touch AE or shipper traffic", async () => {
    // This arc is carrier-only. An AE hitting a shared mount must be unaffected.
    for (const role of ["ADMIN", "CEO", "SHIPPER", "BROKER"]) {
      const { req, res, next } = ctx({ user: { id: "u2", role } });
      await requireTotpEnrolled(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    }
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("does not touch unauthenticated requests — that is authenticate's job", async () => {
    const { req, res, next } = ctx({ user: undefined });
    await requireTotpEnrolled(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("the exemptions, which are what stop it being a lockout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ totpEnabled: false });
  });

  // A gate that blocks the route needed to satisfy the gate locks every carrier
  // out permanently. Each of these is load-bearing for a different reason.
  const exempt = [
    ["/totp/setup", "otherwise nobody can ever begin enrolling"],
    ["/totp/confirm", "otherwise enrollment can begin but never complete"],
    ["/totp/status", "the portal reads it to know whether to show the wall"],
    ["/activation-status", "the portal reads it to know where to send them"],
    ["/me", "identity must always resolve"],
    ["/logout", "escape must always work"],
  ];

  for (const [route, why] of exempt) {
    it(`allows ${route} — ${why}`, async () => {
      const { req, res, next } = ctx({ path: route });
      await requireTotpEnrolled(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  }

  it("does not exempt something merely because it starts with a similar word", async () => {
    // "/totp-something-else" is not "/totp/..." — prefix matching must respect
    // the segment boundary, the same distinction that broke cookie routing in
    // Sprint 53.a.
    const { req, res, next } = ctx({ path: "/totpsecrets" });
    await requireTotpEnrolled(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("every carrier-portal router is actually behind the gate", () => {
  // Walking the mounts, not one page. A gate on five routers of six is
  // indistinguishable from a gate on all six until someone finds the sixth.
  const routesFile = fs.readFileSync(
    path.join(__dirname, "../../../src/routes/index.ts"),
    "utf8",
  );

  const CARRIER_MOUNTS = [
    "carrier-auth",
    "carrier-loads",
    "carrier-compliance",
    "carrier-payments",
    "carrier-drivers",
    "carrier-tenders",
  ];

  for (const mount of CARRIER_MOUNTS) {
    it(`/${mount} passes through requireTotpEnrolled`, () => {
      const line = routesFile
        .split("\n")
        .find((l) => l.includes(`router.use("/${mount}"`));
      expect(line, `no mount line found for /${mount}`).toBeTruthy();
      expect(line).toContain("requireTotpEnrolled");
    });
  }

  it("covers the same set the cookie resolver calls the carrier portal", () => {
    // If a future arc adds a seventh carrier mount to CARRIER_PORTAL_MOUNTS and
    // forgets the gate, this is what notices — the two lists must agree.
    const auth = fs.readFileSync(path.join(__dirname, "../../../src/middleware/auth.ts"), "utf8");
    const block = auth.slice(auth.indexOf("const CARRIER_PORTAL_MOUNTS"));
    const declared = [...block.slice(0, block.indexOf("]")).matchAll(/"\/api\/([a-z-]+)"/g)].map((m) => m[1]);

    expect(declared.sort()).toEqual([...CARRIER_MOUNTS].sort());
  });
});

describe("the portal wall defers to the enrollment gate", () => {
  // STATIC, and weaker than the behavioural tests above — deliberately said out
  // loud rather than left for a reader to discover. There is no frontend test
  // runner in this repo, and standing one up mid-arc to assert one precedence
  // rule is not a trade worth making. So this reads the layout the way the
  // mount-parity test reads the router: it cannot prove the redirect fires, only
  // that the ordering rule is still written down.
  //
  // It is worth having anyway, because the failure it catches is silent. Three
  // gates each call router.replace, and without an explicit rule the winner is
  // whichever effect React happens to run last. If enrollment stops outranking
  // status routing, a PENDING carrier without an authenticator gets bounced to
  // the application-status page instead of the enrollment wall — and since the
  // backend exempts /activation-status, they sit there able to load exactly one
  // page and never reach the screen that would let them out.
  const layout = fs.readFileSync(
    path.join(__dirname, "../../../../frontend/src/app/carrier/dashboard/layout.tsx"),
    "utf8",
  );

  it("computes the precedence once rather than per-gate", () => {
    expect(layout).toContain("const mustEnroll =");
  });

  it("yields to enrollment in both of the older gates", () => {
    // Two, not one: status routing AND the activation wall each have to stand
    // down, or the carrier lands somewhere that is not the enrollment screen.
    const yields = layout.split("if (mustEnroll) return;").length - 1;
    expect(yields).toBe(2);
  });

  it("sends an unenrolled carrier to the enrollment screen", () => {
    expect(layout).toContain("router.replace(SECURITY_PAGE)");
  });

  it("hides the operational chrome behind it, as the activation wall does", () => {
    // A sidebar whose every link 403s is worse than no sidebar.
    expect(layout).toMatch(/showOperationalChrome =.*!mustEnroll/);
  });

  it("points at the page that actually exists", () => {
    // The middleware hands back this href in its 403 body. If the constant and
    // the route ever disagree, the carrier is redirected to a 404 and the wall
    // becomes a dead end.
    const middleware = fs.readFileSync(
      path.join(__dirname, "../../../src/middleware/requireTotpEnrolled.ts"),
      "utf8",
    );
    expect(layout).toContain('const SECURITY_PAGE = "/carrier/dashboard/security"');
    expect(middleware).toContain("/carrier/dashboard/security");
    expect(
      fs.existsSync(
        path.join(__dirname, "../../../../frontend/src/app/carrier/dashboard/security/page.tsx"),
      ),
      "the enrollment page the gate redirects to does not exist",
    ).toBe(true);
  });
});
