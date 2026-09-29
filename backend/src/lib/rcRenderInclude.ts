import type { Prisma } from "@prisma/client";

/**
 * The load data every Rate Confirmation render reads, in ONE place.
 *
 * WHY THIS EXISTS (v3.8.boe). Four call sites rendered the RC — issuance
 * (sendRateConfirmation), the RC download, and the two load-keyed PDF routes —
 * and each wrote its own include. They had drifted: two fetched the carrier's
 * address and two did not, one fetched the AE and three did not, none fetched
 * the stop list. So the same load could render a different document depending
 * on which door an AE or a carrier came through. The owner's rule (2026-09-28):
 * the AE and the carrier see the same RC from the same source. Issued RCs are
 * served from the frozen artifact; this include makes sure every render that
 * produces bytes starts from the same data.
 *
 * A render site may ADD to this (the issuance path needs the carrier's tier
 * and Quick Pay flag to price the election), never narrow it.
 */
export const RC_RENDER_LOAD_INCLUDE = {
  carrier: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      company: true,
      phone: true,
      email: true,
      carrierProfile: {
        select: {
          id: true,
          mcNumber: true,
          dotNumber: true,
          tier: true,
          quickPayEnabled: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          contactPhone: true,
          contactEmail: true,
        },
      },
    },
  },
  customer: true,
  poster: { select: { firstName: true, lastName: true, phone: true, email: true } },
  loadStops: { orderBy: { stopNumber: "asc" } },
  // The tender-expiry banner: latest live tender only; the renderer filters by
  // status and expiry.
  tenders: {
    orderBy: { createdAt: "desc" },
    take: 1,
    where: { status: { in: ["OFFERED", "ACCEPTED"] } },
    select: { expiresAt: true, status: true },
  },
} satisfies Prisma.LoadInclude;
