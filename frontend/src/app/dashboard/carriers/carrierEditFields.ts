// Which fields each edit tab may send, and only the ones the AE changed.
//
// coi-verify-email-fix C3: the Insurance tab sent the whole form, so a field
// loaded blank (the agent, which the list did not return) or stale overwrote
// the record, and tier / safety score / trucks rode along with an insurance save.

const POLICIES = ["autoLiability", "cargoInsurance", "generalLiability", "workersComp"] as const;

export const INSURANCE_EDIT_FIELDS: readonly string[] = [
  "insuranceExpiry",
  ...POLICIES.flatMap((p) => [`${p}Provider`, `${p}Policy`, `${p}Amount`, `${p}Expiry`]),
  "additionalInsuredSRL", "waiverOfSubrogation", "thirtyDayCancellationNotice",
  "insuranceAgencyName", "insuranceAgentName", "insuranceAgentEmail", "insuranceAgentPhone",
];

export const PROFILE_EDIT_FIELDS: readonly string[] = ["tier", "safetyScore", "numberOfTrucks"];

export function changedFields(
  baseline: Record<string, unknown>,
  form: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (form[k] !== baseline[k]) out[k] = form[k];
  return out;
}
