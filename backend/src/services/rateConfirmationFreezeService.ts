/**
 * Freezing an issued rate confirmation onto its load — the one writer.
 *
 * Two moments make an issued rate confirmation the load's governing document:
 * an AE sending it to a carrier who already holds the load, and (Item 342) a
 * carrier signing one that was issued with the offer, which is also the moment
 * they take the load. Both write the same three columns for the same reason,
 * so they write them here: the portal's view of the document and the Quick Pay
 * pair every charge path reads, in one statement, because they describe one
 * event. A second copy of this update is a second place for the fee on a load
 * to disagree with the fee on the document.
 *
 * NOT at offer. An offer can die, and a load carrying the fee a declined
 * carrier elected would charge whoever takes it next.
 *
 * The path is API-client-relative on purpose (v3.8.awt): the portal and the API
 * are different hosts, and the column holds what the api client consumes.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

type Db = Prisma.TransactionClient | typeof prisma;

export async function freezeIssuedRateConfirmationOntoLoad(
  input: { loadId: string; rateConfirmationId: string; quickPayFeePercent: number; quickPaySpeed: string },
  db: Db = prisma,
): Promise<void> {
  await db.load.update({
    where: { id: input.loadId },
    data: {
      rateConfirmationPdfUrl: `/rate-confirmations/${input.rateConfirmationId}/pdf`,
      quickPayFeePercent: input.quickPayFeePercent,
      quickPaySpeed: input.quickPaySpeed as never,
    },
  });
}
