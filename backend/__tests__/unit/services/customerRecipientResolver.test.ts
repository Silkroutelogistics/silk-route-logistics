/**
 * The recipient resolver — CLAUDE.md 13.3 Item 8.3.
 *
 * THE CASE THAT MATTERS IS "no fallthrough". On 2026-09-02 operational mail
 * reached accountspayable@beekeepersnaturals.com because the sender fell
 * through to customers.email when it found nothing better. Several cases below
 * assert the resolver returns [] where the old code would have returned that
 * address — an empty result is the FIX, not a gap, and anyone tempted to
 * "improve" it by adding a fallback should read the incident first.
 *
 * Every mocked call that must return null uses an explicit
 * mockResolvedValue(null): vitest's clearAllMocks resets call history but NOT
 * a queued mockResolvedValue, so a truthy value from a previous test leaks
 * forward and the failure looks like resolver logic. That cost a debugging
 * cycle in v3.8.alh.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resolveOperationalRecipients,
  resolveBillingRecipients,
  primaryAddress,
} from "../../../src/services/customerRecipientResolver";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;

/** The address that must never appear in an operational result. */
const AP = "accountspayable@beekeepersnaturals.com";
const OPS = "logistics@beekeepersnaturals.com";

function contact(over: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Logistics",
    email: OPS,
    isPrimary: false,
    receivesTrackingLink: false,
    isBilling: false,
    doNotContact: false,
    ...over,
  };
}

function load(over: Partial<Record<string, unknown>> = {}, contacts: unknown[] = []) {
  return {
    id: "load-1",
    loadNumber: "SRL-121489",
    referenceNumber: "SRL-121489",
    contactEmail: null,
    isTestAccount: false,
    deletedAt: null,
    customerId: "cust-1",
    customer: { id: "cust-1", name: "Beekeepers Naturals USA Inc.", deletedAt: null, contacts },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.load.findUnique.mockResolvedValue(null);
  mockPrisma.customer.findUnique.mockResolvedValue(null);
});

describe("operational — who is eligible", () => {
  it("an isPrimary contact receives operational mail", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(load({}, [contact({ isPrimary: true })]));
    const r = await resolveOperationalRecipients("load-1");
    expect(r.map((x) => x.email)).toEqual([OPS]);
    expect(r[0].source).toBe("contact-operational");
  });

  it("THE BKN CASE — receivesTrackingLink=false still receives operational mail when isPrimary", async () => {
    // The AE turned the tracking tag off. That must silence tracking links and
    // nothing else; this contact is still the operations contact.
    mockPrisma.load.findUnique.mockResolvedValue(
      load({}, [contact({ isPrimary: true, receivesTrackingLink: false })]),
    );
    expect((await resolveOperationalRecipients("load-1")).map((x) => x.email)).toEqual([OPS]);
  });

  it("a receivesTrackingLink contact receives operational mail even when not primary", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({}, [contact({ isPrimary: false, receivesTrackingLink: true })]),
    );
    expect((await resolveOperationalRecipients("load-1")).map((x) => x.email)).toEqual([OPS]);
  });

  it("a contact that is neither primary nor tracking receives nothing", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({}, [contact({ isPrimary: false, receivesTrackingLink: false })]),
    );
    expect(await resolveOperationalRecipients("load-1")).toEqual([]);
  });

  it("a contact with no email address is skipped rather than yielding an empty string", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({}, [contact({ isPrimary: true, email: null }), contact({ isPrimary: true, email: "  " })]),
    );
    expect(await resolveOperationalRecipients("load-1")).toEqual([]);
  });

  it("deduplicates when two contacts carry the same address in different cases", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({}, [
        contact({ isPrimary: true, email: OPS }),
        contact({ receivesTrackingLink: true, email: OPS.toUpperCase() }),
      ]),
    );
    expect(await resolveOperationalRecipients("load-1")).toHaveLength(1);
  });
});

describe("operational — NEVER falls through to customers.email", () => {
  it("returns [] when the customer has no contacts at all", async () => {
    // The old code returned customers.email here. That is the incident.
    mockPrisma.load.findUnique.mockResolvedValue(load({}, []));
    expect(await resolveOperationalRecipients("load-1")).toEqual([]);
  });

  it("returns [] when every contact is ineligible", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({}, [contact({ isPrimary: false, receivesTrackingLink: false })]),
    );
    expect(await resolveOperationalRecipients("load-1")).toEqual([]);
  });

  it("never yields the AP address even though it is the customer's email", async () => {
    // Belt and braces: the resolver does not select customers.email for the
    // operational path at all, so it cannot appear whatever the contacts say.
    mockPrisma.load.findUnique.mockResolvedValue(load({}, [contact({ isPrimary: false })]));
    const r = await resolveOperationalRecipients("load-1");
    expect(r.some((x) => x.email === AP)).toBe(false);
    expect(r).toEqual([]);
  });
});

describe("operational — Load.contactEmail is tier 1", () => {
  it("wins over the CRM contacts when set", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({ contactEmail: "ops@shipper.example" }, [contact({ isPrimary: true })]),
    );
    const r = await resolveOperationalRecipients("load-1");
    expect(r.map((x) => x.email)).toEqual(["ops@shipper.example"]);
    expect(r[0].source).toBe("load-contact-email");
  });

  it("is SKIPPED when a contact row marks that same address do-not-contact", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({ contactEmail: "Ops@Shipper.Example" }, [
        contact({ email: "ops@shipper.example", doNotContact: true }),
        contact({ email: OPS, isPrimary: true }),
      ]),
    );
    // Falls to tier 2 rather than honouring an address an AE suppressed.
    expect((await resolveOperationalRecipients("load-1")).map((x) => x.email)).toEqual([OPS]);
  });

  it("an empty-string contactEmail is treated as unset", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({ contactEmail: "   " }, [contact({ isPrimary: true })]),
    );
    expect((await resolveOperationalRecipients("load-1")).map((x) => x.email)).toEqual([OPS]);
  });
});

describe("doNotContact excludes at every tier", () => {
  it("excludes an otherwise-eligible primary contact", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({}, [contact({ isPrimary: true, doNotContact: true })]),
    );
    expect(await resolveOperationalRecipients("load-1")).toEqual([]);
  });

  it("excludes a tracking-tagged contact from tracking-link sends", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({}, [contact({ receivesTrackingLink: true, doNotContact: true })]),
    );
    expect(await resolveOperationalRecipients("load-1", { requireTrackingLink: true })).toEqual([]);
  });

  it("excludes from billing too, including the raw customer.email column", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({
      id: "cust-1",
      name: "C",
      email: AP,
      billingEmail: null,
      billingContactEmail: null,
      deletedAt: null,
      contacts: [contact({ email: AP, doNotContact: true })],
    });
    expect(await resolveBillingRecipients("cust-1")).toEqual([]);
  });
});

describe("tracking links require the tracking tag", () => {
  it("an isPrimary contact WITHOUT the tag gets no tracking link", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({}, [contact({ isPrimary: true, receivesTrackingLink: false })]),
    );
    expect(await resolveOperationalRecipients("load-1", { requireTrackingLink: true })).toEqual([]);
  });

  it("a tagged contact does", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({}, [contact({ receivesTrackingLink: true })]),
    );
    const r = await resolveOperationalRecipients("load-1", { requireTrackingLink: true });
    expect(r.map((x) => x.email)).toEqual([OPS]);
    expect(r[0].source).toBe("contact-tracking-link");
  });

  it("Load.contactEmail does NOT receive tracking links", async () => {
    // Preserves what sendTrackingLinkToCrmContacts did: CRM contacts only.
    mockPrisma.load.findUnique.mockResolvedValue(
      load({ contactEmail: "ops@shipper.example" }, []),
    );
    expect(await resolveOperationalRecipients("load-1", { requireTrackingLink: true })).toEqual([]);
  });
});

describe("hard stops", () => {
  it("isTestAccount returns [] — a test load never reaches a real customer", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({ isTestAccount: true, contactEmail: "ops@shipper.example" }, [contact({ isPrimary: true })]),
    );
    expect(await resolveOperationalRecipients("load-1")).toEqual([]);
  });

  it("a soft-deleted load returns []", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({ deletedAt: new Date() }, [contact({ isPrimary: true })]),
    );
    expect(await resolveOperationalRecipients("load-1")).toEqual([]);
  });

  it("a soft-deleted customer returns []", async () => {
    const l = load({}, [contact({ isPrimary: true })]);
    (l.customer as any).deletedAt = new Date();
    mockPrisma.load.findUnique.mockResolvedValue(l);
    expect(await resolveOperationalRecipients("load-1")).toEqual([]);
  });

  it("a missing load returns [] rather than throwing", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(null);
    expect(await resolveOperationalRecipients("nope")).toEqual([]);
  });

  it("a load with no customer returns []", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(load({ customer: null, customerId: null }, []));
    expect(await resolveOperationalRecipients("load-1")).toEqual([]);
  });

  it("a missing customer returns [] from the billing path", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    expect(await resolveBillingRecipients("nope")).toEqual([]);
  });

  it("a soft-deleted customer returns [] from the billing path", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({
      id: "c", name: "C", email: AP, billingEmail: null, billingContactEmail: null,
      deletedAt: new Date(), contacts: [],
    });
    expect(await resolveBillingRecipients("c")).toEqual([]);
  });
});

describe("billing falls through in order", () => {
  const base = {
    id: "cust-1", name: "C", deletedAt: null,
    email: "cust@x.example",
    billingEmail: "billing@x.example",
    billingContactEmail: "bce@x.example",
    contacts: [] as unknown[],
  };

  it("tier 1 — an isBilling contact wins over every column", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({
      ...base, contacts: [contact({ email: "ap@x.example", isBilling: true })],
    });
    const r = await resolveBillingRecipients("cust-1");
    expect(r.map((x) => x.email)).toEqual(["ap@x.example"]);
    expect(r[0].source).toBe("contact-billing");
  });

  it("tier 2 — billingContactEmail when no tagged contact", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ ...base });
    expect((await resolveBillingRecipients("cust-1"))[0]).toMatchObject({
      email: "bce@x.example", source: "customer-billing-contact-email",
    });
  });

  it("tier 3 — billingEmail when billingContactEmail is unset", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ ...base, billingContactEmail: null });
    expect((await resolveBillingRecipients("cust-1"))[0]).toMatchObject({
      email: "billing@x.example", source: "customer-billing-email",
    });
  });

  it("tier 4 — customers.email last, which is where all 80 production customers land today", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({
      ...base, billingContactEmail: null, billingEmail: null,
    });
    expect((await resolveBillingRecipients("cust-1"))[0]).toMatchObject({
      email: "cust@x.example", source: "customer-email",
    });
  });

  it("returns [] when the customer has no address anywhere", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({
      ...base, email: null, billingEmail: null, billingContactEmail: null,
    });
    expect(await resolveBillingRecipients("cust-1")).toEqual([]);
  });

  it("billing DOES use customers.email — the no-fallthrough rule is operational only", async () => {
    // Stated as a case so nobody "fixes" billing by symmetry with operations.
    mockPrisma.customer.findUnique.mockResolvedValue({
      ...base, billingContactEmail: null, billingEmail: null, email: AP,
    });
    expect((await resolveBillingRecipients("cust-1")).map((x) => x.email)).toEqual([AP]);
  });
});

describe("primaryAddress helper", () => {
  it("returns the first address or null", () => {
    expect(primaryAddress([{ email: "a@x", name: null, source: "customer-email" }])).toBe("a@x");
    expect(primaryAddress([])).toBeNull();
  });
});
