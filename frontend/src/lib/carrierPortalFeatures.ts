/**
 * carrier-portal-upgrade M1 — which carrier portal features are switched on.
 *
 * A feature that does not work is LOCKED, not deleted: the control stays where a
 * carrier expects it, shows a lock and "Available soon", explains why on hover
 * or tap, and sends nothing to the server. Unlocking is one line: set
 * `enabled: true` once the thing behind it exists.
 *
 * `route` is set for a feature that owns a whole page. A locked route is shown
 * locked in the sidebar and the layout sends anyone who lands on it to the
 * Dashboard. A feature without `route` is a control inside a page, and the page
 * reads `isFeatureEnabled` before rendering it as live.
 *
 * Every entry below was locked by the carrier-portal-upgrade A11 walk (2026-10-01).
 */
export type CarrierPortalFeature = {
  enabled: boolean;
  /** Shown in the tooltip and to screen readers on the locked control. */
  reason: string;
  /** Set when the feature is a whole page under /carrier/dashboard. */
  route?: string;
};

export const CARRIER_PORTAL_FEATURES = {
  // The header search box had no handler and no endpoint behind it.
  headerSearch: {
    enabled: false,
    reason: "Search is not available yet. Use the menu to open loads, documents and payments.",
  },
  // Settings "Save" PUT /carrier-auth/profile, a route that does not exist.
  contactPhoneEdit: {
    enabled: false,
    reason: "Phone changes are made by the SRL team for now. Call (269) 220-6760 to update it.",
  },
  // Settings "Save Preferences" PUT /carrier-auth/notifications, which does not
  // exist, and no column stores the choices.
  notificationPreferences: {
    enabled: false,
    reason: "Notification choices cannot be saved yet. You receive every carrier notice for now.",
  },
  // Owner ruling (F2, 2026-10-02) locked Messages; FINISH-2 G3 unlocked it. The
  // A11 walk found it working end to end, and the staff-only messaging fix
  // limits a carrier to SRL staff (messageScope.test.ts). The reason stays for
  // a future re-lock.
  messaging: {
    enabled: true,
    route: "/carrier/dashboard/messaging",
    reason: "Messages are not open yet. Call your SRL rep; the number is on every load, or call (269) 220-6760.",
  },
} satisfies Record<string, CarrierPortalFeature>;

export type CarrierPortalFeatureKey = keyof typeof CARRIER_PORTAL_FEATURES;

const FEATURES: Record<string, CarrierPortalFeature> = CARRIER_PORTAL_FEATURES;

export function isFeatureEnabled(key: CarrierPortalFeatureKey): boolean {
  return FEATURES[key].enabled;
}

export function featureReason(key: CarrierPortalFeatureKey): string {
  return FEATURES[key].reason;
}

/** The locked feature that owns this path, if any. Matches the page and anything under it. */
export function lockedFeatureForPath(pathname: string | null | undefined): CarrierPortalFeature | null {
  if (!pathname) return null;
  for (const f of Object.values(FEATURES)) {
    if (!f.enabled && f.route && (pathname === f.route || pathname.startsWith(`${f.route}/`))) return f;
  }
  return null;
}
