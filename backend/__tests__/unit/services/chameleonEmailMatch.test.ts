/**
 * Chameleon EMAIL matching — the same INBOX, never the same PROVIDER.
 *
 * v3.8.bbv. Until this commit the EMAIL fingerprint was sha256 of the DOMAIN,
 * so every gmail.com carrier matched every other one, three matches read as
 * HIGH, and HIGH hard-blocks a tender. On 2026-09-17 five of the six live real
 * carriers were HIGH, all five on free mail. A fraud signal that fires on a mail
 * provider is a dispatch outage wearing a compliance badge.
 *
 * WHY THE DOUBLE EVALUATES THE WHERE-CLAUSE. Asserting on `findMany.mock.calls`
 * would prove the code SENT `deletedAt: null`; it would not prove a deleted
 * carrier is excluded. The double here filters real fixtures by the predicate
 * the service passes, so dropping the filter from the service returns the
 * deleted row and the exclusion case fails on behaviour. Reinjection-verified
 * both ways at commit time (see the commit message for the red output).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

type Row = Record<string, any>;
const store = vi.hoisted(() => ({
  profiles: new Map<string, Row>(),
  fingerprints: new Map<string, Row>(),
  matches: [] as Row[],
  profileUpdates: [] as Row[],
}));

/** Minimal evaluator for the shape checkChameleon passes:
 *  { AND: [ { carrierId: { not } }, { carrier: { isTestAccount, deletedAt } }, { OR: [ { hash: value } ] } ] } */
function evaluate(where: Row, fp: Row): boolean {
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

vi.mock("../../../src/config/database", () => ({
  prisma: {
    carrierProfile: {
      findUnique: vi.fn(async ({ where }: Row) => store.profiles.get(where.id) ?? null),
      update: vi.fn(async (args: Row) => { store.profileUpdates.push(args); return {}; }),
    },
    carrierFingerprint: {
      upsert: vi.fn(async ({ where, create }: Row) => { store.fingerprints.set(where.carrierId, { ...create }); return create; }),
      findUnique: vi.fn(async ({ where }: Row) => store.fingerprints.get(where.carrierId) ?? null),
      findMany: vi.fn(async ({ where }: Row) =>
        [...store.fingerprints.values()].filter((fp) => evaluate(where, fp)).map((fp) => ({ ...fp, carrier: store.profiles.get(fp.carrierId) })),
      ),
    },
    chameleonMatch: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: Row) => { store.matches.push(data); return data; }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock("../../../src/services/emailService", () => ({ sendEmail: vi.fn(async () => ({})), wrap: (s: string) => s }));
vi.mock("../../../src/lib/logger", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { normalizeEmail, buildFingerprint, checkChameleon } from "../../../src/services/chameleonDetectionService";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** A carrier with ONLY an email on file, so any match can only be EMAIL. */
function carrier(id: string, email: string, extra: Row = {}): void {
  store.profiles.set(id, {
    id, companyName: id.toUpperCase(), onboardingStatus: "REVIEWING", status: "REVIEW",
    isTestAccount: false, deletedAt: null,
    contactEmail: email, contactPhone: null, address: null, zip: null, dotNumber: null,
    user: { email, phone: null }, identityVerification: null,
    ...extra,
  });
}

async function emailFieldsFor(subject: string): Promise<string[][]> {
  const r = await checkChameleon(subject);
  return r.matches.map((m) => m.fields);
}

beforeEach(() => {
  store.profiles.clear(); store.fingerprints.clear();
  store.matches.length = 0; store.profileUpdates.length = 0;
});

describe("normalizeEmail — the same inbox and nothing wider", () => {
  it("folds +tag on every domain, dots and googlemail on gmail", () => {
    expect(normalizeEmail("J.Doe+x@Gmail.com")).toBe("jdoe@gmail.com");
    expect(normalizeEmail("jdoe@googlemail.com")).toBe("jdoe@gmail.com");
    expect(normalizeEmail("Ops+dispatch@Acme-Freight.com")).toBe("ops@acme-freight.com");
  });
  it("keeps dots on a corporate domain — they are distinct inboxes there", () => {
    expect(normalizeEmail("j.doe@acme.com")).toBe("j.doe@acme.com");
    expect(normalizeEmail("jdoe@acme.com")).toBe("jdoe@acme.com");
  });
  it.each([null, undefined, "", " ", "nodomain", "@acme.com", "jdoe@"])("produces no hash for %j", (raw) => {
    expect(normalizeEmail(raw as any)).toBeNull();
  });
});

describe("EMAIL fingerprint and match", () => {
  it("two different gmail addresses do NOT match on EMAIL", async () => {
    carrier("a", "cjmaster@gmail.com"); carrier("b", "aeroswift@gmail.com");
    await buildFingerprint("b");
    expect(await emailFieldsFor("a")).toEqual([]);
    // and the two hashes are genuinely different, not merely unmatched
    expect(store.fingerprints.get("a")!.emailHash).not.toBe(store.fingerprints.get("b")!.emailHash);
  });

  it("j.doe+x@gmail.com and jdoe@googlemail.com are one inbox and DO match", async () => {
    carrier("a", "j.doe+x@gmail.com"); carrier("b", "jdoe@googlemail.com");
    await buildFingerprint("b");
    expect(await emailFieldsFor("a")).toEqual([["EMAIL"]]);
    expect(store.fingerprints.get("a")!.emailHash).toBe(sha("jdoe@gmail.com"));
  });

  it("an identical corporate address matches", async () => {
    carrier("a", "dispatch@acme-freight.com"); carrier("b", "Dispatch@Acme-Freight.com ");
    await buildFingerprint("b");
    expect(await emailFieldsFor("a")).toEqual([["EMAIL"]]);
  });

  it("different addresses on the same corporate domain do NOT match", async () => {
    carrier("a", "jane@acme-freight.com"); carrier("b", "john@acme-freight.com");
    await buildFingerprint("b");
    expect(await emailFieldsFor("a")).toEqual([]);
  });

  it.each(["", " ", "nodomain"])("email %j writes a null hash rather than hashing the junk", async (bad) => {
    carrier("a", bad);
    await buildFingerprint("a");
    expect(store.fingerprints.get("a")!.emailHash).toBeNull();
  });

  it("two carriers with no email do not match on the absence of one", async () => {
    carrier("a", ""); carrier("b", "");
    await buildFingerprint("b");
    expect(await emailFieldsFor("a")).toEqual([]);
  });

  it("a soft-deleted carrier with the SAME inbox is excluded from the match set", async () => {
    carrier("a", "owner@gmail.com");
    carrier("gone", "owner@gmail.com", { deletedAt: new Date("2026-07-07"), companyName: null });
    carrier("live", "owner@gmail.com");
    await buildFingerprint("gone"); await buildFingerprint("live");
    const r = await checkChameleon("a");
    expect(r.matches.map((m) => m.matchedCarrierId)).toEqual(["live"]);
  });

  it("a test account with the same inbox is still excluded (v3.8.alm, unchanged)", async () => {
    carrier("a", "owner@gmail.com"); carrier("t", "owner@gmail.com", { isTestAccount: true });
    await buildFingerprint("t");
    expect(await emailFieldsFor("a")).toEqual([]);
  });
});
