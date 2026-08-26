/**
 * Client mirror of the SERVER session policy. The server is authoritative.
 *
 * These numbers exist here only so the warning modal can count down to the same
 * instant the server will refuse at. They are a MIRROR, never a second opinion:
 * if they disagree with backend/src/lib/sessionPolicy.ts the user watches a
 * timer that does not match what happens to them, which is worse than having no
 * timer at all.
 *
 * That is not hypothetical. Before 2026-08-26 three different client numbers
 * were live at once:
 *   - useSessionTimeout defaulted to 60 minutes
 *   - the carrier and shipper layouts passed 60 minutes explicitly
 *   - public/js/session-timeout.js encoded `isAE ? 30 : 60`
 * while the server had already been cutting every portal at 30. A carrier could
 * watch their own countdown sit at 25 minutes remaining while the server had
 * already signed them out.
 *
 * WHY NOT FETCH THEM. An endpoint would be authoritative but adds a request on
 * every portal mount to learn two integers that change roughly never, and it
 * fails open (what does the modal do if the fetch fails?). A mirror plus a CI
 * guard is cheaper and fails closed — see sessionPolicyMirror.test.ts, which
 * reads the backend file and fails if these drift.
 *
 * DRIVER IS NOT GOVERNED and must not import these. Its session is 7 days with
 * no idle rule, ratified with a re-ratification trigger — see the governance
 * comment on SESSION_IDLE_MINUTES in the backend module, and §13.3 Item 244.6.
 */

/** Mirrors backend SESSION_IDLE_MINUTES. */
export const SESSION_IDLE_MINUTES = 30;

/** Mirrors backend SESSION_ABSOLUTE_HOURS. */
export const SESSION_ABSOLUTE_HOURS = 12;

/** Mirrors backend SESSION_WARNING_LEAD_MS — how long before the cut to warn. */
export const SESSION_WARNING_LEAD_MS = 2 * 60 * 1000;

export const SESSION_IDLE_MS = SESSION_IDLE_MINUTES * 60 * 1000;
export const SESSION_ABSOLUTE_MS = SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000;

/**
 * The `?reason=` values the API interceptor puts on the login URL, mapped from
 * the server codes. A sign-in screen that does not recognise a reason shows its
 * ordinary copy rather than guessing — an unexplained sign-out is bad, but a
 * WRONGLY explained one is worse.
 */
export const SIGNED_OUT_COPY: Record<string, { title: string; body: string }> = {
  timeout: {
    title: "Signed out after inactivity",
    body: `You were signed out after ${SESSION_IDLE_MINUTES} minutes without activity. Sign in to pick up where you left off.`,
  },
  expired: {
    title: "Session reached its time limit",
    body: `For security, sessions end after ${SESSION_ABSOLUTE_HOURS} hours regardless of activity. Signing in again starts a fresh one.`,
  },
  policy: {
    title: "Sessions changed — one-time sign-in",
    body: "We updated how sessions work, so existing ones ended. This is a one-time change; nothing about your account is affected.",
  },
  replaced: {
    title: "Signed in on another device",
    body: "This session ended because your account signed in somewhere else. If that was not you, change your password.",
  },
};
