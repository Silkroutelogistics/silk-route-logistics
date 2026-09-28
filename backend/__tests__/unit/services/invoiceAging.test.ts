/**
 * v3.8.bmi — ruling 2026-09-27: "Overdue is set only by the hourly aging job,
 * on the due date, for every customer including Tipalti."
 *
 * Held here: when a due date has passed (the day after the due day, on the
 * America/Toronto clock, ruling 2026-09-27), and what the job does with that — an invoice due today stays as it
 * is, and a Tipalti invoice past due turns OVERDUE like any other.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { markPastDueInvoicesOverdue } from "../../../src/services/invoiceAging";
import { OVERDUE_FROM, pastDueCutoff } from "../../../../shared/constants/invoiceDueDay";

const mockPrisma = prisma as any;

// Production shape: Beekeepers' four invoices are stored due 2026-10-25T00:00:00.000Z.
const DUE_OCT25 = new Date("2026-10-25T00:00:00.000Z");
const passed = (due: Date, now: string) => due < pastDueCutoff(new Date(now));

describe("a due date has passed once its day is over on the Toronto clock", () => {
  it("an invoice due Oct 25 is not overdue at 8:30 PM or 11:59 PM Eastern on Oct 25", () => {
    expect(passed(DUE_OCT25, "2026-10-26T00:30:00.000Z")).toBe(false); // the old rule's first overdue hour was Oct 24, 8 PM
    expect(passed(DUE_OCT25, "2026-10-26T03:59:59.000Z")).toBe(false);
  });

  it("it is overdue from midnight Eastern on Oct 26", () => {
    expect(passed(DUE_OCT25, "2026-10-26T04:00:00.000Z")).toBe(true);
  });

  it("on standard time the boundary follows the clock, at 05:00 UTC", () => {
    const due = new Date("2026-11-10T00:00:00.000Z");
    expect(passed(due, "2026-11-11T04:59:59.000Z")).toBe(false);
    expect(passed(due, "2026-11-11T05:00:00.000Z")).toBe(true);
  });

  // Toronto and New York share a clock today, so no 2026 date can show which
  // one the code reads. January 1974 can: the US was on emergency daylight
  // time (UTC-4) while Toronto stayed on standard time (UTC-5). At 04:30 UTC
  // on Jan 10 it was already Jan 10 in New York and still Jan 9 in Toronto.
  it("the clock is America/Toronto, not America/New_York", () => {
    const due = new Date("1974-01-09T00:00:00.000Z");
    expect(passed(due, "1974-01-10T04:30:00.000Z")).toBe(false); // on New York's clock this was already overdue
    expect(passed(due, "1974-01-10T05:00:00.000Z")).toBe(true);
  });

  it("a due date carrying a time of day is judged by its day, not its hour", () => {
    const due = new Date("2026-10-27T14:32:00.000Z"); // generated invoices keep their creation time
    expect(passed(due, "2026-10-27T20:00:00.000Z")).toBe(false); // the old rule: overdue since 14:32
    expect(passed(due, "2026-10-28T04:00:00.000Z")).toBe(true);
  });
});

interface Row { id: string; status: string; dueDate: Date | null; channel: "EMAIL" | "TIPALTI"; paidAmount?: number }
let rows: Row[];

/**
 * Answers the job's WHERE against rows, and throws on any filter it does not
 * know. A filter added to the job (one that left Tipalti out, say) fails here
 * instead of quietly narrowing who turns overdue.
 */
function matches(r: Row, where: any): boolean {
  const known = ["status", "dueDate"];
  for (const k of Object.keys(where)) if (!known.includes(k)) throw new Error(`unexpected filter in the aging job: ${k}`);
  if (Object.keys(where.status).join() !== "in") throw new Error("unexpected status filter");
  if (Object.keys(where.dueDate).join() !== "lt") throw new Error("unexpected dueDate filter");
  return where.status.in.includes(r.status) && r.dueDate !== null && r.dueDate < where.dueDate.lt;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.invoice.updateMany.mockImplementation(async ({ where, data }: any) => {
    const hit = rows.filter((r) => matches(r, where));
    for (const r of hit) Object.assign(r, data);
    return { count: hit.length };
  });
});

describe("markPastDueInvoicesOverdue — the hourly aging job", () => {
  it("an invoice due today is not overdue before its due date passes", async () => {
    rows = [{ id: "due-today", status: "SENT", dueDate: DUE_OCT25, channel: "EMAIL" }];
    expect(await markPastDueInvoicesOverdue(new Date("2026-10-26T00:30:00.000Z"))).toBe(0);
    expect(rows[0].status).toBe("SENT");
  });

  it("the job judges the due day on the Toronto clock", async () => {
    rows = [{ id: "jan9", status: "SENT", dueDate: new Date("1974-01-09T00:00:00.000Z"), channel: "EMAIL" }];
    expect(await markPastDueInvoicesOverdue(new Date("1974-01-10T04:30:00.000Z"))).toBe(0);
    expect(await markPastDueInvoicesOverdue(new Date("1974-01-10T05:00:00.000Z"))).toBe(1);
    expect(rows[0].status).toBe("OVERDUE");
  });

  it("a Tipalti invoice past due shows overdue in aging", async () => {
    rows = [{ id: "bkn", status: "SENT", dueDate: DUE_OCT25, channel: "TIPALTI" }];
    expect(await markPastDueInvoicesOverdue(new Date("2026-10-26T04:00:00.000Z"))).toBe(1);
    expect(rows[0].status).toBe("OVERDUE");
  });

  it("a partly paid invoice past its due date turns OVERDUE and keeps what was paid", async () => {
    // Ruling 2026-09-27, 2. The job writes the status and nothing else, so the
    // paid amount survives and the balance ($400 here) is still what shows.
    rows = [{ id: "part", status: "PARTIAL", dueDate: DUE_OCT25, channel: "EMAIL", paidAmount: 600 }];
    expect(await markPastDueInvoicesOverdue(new Date("2026-10-26T00:30:00.000Z"))).toBe(0); // its due day is not over
    expect(rows[0].status).toBe("PARTIAL");
    expect(await markPastDueInvoicesOverdue(new Date("2026-10-26T04:00:00.000Z"))).toBe(1);
    expect(rows[0]).toEqual({ id: "part", status: "OVERDUE", dueDate: DUE_OCT25, channel: "EMAIL", paidAmount: 600 });
  });

  it("moves exactly the issued, unsettled statuses, and never one with no due date", async () => {
    // The five the inline query moved, and PARTIAL since v3.8.bna.
    expect(OVERDUE_FROM).toEqual(["SENT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED", "PARTIAL"]);
    rows = [
      ...OVERDUE_FROM.map((s) => ({ id: s, status: s, dueDate: DUE_OCT25, channel: "EMAIL" as const })),
      { id: "paid", status: "PAID", dueDate: DUE_OCT25, channel: "EMAIL" },
      { id: "draft", status: "DRAFT", dueDate: DUE_OCT25, channel: "EMAIL" },
      { id: "void", status: "VOID", dueDate: DUE_OCT25, channel: "EMAIL" },
      { id: "no-due", status: "SENT", dueDate: null, channel: "EMAIL" },
    ];
    expect(await markPastDueInvoicesOverdue(new Date("2026-11-01T12:00:00.000Z"))).toBe(OVERDUE_FROM.length);
    expect(rows.filter((r) => r.status === "OVERDUE").map((r) => r.id).sort()).toEqual([...OVERDUE_FROM].sort());
  });
});
