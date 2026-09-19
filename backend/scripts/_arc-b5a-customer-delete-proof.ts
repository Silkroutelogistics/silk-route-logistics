/**
 * Lifecycle-gaps B5a proof — a customer is deleted only when nothing references
 * it; everything else is refused with the references named; the cascade that
 * used to cancel loads under a free-text reason is gone. Real controllers, real
 * status endpoint, real database.
 *
 * Refuses a non-local DATABASE_URL: it writes and deletes rows.
 */
import { prisma } from "../src/config/database";
import { deleteCustomer, inactivateCustomer, restoreCustomer } from "../src/controllers/customerController";
import { updateLoadStatus } from "../src/controllers/loadController";
import { makeCaptureRes } from "../src/lib/captureResponse";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d?: string) => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  — " + d : ""}`); }
};

async function main() {
  const stamp = Date.now().toString(36);
  const ae = await prisma.user.create({
    data: { email: `b5a-ae-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "ADMIN" },
  });
  const actor = { id: ae.id, email: ae.email, role: "ADMIN", firstName: "A", lastName: "E" };
  const call = async (fn: (req: any, res: any) => Promise<any>, params: Record<string, string>, body: Record<string, unknown> = {}) => {
    const { shim, state } = makeCaptureRes();
    await fn({ params, body, user: actor, ip: "127.0.0.1", headers: {} } as any, shim);
    return state as { statusCode: number; body: any };
  };
  const mkCustomer = (tag: string, extra: Record<string, unknown> = {}) =>
    prisma.customer.create({ data: { name: `B5A ${tag} ${stamp}`, email: `b5a-${tag}-${stamp}@srl.invalid`, ...extra } });
  const mkLoad = (customerId: string, tag: string, status: string) =>
    prisma.load.create({
      data: {
        referenceNumber: `B5A-${stamp}-${tag}`, posterId: ae.id, customerId, status: status as any,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
        equipmentType: "Reefer", rate: 5100, customerRate: 5100, carrierRate: 4100, dispatchMethod: "loadboard",
      },
    });
  const exists = async (id: string) => !!(await prisma.customer.findUnique({ where: { id }, select: { id: true } }));

  console.log("\n── 1. one historical load: refused, named, nothing touched ──");
  const c1 = await mkCustomer("hist");
  const l1 = await mkLoad(c1.id, "hist", "COMPLETED");
  const r1 = await call(deleteCustomer, { id: c1.id });
  ok("409 CUSTOMER_HAS_REFERENCES", r1.statusCode === 409 && r1.body?.error === "CUSTOMER_HAS_REFERENCES", `status=${r1.statusCode} ${JSON.stringify(r1.body).slice(0, 160)}`);
  ok("the load is named and classified as history", r1.body?.references?.loads?.[0]?.referenceNumber === l1.referenceNumber && r1.body.references.loads[0].cancellable === false);
  ok("the message says what the end state is", /inactivated, not deleted/.test(r1.body?.message ?? ""));
  ok("no open loads to cancel first", Array.isArray(r1.body?.remedy?.openLoads) && r1.body.remedy.openLoads.length === 0);
  const c1After = await prisma.customer.findUnique({ where: { id: c1.id }, select: { deletedAt: true, isActive: true } });
  const l1After = await prisma.load.findUnique({ where: { id: l1.id }, select: { status: true, customerId: true, deletedAt: true } });
  ok("the customer row stands: not soft-deleted, still active", !!c1After && c1After.deletedAt === null && c1After.isActive === true);
  ok("the load is untouched: still COMPLETED, still the customer's, not archived", l1After?.status === "COMPLETED" && l1After.customerId === c1.id && l1After.deletedAt === null);
  ok("no 'Customer Deleted' notice was raised", (await prisma.notification.count({ where: { userId: ae.id, title: "Customer Deleted" } })) === 0);

  console.log("\n── 2. one OPEN load: refused, and the endpoint does NOT cancel it (decision 4) ──");
  const c2 = await mkCustomer("open");
  const l2 = await mkLoad(c2.id, "open", "BOOKED");
  const r2 = await call(deleteCustomer, { id: c2.id });
  ok("409 with the open load listed as the thing to cancel first", r2.statusCode === 409 && r2.body?.remedy?.openLoads?.[0] === l2.referenceNumber, JSON.stringify(r2.body?.remedy));
  ok("the remedy says: individually, with a reason code", /individually.*reason code/.test(r2.body?.remedy?.cancelOpenLoadsFirst ?? ""));
  const l2After = await prisma.load.findUnique({ where: { id: l2.id }, select: { status: true, cancellationReasonCode: true, cancelledAt: true } });
  ok("the load is still BOOKED — no silent cancellation, no code written, no cancelledAt", l2After?.status === "BOOKED" && l2After.cancellationReasonCode === null && l2After.cancelledAt === null, JSON.stringify(l2After));
  ok("no FallOffEvent, no invoice, no CarrierPay were created by the refusal", (await prisma.fallOffEvent.count({ where: { loadId: l2.id } })) === 0 && (await prisma.invoice.count({ where: { loadId: l2.id } })) === 0 && (await prisma.carrierPay.count({ where: { loadId: l2.id } })) === 0);

  console.log("\n── 3. the intended lifecycle: cancel the open load with a reason, then inactivate ──");
  const rc = await call(updateLoadStatus, { id: l2.id }, { status: "CANCELLED", cancellationReasonCode: "SHIPPER_CANCELLED" });
  ok("the AE cancels the load through the real endpoint with a reason code", rc.statusCode === 200, `status=${rc.statusCode} ${JSON.stringify(rc.body).slice(0, 120)}`);
  const r2b = await call(deleteCustomer, { id: c2.id });
  ok("delete is STILL refused — a cancelled load is history, not absence", r2b.statusCode === 409 && /1 history/.test(r2b.body?.message ?? ""), r2b.body?.message);
  const ri = await call(inactivateCustomer, { id: c2.id }, { reason: "Shipper closed the account after cancelling their only load." });
  ok("inactivate is the end state, and it is reachable", ri.statusCode === 200, `status=${ri.statusCode} ${JSON.stringify(ri.body).slice(0, 120)}`);
  const c2After = await prisma.customer.findUnique({ where: { id: c2.id }, select: { isActive: true, inactivationReason: true, deletedAt: true } });
  ok("the customer is inactive with its reason, and its history is intact", c2After?.isActive === false && !!c2After.inactivationReason && c2After.deletedAt === null && (await prisma.load.count({ where: { customerId: c2.id } })) === 1);

  console.log("\n── 4. each of the other reference classes refuses on its own ──");
  const c3 = await mkCustomer("contact");
  await prisma.customerContact.create({ data: { customerId: c3.id, name: "Jo Contact" } });
  const r3 = await call(deleteCustomer, { id: c3.id });
  ok("a contact blocks (the plan's list, taken literally)", r3.statusCode === 409 && r3.body?.references?.contacts === 1);

  const c4 = await mkCustomer("seq");
  await prisma.emailSequence.create({ data: { prospectId: c4.id, prospectEmail: c4.email!, prospectName: c4.name, status: "ACTIVE", schedule: [] } });
  const r4 = await call(deleteCustomer, { id: c4.id });
  ok("an in-flight sequence blocks and the remedy says to stop it first", r4.statusCode === 409 && r4.body?.remedy?.stopSequencesFirst === true);
  await prisma.emailSequence.updateMany({ where: { prospectId: c4.id }, data: { status: "STOPPED" } });
  const r4b = await call(deleteCustomer, { id: c4.id });
  ok("a STOPPED sequence is inert: the same customer now deletes", r4b.statusCode === 200 && r4b.body?.details?.hardDeleted === true, `status=${r4b.statusCode}`);
  ok("and the row is gone", !(await exists(c4.id)));

  const shipper = await prisma.user.create({ data: { email: `b5a-shipper-${stamp}@srl.invalid`, passwordHash: "x", firstName: "S", lastName: "H", role: "SHIPPER" } });
  const c5 = await mkCustomer("login", { userId: shipper.id });
  const r5 = await call(deleteCustomer, { id: c5.id });
  ok("a shipper login blocks — a portal account must not be left pointing at nothing", r5.statusCode === 409 && r5.body?.references?.shipperUser?.email === shipper.email);

  console.log("\n── 5. a bare row: hard-deleted, owned rows go with it, the AEs are told ──");
  const c6 = await mkCustomer("bare");
  await prisma.shipperCredit.create({ data: { customerId: c6.id } });
  await prisma.customerNote.create({ data: { customerId: c6.id, noteType: "GENERAL", content: "junk import" } });
  const r6 = await call(deleteCustomer, { id: c6.id });
  ok("200 hardDeleted", r6.statusCode === 200 && r6.body?.details?.hardDeleted === true && r6.body?.details?.references === 0, `status=${r6.statusCode} ${JSON.stringify(r6.body)}`);
  ok("the customer row is gone (not soft-deleted)", !(await exists(c6.id)));
  ok("its owned rows went with it", (await prisma.shipperCredit.count({ where: { customerId: c6.id } })) === 0 && (await prisma.customerNote.count({ where: { customerId: c6.id } })) === 0);
  const notice = await prisma.notification.findFirst({ where: { userId: ae.id, title: "Customer Deleted" }, orderBy: { createdAt: "desc" } });
  ok("the AE notice is honest about what was deleted", !!notice && /had no loads, orders, contracts, facilities or contacts/.test(notice.message) && !/cancelled|voided/.test(notice.message), notice?.message);

  console.log("\n── 6. a legacy soft-deleted row: 404 on delete, restore still works ──");
  const c7 = await mkCustomer("legacy", { deletedAt: new Date(), deletedBy: "someone@srl.invalid" });
  const r7 = await call(deleteCustomer, { id: c7.id });
  ok("404 — an archived row is not deletable through this door", r7.statusCode === 404);
  const r7r = await call(restoreCustomer, { id: c7.id });
  ok("restore brings the legacy row back", r7r.statusCode === 200 && (await prisma.customer.findUnique({ where: { id: c7.id }, select: { deletedAt: true } }))?.deletedAt === null, `status=${r7r.statusCode}`);

  // cleanup
  const custIds = [c1.id, c2.id, c3.id, c5.id, c7.id];
  await prisma.notification.deleteMany({ where: { userId: { in: [ae.id, shipper.id] } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ae.id, shipper.id] } } });
  await prisma.loadActivity.deleteMany({ where: { load: { referenceNumber: { startsWith: `B5A-${stamp}-` } } } });
  await prisma.load.deleteMany({ where: { referenceNumber: { startsWith: `B5A-${stamp}-` } } });
  await prisma.emailSequence.deleteMany({ where: { prospectId: { in: custIds.concat([c4.id, c6.id]) } } });
  await prisma.customer.deleteMany({ where: { id: { in: custIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [ae.id, shipper.id] } } });

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
