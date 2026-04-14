"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Waterfall Dispatch replaces the old Dispatch Board (Karpathy Rule 5 —
// Delete Before Add). Client-side redirect because the frontend is
// statically exported (next.config.ts has output: "export").
export default function DispatchRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/waterfall"); }, [router]);
  return <div className="p-6 text-sm text-gray-500">Redirecting to Waterfall Dispatch…</div>;
}
