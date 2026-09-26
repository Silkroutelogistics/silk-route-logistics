/**
 * void-test-invoices (D1-D5 directive, item 4).
 *
 * The property that matters most is the one a literal reading of "clear the
 * reminder flags" would break: a reminderSent* flag set to FALSE is what makes
 * an AR job send that reminder, so a void must leave every flag TRUE.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { planVoid, voidData, REMINDER_FLAGS, VOID_REASON } from "../../../scripts/void-test-invoices";

const row = (id: string, status: string) => ({ id, invoiceNumber: `INV-${id}`, status });

describe("void-test-invoices plan", () => {
  it("voids an unpaid invoice by id and records where it came from", () => {
    expect(planVoid(["1001"], [row("1001", "OVERDUE")])).toEqual([
      { id: "1001", action: "VOID", invoiceNumber: "INV-1001", from: "OVERDUE" },
    ]);
  });

  it("refuses an id it cannot find and a PAID invoice; skips one already VOID", () => {
    const steps = planVoid(["x", "p", "v"], [row("p", "PAID"), row("v", "VOID")]);
    expect(steps.map((s) => s.action)).toEqual(["REFUSE", "REFUSE", "SKIP"]);
  });

  it("acts only on the ids it was given", () => {
    const steps = planVoid(["1001"], [row("1001", "OVERDUE"), row("1002", "OVERDUE"), row("1003", "SENT")]);
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe("1001");
  });
});

describe("void-test-invoices update", () => {
  it("sets VOID with the test-entry reason first in the notes", () => {
    const d = voidData("prior note");
    expect(d.status).toBe("VOID");
    expect(VOID_REASON).toBe("test entry");
    expect(d.notes).toBe("VOIDED: test entry\nprior note");
  });

  it("leaves every reminder flag TRUE, so no AR job can send another", () => {
    const d = voidData(null) as Record<string, unknown>;
    expect(REMINDER_FLAGS).toHaveLength(7);
    for (const f of REMINDER_FLAGS) expect(d[f], f).toBe(true);
  });

  it("covers every reminderSent* column on the Invoice model", () => {
    const schema = readFileSync(join(__dirname, "../../../prisma/schema.prisma"), "utf8");
    const start = schema.indexOf("model Invoice {");
    const model = schema.slice(start, schema.indexOf("\n}", start));
    const columns = model.match(/reminderSent\w+/g) ?? [];
    expect(columns.length).toBeGreaterThan(0);
    expect(new Set(columns)).toEqual(new Set(REMINDER_FLAGS));
  });
});
