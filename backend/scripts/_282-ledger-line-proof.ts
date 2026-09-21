/**
 * §13.3 Item 282 proof — the ledger and the customer invoice, line by line.
 *
 * 282a: every accessorial line on a customer invoice names the ledger row it
 * bills or credits, on all five writer paths — BASE, DRAFT fold, SUPPLEMENTAL,
 * DRAFT credit, SUPPLEMENTAL credit memo. Linehaul and fuel lines are NULL.
 *
 * Read back from the DATABASE, not from the function's return value: the claim
 * is about what the column holds after the transaction commits.
 *
 * Real functions, real Postgres. Rehearsal container only; outbound keys must be
 * explicitly empty (an unset key is filled from backend/.env by dotenv).
 *
 *   DATABASE_URL=postgresql://srl:srl@127.0.0.1:55482/srl DIRECT_URL=... \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= npx tsx scripts/_282-ledger-line-proof.ts
 */
function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "QUO_API_KEY"]) {
    const v = process.env[k];
    if (v === undefined) { console.error(`REFUSING: ${k} UNSET — dotenv would fill it from backend/.env.`); process.exit(1); }
    if (v !== "") { console.error(`REFUSING: ${k} set to a real value. Outbound would be LIVE.`); process.exit(1); }
  }
  const h = new URL(url);
  console.log(`guard: local DB ${h.hostname}:${h.port}${h.pathname}; outbound keys explicitly empty (post-dotenv)\n`);
}
guard();

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  -- " + d : ""}`); }
};

async function main() {
  const { prisma } = await import("../src/config/database");
  const { autoGenerateInvoice, syncInvoiceAccessorials, creditRejectedAccessorials } =
    await import("../src/services/invoiceService");

  const stamp = Date.now().toString(36);

  // ── fixtures ────────────────────────────────────────────────────────
  const ae = await prisma.user.create({
    data: { email: `ae-${stamp}@p282.invalid`, passwordHash: "x", firstName: "Proof", lastName: "AE", role: "BROKER" },
  });
  const customer = await prisma.customer.create({
    data: { name: `P282 Shipper ${stamp}`, email: `ship-${stamp}@p282.invalid`, phone: "2692206760" },
  });
  const load = await prisma.load.create({
    data: {
      referenceNumber: `P282-${stamp}`,
      loadNumber: `P282-${stamp}`,
      posterId: ae.id,
      customerId: customer.id,
      originCity: "Detroit", originState: "MI", originZip: "48201",
      destCity: "Chicago", destState: "IL", destZip: "60601",
      equipmentType: "DRY_VAN",
      pickupDate: new Date(),
      deliveryDate: new Date(Date.now() + 86400_000),
      rate: 3000, customerRate: 3000, fuelSurcharge: 400,
      status: "DELIVERED",
    },
  });
  const ledgerRow = (type: string, amount: number, notes: string | null = null) =>
    prisma.loadAccessorial.create({
      data: { loadId: load.id, type: type as any, amount, status: "APPROVED", billedTo: "SHIPPER", notes },
    });

  /** invoice_line_items for one invoice, from SQL — the column, not the return value. */
  const linesOf = async (invoiceId: string) =>
    prisma.$queryRawUnsafe<any[]>(
      `SELECT type::text, amount, "accessorialId", description FROM invoice_line_items WHERE "invoiceId" = $1 ORDER BY "sortOrder"`,
      invoiceId,
    );
  const stampsOf = async (invoiceId: string) =>
    prisma.$queryRawUnsafe<any[]>(`SELECT id FROM load_accessorials WHERE shipper_invoice_id = $1 ORDER BY created_at`, invoiceId);

  try {
    // ── 1. BASE invoice ──────────────────────────────────────────────
    console.log("[1] BASE — autoGenerateInvoice on a delivered load with two approved charges");
    const det = await ledgerRow("DETENTION_DEL", 150, "5h dwell");
    const lump = await ledgerRow("LUMPER", 150, "receipt on file");
    const base = await autoGenerateInvoice(load.id);
    ok("a BASE invoice was drafted", !!base && base.invoiceKind === "BASE" && base.status === "DRAFT");
    const l1 = await linesOf(base!.id);
    ok("four lines: linehaul, fuel, detention, lumper", l1.map((l) => l.type).join(",") === "LINEHAUL,FUEL_SURCHARGE,DETENTION,LUMPER", l1.map((l) => l.type).join(","));
    ok("linehaul and fuel carry NULL accessorialId (from the load, not the ledger)",
      l1.filter((l) => l.type === "LINEHAUL" || l.type === "FUEL_SURCHARGE").every((l) => l.accessorialId === null));
    ok("the detention line names its ledger row", l1.find((l) => l.type === "DETENTION")?.accessorialId === det.id);
    ok("the lumper line names its ledger row", l1.find((l) => l.type === "LUMPER")?.accessorialId === lump.id);
    const s1 = await stampsOf(base!.id);
    ok("both ledger rows are stamped with the same invoice the lines point back from",
      s1.map((r) => r.id).sort().join() === [det.id, lump.id].sort().join());

    // ── 2. DRAFT fold ────────────────────────────────────────────────
    console.log("[2] DRAFT fold — a TONU approved while the base is still a draft");
    const tonu = await ledgerRow("TONU", 200, "truck ordered not used");
    await syncInvoiceAccessorials(load.id);
    const l2 = await linesOf(base!.id);
    ok("the draft gained exactly one line", l2.length === l1.length + 1, `${l1.length} -> ${l2.length}`);
    ok("the folded line names the TONU row", l2.at(-1)?.accessorialId === tonu.id && Number(l2.at(-1)?.amount) === 200);
    const inv2 = await prisma.invoice.findUnique({ where: { id: base!.id } });
    ok("draft total moved 3700 -> 3900", Number(inv2?.totalAmount) === 3900, String(inv2?.totalAmount));

    // ── 3. SUPPLEMENTAL ──────────────────────────────────────────────
    console.log("[3] SUPPLEMENTAL — the base is SENT; a late lumper gets its own document");
    await prisma.invoice.update({ where: { id: base!.id }, data: { status: "SENT" } });
    const late = await ledgerRow("LUMPER", 75, "late receipt");
    const supp = await syncInvoiceAccessorials(load.id);
    ok("a SUPPLEMENTAL was raised off the base", !!supp && (supp as any).invoiceKind === "SUPPLEMENTAL" && (supp as any).supplementsInvoiceId === base!.id);
    const l3 = await linesOf((supp as any).id);
    ok("its one line names the late row", l3.length === 1 && l3[0].accessorialId === late.id);
    ok("the sent base was not touched", (await linesOf(base!.id)).length === l2.length);

    // ── 4. DRAFT credit ──────────────────────────────────────────────
    console.log("[4] DRAFT credit — the late lumper is rejected while its supplemental is still a draft");
    await prisma.loadAccessorial.update({ where: { id: late.id }, data: { status: "REJECTED", rejectedReason: "duplicate receipt" } });
    await creditRejectedAccessorials(load.id);
    const l4 = await linesOf((supp as any).id);
    const credit4 = l4.find((l) => Number(l.amount) < 0);
    ok("a negative credit line was folded into the draft supplemental", !!credit4 && Number(credit4.amount) === -75);
    ok("the credit line names the rejected row", credit4?.accessorialId === late.id);
    ok("the rejected row is un-stamped (may bill again if re-approved)",
      (await prisma.loadAccessorial.findUnique({ where: { id: late.id } }))?.shipperInvoiceId === null);

    // ── 5. SUPPLEMENTAL credit memo ──────────────────────────────────
    console.log("[5] SUPPLEMENTAL credit memo — the TONU on the SENT base is rejected");
    await prisma.loadAccessorial.update({ where: { id: tonu.id }, data: { status: "REJECTED", rejectedReason: "customer disputes" } });
    const memo = await creditRejectedAccessorials(load.id);
    ok("a credit memo was raised as a negative SUPPLEMENTAL", !!memo && memo.invoiceKind === "SUPPLEMENTAL" && Number(memo.totalAmount) === -200);
    const l5 = await linesOf(memo!.id);
    ok("its one line names the rejected TONU row", l5.length === 1 && l5[0].accessorialId === tonu.id && Number(l5[0].amount) === -200);
    ok("the sent base still carries the original TONU line, stamped with the row it billed",
      (await linesOf(base!.id)).some((l) => l.accessorialId === tonu.id && Number(l.amount) === 200));

    // ── 6. the column is queryable in the direction 282b needs ───────
    console.log("[6] the reverse lookup — every line for one ledger row, across documents");
    const byRow = await prisma.$queryRawUnsafe<any[]>(
      `SELECT i."invoiceKind"::text AS kind, li.amount FROM invoice_line_items li JOIN invoices i ON i.id = li."invoiceId" WHERE li."accessorialId" = $1 ORDER BY li."createdAt"`,
      tonu.id,
    );
    ok("the TONU row's history reads as +200 on the BASE and -200 on the memo",
      byRow.map((r) => `${r.kind}:${Number(r.amount)}`).join(",") === "BASE:200,SUPPLEMENTAL:-200", byRow.map((r) => `${r.kind}:${Number(r.amount)}`).join(","));

    // Tripwire: the proof exercised real rows.
    const all = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM invoice_line_items WHERE "accessorialId" IS NOT NULL AND "invoiceId" IN (SELECT id FROM invoices WHERE "loadId" = $1)`, load.id);
    ok("tripwire: stamped lines exist for this load (the walk was not over an empty set)", all[0].n >= 6, String(all[0].n));
  } finally {
    // Cleanup. invoices.loadId and invoices.userId are RESTRICT, not cascade, so
    // the documents go first (their lines cascade), then the load (its ledger
    // cascades), then the customer and the AE.
    await prisma.invoice.deleteMany({ where: { loadId: load.id } }).catch((e: any) => console.error("cleanup invoices:", e?.message));
    await prisma.load.delete({ where: { id: load.id } }).catch((e: any) => console.error("cleanup load:", e?.message));
    await prisma.customer.delete({ where: { id: customer.id } }).catch((e: any) => console.error("cleanup customer:", e?.message));
    await prisma.user.delete({ where: { id: ae.id } }).catch((e: any) => console.error("cleanup user:", e?.message));
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("[282-proof] FAILED:", e); process.exit(1); });
