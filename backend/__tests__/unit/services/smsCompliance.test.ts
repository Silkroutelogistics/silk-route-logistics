// STOP and HELP: the keyword table and the required reply content.
//
// The full round trip (webhook → opt-out row → choke point → zero later sends)
// needs a real database and lives in scripts/_arc20-stop-help-proof.ts. This is
// the CI-resident half: the pure classification, and the HELP reply's required
// elements, both of which are exactly the parts a carrier audit checks and the
// parts a future edit is most likely to break quietly.
//
// §13.3 Item 226.

import { describe, it, expect } from "vitest";
import {
  classifyInbound,
  HELP_RESPONSE,
  STOP_CONFIRMATION,
  STOP_KEYWORDS,
  HELP_KEYWORDS,
} from "../../../src/services/smsComplianceService";

describe("SMS opt-out keywords", () => {
  it("recognises every carrier-standard opt-out word", () => {
    for (const k of STOP_KEYWORDS) {
      expect(classifyInbound(k), `${k} must opt out`).toBe("STOP");
      expect(classifyInbound(k.toLowerCase()), `${k.toLowerCase()} must opt out`).toBe("STOP");
    }
  });

  it("forgives punctuation and spacing", () => {
    // "STOP." and "Stop all" are plainly opt-outs, and refusing them on a full
    // stop would be pedantry that costs a TCPA claim.
    for (const v of ["STOP.", "STOP!", "  stop  ", "Stop All", "STOP ALL", "un-subscribe"]) {
      expect(classifyInbound(v), `"${v}" must opt out`).toBe("STOP");
    }
  });

  it("does NOT opt out a driver who is merely using the word in a sentence", () => {
    // The defect the Arc 20 proof caught. A first-token match unsubscribed a
    // driver replying "stop by the gate when you get here" from the channel
    // they were actively using — worse than missing an opt-out, because it
    // severs a working conversation silently and tells neither side why.
    for (const v of [
      "stop by the gate when you get here",
      "help me find the dock",
      "cancel that last message, I'm loaded",
      "3 - in transit",
      "2",
    ]) {
      expect(classifyInbound(v), `"${v}" must NOT be treated as a keyword`).not.toBe("STOP");
    }
  });

  it("recognises HELP and INFO", () => {
    for (const k of HELP_KEYWORDS) {
      expect(classifyInbound(k)).toBe("HELP");
      expect(classifyInbound(k.toLowerCase())).toBe("HELP");
    }
  });

  it("treats an empty or symbol-only message as nothing", () => {
    for (const v of ["", "   ", "???", "👍"]) {
      expect(classifyInbound(v)).toBeNull();
    }
  });
});

describe("the required reply content", () => {
  // Carriers check a HELP response for four things. Losing any one of them in
  // a copy edit is invisible until an audit, so each is asserted by name.
  it("HELP identifies the sender", () => {
    expect(HELP_RESPONSE).toMatch(/Silk Route Logistics/);
    expect(HELP_RESPONSE).toMatch(/MC# 1794414/);
  });

  it("HELP says what the messages are", () => {
    expect(HELP_RESPONSE).toMatch(/check calls/i);
  });

  it("HELP gives a human contact", () => {
    expect(HELP_RESPONSE).toMatch(/operations@silkroutelogistics\.ai/);
    expect(HELP_RESPONSE).toMatch(/\(269\) 220-6760/);
  });

  it("HELP restates STOP and the rates disclosure", () => {
    expect(HELP_RESPONSE).toMatch(/Reply STOP to opt out/i);
    expect(HELP_RESPONSE).toMatch(/rates may apply/i);
  });

  it("the STOP confirmation says the load and pay are unaffected", () => {
    // A driver who opts out should not fear they have just cost themselves the
    // load. Saying so is both true and the reason opting out stays a real
    // choice rather than a theoretical one.
    expect(STOP_CONFIRMATION).toMatch(/unsubscribed/i);
    expect(STOP_CONFIRMATION).toMatch(/load and your pay are unaffected/i);
  });

  it("both replies fit a single SMS segment budget", () => {
    // Not cosmetic: a HELP reply split across three messages to a handset that
    // just asked what we are reads as more spam, and segment count is what a
    // carrier bills and throttles on.
    expect(STOP_CONFIRMATION.length).toBeLessThanOrEqual(320);
    expect(HELP_RESPONSE.length).toBeLessThanOrEqual(320);
  });
});
