// The boundary for step-up verification (Arc 11 B2).
//
// Pairs with lib/stepUpToken. This is the part that refuses the write; the
// portal's job is only to ask for the code before it gets here.
//
// FAILS CLOSED, AND SAYS WHAT TO DO. A 403 with no instruction is a dead end —
// the client cannot tell "you need to step up" from "you are not allowed", and
// the carrier sees a spinner that stops. The response carries a code the client
// branches on and the action the token must be minted for, so the portal can
// put up the right prompt without guessing.

import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { verifyStepUpToken, STEP_UP_WINDOW_MINUTES } from "../lib/stepUpToken";

/**
 * Require a fresh authenticator code for this write.
 *
 * `action` must match the value the token was minted for. Pick a stable string
 * and use the same one on both sides; a mismatch reads as a missing step-up,
 * which is the safe direction to fail.
 */
export function requireStepUp(action: string) {
  return function stepUpGate(req: AuthRequest, res: Response, next: NextFunction) {
    if (!req.user) {
      // authenticate runs first and owns this case. Reaching here means the
      // middleware order is wrong, and guessing would mask it.
      res.status(401).json({ error: "Not signed in" });
      return;
    }

    // Header first — it keeps the credential out of the request body, so it
    // does not end up in a log line that prints the payload, and it survives
    // validateBody stripping undeclared keys (the Sub-pattern 5 hazard: the
    // schema would have to declare it on every protected route, and the one
    // route that forgot would silently read undefined and reject every write).
    const token =
      (req.headers["x-step-up-token"] as string | undefined) ||
      (typeof req.body?.stepUpToken === "string" ? req.body.stepUpToken : undefined);

    if (!token || !verifyStepUpToken(token, req.user.id, action)) {
      res.status(403).json({
        error:
          "Enter the code from your authenticator app to confirm this change.",
        code: "STEP_UP_REQUIRED",
        action,
        windowMinutes: STEP_UP_WINDOW_MINUTES,
      });
      return;
    }

    next();
  };
}
