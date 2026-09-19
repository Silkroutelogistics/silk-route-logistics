/**
 * Lifecycle-audit COVERAGE — lifecycle-gaps B6b, finding #24.
 *
 * Three invariants, each of which fails by NAME:
 *
 *  A. Every lifecycle writer calls recordLifecycleEvent inside its own body,
 *     and the number of calls per writer is frozen. Remove one call and the
 *     writer is named (file + function); add a writer and the inventory must
 *     grow deliberately.
 *  B. No lifecycle WRITE exists outside the inventory. A scanner finds the
 *     write shapes (a Load status of CANCELLED/TONU, a Customer isActive flip,
 *     a Customer hard delete, a CarrierProfile deletedAt move) across all of
 *     src and fails on any site that is not inside an inventoried function.
 *  C. Every mutation route in routes/customers.ts carries auditLog(), and the
 *     route count is frozen.
 *
 * DELIBERATELY OUTSIDE THIS GUARD — carrier SUSPENSION and reinstatement.
 * Those rows are written by complianceController.suspendCarrier today and by
 * lib/carrierStatusAudit (the concurrent arc's single writer, USER → AuditTrail,
 * CRON → SystemLog) once it lands. A second writer there would be the
 * dual-convention class §13.3 keeps unpicking, so this guard does not scan for
 * onboardingStatus writes. The AUTOMATIC suspensions (insurance expiry, FMCSA,
 * OFAC, checkAutoReversal) are that arc's too. Deactivating a User
 * (adminController.updateUserStatus) is banked as its own item and also
 * excluded.
 *
 * Scanner notes: comments are stripped before matching (a comment naming a
 * write is not a write); the model of a write is resolved from the nearest
 * preceding `prisma.<model>.` / `tx.<model>.` so a CANCELLED on a shipment,
 * an approval-queue row or an info request is not read as a Load cancel.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");

/** Strip // and block comments so prose is never read as code (Item 200 rule). */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, "");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

/** [start, end) of an exported top-level function's text: from its header to the next top-level `export`. */
function fnRange(src: string, name: string): [number, number] | null {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) return null;
  const next = src.indexOf("\nexport ", start + 1);
  return [start, next < 0 ? src.length : next];
}

function lineOf(src: string, idx: number): number {
  return src.slice(0, idx).split("\n").length;
}

// ─── A. the inventory ────────────────────────────────────────────────────────
// file → { writer: calls }. Change the number here when a writer changes, on purpose.
const INVENTORY: Record<string, Record<string, number>> = {
  "controllers/loadController.ts": {
    updateLoadStatus: 2, // CANCELLED branch, TONU branch
    deleteLoad: 1,       // one call, a cancel-or-archive ternary
    restoreLoad: 1,
  },
  "controllers/customerController.ts": {
    inactivateCustomer: 1,
    reactivateCustomer: 1,
    deleteCustomer: 1,
    restoreCustomer: 1,
  },
  "controllers/carrierController.ts": {
    archiveCarrier: 1,
    restoreCarrier: 1,
  },
};

const sources: Record<string, string> = {};
for (const rel of Object.keys(INVENTORY)) {
  sources[rel] = stripComments(fs.readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n"));
}

describe("A. every lifecycle writer records the event, and the call count is frozen", () => {
  it("the inventory is not empty and every writer is found (vacuity tripwire)", () => {
    const writers = Object.values(INVENTORY).flatMap((m) => Object.keys(m));
    expect(writers.length).toBe(9);
    for (const [rel, fns] of Object.entries(INVENTORY)) {
      for (const fn of Object.keys(fns)) {
        expect(fnRange(sources[rel], fn), `${rel} ${fn} — function not found`).not.toBeNull();
      }
    }
  });

  for (const [rel, fns] of Object.entries(INVENTORY)) {
    for (const [fn, expected] of Object.entries(fns)) {
      it(`${rel} ${fn} calls recordLifecycleEvent ${expected}×`, () => {
        const r = fnRange(sources[rel], fn)!;
        const body = sources[rel].slice(r[0], r[1]);
        const calls = (body.match(/\brecordLifecycleEvent\(/g) ?? []).length;
        expect(calls, `${rel} ${fn}: expected ${expected} recordLifecycleEvent call(s), found ${calls}`).toBe(expected);
        expect(sources[rel], `${rel} must import recordLifecycleEvent`).toMatch(/import \{[^}]*\brecordLifecycleEvent\b[^}]*\} from "\.\.\/lib\/lifecycleAudit"/);
      });
    }
  }
});

// ─── B. no lifecycle write outside the inventory ─────────────────────────────
type Site = { rel: string; line: number; what: string };

/**
 * The Prisma model of the write nearest above `idx`, or null — and null when
 * the match sits in a `where:` filter rather than a `data:` payload, because a
 * `deletedAt: null` that SELECTS live rows is not a write (the where-clause
 * blind spot every source guard in this repo has hit once).
 */
function modelAt(src: string, idx: number): string | null {
  const back = src.slice(Math.max(0, idx - 700), idx);
  const lastData = back.lastIndexOf("data:");
  const lastWhere = back.lastIndexOf("where:");
  if (lastWhere > lastData) return null;
  const m = [...back.matchAll(/\b(?:prisma|tx|db|client)\s*\.\s*([a-zA-Z]+)\s*\.\s*(?:update|updateMany|create|upsert|delete)\s*\(/g)];
  return m.length ? m[m.length - 1][1] : null;
}

function findWrites(): Site[] {
  const sites: Site[] = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).replace(/\\/g, "/");
    const src = stripComments(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
    // A Load leaving the lifecycle by literal status.
    for (const m of src.matchAll(/\bstatus:\s*"(CANCELLED|TONU)"/g)) {
      if (modelAt(src, m.index!) === "load") sites.push({ rel, line: lineOf(src, m.index!), what: `Load status ${m[1]}` });
    }
    // A Customer inactivated or reactivated.
    for (const m of src.matchAll(/\bisActive:\s*(true|false)\b/g)) {
      if (modelAt(src, m.index!) === "customer") sites.push({ rel, line: lineOf(src, m.index!), what: `Customer isActive ${m[1]}` });
    }
    // A Customer hard-deleted.
    for (const m of src.matchAll(/\bcustomer\s*\.\s*delete\s*\(/g)) {
      sites.push({ rel, line: lineOf(src, m.index!), what: "Customer hard delete" });
    }
    // A CarrierProfile archived or restored.
    for (const m of src.matchAll(/\bdeletedAt:\s*(null|new Date\(\)|[a-zA-Z]+)\b/g)) {
      if (modelAt(src, m.index!) === "carrierProfile") sites.push({ rel, line: lineOf(src, m.index!), what: `CarrierProfile deletedAt ${m[1]}` });
    }
  }
  return sites;
}

function insideInventory(site: Site): boolean {
  const fns = INVENTORY[site.rel];
  if (!fns) return false;
  const src = sources[site.rel];
  for (const fn of Object.keys(fns)) {
    const r = fnRange(src, fn)!;
    const startLine = lineOf(src, r[0]);
    const endLine = lineOf(src, r[1]);
    if (site.line >= startLine && site.line <= endLine) return true;
  }
  return false;
}

describe("B. no lifecycle write outside the inventory", () => {
  const sites = findWrites();

  it("the scanner sees each write class at least once (vacuity tripwire)", () => {
    const kinds = new Set(sites.map((s) => s.what.split(" ").slice(0, 2).join(" ")));
    expect(kinds, JSON.stringify([...kinds])).toContain("Load status");
    expect(kinds).toContain("Customer isActive");
    expect(kinds).toContain("Customer hard");
    expect(kinds).toContain("CarrierProfile deletedAt");
  });

  it("scanner self-test: the model resolver reads the nearest write and ignores other models", () => {
    const fixture = stripComments(`
      await prisma.shipment.updateMany({ where: { loadId }, data: { status: "CANCELLED" } });
      await tx.load.update({ where: { id }, data: { status: "CANCELLED" as const } });
      // prisma.load.update({ data: { status: "TONU" } })  ← a comment is not a write
      const rows = await prisma.load.findMany({ where: { status: "TONU", deletedAt: null } });
    `);
    const hits = [...fixture.matchAll(/\bstatus:\s*"(CANCELLED|TONU)"/g)].map((m) => modelAt(fixture, m.index!));
    // The third match is a where-clause filter under a read: not a write, resolves to null.
    expect(hits).toEqual(["shipment", "load", null]);
  });

  it("every lifecycle write sits inside an inventoried writer", () => {
    const strays = sites.filter((s) => !insideInventory(s));
    expect(strays, strays.map((s) => `${s.rel}:${s.line} ${s.what}`).join("\n")).toEqual([]);
  });
});

// ─── C. the customers router ─────────────────────────────────────────────────
describe("C. every mutation route in routes/customers.ts carries auditLog()", () => {
  const src = stripComments(fs.readFileSync(path.join(SRC, "routes/customers.ts"), "utf8").replace(/\r\n/g, "\n"));
  const mutations = src.split("\n").filter((l) => /^router\.(post|put|patch|delete)\(/.test(l));

  it("sixteen mutation routes, frozen — a seventeenth is added here on purpose", () => {
    expect(mutations.length).toBe(16);
  });

  it("each names auditLog(action, entity) before its handler", () => {
    const bare = mutations.filter((l) => !/auditLog\("[A-Z_]+", "[A-Za-z]+"\)/.test(l));
    expect(bare, bare.join("\n")).toEqual([]);
    expect(src).toMatch(/import \{ auditLog \} from "\.\.\/middleware\/audit"/);
  });

  it("the lifecycle acts carry their own verbs, not a generic UPDATE", () => {
    const verb = (p: string) => mutations.find((l) => l.includes(`"${p}"`))?.match(/auditLog\("([A-Z_]+)"/)?.[1];
    expect(verb("/:id/inactivate")).toBe("INACTIVATE");
    expect(verb("/:id/reactivate")).toBe("REACTIVATE");
    expect(verb("/:id/restore")).toBe("RESTORE");
    expect(mutations.find((l) => l.startsWith('router.delete("/:id",'))).toMatch(/auditLog\("DELETE", "Customer"\)/);
  });
});
