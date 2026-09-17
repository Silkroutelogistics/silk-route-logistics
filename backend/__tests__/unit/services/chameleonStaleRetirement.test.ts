/**
 * A rescan retires the OPEN rows it can no longer support, and the level it
 * writes is the level a review would read.
 *
 * v3.8.bbw. v3.8.bbv changed what an EMAIL match IS, which left 26 OPEN rows
 * in production that no rescan could reproduce. Left standing they were not
 * inert: checkChameleon derived its level from THIS run's matches (NONE), but
 * recomputeChameleonRiskLevel — which every review calls — derived from the
 * STORED rows (HIGH). One click on any row would have re-blocked a carrier
 * from evidence the scan itself had just declined to find. Two writers, two
 * answers, and §13.3 Item 231 already records what that costs.
 *
 * Scope of retirement is OPEN rows only. REVIEWED, DISMISSED and
 * CONFIRMED_FRAUD carry a human's judgment and are pinned untouched here.
 *
 * The double stores match rows and honours the where-clauses the service
 * actually sends (status, notIn, latest-per-pair), so the retirement and the
 * recompute are exercised against state rather than against call args.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const store = vi.hoisted(() => ({
  profiles: new Map<string, Row>(),
  fingerprints: new Map<string, Row>(),
  matches: [] as Row[],
  profileUpdates: [] as Row[],
  systemLogs: [] as Row[],
  seq: 0,
}));

function fpMatches(where: Row, fp: Row): boolean {
  const profile = store.profiles.get(fp.carrierId) ?? {};
  const one = (clause: Row): boolean =>
    Object.entries(clause).every(([k, v]) => {
      if (k === "AND") return (v as Row[]).every(one);
      if (k === "OR") return (v as Row[]).some(one);
      if (k === "carrier") return Object.entries(v as Row).every(([pk, pv]) => (profile[pk] ?? null) === pv);
      if (k === "carrierId") return typeof v === "object" && v !== null && "not" in v ? fp.carrierId !== v.not : fp.carrierId === v;
      return fp[k] === v;
    });
  return one(where);
}
function matchRowMatches(where: Row, m: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (typeof v === "object" && v !== null && !(v instanceof Date)) {
      if ("not" in v) return m[k] !== v.not;
      if ("notIn" in v) return !(v.notIn as any[]).includes(m[k]);
      if ("in" in v) return (v.in as any[]).includes(m[k]);
    }
    return m[k] === v;
  });
}

vi.mock("../../../src/config/database", () => ({
  prisma: {
    carrierProfile: {
      findUnique: vi.fn(async ({ where }: Row) => store.profiles.get(where.id) ?? null),
      update: vi.fn(async (args: Row) => {
        store.profileUpdates.push(args);
        const p = store.profiles.get(args.where.id);
        if (p) Object.assign(p, args.data);
        return {};
      }),
    },
    carrierFingerprint: {
      upsert: vi.fn(async ({ where, create }: Row) => { store.fingerprints.set(where.carrierId, { ...create }); return create; }),
      findUnique: vi.fn(async ({ where }: Row) => store.fingerprints.get(where.carrierId) ?? null),
      findMany: vi.fn(async ({ where }: Row) =>
        [...store.fingerprints.values()].filter((fp) => fpMatches(where, fp)).map((fp) => ({ ...fp, carrier: store.profiles.get(fp.carrierId) })),
      ),
    },
    chameleonMatch: {
      findFirst: vi.fn(async ({ where }: Row) =>
        [...store.matches].filter((m) => matchRowMatches(where, m)).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null),
      findMany: vi.fn(async ({ where }: Row) => store.matches.filter((m) => matchRowMatches(where, m))),
      updateMany: vi.fn(async ({ where, data }: Row) => {
        const hit = store.matches.filter((m) => matchRowMatches(where, m));
        for (const m of hit) Object.assign(m, data);
        return { count: hit.length };
      }),
      create: vi.fn(async ({ data }: Row) => {
        const row = { id: `m${++store.seq}`, createdAt: store.seq, reviewedById: null, ...data };
        store.matches.push(row);
        return row;
      }),
    },
    systemLog: { create: vi.fn(async ({ data }: Row) => { store.systemLogs.push(data); return data; }) },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock("../../../src/services/emailService", () => ({ sendEmail: vi.fn(async () => ({})), wrap: (s: string) => s }));
vi.mock("../../../src/lib/logger", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import {
  buildFingerprint, checkChameleon, recomputeChameleonRiskLevel, RETIRED_BY_RESCAN_NOTE,
} from "../../../src/services/chameleonDetectionService";

function carrier(id: string, email: string, extra: Row = {}): void {
  store.profiles.set(id, {
    id, companyName: id.toUpperCase(), onboardingStatus: "REVIEWING", status: "REVIEW",
    isTestAccount: false, deletedAt: null, chameleonRiskLevel: "NONE",
    contactEmail: email, contactPhone: null, address: null, zip: null, dotNumber: null,
    user: { email, phone: null }, identityVerification: null,
    ...extra,
  });
}
/** A pre-existing row, as the domain-only rule left them in production. */
function staleRow(carrierId: string, matchedCarrierId: string, status: string, extra: Row = {}): Row {
  const row = { id: `stale${++store.seq}`, createdAt: store.seq, carrierId, matchedCarrierId, matchType: "EMAIL", riskScore: 25, status, reviewedById: null, reviewedAt: null, reviewNotes: null, ...extra };
  store.matches.push(row);
  return row;
}
const byId = (id: string) => store.matches.find((m) => m.id === id)!;
const levelWrites = () => store.profileUpdates.filter((u) => u.data && "chameleonRiskLevel" in u.data).map((u) => u.data.chameleonRiskLevel);

beforeEach(() => {
  store.profiles.clear(); store.fingerprints.clear();
  store.matches.length = 0; store.profileUpdates.length = 0; store.systemLogs.length = 0; store.seq = 0;
});

/** Four gmail carriers with DISTINCT inboxes: the production shape after bbw. */
async function gmailCluster(): Promise<void> {
  carrier("a", "cjmaster@gmail.com", { chameleonRiskLevel: "HIGH" });
  carrier("b", "aeroswift@gmail.com"); carrier("c", "eaglefleet@gmail.com"); carrier("d", "falcon@gmail.com");
  for (const id of ["b", "c", "d"]) await buildFingerprint(id);
}

describe("stale-row retirement", () => {
  it("retires the OPEN rows for pairs this run no longer matches, as a system act", async () => {
    await gmailCluster();
    const rows = ["b", "c", "d"].map((m) => staleRow("a", m, "OPEN"));
    const r = await checkChameleon("a");
    expect(r.matches).toEqual([]);
    for (const row of rows) {
      const now = byId(row.id);
      expect(now.status).toBe("DISMISSED");
      expect(now.reviewedById).toBeNull();
      expect(now.reviewedAt).toBeInstanceOf(Date);
      expect(now.reviewNotes).toBe(RETIRED_BY_RESCAN_NOTE);
    }
  });

  it("writes one audit row per batch carrying the retired ids", async () => {
    await gmailCluster();
    const rows = ["b", "c", "d"].map((m) => staleRow("a", m, "OPEN"));
    await checkChameleon("a");
    const audits = store.systemLogs.filter((l) => l.source === "chameleon-rescan-retire");
    expect(audits).toHaveLength(1);
    expect(audits[0].details.retiredMatchIds.sort()).toEqual(rows.map((r) => r.id).sort());
    expect(audits[0].details.carrierId).toBe("a");
  });

  it("writes no audit row when nothing was retired", async () => {
    await gmailCluster();
    await checkChameleon("a");
    expect(store.systemLogs.filter((l) => l.source === "chameleon-rescan-retire")).toHaveLength(0);
  });

  it("never touches REVIEWED, DISMISSED or CONFIRMED_FRAUD rows, even for vanished pairs", async () => {
    await gmailCluster();
    const reviewed = staleRow("a", "b", "REVIEWED", { reviewedById: "ae-1", reviewNotes: "looking" });
    const confirmed = staleRow("a", "c", "CONFIRMED_FRAUD", { reviewedById: "ae-1", riskScore: 25 });
    const dismissed = staleRow("a", "d", "DISMISSED", { reviewedById: "ae-1", reviewNotes: "not a match" });
    await checkChameleon("a");
    expect(byId(reviewed.id)).toMatchObject({ status: "REVIEWED", reviewedById: "ae-1", reviewNotes: "looking" });
    expect(byId(confirmed.id)).toMatchObject({ status: "CONFIRMED_FRAUD", reviewedById: "ae-1" });
    expect(byId(dismissed.id)).toMatchObject({ status: "DISMISSED", reviewedById: "ae-1", reviewNotes: "not a match" });
    expect(store.systemLogs.filter((l) => l.source === "chameleon-rescan-retire")).toHaveLength(0);
  });

  it("keeps an OPEN row whose pair still matches this run", async () => {
    carrier("a", "owner@gmail.com"); carrier("b", "owner@gmail.com"); carrier("c", "other@gmail.com");
    await buildFingerprint("b"); await buildFingerprint("c");
    const kept = staleRow("a", "b", "OPEN"); const gone = staleRow("a", "c", "OPEN");
    await checkChameleon("a");
    expect(byId(kept.id).status).toBe("OPEN");
    expect(byId(gone.id).status).toBe("DISMISSED");
  });
});

describe("the level is written from the same source a review reads", () => {
  it("downgrades HIGH → NONE on the scan path, and writes it", async () => {
    await gmailCluster();
    ["b", "c", "d"].forEach((m) => staleRow("a", m, "OPEN"));
    expect(store.profiles.get("a")!.chameleonRiskLevel).toBe("HIGH");
    const r = await checkChameleon("a");
    expect(r.riskLevel).toBe("NONE");
    expect(levelWrites()).toEqual(["NONE"]);
    expect(store.profiles.get("a")!.chameleonRiskLevel).toBe("NONE");
  });

  it("parity: a recompute after the scan returns exactly what the scan wrote", async () => {
    await gmailCluster();
    ["b", "c", "d"].forEach((m) => staleRow("a", m, "OPEN"));
    const scan = await checkChameleon("a");
    expect(await recomputeChameleonRiskLevel("a")).toBe(scan.riskLevel);
  });

  it("parity holds the other way too: a standing CONFIRMED_FRAUD verdict keeps the carrier HIGH through a rescan", async () => {
    await gmailCluster();
    staleRow("a", "b", "CONFIRMED_FRAUD", { reviewedById: "ae-1", riskScore: 75 });
    const scan = await checkChameleon("a");
    // The scan found NO fingerprint overlap this run — and still writes HIGH,
    // because the level is read from the standing rows, not from this run.
    expect(scan.matches).toEqual([]);
    expect(scan.riskLevel).toBe("HIGH");
    expect(await recomputeChameleonRiskLevel("a")).toBe("HIGH");
  });

  it("escalation still writes on the same path", async () => {
    carrier("a", "owner@gmail.com"); carrier("b", "owner@gmail.com"); carrier("c", "owner@gmail.com"); carrier("d", "owner@gmail.com");
    for (const id of ["b", "c", "d"]) await buildFingerprint(id);
    const r = await checkChameleon("a");
    expect(r.riskLevel).toBe("HIGH");
    expect(levelWrites()).toEqual(["HIGH"]);
  });
});

describe("a system retirement is not a human judgment", () => {
  it("a HUMAN-dismissed pair is not resurrected when it matches again (Item 231, unchanged)", async () => {
    carrier("a", "owner@gmail.com"); carrier("b", "owner@gmail.com");
    await buildFingerprint("b");
    staleRow("a", "b", "DISMISSED", { reviewedById: "ae-1", reviewNotes: "not a match" });
    const r = await checkChameleon("a");
    expect(r.matches).toEqual([]);
    expect(store.matches.filter((m) => m.carrierId === "a")).toHaveLength(1);
  });

  it("a SYSTEM-retired pair gets a fresh OPEN row when the evidence comes back", async () => {
    carrier("a", "owner@gmail.com"); carrier("b", "owner@gmail.com");
    await buildFingerprint("b");
    const retired = staleRow("a", "b", "DISMISSED", { reviewedById: null, reviewNotes: RETIRED_BY_RESCAN_NOTE });
    const r = await checkChameleon("a");
    expect(r.matches.map((m) => m.matchedCarrierId)).toEqual(["b"]);
    const rows = store.matches.filter((m) => m.carrierId === "a");
    expect(rows).toHaveLength(2);
    expect(byId(retired.id).status).toBe("DISMISSED");
    expect(rows.find((m) => m.id !== retired.id)!.status).toBe("OPEN");
  });
});
