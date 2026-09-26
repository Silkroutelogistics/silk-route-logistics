/**
 * Proof for migration 20260926140000 as amended by item 3: the two archive
 * columns exist with the shape the schema declares, one stored file can be the
 * archive of only one invoice (UNIQUE), and that file cannot be deleted while an
 * invoice names it (RESTRICT). Local containers only; any other host is refused.
 *
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= DATABASE_URL=<local> \
 *   npx tsx scripts/_arc-invoice-archive-proof.ts
 *
 * Needs the migration chain applied and the seed run: it borrows two seeded
 * invoices, and puts back everything it changes.
 */
import { hostOf, isLocalHost } from "./prisma-target-guard";

const url = process.env.DATABASE_URL ?? "";
if (!url || !isLocalHost(hostOf(url))) {
  console.error("[archive-proof] REFUSED: a local DATABASE_URL only.");
  process.exit(2);
}

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

(async () => {
  const { prisma } = await import("../src/config/database");
  try {
    const cols = await prisma.$queryRawUnsafe<any[]>(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_name = 'invoices' AND column_name IN ('deliveredFileHash', 'archivedDocumentId')`,
    );
    for (const name of ["deliveredFileHash", "archivedDocumentId"]) {
      const c = cols.find((x) => x.column_name === name);
      check(`invoices.${name} is nullable text`, c?.data_type === "text" && c?.is_nullable === "YES");
    }
    const fk = await prisma.$queryRawUnsafe<any[]>(
      `SELECT confdeltype FROM pg_constraint WHERE conname = 'invoices_archivedDocumentId_fkey'`,
    );
    check("the archive foreign key refuses a delete (RESTRICT)", fk[0]?.confdeltype === "r", `confdeltype=${fk[0]?.confdeltype}`);
    const ux = await prisma.$queryRawUnsafe<any[]>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'invoices_archivedDocumentId_key'`,
    );
    check("archivedDocumentId carries a unique index", /UNIQUE/.test(ux[0]?.indexdef ?? ""));

    const [a, b] = await prisma.invoice.findMany({ take: 2, orderBy: { createdAt: "asc" }, select: { id: true, userId: true } });
    if (!a || !b) throw new Error("needs two seeded invoices: run the seed first");
    const doc = await prisma.document.create({
      data: { fileName: "proof.pdf", fileUrl: "invoices/archive/proof.pdf", fileType: "application/pdf", fileSize: 1, userId: a.userId, invoiceId: a.id, docType: "INVOICE" },
    });
    const hash = "3e12b2d342e67c8e2458ca7f6466062fea52f6453bcc19e72bc19a6ef80cdace";
    await prisma.invoice.update({ where: { id: a.id }, data: { deliveredFileHash: hash, archivedDocumentId: doc.id } });
    const back = await prisma.invoice.findUnique({ where: { id: a.id }, select: { deliveredFileHash: true, archivedDocument: { select: { id: true } } } });
    check("an invoice keeps the hash and reads its archive back through the relation", back?.deliveredFileHash === hash && back?.archivedDocument?.id === doc.id);

    let dupRefused = false;
    try { await prisma.invoice.update({ where: { id: b.id }, data: { archivedDocumentId: doc.id } }); } catch (e: any) { dupRefused = e?.code === "P2002"; }
    check("one stored file cannot be the archive of a second invoice", dupRefused);

    let deleteRefused = false;
    try { await prisma.document.delete({ where: { id: doc.id } }); } catch (e: any) { deleteRefused = e?.code === "P2003"; }
    const stillThere = !!(await prisma.document.findUnique({ where: { id: doc.id } }));
    check("the archived file cannot be deleted while an invoice names it", deleteRefused && stillThere);

    await prisma.invoice.update({ where: { id: a.id }, data: { deliveredFileHash: null, archivedDocumentId: null } });
    await prisma.document.delete({ where: { id: doc.id } });
    check("control: once unlinked, the same file deletes (the refusal was the foreign key)", !(await prisma.document.findUnique({ where: { id: doc.id } })));
  } finally {
    await prisma.$disconnect();
  }
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
