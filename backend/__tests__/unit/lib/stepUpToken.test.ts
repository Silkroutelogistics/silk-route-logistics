// Step-up verification (Arc 11 B2).
//
// Signing in proves who you are. It does not prove you are still there an hour
// later, and it does not prove that the person moving the payment terms is the
// person who typed the password. These tests are about the second thing.
//
// Unlike the layout and login guards in this arc, these are BEHAVIOURAL — the
// token module is plain TypeScript with no browser in it, so it can be exercised
// directly rather than read as text.

import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/config/env", () => ({
  env: { JWT_SECRET: "test-secret-for-step-up-tokens-only" },
}));

import {
  mintStepUpToken,
  verifyStepUpToken,
  STEP_UP_WINDOW_MINUTES,
  STEP_UP_ACTIONS,
} from "../../../src/lib/stepUpToken";

describe("a step-up buys one thing, for one person, for a short time", () => {
  it("accepts the token it just minted", () => {
    const t = mintStepUpToken("u1", "quickpay-election");
    expect(verifyStepUpToken(t, "u1", "quickpay-election")).toBe(true);
  });

  it("will not let one carrier's step-up authorise another's change", () => {
    // The token is a bearer credential. If it did not pin the user, a leaked or
    // logged one would be spendable against any account.
    const t = mintStepUpToken("u1", "quickpay-election");
    expect(verifyStepUpToken(t, "u2", "quickpay-election")).toBe(false);
  });

  it("will not let a token minted for one change be spent on another", () => {
    // This is the reason action is in the token at all. The carrier consented to
    // updating insurance; that consent is not consent to move payment terms, even
    // though both are theirs and both are within the window.
    const t = mintStepUpToken("u1", "insurance-update");
    expect(verifyStepUpToken(t, "u1", "quickpay-election")).toBe(false);
  });

  it("rejects a forgery", () => {
    expect(verifyStepUpToken("not-a-token", "u1", "quickpay-election")).toBe(false);
    expect(verifyStepUpToken("", "u1", "quickpay-election")).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const forged = jwt.sign(
      { userId: "u1", purpose: "carrier-step-up", action: "quickpay-election" },
      "some-other-secret",
      { algorithm: "HS256", expiresIn: "10m" },
    );
    expect(verifyStepUpToken(forged, "u1", "quickpay-election")).toBe(false);
  });

  it("rejects a session token dressed up as a step-up", async () => {
    // Session tokens are signed with the SAME secret, so the signature check
    // alone passes. The purpose claim is the only thing standing between a
    // stolen session cookie and an elevated write.
    const jwt = (await import("jsonwebtoken")).default;
    const session = jwt.sign({ userId: "u1" }, "test-secret-for-step-up-tokens-only", {
      algorithm: "HS256",
      expiresIn: "7d",
    });
    expect(verifyStepUpToken(session, "u1", "quickpay-election")).toBe(false);
  });

  it("rejects a token whose window has closed", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const stale = jwt.sign(
      { userId: "u1", purpose: "carrier-step-up", action: "quickpay-election" },
      "test-secret-for-step-up-tokens-only",
      { algorithm: "HS256", expiresIn: "-1s" },
    );
    expect(verifyStepUpToken(stale, "u1", "quickpay-election")).toBe(false);
  });

  it("expires inside a window a walked-away-from laptop would outlive", () => {
    // Not a round number for its own sake: the value is arguable, but it has to
    // be short enough that an unattended screen is not an open door, and long
    // enough to read a confirmation and change your mind about a form.
    expect(STEP_UP_WINDOW_MINUTES).toBeGreaterThan(0);
    expect(STEP_UP_WINDOW_MINUTES).toBeLessThanOrEqual(15);
  });

  it("covers every action a gate can ask for", () => {
    // STEP_UP_ACTIONS is shared with the mint endpoint's Zod enum, so a gate
    // naming an action that is not here will not compile. This asserts the set is
    // real rather than empty, which would make that compile-time check vacuous.
    expect(STEP_UP_ACTIONS.length).toBeGreaterThan(0);
    for (const a of STEP_UP_ACTIONS) {
      expect(verifyStepUpToken(mintStepUpToken("u1", a), "u1", a)).toBe(true);
    }
  });
});
