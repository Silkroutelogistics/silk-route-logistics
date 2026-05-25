"use client";

/**
 * v3.8.akn §13.3 Item 180.4 — Customer-facing magic-link approval page.
 *
 * Customers click the "Approve this quote" button in the quote email,
 * land on this page. Token comes from the URL path (after /quote/approve/),
 * read via window.location.pathname at runtime because Next.js static
 * export can't pre-render arbitrary token paths.
 *
 * SPA-rewrite from _redirects: /quote/approve/<token> → /quote/approve
 * (status 200, URL preserved). Mirrors the v3.8.aae pattern used for
 * /track/<token> public tracking page.
 *
 * No auth required — the JWT in the URL IS the auth. Backend verifies
 * + idempotently flips order.status to "quote_approved".
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface ApprovalResult {
  success: boolean;
  alreadyApproved: boolean;
  orderNumber: string;
  customerName: string | null;
  approvedAt: string | null;
}

interface ApprovalError {
  error: string;
  code?: "TOKEN_EXPIRED" | "TOKEN_INVALID" | "ORDER_NOT_FOUND";
}

type State =
  | { kind: "loading" }
  | { kind: "missing-token" }
  | { kind: "success"; result: ApprovalResult }
  | { kind: "error"; error: ApprovalError };

function extractTokenFromPath(pathname: string): string | null {
  // Expected shape: /quote/approve/<token>
  // Also accept /quote/approve/<token>/ trailing-slash variant.
  const match = pathname.match(/^\/quote\/approve\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function QuoteApprovePage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const token = extractTokenFromPath(window.location.pathname);
    if (!token) {
      setState({ kind: "missing-token" });
      return;
    }

    api
      .post<ApprovalResult>("/quote-approve", { token })
      .then((res) => setState({ kind: "success", result: res.data }))
      .catch((err) => {
        const data = (err?.response?.data as ApprovalError | undefined) ?? { error: "Network error. Please try again or contact your AE." };
        setState({ kind: "error", error: data });
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#FBF7F0] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-block w-12 h-12 rounded-lg bg-[#0A2540] text-[#C5A572] flex items-center justify-center text-base font-bold mb-3">
            SRL
          </div>
          <h1 className="text-xl font-semibold text-[#0A2540]">Silk Route Logistics</h1>
          <p className="text-[11px] text-[#6B7685] italic mt-1">Where Trust Travels.</p>
        </div>

        {/* State card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {state.kind === "loading" && (
            <div className="text-center py-4">
              <div className="inline-block w-8 h-8 border-4 border-[#C5A572] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-[#6B7685] mt-3">Confirming your approval…</p>
            </div>
          )}

          {state.kind === "missing-token" && (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">⚠️</div>
              <h2 className="text-base font-semibold text-[#0A2540]">Approval link incomplete</h2>
              <p className="text-sm text-[#3A4A5F] mt-2">
                This link is missing its approval token. Please use the link from your quote email, or contact your AE for a fresh quote.
              </p>
            </div>
          )}

          {state.kind === "success" && state.result.alreadyApproved && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-[#E6F0E9] text-[#2F7A4F] flex items-center justify-center text-xl mx-auto mb-3">✓</div>
              <h2 className="text-base font-semibold text-[#0A2540]">Already approved</h2>
              <p className="text-sm text-[#3A4A5F] mt-2">
                Quote <strong>{state.result.orderNumber}</strong>
                {state.result.customerName && <> for <strong>{state.result.customerName}</strong></>}
                {" "}was already approved
                {state.result.approvedAt && <> on {new Date(state.result.approvedAt).toLocaleDateString()}</>}.
              </p>
              <p className="text-xs text-[#6B7685] mt-3">
                Your AE has been notified and will move forward with carrier dispatch.
              </p>
            </div>
          )}

          {state.kind === "success" && !state.result.alreadyApproved && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-[#E6F0E9] text-[#2F7A4F] flex items-center justify-center text-xl mx-auto mb-3">✓</div>
              <h2 className="text-base font-semibold text-[#0A2540]">Quote approved</h2>
              <p className="text-sm text-[#3A4A5F] mt-2">
                Quote <strong>{state.result.orderNumber}</strong>
                {state.result.customerName && <> for <strong>{state.result.customerName}</strong></>}
                {" "}is confirmed.
              </p>
              <p className="text-xs text-[#6B7685] mt-3">
                Your AE has been notified and will proceed with carrier dispatch. You&apos;ll receive a Rate Confirmation + tracking link by email once a carrier accepts.
              </p>
            </div>
          )}

          {state.kind === "error" && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-[#F6E3E3] text-[#9B2C2C] flex items-center justify-center text-xl mx-auto mb-3">×</div>
              <h2 className="text-base font-semibold text-[#0A2540]">
                {state.error.code === "TOKEN_EXPIRED" ? "Link expired" : state.error.code === "ORDER_NOT_FOUND" ? "Quote not found" : "Approval failed"}
              </h2>
              <p className="text-sm text-[#3A4A5F] mt-2">{state.error.error}</p>
              <p className="text-xs text-[#6B7685] mt-3">
                Please contact your AE at <a href="mailto:operations@silkroutelogistics.ai" className="text-[#BA7517] hover:underline">operations@silkroutelogistics.ai</a> or reply to the quote email.
              </p>
            </div>
          )}
        </div>

        {/* Footer brand line */}
        <p className="text-[10px] text-[#A7AEB8] text-center mt-4">
          Silk Route Logistics Inc. · MC# 1794414 · DOT# 4526880
        </p>
      </div>
    </div>
  );
}
