/**
 * Feature Flags — env-driven, no rebuild needed.
 *
 * Set SRL_FEATURE_<NAME>=true|false in .env or container env.
 * Defaults are production-safe (established features ON, beta features OFF).
 */

function flag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[`SRL_FEATURE_${name}`];
  if (raw === undefined) return defaultValue;
  return raw === "true" || raw === "1";
}

export const features = {
  // ─── Established (default ON) ────────────────────────
  compassEngine:        flag("COMPASS_ENGINE", true),
  fmcsaVetting:         flag("FMCSA_VETTING", true),
  ofacScreening:        flag("OFAC_SCREENING", true),
  checkCallSystem:      flag("CHECK_CALL_SYSTEM", true),
  detentionTracking:    flag("DETENTION_TRACKING", true),
  laneRateIntelligence: flag("LANE_RATE_INTELLIGENCE", true),
  geofenceAutoStatus:   flag("GEOFENCE_AUTO_STATUS", true),
  shipperNotifications: flag("SHIPPER_NOTIFICATIONS", true),

  // ─── Beta (default OFF) ──────────────────────────────
  emailSequences:       flag("EMAIL_SEQUENCES", false),
  carrierSelfService:   flag("CARRIER_SELF_SERVICE", false),
  waterfallTendering:   flag("WATERFALL_TENDERING", false),
  aiLoadParsing:        flag("AI_LOAD_PARSING", false),
  webhookEvents:        flag("WEBHOOK_EVENTS", false),
} as const;

export type FeatureFlag = keyof typeof features;

/** Check if a feature is enabled — use in route guards and services */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return features[flag];
}
