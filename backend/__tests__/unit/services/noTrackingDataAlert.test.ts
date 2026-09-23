/**
 * R4 on the internal alert — a gap reported as a gap.
 *
 * The subject was "LATE ALERT: Shipment SHP-2026-009 - No movement in 13h".
 * It asserts two things SRL does not know: that the freight has not moved, and
 * for how long. What is known is that nobody filed a location report. The job
 * selects purely on a stale or absent lastLocationAt, so it has never had a
 * LATE branch — every alert it raised was this case under the other name.
 *
 * Three of these reached whaider@ on 2026-09-23 (4h, 9h, 13h). The growing
 * number made each one a new thread and read as an escalating incident when the
 * only thing escalating was the silence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("../../../src/services/emailService", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  sendNoTrackingDataEmail: vi.fn().mockResolvedValue(undefined),
  sendPreTracingEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordExpiryReminder: vi.fn().mockResolvedValue(undefined),
  settingsPathForRole: vi.fn().mockReturnValue("/dashboard/settings"),
}));

const BACKEND = path.resolve(__dirname, "../../..");
const scheduler = fs.readFileSync(path.join(BACKEND, "src/services/schedulerService.ts"), "utf8");
const email = fs.readFileSync(path.join(BACKEND, "src/services/emailService.ts"), "utf8");

/**
 * Comments stripped before asserting. The doc block above sendNoTrackingDataEmail
 * QUOTES the old subject to explain why it went, so a bare search finds the
 * string in prose and fails against correct code — §19 Sub-pattern 17, and it
 * did fail exactly that way here before this stripper existed.
 */
function code(src: string): string {
  // Line-based on purpose: a comment-stripping REGEX is the thing this arc kept
  // getting wrong (escapes eaten on the way into a shell, §19 Sub-pattern 22).
  // Every comment in these two files is either a whole line or a trailing //.
  return src
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*"));
    })
    .join("\n");
}
const emailCode = code(email);
const schedulerCode = code(scheduler);

describe("the subject no longer claims the freight stopped", () => {
  it('"LATE ALERT" and "No movement in Nh" are gone', () => {
    expect(emailCode, "vacuity: the sender is still here").toContain("sendNoTrackingDataEmail");
    expect(emailCode).not.toContain("LATE ALERT: Shipment");
    expect(emailCode).not.toContain("No movement in");
  });

  it("the subject names the gap and carries no hour count", () => {
    const subject = email.slice(email.indexOf("TRACKING GAP"), email.indexOf("TRACKING GAP") + 90);
    expect(subject).toContain("no location report");
    expect(subject).not.toContain("hoursSinceUpdate");
  });

  it("the body says plainly that this is not a confirmed delay", () => {
    expect(email).toContain("not a confirmed delay");
  });

  it("a never-reported shipment is described as such, not as 999 hours", () => {
    // runLateDetection passes 999 as its sentinel for a null lastLocationAt.
    expect(email).toContain("hoursSinceUpdate >= 900");
    expect(email).toContain("No location has ever been reported");
  });
});

describe("the job reports it once per 12 hours", () => {
  it("the 4-hour lookback is gone", () => {
    const block = scheduler.slice(
      scheduler.indexOf("R4 — once per shipment per 12 hours"),
      scheduler.indexOf("if (dedup) continue;"),
    );
    expect(block.length, "vacuity: the dedup block was found").toBeGreaterThan(100);
    expect(block).toContain("now.getTime() - 12 * 60 * 60 * 1000");
    expect(block).not.toContain("createdAt: { gte: fourHoursAgo }");
  });

  it("the 4h constant still governs WHICH shipments are stale — a different question", () => {
    // 4h is the staleness threshold for selecting a shipment at all. Only the
    // dedup window moved; conflating the two would change what is detected.
    expect(scheduler).toContain("const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000)");
    expect(scheduler).toContain("lastLocationAt: { lt: fourHoursAgo }");
  });

  it("the dedup key matches the title the job writes", () => {
    expect(scheduler).toContain('title: { contains: "No Location Report" }');
    expect(scheduler).toContain("title: `No Location Report: ${shipment.shipmentNumber}`");
  });
});
