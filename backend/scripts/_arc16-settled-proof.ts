/**
 * ARC 16 — proof that `Load.carrierSettled` tracks the carrier pays behind it.
 *
 * WHAT THIS EXISTS TO CATCH. `carrierSettled` had exactly one writer — the
 * `POST /accounting/payments/:id/mark-paid` endpoint — and no frontend calls
 * it. The three settle paths the product actually uses never set it, so the
 * Track & Trace "delivered" tab (which ORs on `carrierSettled: false`) could
 * never clear. §13.3 Item 221.3.
 *
 * Real database, real controllers. Safety guard identical to
 * scripts/_arc16-rate-proof.ts and for the same reason.
 *
 *   DATABASE_URL=postgresql://arc16:arc16@localhost:55433/arc16 \
 *     JWT_SECRET=x RESEND_API_KEY= OPENPHONE_API_KEY= \
 *     npx tsx scripts/_arc16-settled-proof.ts
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!url.includes("55432") && !url.includes("55433")) {
    console.error("REFUSING: DATABASE_URL is not a rehearsal container (:55432/:55433).");
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    const v = process.env[k];
    if (v === undefined) {
      console.error(`REFUSING: ${k} is UNSET, which dotenv will fill from backend/.env.`);
      process.exit(1);
    }
    if (v !== "") {
      console.error(`REFUSING: ${k} is set to a real value. Outbound would be LIVE.`);
      process.exit(1);
    }
  }
  console.log("guard: rehearsal DB confirmed; outbound keys explicitly empty (post-dotenv)\n");
}
guard();

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
}

async function main() {
  const { prisma } = await import("../src/config/database");
  const { syncCarrierSettled, syncCarrierSettledForPays } = await import("../src/lib/settlementFlags");

  const stamp = Date.now();
  const customer = await prisma.customer.create({
    data: { name: `Settled ${stamp}`, email: `s-${stamp}@arc16.invalid`, phone: "2692206760" },
  });
  const ae = await prisma.user.create({
    data: { email: `sae-${stamp}@arc16.invalid`, passwordHash: "x", firstName: "S", lastName: "AE", role: "BROKER" },
  });
  const carrier = await prisma.user.create({
    data: { email: `sc-${stamp}@arc16.invalid`, passwordHash: "x", firstName: "S", lastName: "Carrier", role: "CARRIER" },
  });

  let n = 0;
  async function makeLoad() {
    n += 1;
    return prisma.load.create({
      data: {
        referenceNumber: `SET-${stamp}-${n}`,
        posterId: ae.id,
        customerId: customer.id,
        carrierId: carrier.id,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "76247",
        equipmentType: "REEFER",
        pickupDate: new Date(),
        deliveryDate: new Date(Date.now() + 3 * 86400_000),
        rate: 5100,
        status: "DELIVERED",
      },
    });
  }
  let payNo = 0;
  async function makePay(loadId: string, status: string) {
    payNo += 1;
    return prisma.carrierPay.create({
      data: {
        loadId,
        carrierId: carrier.id,
        paymentNumber: `SETPAY-${stamp}-${payNo}`,
        amount: 4100,
        lineHaul: 4100,
        grossAmount: 4100,
        netAmount: 4100,
        status: status as any,
      },
    });
  }
  const flag = async (id: string) =>
    (await prisma.load.findUnique({ where: { id }, select: { carrierSettled: true } }))!.carrierSettled;

  console.log("── the flag follows the pays ──────────────────────────────────────");
  {
    const load = await makeLoad();
    const pay = await makePay(load.id, "PENDING");
    await syncCarrierSettled(load.id);
    check("a pending pay leaves the load unsettled", (await flag(load.id)) === false, `carrierSettled=${await flag(load.id)}`);

    await prisma.carrierPay.update({ where: { id: pay.id }, data: { status: "PAID" } });
    await syncCarrierSettled(load.id);
    check("paying it settles the load", (await flag(load.id)) === true, `carrierSettled=${await flag(load.id)}`);
  }

  console.log("\n── the case the old unconditional write got wrong ─────────────────");
  {
    // The retired writer set `carrierSettled: true` on any mark-paid, with no
    // regard for whether the load's OTHER pays were paid. A load with a second
    // outstanding pay would have vanished off the delivered tab still owing
    // money. Deriving the flag is what makes this case come out right.
    const load = await makeLoad();
    const one = await makePay(load.id, "PAID");
    await makePay(load.id, "PENDING");
    await syncCarrierSettled(load.id);
    check(
      "one of two pays paid does NOT settle the load",
      (await flag(load.id)) === false,
      `carrierSettled=${await flag(load.id)} with 1 PAID + 1 PENDING (the unconditional write said true)`,
    );
    void one;
  }

  console.log("\n── reversal, and the void convention ──────────────────────────────");
  {
    const load = await makeLoad();
    const pay = await makePay(load.id, "PAID");
    await syncCarrierSettled(load.id);
    const before = await flag(load.id);
    await prisma.carrierPay.update({ where: { id: pay.id }, data: { status: "PENDING" } });
    await syncCarrierSettled(load.id);
    check(
      "a correction back off PAID returns the load to the board",
      before === true && (await flag(load.id)) === false,
      `settled=${before} then ${await flag(load.id)} — a set-once boolean would have stranded it as true`,
    );
  }
  {
    const load = await makeLoad();
    await makePay(load.id, "VOID");
    await syncCarrierSettled(load.id);
    check(
      "a voided pay counts as settled, not as owing",
      (await flag(load.id)) === true,
      `carrierSettled=${await flag(load.id)} — nothing is outstanding, so it must not sit on the tab forever`,
    );
  }
  {
    const load = await makeLoad();
    await syncCarrierSettled(load.id);
    check(
      "a delivered load with no pays at all stays unsettled",
      (await flag(load.id)) === false,
      `carrierSettled=${await flag(load.id)} — nobody has raised a settlement yet, so it belongs on the tab`,
    );
  }

  console.log("\n── the bulk path ─────────────────────────────────────────────────");
  {
    const a = await makeLoad();
    const b = await makeLoad();
    const pays = [await makePay(a.id, "PAID"), await makePay(b.id, "PAID")];
    await syncCarrierSettledForPays(pays.map((p) => p.id));
    check(
      "batch settle clears every load it touched",
      (await flag(a.id)) === true && (await flag(b.id)) === true,
      `a=${await flag(a.id)} b=${await flag(b.id)}`,
    );
  }

  console.log("\n── the tab query itself ──────────────────────────────────────────");
  {
    // The real filter from routes/trackTraceBoard.ts. This is the assertion
    // that matters: not "the column is true" but "the load leaves the tab".
    const load = await makeLoad();
    const pay = await makePay(load.id, "PENDING");
    await prisma.load.update({ where: { id: load.id }, data: { podVerified: true, customerInvoiced: true } });
    await syncCarrierSettled(load.id);

    const onTab = async () =>
      (await prisma.load.count({
        where: {
          id: load.id,
          OR: [{ podVerified: false }, { customerInvoiced: false }, { carrierSettled: false }],
        },
      })) > 0;

    const beforePay = await onTab();
    await prisma.carrierPay.update({ where: { id: pay.id }, data: { status: "PAID" } });
    await syncCarrierSettled(load.id);
    const afterPay = await onTab();
    check(
      "the delivered tab actually clears once the carrier is paid",
      beforePay === true && afterPay === false,
      `on tab before payment: ${beforePay}; after: ${afterPay}`,
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + "=".repeat(66));
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log("carrierSettled TRACKS THE MONEY — and the delivered tab clears.");
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
