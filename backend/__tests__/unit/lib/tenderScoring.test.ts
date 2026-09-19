/**
 * One acceptance rule, three surfaces, and a guard that they read it.
 *
 * Lifecycle-gaps B3a (findings #6, #7). Behavioural cases pin the rule on the
 * cases the audit named; the drift guard reads schema.prisma so every
 * TenderStatus lands in exactly one bucket, and reads the three surfaces so
 * none of them keeps a private `status === "ACCEPTED"` again.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  summarizeTenders,
  isAcceptedTender,
  ACCEPTED_TENDER_STATES,
  UNJUDGED_TENDER_STATES,
} from "../../../src/lib/tenderScoring";

const BACKEND = path.join(__dirname, "../../..");

/** The enum as the schema declares it. */
function schemaEnum(name: string): string[] {
  const schema = fs.readFileSync(path.join(BACKEND, "prisma/schema.prisma"), "utf8");
  const m = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\}`));
  if (!m) throw new Error(`enum ${name} not in schema.prisma`);
  return m[1].split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "").trim()).filter((l) => /^[A-Z_]+$/.test(l));
}

const T = (...statuses: string[]) => statuses.map((status) => ({ status }));

describe("summarizeTenders — the rule", () => {
  it("#6: a carrier offered three loads who wins one and loses two to SRL withdrawals scores 100%, not 33%", () => {
    const s = summarizeTenders(T("ACCEPTED", "WITHDRAWN", "WITHDRAWN"));
    expect(s.judged).toBe(1);
    expect(s.acceptanceRate).toBe(100);
  });

  it("#7: a carrier who accepted and SIGNED — RC_SENT, CONFIRMED — is accepted; so is one released after accepting", () => {
    for (const st of ["ACCEPTED", "RC_SENT", "CONFIRMED", "RELEASED"]) {
      const s = summarizeTenders(T(st));
      expect(s.accepted, st).toBe(1);
      expect(s.acceptanceRate, st).toBe(100);
    }
    expect(summarizeTenders(T("RC_SENT", "CONFIRMED")).acceptedByStage).toEqual({ accepted: 0, rcSent: 1, confirmed: 1, released: 0 });
  });

  it("EXPIRED stays in the denominator (v3.8.awx): the carrier had the offer and the window", () => {
    const s = summarizeTenders(T("ACCEPTED", "EXPIRED"));
    expect(s.judged).toBe(2);
    expect(s.acceptanceRate).toBe(50);
  });

  it("DECLINED and COUNTERED are responses; a live OFFERED is pending, in the denominator, not a response", () => {
    const s = summarizeTenders(T("ACCEPTED", "DECLINED", "COUNTERED", "OFFERED"));
    expect(s.responded).toBe(3);
    expect(s.pending).toBe(1);
    expect(s.judged).toBe(4);
    expect(s.acceptanceRate).toBe(25);
    expect(s.acceptanceRateOfResponded).toBeCloseTo(33.33, 1);
  });

  it("null, never 0, when nothing was judged — a carrier nobody has tendered has no acceptance rate", () => {
    expect(summarizeTenders([]).acceptanceRate).toBeNull();
    expect(summarizeTenders(T("WITHDRAWN", "WITHDRAWN")).acceptanceRate).toBeNull();
    expect(summarizeTenders(T("EXPIRED")).acceptanceRateOfResponded).toBeNull();
  });

  it("the parts sum to total for every mix, including the signed and released stages", () => {
    const s = summarizeTenders(T("ACCEPTED", "RC_SENT", "CONFIRMED", "RELEASED", "DECLINED", "COUNTERED", "EXPIRED", "OFFERED", "WITHDRAWN", "WITHDRAWN"));
    expect(s.total).toBe(10);
    expect(s.accepted + s.declined + s.countered + s.expired + s.pending + s.withdrawn).toBe(s.total);
    expect(s.judged).toBe(8);
  });
});

describe("drift guard — the enum is partitioned, and the surfaces read the helper", () => {
  const enumStates = schemaEnum("TenderStatus");

  it("every TenderStatus the schema declares lands in exactly one bucket (vacuity tripwire on the enum read)", () => {
    expect(enumStates.length, "tripwire: schema enum read must be non-empty").toBeGreaterThanOrEqual(9);
    for (const st of enumStates) {
      const s = summarizeTenders(T(st));
      const buckets = [s.accepted, s.declined, s.countered, s.expired, s.pending, s.withdrawn];
      expect(buckets.reduce((a, b) => a + b, 0), `${st} must land in exactly one bucket`).toBe(1);
    }
  });

  it("the accepted and unjudged sets name only real enum members", () => {
    for (const st of [...ACCEPTED_TENDER_STATES, ...UNJUDGED_TENDER_STATES]) expect(enumStates, st).toContain(st);
    expect(isAcceptedTender("CONFIRMED")).toBe(true);
    expect(isAcceptedTender("WITHDRAWN")).toBe(false);
  });

  const SURFACES = [
    "src/services/integrationService.ts", // the persisted Compass factor
    "src/controllers/carrierController.ts", // the AE carriers list
    "src/routes/analytics.ts", // the tender funnel
  ];

  it("each of the three surfaces imports lib/tenderScoring", () => {
    for (const f of SURFACES) {
      const src = fs.readFileSync(path.join(BACKEND, f), "utf8");
      expect(src, `${f} must import the helper`).toMatch(/from "\.\.\/lib\/tenderScoring"/);
    }
  });

  it("no surface counts acceptance privately — `status === \"ACCEPTED\"` on a tender is gone from all three", () => {
    // Comments stripped so prose describing the old defect does not fail the guard.
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const f of SURFACES) {
      const src = strip(fs.readFileSync(path.join(BACKEND, f), "utf8"));
      const hits = src.match(/status === "ACCEPTED"/g) ?? [];
      expect(hits, `${f} keeps its own accepted count: ${hits.length} hit(s)`).toHaveLength(0);
    }
  });

  it("scanner self-test: the private-count pattern is still findable (vacuity tripwire)", () => {
    expect(`x.filter((t) => t.status === "ACCEPTED")`.match(/status === "ACCEPTED"/g)).toHaveLength(1);
  });
});
