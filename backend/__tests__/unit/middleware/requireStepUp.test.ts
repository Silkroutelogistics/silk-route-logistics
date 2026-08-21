// The step-up boundary (Arc 11 B2).
//
// stepUpToken.test covers what a token means. This covers what the gate does
// with one — and, at the end, WHERE the gate is actually mounted, because a
// correct middleware that nobody applied protects nothing.

import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

vi.mock("../../../src/config/env", () => ({
  env: { JWT_SECRET: "test-secret-for-step-up-tokens-only" },
}));

import { requireStepUp } from "../../../src/middleware/requireStepUp";
import { mintStepUpToken } from "../../../src/lib/stepUpToken";

function ctx(overrides: any = {}) {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  const next = vi.fn();
  const req: any = {
    user: { id: "u1", role: "CARRIER", email: "c@x.com" },
    headers: {},
    body: {},
    ...overrides,
  };
  return { req, res, next };
}

describe("the gate refuses a sensitive write without a fresh code", () => {
  it("blocks when nothing is presented", () => {
    const { req, res, next } = ctx();
    requireStepUp("quickpay-election")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe("STEP_UP_REQUIRED");
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a valid token in the header", () => {
    const token = mintStepUpToken("u1", "quickpay-election");
    const { req, res, next } = ctx({ headers: { "x-step-up-token": token } });

    requireStepUp("quickpay-election")(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("accepts the body as a fallback, for a caller that cannot set headers", () => {
    const token = mintStepUpToken("u1", "quickpay-election");
    const { req, res, next } = ctx({ body: { stepUpToken: token } });

    requireStepUp("quickpay-election")(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("blocks a token minted for a different change", () => {
    // The carrier confirmed an insurance update. That is not consent to move
    // payment terms, and the gate is where that distinction is enforced.
    const token = mintStepUpToken("u1", "insurance-update");
    const { req, res, next } = ctx({ headers: { "x-step-up-token": token } });

    requireStepUp("quickpay-election")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks another carrier's token", () => {
    const token = mintStepUpToken("someone-else", "quickpay-election");
    const { req, res, next } = ctx({ headers: { "x-step-up-token": token } });

    requireStepUp("quickpay-election")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("tells the client what is needed rather than only that it was refused", () => {
    // A bare 403 is indistinguishable from "you are not allowed to do this at
    // all", so the portal cannot know to put up a prompt and the carrier gets a
    // spinner that stops.
    const { req, res, next } = ctx();
    requireStepUp("quickpay-election")(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.action).toBe("quickpay-election");
    expect(body.windowMinutes).toBeGreaterThan(0);
    expect(body.error).toMatch(/authenticator/i);
  });

  it("401s an unauthenticated request rather than guessing", () => {
    // authenticate runs first and owns this case. Reaching here means the
    // middleware order is wrong, and papering over it would hide that.
    const { req, res, next } = ctx({ user: undefined });
    requireStepUp("quickpay-election")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("the gate is mounted where it was supposed to be", () => {
  // STATIC, and the reason is worth stating: everything above proves the
  // middleware is correct, and none of it proves anyone applied it. A gate that
  // is right and unmounted looks exactly like a gate that is working.
  const carrierAuth = fs.readFileSync(
    path.join(__dirname, "../../../src/routes/carrierAuth.ts"),
    "utf8",
  );
  const compliance = fs.readFileSync(
    path.join(__dirname, "../../../src/routes/carrierCompliance.ts"),
    "utf8",
  );

  it("guards the Quick Pay election — the one that moves money", () => {
    const line = carrierAuth
      .split("\n")
      .find((l) => l.includes('router.post("/quickpay-election"'));
    expect(line, "quickpay-election route not found").toBeTruthy();
    expect(line).toContain('requireStepUp("quickpay-election")');
  });

  it("guards the insurance update — the one that moves the compliance gate", () => {
    const line = compliance
      .split("\n")
      .find((l) => l.includes('router.patch("/insurance"'));
    expect(line, "insurance route not found").toBeTruthy();
    expect(line).toContain('requireStepUp("insurance-update")');
  });

  it("does not guard the endpoint that hands out step-ups", () => {
    // Requiring a step-up to obtain a step-up is a deadlock, and it would be an
    // easy one to add by pattern-matching the other routes.
    const line = carrierAuth.split("\n").find((l) => l.includes('"/step-up"'));
    expect(line).toBeTruthy();
    expect(line).not.toContain("requireStepUp(");
  });
});
