/**
 * The communication rule, and a guard that its vocabulary is the code's.
 *
 * Lifecycle-gaps B3b (finding #8). The vocabulary is not a Prisma enum —
 * CheckCallSchedule.status is a String with a comment-as-enumeration in
 * schema.prisma, and the code writes one value (CANCELLED) the comment does
 * not list. So the guard reads BOTH: every value the schema comment names and
 * every literal the writers actually write must be classified, and the two
 * classification sets must partition the vocabulary.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  summarizeCheckCalls,
  JUDGED_CHECK_CALL_STATES,
  UNJUDGED_CHECK_CALL_STATES,
  ANSWERED_CHECK_CALL_STATES,
} from "../../../src/lib/communicationScoring";

const BACKEND = path.join(__dirname, "../../..");
const R = (...statuses: string[]) => statuses.map((status) => ({ status }));

describe("summarizeCheckCalls — the rule", () => {
  it("#8: CANCELLED calls never fell due and leave the denominator", () => {
    const s = summarizeCheckCalls(R("RESPONDED", "CANCELLED", "CANCELLED"));
    expect(s.judged).toBe(1);
    expect(s.cancelled).toBe(2);
    expect(s.score).toBe(100);
  });

  it("PENDING and SENT are open, not unanswered", () => {
    const s = summarizeCheckCalls(R("RESPONDED", "PENDING", "SENT"));
    expect(s.open).toBe(2);
    expect(s.judged).toBe(1);
    expect(s.score).toBe(100);
  });

  it("ESCALATED — the second miss — is judged and unanswered; so is the documented MISSED", () => {
    expect(summarizeCheckCalls(R("RESPONDED", "ESCALATED")).score).toBe(50);
    expect(summarizeCheckCalls(R("RESPONDED", "MISSED", "ESCALATED")).score).toBeCloseTo(33.33, 1);
  });

  it("null, never 0, when nothing was judged", () => {
    expect(summarizeCheckCalls([]).score).toBeNull();
    expect(summarizeCheckCalls(R("CANCELLED", "PENDING", "SENT")).score).toBeNull();
  });
});

describe("vocabulary guard — the classification covers what the schema documents and what the code writes", () => {
  it("the judged and unjudged sets partition, and answered ⊆ judged", () => {
    const overlap = JUDGED_CHECK_CALL_STATES.filter((s) => UNJUDGED_CHECK_CALL_STATES.includes(s));
    expect(overlap).toEqual([]);
    for (const s of ANSWERED_CHECK_CALL_STATES) expect(JUDGED_CHECK_CALL_STATES).toContain(s);
  });

  it("every value the schema comment lists for CheckCallSchedule.status is classified", () => {
    const schema = fs.readFileSync(path.join(BACKEND, "prisma/schema.prisma"), "utf8");
    const model = schema.match(/model CheckCallSchedule \{([\s\S]*?)\n\}/);
    if (!model) throw new Error("CheckCallSchedule model not found");
    const line = model[1].split(/\r?\n/).find((l) => /^\s*status\s+String/.test(l)) ?? "";
    const documented = (line.split("//")[1] ?? "").split(",").map((s) => s.trim()).filter((s) => /^[A-Z_]+$/.test(s));
    expect(documented.length, "tripwire: the schema comment must enumerate the statuses").toBeGreaterThanOrEqual(4);
    const all = [...JUDGED_CHECK_CALL_STATES, ...UNJUDGED_CHECK_CALL_STATES];
    for (const s of documented) expect(all, `schema documents ${s}`).toContain(s);
  });

  it("every status literal the writers actually write is classified — CANCELLED is written and undocumented", () => {
    // The writer files, read as text. A `status: "X"` inside a checkCallSchedule
    // write is the vocabulary as it exists; the schema comment lags it.
    const writers = [
      "src/services/checkCallAutomation.ts",
      "src/routes/loadTracking.ts",
      "src/services/integrationService.ts",
      "src/services/trackTraceAlertEngine.ts",
    ];
    const found = new Set<string>();
    for (const f of writers) {
      const src = fs.readFileSync(path.join(BACKEND, f), "utf8");
      // Only blocks that address checkCallSchedule, so other models' statuses
      // in the same file (Load.status, Notification.type) are not mistaken
      // for this vocabulary.
      for (const block of src.split(/prisma\.checkCallSchedule\./).slice(1)) {
        const end = block.indexOf("})"); // the call's own argument object; past it is the next statement
        const head = end === -1 ? block.slice(0, 400) : block.slice(0, end);
        for (const m of head.matchAll(/status: "([A-Z_]+)"/g)) found.add(m[1]);
      }
    }
    expect(found.has("CANCELLED"), "tripwire: the cancellation writer must be seen").toBe(true);
    expect(found.has("RESPONDED"), "tripwire: the response writer must be seen").toBe(true);
    const all = [...JUDGED_CHECK_CALL_STATES, ...UNJUDGED_CHECK_CALL_STATES];
    for (const s of found) expect(all, `code writes ${s}`).toContain(s);
  });
});
