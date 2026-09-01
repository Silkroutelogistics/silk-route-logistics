import { useEffect, useState } from "react";
import { api } from "./api";

/**
 * A blob: URL for previewing a stored document inline.
 *
 * v3.8.awt — the preview surfaces used to point `<iframe src>` / `<img src>`
 * straight at `Document.fileUrl`, which holds `s3://bucket/key` in production.
 * No browser can open that scheme, so every preview rendered as a broken box
 * from the moment object storage went live.
 *
 * Why a blob rather than just pointing at the API:
 *   - `frame-src 'self' blob:` does not list the API host, so an <iframe> aimed
 *     at api.silkroutelogistics.ai is refused outright.
 *   - The API's plain download 302s to presigned storage, and an XHR cannot
 *     follow that hop because `connect-src` names no storage host.
 * So the bytes come from this origin via ?inline=1, and the blob: URL is the
 * one thing frame-src actually permits. Same conclusion v3.8.avy reached for the
 * carrier-document preview; this is that fix on the shared endpoint.
 *
 * Returns `null` while loading and on failure — callers render their own empty
 * state rather than a broken frame.
 */
export function useInlineDocumentUrl(docId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    if (!docId) return;

    // `cancelled` guards the async resolve: without it, switching preview fast
    // lets a stale response overwrite a newer one, and the revoke below would
    // then free a URL the DOM is still showing.
    let cancelled = false;
    let objectUrl: string | null = null;

    api
      .get(`/documents/${docId}/download?inline=1`, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docId]);

  return url;
}
