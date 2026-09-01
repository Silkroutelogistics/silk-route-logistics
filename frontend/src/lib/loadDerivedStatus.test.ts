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
import { deriveLoadStatus, actionsFor, carrierTenderLabel, WIRED_ACTIONS } from "./loadDerivedStatus";

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

describe("what the carrier is told", () => {
  it("a lost race is 'Load covered', not 'withdrawn'", () => {
    // The whole point of splitting WITHDRAWN from DECLINED: the carrier did not
    // refuse anything and must not be shown language that says they did.
    expect(carrierTenderLabel("WITHDRAWN", "load_covered")).toBe("Load covered");
  });

  it("their own decline still reads as a decline", () => {
    expect(carrierTenderLabel("DECLINED", null)).toBe("You declined");
  });

  it("every withdraw reason has words of its own", () => {
    const reasons = ["load_covered", "counter_rejected", "load_cancelled", "position_skipped", "compliance_block"];
    const labels = reasons.map((r) => carrierTenderLabel("WITHDRAWN", r));
    expect(new Set(labels).size, "two reasons sharing a label is a reason nobody can act on").toBe(reasons.length);
    expect(labels.every((l) => !/withdraw/i.test(l))).toBe(true);
  });
});

describe("nothing bypasses the selector", () => {
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

  it("the surface list is not silently empty (vacuity tripwire)", () => {
    // A guard over files that have moved reports a clean tree forever.
    for (const rel of SURFACES) {
      const p = path.resolve(__dirname, "..", "..", rel);
      expect(fs.existsSync(p), `${rel} no longer exists — update SURFACES`).toBe(true);
      expect(fs.readFileSync(p, "utf8")).toContain("deriveLoadStatus");
    }
  });
});
