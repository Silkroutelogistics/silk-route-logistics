/**
 * v3.8.bmi — ruling 2026-09-27: "Overdue is set only by the hourly aging job,
 * on the due date, for every customer including Tipalti."
 *
 * Held here: when a due date has passed (the Eastern calendar day after the
 * due day), and what the job does with that — an invoice due today stays as it
 * is, and a Tipalti invoice past due turns OVERDUE like any other.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { pastDueCutoff, markPastDueInvoicesOverdue, OVERDUE_FROM } from "../../../src/services/invoiceAging";

const mockPrisma = prisma as any;

// Production shape: Beekeepers' four invoices are stored due 2026-10-25T00:00:00.000Z.
const DUE_OCT25 = new Date("2026-10-25T00:00:00.000Z");
const passed = (due: Date, now: string) => due < pastDueCutoff(new Date(now));

describe("a due date has passed once its day is over in Eastern time", () => {
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

  it("a due date carrying a time of day is judged by its day, not its hour", () => {
    const due = new Date("2026-10-27T14:32:00.000Z"); // generated invoices keep their creation time
    expect(passed(due, "2026-10-27T20:00:00.000Z")).toBe(false); // the old rule: overdue since 14:32
    expect(passed(due, "2026-10-28T04:00:00.000Z")).toBe(true);
  });
});

interface Row { id: string; status: string; dueDate: Date | null; channel: "EMAIL" | "TIPALTI" }
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

  it("a Tipalti invoice past due shows overdue in aging", async () => {
    rows = [{ id: "bkn", status: "SENT", dueDate: DUE_OCT25, channel: "TIPALTI" }];
    expect(await markPastDueInvoicesOverdue(new Date("2026-10-26T04:00:00.000Z"))).toBe(1);
    expect(rows[0].status).toBe("OVERDUE");
  });

  it("moves only the statuses it always moved, and never one with no due date", async () => {
    // The inline query this replaces moved exactly these five. PARTIAL is not
    // among them: whether it should be is an open decision (v3.8.bmh).
    expect(OVERDUE_FROM).toEqual(["SENT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED"]);
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
