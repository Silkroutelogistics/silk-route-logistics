/**
 * The cutoff §5 funds against is the cutoff the agreement STATES.
 *
 * §5 clause 3 decides same-day versus next-day Quick Pay on "Broker's business
 * hours". It used to defer to "Broker's PUBLISHED business hours" and the
 * agreement never published them — the only published statement was on /contact
 * and /carriers, which are not part of what a carrier signs. So a carrier
 * reading the signed instrument alone could not find the cutoff that decides
 * when they are paid. agreements.ts recorded that gap in a comment for months.
 *
 * The clause is now generated from lib/businessHours, and
 * integrationService.sameDayQuickPayDueDate enforces the cutoff from the same
 * constants. These cases hold those two together: the words and the code cannot
 * disagree, because there is only one source for both.
 */
import { describe, it, expect } from "vitest";
import { CARAVAN_QUICK_PAY_AGREEMENT } from "../../../src/data/agreements";
import {
  BUSINESS_OPEN_HOUR,
  BUSINESS_CLOSE_HOUR,
  BUSINESS_HOURS_SENTENCE,
  formatBusinessHour,
} from "../../../src/lib/businessHours";
import * as integrationService from "../../../src/services/integrationService";

const clause = (): string => {
  const s = CARAVAN_QUICK_PAY_AGREEMENT.sections.find((x) => x.heading.startsWith("5."));
  if (!s) throw new Error("§5 not found");
  const c = s.clauses.find((x) => x.includes("same business day"));
  if (!c) throw new Error("the same-day timing clause is gone from §5");
  return c;
};

describe("the Quick Pay same-day cutoff is stated in the agreement", () => {
  it("§5 states the hours rather than deferring to them", () => {
    const c = clause();
    expect(c, "the clause must name the window, not point at it").toContain(BUSINESS_HOURS_SENTENCE);
    expect(
      c,
      "the clause still defers to \u201cpublished business hours\u201d, which the " +
        "agreement does not publish — that is the gap this closed.",
    ).not.toContain("published business hours");
  });

  it("the stated hours are GENERATED, not transcribed", () => {
    // A transcribed sentence matches today's constants and stops matching the
    // moment either moves. Asserting against the formatter proves the linkage.
    expect(clause()).toContain(formatBusinessHour(BUSINESS_OPEN_HOUR));
    expect(clause()).toContain(formatBusinessHour(BUSINESS_CLOSE_HOUR));
    expect(BUSINESS_HOURS_SENTENCE).toBe(
      `${formatBusinessHour(BUSINESS_OPEN_HOUR)} to ${formatBusinessHour(BUSINESS_CLOSE_HOUR)} Eastern, Monday to Friday`,
    );
  });

  it("the enforcer reads the SAME constants the clause is generated from", () => {
    // integrationService re-exports them; if it ever grows its own copy, these
    // stop being one fact and the agreement can drift from what funds it.
    expect(integrationService.BUSINESS_OPEN_HOUR).toBe(BUSINESS_OPEN_HOUR);
    expect(integrationService.BUSINESS_CLOSE_HOUR).toBe(BUSINESS_CLOSE_HOUR);
  });

  it("the hours match CLAUDE.md §6 honest-hours copy", () => {
    // §6 is the canonical statement: Mon-Fri, 7:00 AM to 7:00 PM Eastern. If a
    // business decision moves the hours, §6, this constant and the agreement
    // move together or the document lies.
    expect(BUSINESS_OPEN_HOUR).toBe(7);
    expect(BUSINESS_CLOSE_HOUR).toBe(19);
    expect(BUSINESS_HOURS_SENTENCE).toBe("7:00 AM to 7:00 PM Eastern, Monday to Friday");
  });

  it("formatBusinessHour is not vacuous", () => {
    expect(formatBusinessHour(0)).toBe("12:00 AM");
    expect(formatBusinessHour(12)).toBe("12:00 PM");
    expect(formatBusinessHour(7)).toBe("7:00 AM");
    expect(formatBusinessHour(19)).toBe("7:00 PM");
  });
});
