/**
 * set-customer-accessorial-rate — put one negotiated accessorial rate on a
 * customer's rate card (Customer.defaultAccessorialRates), by customer id.
 *
 *   npx tsx scripts/set-customer-accessorial-rate.ts --customer=<id> --type=TONU --rate=250 --env-file=<file>
 *   ... --execute --target=prod   (with PRISMA_TARGET=production) to write
 *
 * The card is the customer-level TONU rate: customerPriceFor reads it for the
 * customer's invoice line and it never moves carrier pay (see TONU_AMOUNT).
 * Merges the one key into the existing card; every other key is kept as it was.
 * Writes an AuditTrail UPDATE row with the before and after card.
 */
import { openTarget } from "./_prodTarget";

export const ACCESSORIAL_TYPES = [
  "LUMPER", "DETENTION_PU", "DETENTION_DEL", "TONU", "LAYOVER", "HAZMAT", "DEADHEAD",
  "DRIVER_ASSIST", "REEFER_FUEL", "INSIDE_DELIVERY", "LIFTGATE", "PALLET_EXCHANGE",
] as const;

/** Pure: the card after the merge, or why not. */
export function mergeRate(card: unknown, type: string, rate: number): { card?: Record<string, number>; refuse?: string } {
  if (!(ACCESSORIAL_TYPES as readonly string[]).includes(type)) return { refuse: `${type} is not an accessorial type` };
  if (!Number.isFinite(rate) || rate < 0) return { refuse: `rate ${rate} is not a non-negative number` };
  const base = card && typeof card === "object" && !Array.isArray(card) ? (card as Record<string, number>) : {};
  return { card: { ...base, [type]: rate } };
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const t = openTarget("rate-card");
  const customerId = arg("customer");
  const type = (arg("type") ?? "").toUpperCase();
  const rate = Number(arg("rate"));
  const by = arg("by") ?? "whaider@silkroutelogistics.ai";
  if (!customerId) { console.error("[rate-card] REFUSED: --customer=<id> is required."); process.exit(2); }

  const { prisma } = await import("../src/config/database");
  try {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, defaultAccessorialRates: true } });
    if (!c) { console.error(`[rate-card] REFUSED: no customer ${customerId}.`); process.exit(2); }
    console.log("[rate-card] BEFORE", JSON.stringify(c));
    const merged = mergeRate(c.defaultAccessorialRates, type, rate);
    if (merged.refuse) { console.error(`[rate-card] REFUSED: ${merged.refuse}`); process.exit(2); }
    console.log("[rate-card] PLAN", JSON.stringify({ customerId, defaultAccessorialRates: merged.card }));
    if (!t.write) { console.log("[rate-card] DRY RUN — nothing written."); return; }

    const performer = await prisma.user.findFirst({ where: { email: { equals: by, mode: "insensitive" } }, select: { id: true } });
    if (!performer) { console.error(`[rate-card] REFUSED: no user ${by}.`); process.exit(2); }
    await prisma.$transaction(async (tx: any) => {
      await tx.customer.update({ where: { id: customerId }, data: { defaultAccessorialRates: merged.card } });
      await tx.auditTrail.create({
        data: {
          entityType: "Customer", entityId: customerId, action: "UPDATE", performedById: performer.id,
          changedFields: {
            actionDetail: "CUSTOMER_ACCESSORIAL_RATE_SET",
            defaultAccessorialRates: { from: c.defaultAccessorialRates ?? null, to: merged.card },
            via: "scripts/set-customer-accessorial-rate.ts",
          },
        },
      });
    });
    const after = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, defaultAccessorialRates: true } });
    console.log("[rate-card] AFTER", JSON.stringify(after));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
