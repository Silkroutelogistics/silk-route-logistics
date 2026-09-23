/**
 * WHICH TEMPLATE DREW THIS DOCUMENT.
 *
 * Before this module the answer lived only in source comments: the BOL's
 * "v2.9"/"v2.10" appeared in pdfService and nowhere on the page, so a printed
 * or stored BOL could not be asked which template produced it. "Archived BOLs
 * stay version-faithful" was a convention nobody could verify from the
 * artifact — which is the whole problem, because the artifact is what turns up
 * in a dispute.
 *
 * DISTINCT FROM RC_TERMS_VERSION, deliberately. That is the version of the
 * governing TERMS a rate confirmation was issued under — a legal fact about
 * the agreement. This is the version of the LAYOUT that drew the page. They
 * move for different reasons and on different cadences, and collapsing them
 * into one field is the dual-meaning drift this codebase keeps unpicking.
 *
 * ONE CONSTANT PER DOCUMENT, and it is the only place the number appears
 * outside prose. Bump it in the same commit that changes the template.
 */

/** Bill of Lading layout. Bumped by the stop-data arc from 2.9. */
export const BOL_TEMPLATE_VERSION = "2.10";

/** Rate Confirmation layout. */
export const RC_TEMPLATE_VERSION = "1.4";
