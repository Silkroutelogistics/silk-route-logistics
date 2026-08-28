/**
 * Mark a request as a BACKGROUND POLL — it authenticates, but it does not count
 * as activity.
 *
 * WHY THIS EXISTS. Since Arc 34 any authenticated request resets the 30-minute
 * idle clock. A layout that polls notifications every two minutes therefore
 * keeps an abandoned desk signed in forever, which is the precise opposite of
 * what an idle timeout is for. The backend already honours the header — the gate
 * is `!isBackgroundPoll` on the only remaining touch in middleware/auth — and
 * nothing on the client was sending it.
 *
 * OPT-IN, NOT OPT-OUT, and the asymmetry is deliberate: a poller that forgets to
 * declare itself merely keeps a session alive, whereas defaulting the other way
 * would sign people out mid-task. Wrongly resetting is the smaller harm.
 *
 * WHICH REQUESTS SHOULD USE IT. Ones that fire WITHOUT a human present. An
 * always-mounted layout poll qualifies; a refetch triggered by a click does not.
 * The distinction is "would this still fire if the person walked away", not "is
 * it on a timer".
 *
 * SCOPE TODAY, stated plainly rather than implied. Only the always-mounted
 * LAYOUT polls are marked — carrier and shipper notification bells, which run on
 * every page of their portals and are therefore the ones that can hold a session
 * open indefinitely. Roughly forty other `refetchInterval` sites exist on
 * individual pages; they are banked rather than marked, because each needs a
 * per-site judgement about whether it runs unattended, and forty unreviewed
 * edits to live query code is a worse trade than a bounded fix. The guard below
 * covers the layouts so the always-mounted class cannot regress.
 */

/** The header the backend reads. Must match BACKGROUND_POLL_HEADER server-side. */
export const BACKGROUND_POLL_HEADER = "x-srl-background-poll";

/** Axios config marking a request as a background poll. */
export const backgroundPoll = { headers: { [BACKGROUND_POLL_HEADER]: "1" } } as const;
