"use client";

/**
 * The two-minute warning before an idle sign-out.
 *
 * ONE DEFINITION, THREE PORTALS. Carrier and shipper each carried their own
 * inline copy of this markup and the AE console carried NONE — so the portal
 * whose users hold the most authority was the one that got signed out with no
 * warning at all. Two copies plus a gap is how a third copy gets written.
 *
 * DRIVER DELIBERATELY DOES NOT MOUNT THIS. Its session is 7 days with no idle
 * rule, ratified with a re-ratification trigger (§13.3 Item 244.6) — a countdown
 * there would be counting down to nothing.
 *
 * The countdown string and the extend action come from useSessionTimeout, whose
 * timings come from the shared server mirror. This component holds no timing of
 * its own on purpose: a duration living in a view is how the client ends up
 * disagreeing with the server about when a session ends.
 */

import { Clock } from "lucide-react";

export function SessionWarningModal({
  open,
  countdown,
  onExtend,
  onLogout,
}: {
  open: boolean;
  /** Pre-formatted mm:ss from useSessionTimeout. */
  countdown: string;
  onExtend: () => void;
  onLogout: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="srl-session-warning-title"
    >
      <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[#FBEFD4] flex items-center justify-center">
            <Clock size={20} className="text-[#B07A1A]" />
          </div>
          <div>
            <h3 id="srl-session-warning-title" className="text-sm font-bold text-[#0A2540]">
              Session Expiring
            </h3>
            <p className="text-xs text-gray-500">Your session will expire due to inactivity</p>
          </div>
        </div>
        <div className="text-center py-3">
          <span className="text-2xl font-mono font-bold text-[#9B2C2C]">{countdown}</span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onLogout}
            className="flex-1 px-4 py-2 text-sm border border-[#EFE6D3] rounded-lg text-[#3A4A5F] hover:bg-[#FBF7F0]"
          >
            Logout
          </button>
          <button
            onClick={onExtend}
            className="flex-1 px-4 py-2 text-sm bg-[#BA7517] text-[#FBF7F0] rounded-lg font-semibold hover:bg-[#854F0B]"
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}
