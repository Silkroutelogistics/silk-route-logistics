"use client";

// Version history:
// v2.0   — AE console merge, 4 new pages
// v2.1   — Deep audit, all logic gaps closed
// v2.2   — Contract Rates, RFP, Lane Analytics, AR Collections, Content Engine
// v2.3   — Carvan 3-tier, QP safety, milestones, performance-first tiers
// v2.4   — TMW-level upgrade: Dispatch Board, multi-stop, audit trail, geofence
// v2.4.e — Clickable CEO dashboard, shipper email notifications, pallet fix

export const SRL_VERSION = "2.5";

export function VersionFooter({ className }: { className?: string }) {
  return (
    <p className={`text-[10px] text-slate-500 ${className || ""}`}>
      SRL v{SRL_VERSION}
    </p>
  );
}
