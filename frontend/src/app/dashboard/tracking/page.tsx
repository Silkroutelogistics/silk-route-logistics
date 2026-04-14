"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Old /dashboard/tracking has been consolidated into /dashboard/track-trace.
// Rule 5 (Delete Before You Add) — keep a redirect stub so any external links
// (notifications, bookmarks, old URLs) still land on the new board.
// Uses client-side redirect because the frontend is statically exported
// (next.config.ts has output: "export"), so server-side redirect() won't run.
export default function TrackingRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/track-trace"); }, [router]);
  return <div className="p-6 text-sm text-gray-500">Redirecting to Track &amp; Trace…</div>;
}
