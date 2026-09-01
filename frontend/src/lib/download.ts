import { api } from "./api";

// v3.8.anc — SRL Driver Academy T5: fetch+blob file download via the api client
// (sends the httpOnly auth cookie + surfaces 401/404 errors), matching the
// codebase's established PDF-download convention rather than a bare <a href>.
export async function downloadFromApi(path: string, filename: string): Promise<void> {
  const res = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Absolute URL on the API host for a link the BROWSER NAVIGATES to.
 *
 * v3.8.awt — for endpoints that 302 to presigned object storage
 * (GET /documents/:id/download), navigation is the only mechanism that works.
 * An XHR cannot follow that redirect: the site CSP `connect-src` lists
 * api.silkroutelogistics.ai and no storage host, so the second hop is blocked.
 * A top-level navigation is not subject to connect-src and carries the auth
 * cookie — sameSite is "strict", but SameSite is scoped to the registrable
 * domain, so silkroutelogistics.ai -> api.silkroutelogistics.ai is same-site.
 *
 * Takes an api-relative path (no `/api` prefix) and concatenates. It does NOT
 * try to strip anything: `.replace("/api", "")` on this base is unanchored and
 * eats the `/api` inside `https://api…`, producing `https:/.silkroutelogistics…`
 * — a live bug elsewhere in this codebase and the reason this helper exists at
 * all rather than each caller rebuilding the base.
 */
export function apiHref(apiRelativePath: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  return `${base}${apiRelativePath.startsWith("/") ? "" : "/"}${apiRelativePath}`;
}

/**
 * Open an API-served PDF in a new tab, through the api client so the httpOnly
 * cookie is sent and the response never depends on which host the page was
 * served from.
 *
 * v3.8.awt — a bare `<a href>` cannot be used here. The portal is a static
 * export on silkroutelogistics.ai and the API is api.silkroutelogistics.ai, so a
 * root-relative path resolves against the Pages host and 404s; and even with an
 * absolute URL the browser would render this endpoint's JSON errors as raw JSON
 * in a tab. The rate-confirmation endpoint answers 403 DRIVER_NOT_VERIFIED with
 * a message the carrier is meant to act on.
 *
 * The 60s revoke rather than an immediate one: revoking synchronously races the
 * new tab's own load of the blob, and the tab wins only sometimes. Mirrors the
 * carrier activation page, which is the precedent for this exact action.
 */
export async function openPdfFromApi(path: string): Promise<void> {
  const res = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Pull a readable message off a failed api call.
 *
 * The blob branch is the load-bearing part and is easy to miss: with
 * `responseType: "blob"` axios hands back the ERROR body as a Blob too, so
 * `err.response.data.error` is `undefined` on every non-2xx and the caller
 * silently shows its fallback. That is how an actionable message —
 * "Confirm the driver mobile number before downloading the rate confirmation" —
 * turns into "Couldn't open the document." Read the blob, then parse it.
 */
export async function extractApiError(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return parsed?.message || parsed?.error || fallback;
    } catch {
      return fallback;
    }
  }
  const obj = data as { message?: string; error?: string } | undefined;
  return obj?.message || obj?.error || fallback;
}
