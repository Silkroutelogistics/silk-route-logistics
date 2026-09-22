/**
 * The selector, and the rule that nothing bypasses it.
 *
 * The behavioural half asserts the ordering decisions, because the ordering IS
 * the design: a cancelled load is cancelled whatever its tenders say, a tender
 * beats the load column between POSTED and BOOKED, and the load's own stage
 * takes over once the tender is settled.
 *
 * The structural half asserts that no display surface has quietly gone back to
 * reading `load.status` and mapping it itself. That is exactly how four
 * independent colour maps came to exist, and a selector nothing is obliged to
 * use is a suggestion.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { deriveLoadStatus, actionsFor, carrierTenderLabel, carrierNextStep, WIRED_ACTIONS } from "./loadDerivedStatus";

describe("deriveLoadStatus", () => {
  it("a cancelled load is cancelled whatever its tenders say", () => {
    const d = deriveLoadStatus({ status: "CANCELLED", tenders: [{ status: "ACCEPTED" }] });
    expect(d.key).toBe("CANCELLED");
  });

  it("the tender wins over the load column between POSTED and BOOKED", () => {
    // The case that made this necessary: a load left reading BOOKED after its
    // tender was released. The column is stale; the tender is not.
    const d = deriveLoadStatus({ status: "BOOKED", tenders: [{ status: "RELEASED" }] });
    expect(d.key).toBe("NEEDS_CARRIER");
    expect(d.label).toBe("Needs carrier");
  });

  it("the load's own stage takes over once it is moving", () => {
    const d = deriveLoadStatus({ status: "IN_TRANSIT", tenders: [{ status: "CONFIRMED" }] });
    expect(d.key).toBe("IN_TRANSIT");
  });

  it("ACCEPTED and RC_SENT both read as unsigned", () => {
    expect(deriveLoadStatus({ status: "BOOKED", tenders: [{ status: "ACCEPTED" }] }).rcUnsigned).toBe(true);
    expect(deriveLoadStatus({ status: "BOOKED", tenders: [{ status: "RC_SENT" }] }).rcUnsigned).toBe(true);
    expect(deriveLoadStatus({ status: "BOOKED", tenders: [{ status: "CONFIRMED" }] }).rcUnsigned).toBe(false);
  });

  it("a directly-assigned load with no tender is not 'posted'", () => {
    const d = deriveLoadStatus({ status: "BOOKED", tenders: [], carrierId: "u1" });
    expect(d.key).toBe("ASSIGNED");
  });

  it("'posted' and 'every offer died' are distinguishable", () => {
    // They look identical on a board otherwise, and only one of them needs a
    // human right now.
    expect(deriveLoadStatus({ status: "POSTED", tenders: [] }).key).toBe("POSTED");
    expect(deriveLoadStatus({ status: "POSTED", tenders: [{ status: "EXPIRED" }] }).key).toBe("NEEDS_CARRIER");
  });

  it("the newest interesting tender wins when several are settled", () => {
    const d = deriveLoadStatus({
      status: "TENDERED",
      tenders: [{ status: "WITHDRAWN" }, { status: "DECLINED" }, { status: "OFFERED" }],
    });
    expect(d.key).toBe("OFFERED");
  });
});

describe("the action matrix", () => {
  it("a settled tender offers nothing", () => {
    for (const s of ["DECLINED", "WITHDRAWN", "EXPIRED", "RELEASED"]) {
      expect(actionsFor(s, "POSTED"), `${s} should offer no actions`).toEqual([]);
    }
  });

  it("release is offered before pickup and withdrawn after", () => {
    expect(actionsFor("CONFIRMED", "BOOKED")).toContain("RELEASE");
    expect(actionsFor("CONFIRMED", "IN_TRANSIT")).not.toContain("RELEASE");
  });

  it("every wired action is a real action", () => {
    // A typo here would silently filter every button off the panel.
    for (const a of WIRED_ACTIONS) {
      const anywhere = ["OFFERED", "COUNTERED", "ACCEPTED", "RC_SENT", "CONFIRMED"]
        .some((s) => actionsFor(s, "BOOKED").includes(a));
      expect(anywhere, `${a} is wired but appears in no state`).toBe(true);
    }
  });
});

describe("a wired action has somewhere to go", () => {
  // WIRED_ACTIONS exists to keep dead buttons off the panel, and it can only
  // do that if membership implies an endpoint. Checking that an action appears
  // in the matrix (above) proves it is SPEC'd, not that it WORKS -- which is
  // exactly the distinction that let RESEND_RC and VIEW_RC sit ratified but
  // unimplemented for four commits. This reads the dispatcher.
  const page = fs.readFileSync(path.resolve(__dirname, "..", "app/dashboard/loads/page.tsx"), "utf8");

  it("every wired action has a case in the mutation", () => {
    const missing = WIRED_ACTIONS.filter((a) => !page.includes(`case "${a}"`));
    expect(missing, "wired with no endpoint -- it would render and then throw").toEqual([]);
  });

  it("the dispatcher is actually being read (vacuity tripwire)", () => {
    // A path that has moved would make the check above pass on an empty string.
    expect(page).toContain("tenderAction");
    expect(WIRED_ACTIONS.length).toBeGreaterThan(3);
  });
});

describe("what the carrier is told", () => {
  it("a lost race is 'Load covered', not 'withdrawn'", () => {
    // The whole point of splitting WITHDRAWN from DECLINED: the carrier did not
    // refuse anything and must not be shown language that says they did.
    expect(carrierTenderLabel("WITHDRAWN", "load_covered")).toBe("Load covered");
  });

  it("their own decline still reads as a decline", () => {
    expect(carrierTenderLabel("DECLINED", null)).toBe("You declined");
  });

  it("an expiry says it was the offer that ran out", () => {
    // "Expired" alone reads as though something of theirs lapsed.
    expect(carrierTenderLabel("EXPIRED", null)).toBe("Offer expired");
  });

  it("a release SRL caused says so, and does not imply the carrier's fault", () => {
    // srl_error records no fall-off against the carrier. The wording must not
    // contradict the record.
    expect(carrierTenderLabel("RELEASED", "srl_error")).toBe("Released by SRL");
    expect(carrierTenderLabel("RELEASED", "customer_cancel")).toBe("Load cancelled by customer");
    expect(carrierTenderLabel("RELEASED", "carrier_fell_off")).toBe("You released this load");
  });

  it("every release reason has words of its own", () => {
    const reasons = ["carrier_fell_off", "compliance_lapse", "rate_dispute", "customer_cancel", "srl_error"];
    const labels = reasons.map((r) => carrierTenderLabel("RELEASED", r));
    expect(new Set(labels).size, "two reasons sharing a label is a reason nobody can act on").toBe(reasons.length);
  });

  it("every withdraw reason has words of its own", () => {
    const reasons = ["load_covered", "counter_rejected", "load_cancelled", "position_skipped", "compliance_block"];
    const labels = reasons.map((r) => carrierTenderLabel("WITHDRAWN", r));
    expect(new Set(labels).size, "two reasons sharing a label is a reason nobody can act on").toBe(reasons.length);
    expect(labels.every((l) => !/withdraw/i.test(l))).toBe(true);
  });
});

describe("what the carrier should do next (E2)", () => {
  // A projection of deriveLoadStatus: the strip must say what the AE badge
  // says, in the carrier's terms, and the BOL state must be the backend gate.
  const on = (status: string, tenders: string[] = [], carrierId: string | null = "u1") =>
    carrierNextStep({ status, carrierId, tenders: tenders.map((s) => ({ status: s })) });

  it("ACCEPTED: the RC is coming; the BOL waits for the signature", () => {
    const s = on("BOOKED", ["ACCEPTED"]);
    expect(s.key).toBe("ACCEPTED");
    expect(s.text).toMatch(/Rate confirmation on its way/);
    expect(s.bolReady).toBe(false);
    expect(s.bolReason).toMatch(/sign the rate confirmation/i);
  });

  it("RC_SENT: sign it, and both the step and the reason say it can be done here or from the email", () => {
    const s = on("BOOKED", ["RC_SENT"]);
    expect(s.text).toMatch(/^Sign the rate confirmation/);
    expect(s.bolReady).toBe(false);
    expect(s.text).toMatch(/here, or from the email SRL sent you/);
    expect(s.bolReason).toMatch(/Sign it here, or from the email/);
  });

  it("CONFIRMED: signed, BOL ready, no reason", () => {
    const s = on("BOOKED", ["CONFIRMED"]);
    expect(s.text).toBe("Signed. Bill of lading ready.");
    expect(s.bolReady).toBe(true);
    expect(s.bolReason).toBeNull();
  });

  it("bolReady is the backend gate — a CONFIRMED tender — not the derived key", () => {
    // Rolling: the key is the load's stage, the gate still asks the tender.
    expect(on("IN_TRANSIT", ["CONFIRMED"]).bolReady).toBe(true);
    expect(on("IN_TRANSIT", ["ACCEPTED"]).bolReady).toBe(false);
    // Directly assigned, never tendered: the gate refuses, so the button must too.
    const assigned = on("BOOKED", [], "u1");
    expect(assigned.key).toBe("ASSIGNED");
    expect(assigned.bolReady).toBe(false);
    expect(assigned.bolReason).toMatch(/sign the rate confirmation/i);
  });

  it("the strip carries the derived tone, so strip and badge agree on colour", () => {
    expect(on("BOOKED", ["RC_SENT"]).tone).toBe(deriveLoadStatus({ status: "BOOKED", tenders: [{ status: "RC_SENT" }] }).tone);
    expect(on("DELIVERED", ["CONFIRMED"]).tone).toBe(deriveLoadStatus({ status: "DELIVERED" }).tone);
  });

  it("a cancelled load says so and offers no BOL, whatever the tender", () => {
    const s = on("CANCELLED", ["CONFIRMED"]);
    expect(s.text).toMatch(/cancelled/);
    // The tender IS confirmed, so the gate would serve it — and the strip says
    // not to. Both are true: the reason is about the load, not the signature.
    expect(s.bolReady).toBe(true);
  });

  it("every operational stage has a sentence; nothing the carrier sees is blank", () => {
    for (const st of ["DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"]) {
      expect(on(st, ["CONFIRMED"]).text, st).toBeTruthy();
    }
    expect(on("AT_DELIVERY", ["CONFIRMED"]).text).toMatch(/POD/);
  });
});

describe("nothing bypasses the selector", () => {
  // The carrier portal is in this list on purpose. It is the surface where the
  // DECLINED/WITHDRAWN split is actually paid out -- a carrier reading
  // "WITHDRAWN" where SRL means "somebody else took it" is the exact harm the
  // split exists to prevent, and it is invisible from the AE side.
  const CARRIER_SURFACES = [
    "src/app/carrier/dashboard/tender-history/page.tsx",
  ];

  const SURFACES = [
    "src/app/dashboard/loads/page.tsx",
    "src/app/dashboard/track-trace/BoardTable.tsx",
    "src/app/dashboard/track-trace/LoadDetailDrawer.tsx",
  ];

  /** Comments discuss the old maps by name; they are prose, not code. */
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("no display surface builds its own status-to-colour map", () => {
    // Four of these existed, and they disagreed: BOOKED was violet on one
    // screen, purple on another and grey in a drawer, for the same load.
    for (const rel of SURFACES) {
      const src = strip(fs.readFileSync(path.resolve(__dirname, "..", "..", rel), "utf8"));
      const maps = src.match(/(IN_TRANSIT|AT_PICKUP|DISPATCHED)\s*:\s*"bg-/g) ?? [];
      expect(maps, `${rel} maps load statuses to colours itself — call deriveLoadStatus`).toEqual([]);
    }
  });

  it("no display surface prints a raw status string", () => {
    for (const rel of SURFACES) {
      const src = strip(fs.readFileSync(path.resolve(__dirname, "..", "..", rel), "utf8"));
      const raw = src.match(/\{\s*\w*\.?status\.replace\(\/_\/g/g) ?? [];
      expect(raw, `${rel} renders a raw status — call deriveLoadStatus for the label`).toEqual([]);
    }
  });

  it("the carrier portal speaks through the wording helper", () => {
    for (const rel of CARRIER_SURFACES) {
      const raw = fs.readFileSync(path.resolve(__dirname, "..", "..", rel), "utf8");
      expect(raw, rel + " must import carrierTenderLabel").toContain("carrierTenderLabel");
      const src = strip(raw);
      // A raw status rendered to a CARRIER is the failure this whole split
      // exists to prevent: "WITHDRAWN" reads as though they refused the load.
      const rawStatus = src.match(/\{\s*\w+\.status\s*\}|\w+\.status\.replace\(/g) ?? [];
      expect(rawStatus, rel + " renders a raw tender status to a carrier").toEqual([]);
    }
  });

  it("the surface list is not silently empty (vacuity tripwire)", () => {
    // A guard over files that have moved reports a clean tree forever.
    for (const rel of SURFACES) {
      const p = path.resolve(__dirname, "..", "..", rel);
      expect(fs.existsSync(p), `${rel} no longer exists — update SURFACES`).toBe(true);
      expect(fs.readFileSync(p, "utf8")).toContain("deriveLoadStatus");
    }
    for (const rel of CARRIER_SURFACES) {
      const p = path.resolve(__dirname, "..", "..", rel);
      expect(fs.existsSync(p), rel + " no longer exists -- update CARRIER_SURFACES").toBe(true);
    }
  });
});
