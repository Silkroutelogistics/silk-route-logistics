// The bill of lading and the rate confirmation both printed the CUSTOMER'S
// BILLING CONTACT as the dock contact when the load carried none of its own.
// Production, 2026-09-23: SRL-121497 — BOOKED, pickup 2026-09-24, BOL number
// already issued — prints "Contact: Monika Pape" on its shipper line. She is
// Beekeepers Naturals' billing contact; the dock is Steuart Nutrition Kentucky.
//
// The load-bearing case in this file is the LAST one: a billing contact is
// present in the fixture and must never come back from the resolver, at any
// tier, under any combination. Every other case can pass while that one fails,
// which is exactly the state the code was in before this arc.

import { describe, it, expect } from "vitest";
import {
  pickStopContact,
  resolveStopContacts,
  normalizeKey,
  BLANK_CONTACT,
  type FacilityContactRow,
} from "../../../src/lib/stopContact";

const fac = (o: Partial<FacilityContactRow> & { id: string }): FacilityContactRow => ({
  name: null, city: null, contactName: null, contactPhone: null, contactEmail: null, ...o,
});

// The four production facilities that matter, transcribed from the 2026-09-23
// read-only census so the fixtures are the real shapes rather than invented ones.
const PATTERN_WAREHOUSE = fac({
  id: "fac_pattern", name: "Pattern Warehouse", city: "Hebron",
  contactName: "Brynn", contactPhone: "502-219-3219", contactEmail: null,
});
const DALLAS_ONE_IRVING = fac({
  id: "fac_dallas_irving", name: "Dallas One", city: "Irving",
  contactName: "Carlos", contactPhone: "9724903300", contactEmail: "croque@inwmfg.com",
});
// Same customer, same NAME, different city — and no contact at all. This row is
// why tier 3 matches on name AND city, and why an empty tier falls through.
const DALLAS_ONE_CARROLLTON = fac({
  id: "fac_dallas_carrollton", name: "Dallas One", city: "Carrollton",
});

describe("normalizeKey", () => {
  it("trims, case-folds and collapses internal whitespace", () => {
    expect(normalizeKey("  Pattern   Warehouse ")).toBe("pattern warehouse");
    expect(normalizeKey("PATTERN WAREHOUSE")).toBe("pattern warehouse");
  });

  it("returns empty for nullish and whitespace, so callers can refuse to match on it", () => {
    expect(normalizeKey(null)).toBe("");
    expect(normalizeKey(undefined)).toBe("");
    expect(normalizeKey("   ")).toBe("");
  });
});

describe("pickStopContact — tier order", () => {
  it("tier 1 wins: the load's own stop contact beats both facility tiers", () => {
    const got = pickStopContact({
      loadContactName: "Brian Morgan",
      loadContactPhone: "9723332500",
      linkedFacility: DALLAS_ONE_IRVING,
      company: "Dallas One",
      city: "Irving",
      candidateFacilities: [DALLAS_ONE_IRVING],
    });
    expect(got.name).toBe("Brian Morgan");
    expect(got.phone).toBe("9723332500");
    expect(got.source).toBe("LOAD");
  });

  it("tier 1 carries no email — the load has no column for one, and borrowing the facility's would name a person we never matched", () => {
    const got = pickStopContact({
      loadContactName: "Carlos",
      loadContactPhone: "9724903300",
      linkedFacility: DALLAS_ONE_IRVING, // has croque@inwmfg.com
      candidateFacilities: [DALLAS_ONE_IRVING],
    });
    expect(got.source).toBe("LOAD");
    expect(got.email).toBeNull();
  });

  it("tier 2: the linked facility answers when the load carries no stop contact, and supplies the email", () => {
    const got = pickStopContact({
      linkedFacility: DALLAS_ONE_IRVING,
      company: "Somewhere Else",
      city: "Nowhere",
      candidateFacilities: [DALLAS_ONE_IRVING],
    });
    expect(got.source).toBe("FACILITY_FK");
    expect(got.name).toBe("Carlos");
    expect(got.email).toBe("croque@inwmfg.com");
  });

  it("a linked facility with no contact in it falls through rather than suppressing tier 3", () => {
    const got = pickStopContact({
      linkedFacility: DALLAS_ONE_CARROLLTON, // linked, but empty
      company: "Pattern Warehouse",
      city: "Hebron",
      candidateFacilities: [DALLAS_ONE_CARROLLTON, PATTERN_WAREHOUSE],
    });
    expect(got.source).toBe("FACILITY_MATCH");
    expect(got.name).toBe("Brynn");
  });

  it("tier 3: a unique normalized name + city match fills it — this is SRL-121497's consignee", () => {
    const got = pickStopContact({
      company: "  pattern   WAREHOUSE  ", // messy on purpose
      city: " hebron ",
      candidateFacilities: [DALLAS_ONE_IRVING, DALLAS_ONE_CARROLLTON, PATTERN_WAREHOUSE],
    });
    expect(got.source).toBe("FACILITY_MATCH");
    expect(got.name).toBe("Brynn");
    expect(got.phone).toBe("502-219-3219");
  });

  it("tier 3 matches on city too — the same facility name in another city is not a match", () => {
    const got = pickStopContact({
      company: "Dallas One",
      city: "Irving",
      candidateFacilities: [DALLAS_ONE_IRVING, DALLAS_ONE_CARROLLTON],
    });
    expect(got.name).toBe("Carlos");
  });
});

describe("pickStopContact — blank rather than a guess", () => {
  it("tier 3 ambiguous: two facilities with the same name in the same city yield BLANK, not the first", () => {
    const twinA = fac({ id: "a", name: "Pattern Warehouse", city: "Hebron", contactName: "Brynn" });
    const twinB = fac({ id: "b", name: "pattern warehouse", city: "HEBRON", contactName: "Someone Else" });
    const got = pickStopContact({
      company: "Pattern Warehouse",
      city: "Hebron",
      candidateFacilities: [twinA, twinB],
    });
    expect(got).toEqual(BLANK_CONTACT);
    expect(got.name).toBeNull();
  });

  it("no match at all yields BLANK — a handwrite line, which a driver can fill", () => {
    const got = pickStopContact({
      company: "Steuart Nutrition Kentucky",
      city: "Erlanger",
      candidateFacilities: [PATTERN_WAREHOUSE, DALLAS_ONE_IRVING],
    });
    expect(got).toEqual(BLANK_CONTACT);
  });

  it("a stop with no company cannot match on an empty key, even against a facility with an empty name", () => {
    const nameless = fac({ id: "n", name: "", city: "Hebron", contactName: "Should Not Appear" });
    const got = pickStopContact({
      company: "",
      city: "Hebron",
      candidateFacilities: [nameless],
    });
    expect(got).toEqual(BLANK_CONTACT);
  });

  it("a stop with no city cannot match either", () => {
    const got = pickStopContact({
      company: "Pattern Warehouse",
      city: null,
      candidateFacilities: [PATTERN_WAREHOUSE],
    });
    expect(got).toEqual(BLANK_CONTACT);
  });

  it("whitespace-only load contact is not a contact", () => {
    const got = pickStopContact({ loadContactName: "   ", loadContactPhone: "  " });
    expect(got).toEqual(BLANK_CONTACT);
  });
});

// ── THE ONE THAT MUST NOT REGRESS ────────────────────────────────────────────
describe("the billing contact is never a tier", () => {
  it("SRL-121497's real shape: no stop contact, no facility link, billing contact present — resolver returns BLANK", async () => {
    // Exactly what production holds for SRL-121497 on 2026-09-23 — INCLUDING the
    // `customer` relation, because both assemblers include it and that is where
    // the old fallback reached. A fixture without it cannot catch the defect:
    // the first version of this test omitted `customer`, and an injected billing
    // tier passed 18/18 against it. The fixture must carry the loaded gun.
    const load = {
      customerId: "cust_bkn",
      customer: {
        name: "Beekeepers Naturals USA Inc.",
        contactName: "Monika Pape",
        phone: "",
        email: "ap@beekeepersnaturals.example",
      },
      originCompany: "Steuart Nutrition Kentucky",
      originCity: "Erlanger",
      originContactName: null,
      originContactPhone: null,
      originFacilityId: null,
      destCompany: "Pattern Warehouse",
      destCity: "Hebron",
      destContactName: null,
      destContactPhone: null,
      destFacilityId: null,
    };
    const db = {
      customerFacility: {
        findMany: async () => [PATTERN_WAREHOUSE, DALLAS_ONE_IRVING, DALLAS_ONE_CARROLLTON],
      },
    };

    const got = await resolveStopContacts(load, db);

    // Shipper: no facility of that name in Erlanger -> handwrite line.
    expect(got.shipper).toEqual(BLANK_CONTACT);
    // Consignee: tier 3 finds Pattern Warehouse in Hebron.
    expect(got.consignee.name).toBe("Brynn");
    expect(got.consignee.source).toBe("FACILITY_MATCH");

    // Whatever else changes, this must hold.
    const everything = JSON.stringify(got);
    expect(everything).not.toContain("Monika");
    expect(everything).not.toContain("Pape");
  });

  it("resolveStopContacts exposes no parameter through which a billing contact could arrive", () => {
    // A structural assertion: the resolver takes (load, db) and the load shape
    // it reads has no customer contact field on it. If a future edit adds one,
    // this names it.
    const src = pickStopContact.toString() + resolveStopContacts.toString();
    expect(src).not.toMatch(/customer\s*\??\.\s*(contactName|phone|email)/);
    expect(src).not.toMatch(/billingContact/i);
    // Any identifier that names a customer-level contact at all. The narrow
    // `customer?.contactName` pattern missed an injected `customerContactName`
    // during the adversarial run, which is how this line got here.
    expect(src).not.toMatch(/customerContact|customerPhone|customerEmail/i);
  });
});

describe("resolveStopContacts — the async shell", () => {
  it("resolves the FK against the rows already fetched, without a second query", async () => {
    let calls = 0;
    const db = {
      customerFacility: {
        findMany: async () => { calls += 1; return [PATTERN_WAREHOUSE, DALLAS_ONE_IRVING]; },
      },
    };
    const got = await resolveStopContacts(
      {
        customerId: "c1",
        originFacilityId: "fac_dallas_irving",
        destFacilityId: "fac_pattern",
      },
      db,
    );
    expect(calls).toBe(1);
    expect(got.shipper.name).toBe("Carlos");
    expect(got.shipper.source).toBe("FACILITY_FK");
    expect(got.consignee.name).toBe("Brynn");
  });

  it("a load with no customer does not query, and resolves from its own fields", async () => {
    let calls = 0;
    const db = { customerFacility: { findMany: async () => { calls += 1; return []; } } };
    const got = await resolveStopContacts(
      { customerId: null, originContactName: "Carlos", originContactPhone: "972" },
      db,
    );
    expect(calls).toBe(0);
    expect(got.shipper.name).toBe("Carlos");
    expect(got.consignee).toEqual(BLANK_CONTACT);
  });

  it("a failed CRM lookup yields blank contacts rather than failing the document", async () => {
    const db = {
      customerFacility: { findMany: async () => { throw new Error("db down"); } },
    };
    const got = await resolveStopContacts(
      { customerId: "c1", destCompany: "Pattern Warehouse", destCity: "Hebron" },
      db,
    );
    expect(got.shipper).toEqual(BLANK_CONTACT);
    expect(got.consignee).toEqual(BLANK_CONTACT);
  });
});
