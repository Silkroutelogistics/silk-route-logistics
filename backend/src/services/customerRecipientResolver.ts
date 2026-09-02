/**
 * The single place that answers "who at the customer gets this email".
 *
 * WHY THIS EXISTS. On 2026-09-02 four operational emails -- three milestones
 * and a CRITICAL DELAY -- reached accountspayable@beekeepersnaturals.com about
 * loads that were test data. The AE had already removed the tag on the CRM's
 * logistics contact and the emails did not stop, because the tag and the
 * senders were never connected: shipperNotificationService resolves every
 * recipient from `load.customer.email`, a single scalar column, and never opens
 * the CustomerContact table at all. That column holds the AP address because it
 * is ALSO the invoice recipient, read at 47 sites. So operational mail was
 * addressed with the billing address, and no field an AE could edit changed it.
 * CLAUDE.md 13.3 Item 8.3, open since 2026-05-01.
 *
 * THE RULE THIS ENCODES: operational mail and billing mail have different
 * audiences and must resolve through different chains. Operations goes to
 * whoever runs the freight; billing goes to whoever pays. The one thing the old
 * code did -- use one address for both -- is the thing that cannot happen here.
 *
 * OPERATIONAL NEVER FALLS THROUGH TO customers.email. That is deliberate and it
 * is the whole point: falling through is what put AP on a delay alert. A load
 * whose customer has no operational contact sends NOTHING and logs a warning
 * naming the load, which is a visible gap an AE can fix. Silence is the correct
 * failure here -- the alternative is guessing, and the guess was wrong.
 *
 * ELIGIBILITY (ratified 2026-09-02):
 *   operational   : doNotContact = false AND (isPrimary OR receivesTrackingLink)
 *   tracking link : the above AND receivesTrackingLink = true
 *   billing       : doNotContact = false AND isBilling
 * receivesTrackingLink means tracking links ONLY -- turning it off must not
 * silence a primary contact's operational mail. Separating the two properly
 * needs a receivesOperationalUpdates column, deferred behind the Item 194 soak.
 *
 * doNotContact is honoured at EVERY tier, including the raw address columns: if
 * Load.contactEmail or a billing column happens to equal an address a contact
 * row marks do-not-contact, it is skipped. An AE who marks an address
 * do-not-contact must not have it reached through a different column.
 *
 * TIERS CASCADE -- the first tier yielding at least one address wins and lower
 * tiers are not consulted. That preserves the old single-recipient behaviour of
 * resolveRecipient rather than quietly widening every send to a distribution
 * list.
 */
import { prisma } from "../config/database";
import { log } from "../lib/logger";

export type RecipientSource =
  | "load-contact-email"
  | "contact-operational"
  | "contact-tracking-link"
  | "contact-billing"
  | "customer-billing-contact-email"
  | "customer-billing-email"
  | "customer-email";

export interface ResolvedRecipient {
  email: string;
  name: string | null;
  source: RecipientSource;
}

/** Normalised for comparison only -- never for sending. */
function key(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function clean(email: string | null | undefined): string | null {
  const e = (email ?? "").trim();
  return e.length > 0 ? e : null;
}

interface ContactRow {
  name: string | null;
  email: string | null;
  isPrimary: boolean;
  receivesTrackingLink: boolean;
  isBilling: boolean;
  doNotContact: boolean;
}

const CONTACT_SELECT = {
  name: true,
  email: true,
  isPrimary: true,
  receivesTrackingLink: true,
  isBilling: true,
  doNotContact: true,
} as const;

/** Addresses an AE marked do-not-contact, for suppressing raw columns too. */
function suppressed(contacts: ContactRow[]): Set<string> {
  const s = new Set<string>();
  for (const c of contacts) if (c.doNotContact && c.email) s.add(key(c.email));
  return s;
}

function toRecipient(c: ContactRow, source: RecipientSource): ResolvedRecipient | null {
  const e = clean(c.email);
  return e ? { email: e, name: c.name ?? null, source } : null;
}

/** Deduplicate on the normalised address, keeping the first (highest-tier) hit. */
function dedupe(list: ResolvedRecipient[]): ResolvedRecipient[] {
  const seen = new Set<string>();
  const out: ResolvedRecipient[] = [];
  for (const r of list) {
    const k = key(r.email);
    if (k.length === 0 || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export interface OperationalOptions {
  /**
   * Tracking-link sends only. Restricts to contacts carrying
   * receivesTrackingLink and skips Load.contactEmail, preserving exactly what
   * sendTrackingLinkToCrmContacts did before this resolver existed.
   */
  requireTrackingLink?: boolean;
}

/**
 * Who gets pickup / transit / delivery / POD / ETA / delay / claim mail.
 * Returns [] -- and logs why -- rather than ever reaching customers.email.
 */
export async function resolveOperationalRecipients(
  loadId: string,
  opts: OperationalOptions = {},
): Promise<ResolvedRecipient[]> {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      id: true,
      loadNumber: true,
      referenceNumber: true,
      contactEmail: true,
      isTestAccount: true,
      deletedAt: true,
      customerId: true,
      customer: {
        select: { id: true, name: true, deletedAt: true, contacts: { select: CONTACT_SELECT } },
      },
    },
  });

  if (!load) {
    log.warn({ loadId }, "[RecipientResolver] no such load - no operational recipients");
    return [];
  }
  // A test load must never reach a real customer. This guard alone would have
  // stopped the 2026-09-02 incident.
  if (load.isTestAccount) return [];
  if (load.deletedAt) return [];
  if (!load.customer) {
    log.warn(
      { loadId, ref: load.loadNumber ?? load.referenceNumber },
      "[RecipientResolver] load has no customer",
    );
    return [];
  }
  if (load.customer.deletedAt) return [];

  const contacts = (load.customer.contacts ?? []) as ContactRow[];
  const dnc = suppressed(contacts);

  // Tier 1 - the address explicitly set on this load, unless an AE marked that
  // same address do-not-contact. Skipped for tracking links, which have always
  // gone to CRM contacts rather than the load's own field.
  if (!opts.requireTrackingLink) {
    const explicit = clean(load.contactEmail);
    if (explicit && !dnc.has(key(explicit))) {
      return [{ email: explicit, name: null, source: "load-contact-email" }];
    }
  }

  // Tier 2 - eligible CRM contacts.
  const eligible = contacts.filter(
    (c) =>
      !c.doNotContact &&
      clean(c.email) !== null &&
      (opts.requireTrackingLink ? c.receivesTrackingLink : c.isPrimary || c.receivesTrackingLink),
  );

  const out = dedupe(
    eligible
      .map((c) =>
        toRecipient(c, opts.requireTrackingLink ? "contact-tracking-link" : "contact-operational"),
      )
      .filter((r): r is ResolvedRecipient => r !== null),
  );

  if (out.length === 0) {
    log.warn(
      {
        loadId,
        ref: load.loadNumber ?? load.referenceNumber,
        customer: load.customer.name,
        contactsTotal: contacts.length,
        requireTrackingLink: opts.requireTrackingLink === true,
      },
      "[RecipientResolver] no operational recipient - send skipped. Tag a CRM contact as primary for this customer.",
    );
  }
  return out;
}

/**
 * Who gets invoices, dunning and statements.
 *
 * NOTE, TRUE AS OF 2026-09-02: tiers 1-3 are empty across all 80 production
 * customers -- zero isBilling contacts, zero billingContactEmail, zero
 * billingEmail -- so every customer resolves at tier 4 and this changes nothing
 * today. It becomes live the moment an AE tags a billing contact, which is why
 * it is built now rather than later.
 *
 * isTestAccount is Load-scoped and has no meaning for a customer-scoped lookup;
 * callers holding a load must check it themselves before sending.
 */
export async function resolveBillingRecipients(customerId: string): Promise<ResolvedRecipient[]> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      email: true,
      billingEmail: true,
      billingContactEmail: true,
      deletedAt: true,
      contacts: { select: CONTACT_SELECT },
    },
  });

  if (!customer) {
    log.warn({ customerId }, "[RecipientResolver] no such customer - no billing recipients");
    return [];
  }
  if (customer.deletedAt) return [];

  const contacts = (customer.contacts ?? []) as ContactRow[];
  const dnc = suppressed(contacts);

  // Tier 1 - contacts an AE tagged for billing.
  const tagged = dedupe(
    contacts
      .filter((c) => !c.doNotContact && c.isBilling && clean(c.email) !== null)
      .map((c) => toRecipient(c, "contact-billing"))
      .filter((r): r is ResolvedRecipient => r !== null),
  );
  if (tagged.length > 0) return tagged;

  // Tiers 2-4 - raw columns, each suppressed if do-not-contact names it.
  const chain: Array<[string | null, RecipientSource]> = [
    [clean(customer.billingContactEmail), "customer-billing-contact-email"],
    [clean(customer.billingEmail), "customer-billing-email"],
    [clean(customer.email), "customer-email"],
  ];
  for (const [addr, source] of chain) {
    if (addr && !dnc.has(key(addr))) {
      return [{ email: addr, name: customer.name ?? null, source }];
    }
  }

  log.warn({ customerId, customer: customer.name }, "[RecipientResolver] no billing recipient - send skipped");
  return [];
}

/** Convenience for callers that still take a single `to` string. */
export function primaryAddress(list: ResolvedRecipient[]): string | null {
  return list.length > 0 ? list[0].email : null;
}
