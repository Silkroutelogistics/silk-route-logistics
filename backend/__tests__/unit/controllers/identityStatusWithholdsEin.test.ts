/**
 * The carrier's full EIN never reaches an AE screen.
 *
 * v3.8.blr — GET /api/carriers/:id/identity returned the whole identity row, so
 * the full EIN went to any AE screen that asked. Nothing in the frontend reads
 * it there: the last four identify the number on screen, and the full one is
 * for the IRS match and the carrier's own executed agreement.
 *
 * v3.8.blw — POST /api/carriers/:id/facial-verify returned the row too, straight
 * from its update, and was missed when the first route was closed. It was
 * harmless only while no EIN was stored; blr's onboarding field is what fills
 * the column. Both routes now go through one helper, and the census at the
 * bottom lists every file that touches the row, so a third route that returns
 * it has to be looked at before it can pass.
 */
import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

vi.mock("../../../src/config/database", () => ({
  prisma: { carrierIdentityVerification: { findUnique: vi.fn() } },
}));
vi.mock("../../../src/services/biometricVerificationService", () => ({
  verifyFacialMatch: vi.fn(),
}));

import { prisma } from "../../../src/config/database";
import { verifyFacialMatch } from "../../../src/services/biometricVerificationService";
import { getIdentityStatus, runFacialVerify } from "../../../src/controllers/carrierVettingController";

const p = vi.mocked(prisma) as any;
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }) as any;

describe("identity status withholds the full EIN", () => {
  it("drops w9TinFull, keeps the last four, and says whether one is on file", async () => {
    p.carrierIdentityVerification.findUnique.mockResolvedValue({
      carrierId: "cp1", w9TinFull: "987654321", w9TinLastFour: "4321", identityStatus: "PARTIAL",
    });
    const r = res();
    await getIdentityStatus({ params: { id: "cp1" } } as any, r);
    const body = r.json.mock.calls[0][0];
    expect(body).not.toHaveProperty("w9TinFull");
    expect(JSON.stringify(body)).not.toContain("987654321");
    expect(body.w9TinLastFour).toBe("4321");
    expect(body.w9TinOnFile).toBe(true);
    expect(body.identityStatus).toBe("PARTIAL");
  });

  it("reports no EIN on file when there is none", async () => {
    p.carrierIdentityVerification.findUnique.mockResolvedValue({
      carrierId: "cp2", w9TinFull: null, w9TinLastFour: null, identityStatus: "UNVERIFIED",
    });
    const r = res();
    await getIdentityStatus({ params: { id: "cp2" } } as any, r);
    expect(r.json.mock.calls[0][0].w9TinOnFile).toBe(false);
  });
});

describe("facial verify withholds the full EIN", () => {
  it("returns the match result without the EIN the updated row carries", async () => {
    vi.mocked(verifyFacialMatch).mockResolvedValue({
      carrierId: "cp1", w9TinFull: "987654321", w9TinLastFour: "4321",
      facialMatchStatus: "MATCHED", facialMatchScore: 97,
    } as any);
    const r = res();
    await runFacialVerify({ params: { id: "cp1" } } as any, r);
    const body = r.json.mock.calls[0][0];
    expect(body).not.toHaveProperty("w9TinFull");
    expect(JSON.stringify(body)).not.toContain("987654321");
    // Vacuity: the result itself still reaches the caller.
    expect(body.facialMatchStatus).toBe("MATCHED");
    expect(body.facialMatchScore).toBe(97);
    expect(body.w9TinOnFile).toBe(true);
  });
});

// ── Census: every file that reads or writes the identity row ──────────────────
//
// Each entry says what the file does with the row. A file that returns the row
// to a caller must go through withheldEin; a new file is flagged until someone
// has looked at it. Matches wrapped chains and nested includes, and ignores
// prose (§19 Sub-pattern 18, Sub-pattern 17).
const IDENTITY_ROW_FILES: Record<string, string> = {
  "controllers/carrierController.ts": "writes the EIN at registration; returns nothing from the row",
  "controllers/carrierVettingController.ts": "returns the row from two routes, both through withheldEin",
  "routes/carrierAuth.ts": "selects only w9TinFull, to print on the carrier's own agreement",
  "services/biometricVerificationService.ts": "returns the updated row to runFacialVerify, which withholds the EIN",
  "services/carrierVettingService.ts": "nested include read internally; the EIN goes only to the IRS match",
  "services/chameleonDetectionService.ts": "selects only w9TinLastFour for the fingerprint",
  "services/complianceMonitorService.ts": "selects only identity status and score",
  "services/crossReferenceService.ts": "nested include read internally; never reads the EIN",
  "services/identityVerificationService.ts": "writes identity results; returns nothing from the row",
  "services/tinMatchService.ts": "reads the EIN for the TIN check and returns a computed result",
};

const SRC = join(__dirname, "../../../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".ts") ? [full] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const TOUCHES_ROW = [
  /carrierIdentityVerification\s*\.\s*(findUnique|findFirst|findMany|update|updateMany|upsert|create|createMany)\b/,
  /\bidentityVerification\s*:\s*(true|\{)/,
];

function filesTouchingRow(): string[] {
  return walk(SRC)
    .filter((f) => !f.endsWith(`${sep}config${sep}database.ts`))
    .filter((f) => {
      const code = stripComments(readFileSync(f, "utf8"));
      return TOUCHES_ROW.some((re) => re.test(code));
    })
    .map((f) => relative(SRC, f).split(sep).join("/"))
    .sort();
}

describe("census of the identity row", () => {
  it("matches the wrapped chain and the nested include it exists to catch", () => {
    const wrapped = "await prisma.carrierIdentityVerification\n      .findUnique({ where })";
    const nested = "include: { identityVerification: true }";
    const prose = "// prisma.carrierIdentityVerification.findUnique returns the row";
    expect(TOUCHES_ROW.some((re) => re.test(stripComments(wrapped)))).toBe(true);
    expect(TOUCHES_ROW.some((re) => re.test(stripComments(nested)))).toBe(true);
    expect(TOUCHES_ROW.some((re) => re.test(stripComments(prose)))).toBe(false);
  });

  it("every file that touches the row is listed, with what it does", () => {
    const found = filesTouchingRow();
    expect(found.length, "vacuity: the scan must find the known readers").toBeGreaterThan(5);
    const unlisted = found.filter((f) => !(f in IDENTITY_ROW_FILES));
    expect(unlisted, "a new file touches the identity row: check whether it returns the EIN, then list it").toEqual([]);
    const stale = Object.keys(IDENTITY_ROW_FILES).filter((f) => !found.includes(f));
    expect(stale, "a listed file no longer touches the row: remove it").toEqual([]);
  });
});
