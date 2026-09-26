/**
 * Where an agreement names the carrier.
 *
 * From Broker-Carrier Agreement Revision 3 and Caravan Quick Pay Agreement
 * Revision 6, the opening paragraph carries a placeholder where the carrier's
 * legal name goes. It used to be a printed blank line, so an executed agreement
 * read "by and between ________ ("CARRIER")" even though the carrier's legal
 * name was on file and printed in the execution block.
 *
 * ONE function fills it, used by both trees: the backend's canonical assembly
 * (so the name is part of the hashed text and of the executed PDF) and every
 * portal pane that shows the agreement before it is signed. Two fills would be
 * two answers to "what did the carrier see".
 *
 * With no name to use, the placeholder prints as the line it replaced, so an
 * unsigned specimen still reads as a form. Agreements authored before Revision 3
 * contain no placeholder and pass through unchanged, which is what keeps their
 * stored hashes re-derivable.
 */
export const CARRIER_PARTY_TOKEN = "{{CARRIER}}";

/** What prints in place of the carrier's name when there is none. */
export const CARRIER_PARTY_BLANK = "________________________________";

export function fillCarrierParty(text: string, legalName?: string | null): string {
  if (!text.includes(CARRIER_PARTY_TOKEN)) return text;
  const name = legalName?.trim();
  return text.split(CARRIER_PARTY_TOKEN).join(name ? name : CARRIER_PARTY_BLANK);
}
