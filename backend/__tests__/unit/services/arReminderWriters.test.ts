/**
 * v3.8.blg — one writer for the reminder checklist, one place that records a
 * late payment.
 *
 * Three jobs wrote Invoice.reminderSent*. Only arCollectionsService emails, and
 * it skips any box already ticked, so the two that ticked without sending made
 * it skip most reminders while the invoice said they had gone. One of them also
 * recorded a late payment at 30 days overdue, and the payment path recorded
 * another when the bill was paid, so one late bill could count twice.
 *
 * Nothing here is visible until reminders are switched on, which is why it
 * needs a guard rather than a memory.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { findPrismaFieldWriters, walkTs } from "../../helpers/prismaWriterScan";
import { stripComments } from "../../helpers/stripComments";

const SRC = path.join(__dirname, "..", "..", "..", "src");
const SENDER = "services/arCollectionsService.ts";
const REMINDER_FIELDS = [
  "reminderSentPre7", "reminderSentDue", "reminderSent7", "reminderSent31",
  "reminderSent45", "reminderSent60", "reminderSent90", "lastReminderAt",
];

const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
const code = (f: string) => stripComments(fs.readFileSync(f, "utf8"));

// Read the tree once. Walking it per field ran this file past vitest's 5s
// limit (the source-walking class in §13.3 Item 273.7).
let sources: Map<string, string> | undefined;
function tree(): Map<string, string> {
  if (!sources) sources = new Map(walkTs(SRC).map((f) => [f, fs.readFileSync(f, "utf8")] as [string, string]));
  return sources;
}
const WALK_MS = 30_000;

describe("the reminder checklist has one writer", () => {
  it("no file but the sender writes a reminder field on an invoice", () => {
    const hits = REMINDER_FIELDS.flatMap((field) =>
      findPrismaFieldWriters({ model: "invoice", field, root: SRC, sources: tree() }).map((h) => ({ ...h, field })),
    );
    expect(hits.filter((h) => h.file !== SENDER).map((h) => `${h.file}:${h.line} ${h.field}`)).toEqual([]);
    // Positive control: the scanner still sees the sender's own write.
    expect(hits.some((h) => h.file === SENDER && h.field === "lastReminderAt")).toBe(true);
  }, WALK_MS);

  // The sender ticks its box through a computed key ([flagField]: true), which
  // no field scanner can see. A second writer would need the field name as a
  // quoted string, so that is what this looks for.
  it("no file but the sender names a reminder field as a string (the computed-key route)", () => {
    const quoted = /["'`]reminderSent\w*["'`]/;
    const offenders = [...tree().keys()].filter((f) => rel(f) !== SENDER && quoted.test(stripComments(tree().get(f)!))).map(rel);
    expect(offenders).toEqual([]);
    expect(quoted.test(code(path.join(SRC, SENDER)))).toBe(true);
  }, WALK_MS);

  it("the scanner catches a direct write and ignores the same text in a comment", () => {
    const root = path.resolve("/fixture");
    const sources = new Map([
      [path.join(root, "writes.ts"), "await prisma.invoice.updateMany({ where: { id: { in: ids } }, data: { reminderSent31: true } });"],
      [path.join(root, "comment.ts"), "// prisma.invoice.update({ data: { reminderSent31: true } })\nexport const x = 1;"],
    ]);
    const files = findPrismaFieldWriters({ model: "invoice", field: "reminderSent31", root, sources }).map((h) => h.file);
    expect(files).toEqual(["writes.ts"]);
  });

  it("the monthly box-ticking job stays retired", () => {
    for (const f of ["cron/index.ts", "services/cronRegistryService.ts"]) {
      expect(code(path.join(SRC, f)), f).not.toContain("monthly-invoice-reminders");
    }
  });
});

describe("a late payment is recorded in one place", () => {
  // Asserted per FILE. The scanner links a call's `data: updateData` to an
  // `updateData.latePayments = …` anywhere in the same file, so it also lists
  // integrationService's credit reversal on cancellation, which has its own
  // updateData and never writes this field. A writer in any other file still
  // fails; onInvoicePaidLateCount.test.ts holds the behaviour inside this one.
  it("only the payment path writes ShipperCredit.latePayments", () => {
    const files = findPrismaFieldWriters({ model: "shipperCredit", field: "latePayments", root: SRC, sources: tree() }).map((h) => h.file);
    expect(files.length).toBeGreaterThan(0);
    expect([...new Set(files)]).toEqual(["services/integrationService.ts"]);
  }, WALK_MS);
});
