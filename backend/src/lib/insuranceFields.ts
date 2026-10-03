// The insurance record's newer fields (coi-verify-email-fix C2), named once for
// the save handler, the carrier list and the agent email.

const POLICIES = ["autoLiability", "generalLiability", "cargoInsurance", "workersComp"] as const;

export const INSURER_FIELDS = POLICIES.flatMap((p) => [`${p}InsurerName`, `${p}InsurerNaic`]);

export const WC_EL_FIELDS = ["workersCompElEachAccident", "workersCompElDiseaseEachEmployee", "workersCompElDiseasePolicyLimit"];

// true = confirmed on the COI; false = an AE checked the COI and it is absent;
// null = nobody has said.
export function endorsementState(v: boolean | null | undefined): "Confirmed" | "Not provided" | "Not stated" {
  return v === true ? "Confirmed" : v === false ? "Not provided" : "Not stated";
}
