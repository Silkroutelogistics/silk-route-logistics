/**
 * SRL's countersignature on a Rate Confirmation.
 *
 * WHY THIS IS A MODULE AND NOT THREE LINES IN THE CONTROLLER. The controller
 * that issues a rate confirmation also EMAILS it, and emailIdentity.test.ts
 * bans any email-sending module from reading SIGNATORY_NAME / SIGNATORY_TITLE
 * outright -- no allowlist, because the moment an email body reads them the
 * exemption that lets documents use them has been turned into the regression
 * the guard exists to prevent. That rule is right, so the identity is resolved
 * here, in a module that sends nothing.
 *
 * WHY A COUNTERSIGNATURE AT ALL. The document draws a BROKER column beside the
 * carrier's. Without this it printed a name and a title over two ruled lines
 * nothing could ever fill, which reads as a signature somebody forgot rather
 * than a party that has bound itself.
 *
 * WHY AT ISSUANCE, where the BCA countersigns at ACCEPTANCE. The carrier
 * accepting is the last act needed to form the BCA. A rate confirmation is the
 * other way round: SRL issues it, and issuing it is the broker's act. So the
 * instant SRL puts these terms in front of a carrier is the instant to record
 * binding itself to them.
 *
 * It is NOT a claim that a person typed anything, and the rendered statement
 * says so in as many words. The SIGNATURE rule from agreementPdfService holds
 * unchanged: a typed name never goes on the line a drawn mark belongs on.
 */
import { ENTITY_NAME, SIGNATORY_NAME, SIGNATORY_TITLE } from "../config/authority";

export interface RcCountersign {
  name: string;
  title: string;
  at: Date;
}

/**
 * The countersignature as it is stamped.
 *
 * `at` is a PARAMETER rather than `new Date()` inside, so the caller commits to
 * one instant and can write that same instant to the row it renders into. A
 * clock read in here would be a second, slightly later instant, and the whole
 * point of the stamp is that the row and the bytes describe the same moment.
 */
export function buildRcCountersign(at: Date): RcCountersign {
  return { name: SIGNATORY_NAME, title: SIGNATORY_TITLE, at };
}

/**
 * What the broker SIGNATURE cell says.
 *
 * NOT a typed name. agreementPdfService's rule holds unchanged: the SIGNATURE
 * line is where a wet or drawn mark goes, and printing a name there would
 * assert a mark nobody made. This says what actually happened instead, and the
 * statement below the block says it in full.
 *
 * It also has to FIT. drawSignatureBlock renders a prefilled value with
 * lineBreak: false into CONTENT_W / 2 - 12 = 258pt, so an over-long string
 * overprints the cell rather than wrapping. Measured at FONT_BODY 8.5 this is
 * 113.0pt. Do not lengthen it without re-measuring; the detention label in
 * drawRateConTerms is the standing example of what happens when somebody does.
 */
export const RC_COUNTERSIGN_MARKER = "Countersigned electronically";

/**
 * The broker DATE cell: ISO, matching the BCA's signature block.
 *
 * Deliberately NOT the page-1 DATE ISSUED format ("Sep 22, 2026"). The two
 * registers differ and the signature block is the one that has to agree across
 * documents: a carrier holding a rate confirmation and a Broker-Carrier
 * Agreement should not find two conventions for the same act. ISO is also
 * unambiguous, which on a signed instrument is worth more than matching the
 * meta strip twelve inches above it.
 */
export function rcCountersignDate(cs: RcCountersign): string {
  return new Date(cs.at).toISOString().slice(0, 10);
}

/**
 * The full statement, drawn below the acceptance block.
 *
 * Same shape as the BCA's countersign line, including the ISO instant beside
 * the human one so a reader can reconcile the rendered string against the
 * stored column. The one adaptation is the triggering act: the BCA is formed by
 * the carrier accepting, a rate confirmation is issued by SRL, so this says
 * "on issuance of this Rate Confirmation" where the BCA says "on the Carrier's
 * acceptance".
 *
 * It cannot go in the SIGNATURE cell: the first line measures 577.8pt at
 * FONT_BODY_ITALIC 8 against a 258pt cell. It is drawn full width instead,
 * which costs 34.2pt into the 374pt of page-3 headroom the tightest fixture in
 * the matrix leaves.
 */
export function rcCountersignStatement(cs: RcCountersign): string {
  const at = new Date(cs.at);
  const human = at.toISOString().replace("T", " ").slice(0, 16);
  return (
    `Countersigned for ${ENTITY_NAME} by ${cs.name}, ${cs.title}` +
    ` on ${human} UTC, applied automatically on issuance of this Rate Confirmation.` +
    `\nCountersigned at (UTC, ISO 8601): ${at.toISOString()}`
  );
}
