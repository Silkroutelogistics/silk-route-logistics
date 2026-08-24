/**
 * Where a notification should take you, or nowhere at all.
 *
 * The carrier and shipper bells rendered every notification in a div carrying
 * `cursor-pointer` and a hover highlight, and no click handler. The row looked
 * clickable, invited a click, and did nothing — which is worse than an
 * obviously inert row, because the user concludes the app is broken rather than
 * that there is nothing to open.
 *
 * Meanwhile actionUrl was on the type and populated by the backend the whole
 * time. It was simply never read.
 *
 * TWO THINGS THIS GUARDS, both learned the hard way elsewhere in the codebase.
 *
 * PORTAL CONFINEMENT. Arc 33 found fourteen action URLs pointing at pages that
 * did not exist, several of them aimed at the wrong portal entirely — a carrier
 * notification linking to /dashboard/payments, which is the AE console and
 * which a carrier cannot open. Sending someone to a page their role bounces
 * them off is a worse outcome than not linking. So a target is only accepted if
 * it belongs to the portal doing the rendering.
 *
 * NO EXTERNAL NAVIGATION. actionUrl is data. router.push() will happily leave
 * the origin, and a notification row is an unusually trusted-looking thing to
 * click. Anything that is not a same-origin absolute path is refused outright,
 * including protocol-relative "//evil.example" which is a URL the naive
 * startsWith("/") test lets straight through.
 */

/** Returned when there is nothing safe or sensible to open. */
export type NotificationTarget = string | null;

/**
 * Resolve a notification's action URL for a given portal.
 *
 * @param raw          actionUrl as the backend sent it. Anything at all.
 * @param portalPrefix the portal's own path root, e.g. "/carrier".
 * @returns an in-portal path to navigate to, or null to render the row inert.
 */
export function resolveNotificationHref(
  raw: string | null | undefined,
  portalPrefix: string,
): NotificationTarget {
  if (typeof raw !== "string") return null;

  const url = raw.trim();
  // The literal strings a JSON round-trip produces from a missing value. Each
  // one has been seen in this codebase's notification rows.
  if (!url || url === "#" || url === "null" || url === "undefined") return null;

  // Must be an absolute same-origin path. Rejecting "//host" explicitly: it
  // starts with "/" but is protocol-relative, so the browser treats it as a
  // different origin.
  if (!url.startsWith("/") || url.startsWith("//")) return null;

  // A backslash is normalised to a forward slash by some browsers, so "/\evil"
  // can escape the origin despite passing the tests above.
  if (url.includes("\\")) return null;

  // Confine to the portal doing the rendering. "/carrier" must match
  // "/carrier/dashboard/..." but NOT "/carrierse..." — hence the boundary test
  // rather than a bare startsWith.
  const path = url.split(/[?#]/)[0];
  if (path !== portalPrefix && !path.startsWith(portalPrefix + "/")) return null;

  return url;
}
