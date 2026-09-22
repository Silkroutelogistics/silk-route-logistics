/**
 * Needs Attention, reason 5 (Task E AE, 2026-09-22): an ACCEPTED tender whose
 * rate confirmation has sat in DRAFT longer than RC_SEND_SLA_HOURS. The RC is
 * drafted at accept on every path and sending it is the AE's move, so an
 * accepted load with nothing sent is a carrier waiting for a document that
 * exists -- and reason 2's clock starts at RC_SENT, so it could not see this.
 *
 * Prisma is the shared mock; loadTender.findMany answers by the status it is
 * asked for, so each reason's query is observable on its own. "now" is pinned
 * with fake timers so the cutoffs are exact.
 *
 * Adversarially verified at authoring: deleting the reason-5 query turns the
 * first two cases red (no RC_NOT_SENT item; no ACCEPTED query); removing the
 * dead-load exclusion turns the TONU case red; removing the frontend label
 * turns the mirror case red.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../../../src/config/database";
import { loadsNeedingAttention } from "../../../src/services/needsAttentionService";
import { rcSendSlaHours, rcSignSlaHours } from "../../../src/lib/tenderLifecycle";

const mockPrisma = prisma as any;
const NOW = new Date("2026-09-22T12:00:00.000Z");
const H = 3_600_000;

type Answer = Record<string, any[]>;
/** Answer each reason's query by the tender status it filters on; record every call. */
function arm(byStatus: Answer) {
  const calls: any[] = [];
  mockPrisma.loadTender.findMany.mockImplementation(async (args: any) => {
    calls.push(args);
    return byStatus[args.where.status] ?? [];
  });
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  delete process.env.RC_SEND_SLA_HOURS;
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.RC_SEND_SLA_HOURS;
});

describe("RC_NOT_SENT", () => {
  it("lists an ACCEPTED tender whose DRAFT RC is older than the send SLA, with the hours it has sat", async () => {
    arm({
      ACCEPTED: [{ loadId: "L1", load: { referenceNumber: "SRL-1", rateConfirmations: [{ createdAt: new Date(NOW.getTime() - 3 * H - 5 * 60_000) }] } }],
    });
    const items = await loadsNeedingAttention();
    expect(items).toEqual([{ loadId: "L1", referenceNumber: "SRL-1", reasons: ["RC_NOT_SENT"], rcDraftHours: 3 }]);
  });

  it("asks for exactly the shape the ruling names: ACCEPTED, a DRAFT RC older than now - RC_SEND_SLA_HOURS, on a live load", async () => {
    const calls = arm({});
    await loadsNeedingAttention();
    const q = calls.find((c) => c.where.status === "ACCEPTED");
    expect(q, "the reason-5 query ran").toBeTruthy();
    expect(q.where.deletedAt).toBeNull();
    expect(q.where.load.deletedAt).toBeNull();
    expect(q.where.load.rateConfirmations.some.status).toBe("DRAFT");
    expect(q.where.load.rateConfirmations.some.createdAt.lt).toEqual(new Date(NOW.getTime() - rcSendSlaHours() * H));
    // the default is one hour, and it is not the sign SLA
    expect(rcSendSlaHours()).toBe(1);
    expect(rcSignSlaHours()).toBe(4);
    // the hours on the item come from the OLDEST draft, so a re-draft cannot reset the clock
    expect(q.select.load.select.rateConfirmations).toEqual({ where: { status: "DRAFT" }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } });
  });

  it("does not chase a dead load: CANCELLED and TONU are excluded, as reason 1 excludes them (SRL-121492 carries an ACCEPTED tender and a DRAFT RC on a TONU)", async () => {
    const calls = arm({});
    await loadsNeedingAttention();
    const q = calls.find((c) => c.where.status === "ACCEPTED");
    const excluded: string[] = q.where.load.status.notIn;
    for (const s of ["CANCELLED", "TONU", "DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"]) expect(excluded).toContain(s);
    // and the same list reason 1 uses -- one const, not two lists kept in step
    const expired = calls.find((c) => c.where.status === "EXPIRED");
    expect(expired.where.load.status.notIn).toEqual(excluded);
  });

  it("RC_SEND_SLA_HOURS moves the cutoff; garbage falls back to 1; the bounds hold", async () => {
    process.env.RC_SEND_SLA_HOURS = "2";
    expect(rcSendSlaHours()).toBe(2);
    let calls = arm({});
    await loadsNeedingAttention();
    expect(calls.find((c) => c.where.status === "ACCEPTED").where.load.rateConfirmations.some.createdAt.lt).toEqual(new Date(NOW.getTime() - 2 * H));

    for (const bad of ["", "abc", "0", "-3"]) {
      process.env.RC_SEND_SLA_HOURS = bad;
      expect(rcSendSlaHours(), `env=${JSON.stringify(bad)}`).toBe(1);
    }
    process.env.RC_SEND_SLA_HOURS = "0.01";
    expect(rcSendSlaHours()).toBe(0.25);
    process.env.RC_SEND_SLA_HOURS = "9999";
    expect(rcSendSlaHours()).toBe(168);
    process.env.RC_SEND_SLA_HOURS = "0.5";
    expect(rcSendSlaHours()).toBe(0.5);
  });

  it("is one reason among five and merges by load: an RC_SENT row past the sign SLA still reads RC_UNSIGNED_PAST_SLA, not RC_NOT_SENT", async () => {
    arm({
      RC_SENT: [{ loadId: "L2", statusChangedAt: new Date(NOW.getTime() - 5 * H), load: { referenceNumber: "SRL-2" } }],
      ACCEPTED: [{ loadId: "L1", load: { referenceNumber: "SRL-1", rateConfirmations: [{ createdAt: new Date(NOW.getTime() - 2 * H) }] } }],
      COUNTERED: [{ loadId: "L1", load: { referenceNumber: "SRL-1" } }],
    });
    const items = await loadsNeedingAttention();
    expect(items).toEqual([
      { loadId: "L2", referenceNumber: "SRL-2", reasons: ["RC_UNSIGNED_PAST_SLA"], rcUnsignedHours: 5 },
      { loadId: "L1", referenceNumber: "SRL-1", reasons: ["COUNTER_AWAITING_AE", "RC_NOT_SENT"], rcDraftHours: 2 },
    ]);
  });

  it("a draft with no readable createdAt still lists the load, without inventing an hour count", async () => {
    arm({ ACCEPTED: [{ loadId: "L1", load: { referenceNumber: "SRL-1", rateConfirmations: [] } }] });
    const items = await loadsNeedingAttention();
    expect(items).toEqual([{ loadId: "L1", referenceNumber: "SRL-1", reasons: ["RC_NOT_SENT"] }]);
  });
});

/**
 * The AE board renders ATTENTION_LABEL[r] ?? r, so a reason with no label
 * prints its code. The label map is a hand-kept mirror the compiler cannot
 * see (the blockedCodeMirror shape); this holds the two together.
 */
describe("every backend reason has a label on the AE board", () => {
  it("frontend ATTENTION_LABEL keys equal the backend AttentionReason union", () => {
    const root = path.join(__dirname, "../../../..");
    const be = fs.readFileSync(path.join(root, "backend/src/services/needsAttentionService.ts"), "utf8").replace(/^[ \t]*\/\/.*$/gm, "");
    const fe = fs.readFileSync(path.join(root, "frontend/src/lib/loadDerivedStatus.ts"), "utf8").replace(/^[ \t]*\/\/.*$/gm, "");

    const unionBlock = be.slice(be.indexOf("export type AttentionReason ="), be.indexOf("export interface AttentionItem"));
    const backend = [...unionBlock.matchAll(/\|\s*"([A-Z_]+)"/g)].map((m) => m[1]).sort();
    const labelBlock = fe.slice(fe.indexOf("export const ATTENTION_LABEL"), fe.indexOf("};", fe.indexOf("export const ATTENTION_LABEL")));
    const frontend = [...labelBlock.matchAll(/^\s*([A-Z_]+):\s*"/gm)].map((m) => m[1]).sort();

    // vacuity: a scanner matching nothing would report two empty, equal sets
    expect(backend.length).toBeGreaterThanOrEqual(5);
    expect(backend).toContain("RC_NOT_SENT");
    expect(frontend).toEqual(backend);
  });
});
