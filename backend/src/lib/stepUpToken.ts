// Step-up verification (Arc 11 B2).
//
// Signing in proves who you are. It does not prove you are still there an hour
// later, and it does not prove the person changing the payment terms is the
// person who typed the password. Step-up closes that gap: a fresh authenticator
// code, presented at the moment of a sensitive change.
//
// WHY A TOKEN AND NOT A COLUMN. The obvious shape is a lastStepUpAt timestamp
// on User, which means a migration — and migrations are on the hold-branch rule
// after the v3.8.atd incident, where a staged one rode a push to production and
// dropped four columns. A short-lived purpose-scoped JWT needs no schema at all
// and reuses the idiom already in this codebase (tenderActionToken, the
// totp-verification token in carrierAuth). Same secret, same algorithm, same
// purpose-claim discipline.
//
// It is also the safer of the two. A column says "this user stepped up
// recently" and every request afterwards trusts it. A token has to be carried
// and handed over deliberately, so a background request cannot accidentally
// inherit the elevation.
//
// FRESHNESS. Ten minutes. Long enough to type a code, read a confirmation and
// change your mind about the form you were filling in; short enough that a
// walked-away-from laptop is not an open door. It is named rather than inlined
// so the number is arguable in one place.

import jwt from "jsonwebtoken";
import { env } from "../config/env";

/** How long a single step-up stays good for. See the note above. */
export const STEP_UP_WINDOW_MINUTES = 10;

const PURPOSE = "carrier-step-up";

/**
 * The sensitive writes that can demand a step-up.
 *
 * Closed, and shared with the Zod schema on the mint endpoint, so a typo in an
 * action string is a compile error rather than a token nobody can spend. Adding
 * one here and forgetting the gate is inert; adding a gate whose action is not
 * here will not compile.
 */
export const STEP_UP_ACTIONS = ["quickpay-election", "insurance-update"] as const;
export type StepUpAction = (typeof STEP_UP_ACTIONS)[number];

export interface StepUpClaims {
  userId: string;
  purpose: string;
  /** What the carrier was told they were authorising. */
  action: string;
}

/**
 * Mint a step-up token after a fresh authenticator code has been verified.
 *
 * `action` is embedded rather than left open so a token minted to change
 * payment terms cannot be replayed against a different sensitive endpoint. The
 * carrier consented to one thing; the token should only buy that thing.
 */
export function mintStepUpToken(userId: string, action: string): string {
  return jwt.sign({ userId, purpose: PURPOSE, action }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: `${STEP_UP_WINDOW_MINUTES}m`,
  } as jwt.SignOptions);
}

/**
 * Verify a step-up token against the user and the action it is being spent on.
 *
 * Returns null on every failure rather than throwing or distinguishing between
 * them. The caller cannot do anything different with "expired" versus "wrong
 * action" versus "forged", and a handler that tells the client which one it was
 * is a handler that helps someone probe it.
 */
export function verifyStepUpToken(
  token: string,
  userId: string,
  action: string,
): boolean {
  try {
    const claims = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as StepUpClaims;

    // All three must hold. Purpose stops a session token being spent here;
    // userId stops one carrier's step-up authorising another's change; action
    // stops a token minted for one thing being replayed against another.
    return (
      claims.purpose === PURPOSE &&
      claims.userId === userId &&
      claims.action === action
    );
  } catch {
    return false;
  }
}
