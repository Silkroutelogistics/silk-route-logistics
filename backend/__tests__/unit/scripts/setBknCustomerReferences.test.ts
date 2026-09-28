// Beekeepers' references (ruled 2026-09-27): TO3665 on SRL-121492, PO1861 on SRL-121494 and
// SRL-121495, on Load.poNumbers. Never overwrite a different reference.
import { describe, it, expect } from "vitest";
import { planReferences, REFERENCES, type RefState } from "../../../scripts/set-bkn-customer-references";

// Production as read 2026-09-27: 121492 and 121494 empty, 121495 already PO1861.
const prod = (): RefState[] => [
  { id: "cmu78p8lr00eamb2dehub3qdl", loadNumber: "SRL-121492", poNumbers: [] },
  { id: "cmubrf8on00qoh02dujll2ltb", loadNumber: "SRL-121494", poNumbers: [] },
  { id: "cmuct8gnk001vma2db2hbgrsj", loadNumber: "SRL-121495", poNumbers: ["PO1861"] },
];

describe("planReferences", () => {
  it("sets the two empty loads and leaves 121495, which already carries PO1861", () => {
    const plan = planReferences(prod());
    expect(plan.refuse).toEqual([]);
    expect(plan.set).toEqual([
      { loadId: "cmu78p8lr00eamb2dehub3qdl", from: [], to: ["TO3665"] },
      { loadId: "cmubrf8on00qoh02dujll2ltb", from: [], to: ["PO1861"] },
    ]);
    expect(plan.done).toEqual(["SRL-121495"]);
  });

  it("the ruled values, exactly", () => {
    expect(REFERENCES.map((r) => `${r.loadNumber}=${r.reference}`)).toEqual(["SRL-121492=TO3665", "SRL-121494=PO1861", "SRL-121495=PO1861"]);
  });

  it("a load carrying a different reference refuses the whole run", () => {
    const loads = prod(); loads[0] = { ...loads[0], poNumbers: ["TO9999"] };
    const plan = planReferences(loads);
    expect(plan.refuse.join(" ")).toMatch(/SRL-121492 already carries TO9999; not overwriting it with TO3665/);
    expect(plan.set).toEqual([]);
  });

  it("a load that is not the ruled load refuses", () => {
    const loads = prod(); loads[1] = { ...loads[1], loadNumber: "121498" };
    expect(planReferences(loads).refuse.join(" ")).toMatch(/is 121498, not SRL-121494/);
    expect(planReferences(loads).set).toEqual([]);
  });

  it("a second run is a no-op", () => {
    const after = prod().map((l, i) => ({ ...l, poNumbers: [REFERENCES[i].reference] }));
    expect(planReferences(after)).toEqual({ set: [], done: ["SRL-121492", "SRL-121494", "SRL-121495"], refuse: [] });
  });

  it("never names 121496, which carries its own TO3667", () => {
    expect(REFERENCES.map((r) => r.loadNumber)).not.toContain("SRL-121496");
  });
});
