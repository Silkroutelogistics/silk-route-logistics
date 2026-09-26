/**
 * v3.8.bkn — the one rule for mail an AE sends to a customer's PERSON:
 * the recipient is a contact on that customer's live contact list, picked by
 * id, and never Customer.email.
 *
 * Customer.email is also the AP / billing address (§13.3 Item 8.3), and
 * deleting a contact from the list never touches it — so any path that falls
 * back to it keeps mailing someone the AE has removed. That is what sent
 * Beekeepers' portal invite to accounts payable (v3.8.bjv). Portal invites and
 * quotes both answer "who receives this" here, so a third sender inherits the
 * rule instead of rewriting it with a fallback.
 *
 * Refusals carry a stable code the UI can branch on, and say that nothing was
 * sent, because the AE's next question is always "did it go anyway?".
 */
import type { PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "customerContact">;

export interface ListedContact {
  id: string;
  name: string;
  email: string;
}

export type ListedContactVerdict =
  | { ok: true; contact: ListedContact }
  | {
      ok: false;
      status: 400 | 404 | 409;
      code: "CONTACT_REQUIRED" | "CONTACT_NOT_ON_LIST" | "CONTACT_DO_NOT_CONTACT" | "CONTACT_NO_EMAIL";
      error: string;
    };

/**
 * @param noun what is being sent, for the refusal text: "invite", "quote".
 */
export async function resolveListedContact(
  db: Db,
  customerId: string,
  rawContactId: unknown,
  noun: string,
): Promise<ListedContactVerdict> {
  const contactId = typeof rawContactId === "string" ? rawContactId.trim() : "";
  if (!contactId) {
    return {
      ok: false, status: 400, code: "CONTACT_REQUIRED",
      error: `Choose a contact from this customer's contact list to receive the ${noun}.`,
    };
  }
  const contact = await db.customerContact.findFirst({
    where: { id: contactId, customerId },
    select: { id: true, name: true, email: true, doNotContact: true },
  });
  if (!contact) {
    return {
      ok: false, status: 404, code: "CONTACT_NOT_ON_LIST",
      error: `That contact is not on this customer's contact list. No ${noun} was sent.`,
    };
  }
  if (contact.doNotContact) {
    return {
      ok: false, status: 409, code: "CONTACT_DO_NOT_CONTACT",
      error: `${contact.name} is marked Do Not Contact. No ${noun} was sent.`,
    };
  }
  const email = contact.email?.trim();
  if (!email) {
    return {
      ok: false, status: 400, code: "CONTACT_NO_EMAIL",
      error: `${contact.name} has no email on file. Add one on the Contacts tab first.`,
    };
  }
  return { ok: true, contact: { id: contact.id, name: contact.name, email } };
}

export interface EligibleContact extends ListedContact {
  isPrimary: boolean;
  title: string | null;
}

/**
 * The contacts a picker may offer: on the list, with an email, not Do Not
 * Contact. Primary first, then by name — the order a picker defaults from.
 */
export async function listEligibleContacts(db: Db, customerId: string): Promise<EligibleContact[]> {
  const rows = await db.customerContact.findMany({
    where: { customerId, doNotContact: false },
    select: { id: true, name: true, email: true, isPrimary: true, title: true },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
  });
  return rows
    .filter((r) => !!r.email?.trim())
    .map((r) => ({ id: r.id, name: r.name, email: r.email!.trim(), isPrimary: r.isPrimary, title: r.title ?? null }));
}
