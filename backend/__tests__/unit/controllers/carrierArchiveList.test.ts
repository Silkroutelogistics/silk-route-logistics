/**
 * Carrier-archive arc B4a (2026-09-19) — the AE carrier list carries archived
 * state, and only when it was asked to.
 *
 * Three things are held here:
 *
 * 1. THE FENCE. getAllCarriers keeps its deletedAt: null filter unless the
 *    query string carries include_deleted=true — the literal string, the
 *    include_test idiom. "false", "TRUE", "1" and garbage all keep the fence.
 *    The Prisma mock below is a small fake database that HONOURS the where it
 *    is handed, so the assertion is on what comes back, not only on what was
 *    asked: a controller that built the right where and then ignored it would
 *    still go red.
 *
 * 2. THE FIELDS. A row that is present carries deletedAt / deletedBy /
 *    archiveReason / archiveNote — populated on an archived row, null on a
 *    live one — so the list can render the badge without a second request.
 *
 * 3. THE VOCABULARY, in both directions and at both levels. The shared
 *    constants file names exactly the Prisma enum (runtime, both ways), and
 *    the label map is exhaustive AT THE TYPE LEVEL: this suite is not
 *    type-checked by tsc (tests sit outside the backend tsconfig include), so
 *    the type-level claim is proven by running the TypeScript compiler over a
 *    probe file — a control that must compile clean, then an eighth member
 *    with no label, then a label for a member the union does not name, each
 *    of which must produce a diagnostic that names NEW_EIGHTH. The control is
 *    the vacuity tripwire: if the probe could not resolve the real shared
 *    file, the control would carry a diagnostic and the failing probes would
 *    be failing for the wrong reason.
 *
 * Adversarially verified at authoring — matrix in the commit message.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";
import ts from "typescript";
import { CarrierArchiveReason as PrismaCarrierArchiveReason } from "@prisma/client";
import { prisma } from "../../../src/config/database";
import {
  CARRIER_ARCHIVE_REASONS,
  CARRIER_ARCHIVE_REASON_LABELS,
  carrierArchiveReasonLabel,
} from "../../../../shared/constants/carrierArchiveReasons";

vi.setConfig({ testTimeout: 30_000 });

// Same stand-ins carrierController.test.ts uses: the controller module pulls
// these in at import time and none of them is exercised here.
vi.mock("../../../src/services/tierService", () => ({
  calculateTier: vi.fn().mockReturnValue("SILVER"),
  getBonusPercentage: vi.fn().mockReturnValue(2),
}));
vi.mock("../../../src/services/integrationService", () => ({
  onCarrierApproved: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/storageService", () => ({
  uploadFile: vi.fn().mockResolvedValue("https://cdn.example.com/file.pdf"),
}));
vi.mock("../../../src/validators/carrier", () => ({
  carrierRegisterSchema: { parse: (v: unknown) => v },
  verifyCarrierSchema: { parse: (v: unknown) => v },
}));

import { getAllCarriers } from "../../../src/controllers/carrierController";

const mockPrisma = prisma as any;

function profile(id: string, over: Record<string, unknown>) {
  return {
    id,
    userId: `u-${id}`,
    tier: "SILVER",
    mcNumber: "123456",
    dotNumber: "7654321",
    equipmentTypes: ["Dry Van"],
    operatingRegions: ["MIDWEST"],
    safetyScore: null,
    numberOfTrucks: 3,
    onboardingStatus: "APPROVED",
    isTestAccount: false,
    user: { id: `u-${id}`, firstName: "Test", lastName: id, email: `${id}@srl.invalid`, company: `Company ${id}`, phone: null },
    scorecards: [],
    tenders: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
    deletedBy: null,
    archiveReason: null,
    archiveNote: null,
    ...over,
  };
}

const LIVE = profile("live", {});
const ARCHIVED = profile("arch", {
  deletedAt: new Date("2026-09-18T15:00:00Z"),
  deletedBy: "admin@srl.invalid",
  archiveReason: "CEASED_OPERATIONS",
  archiveNote: "Owner retired",
});
const TEST_ARCHIVED = profile("test-arch", { isTestAccount: true, deletedAt: new Date("2026-09-01T00:00:00Z"), archiveReason: "ERRONEOUS_RECORD" });

function mockReqRes(query: Record<string, unknown>) {
  return {
    req: { body: {}, user: { id: "admin-1", role: "ADMIN" }, params: {}, query, headers: {} } as any,
    res: { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any,
  };
}

async function list(query: Record<string, unknown>) {
  const { req, res } = mockReqRes(query);
  await getAllCarriers(req, res);
  const where = mockPrisma.carrierProfile.findMany.mock.calls.at(-1)![0].where;
  const body = res.json.mock.calls.at(-1)![0];
  return { where, carriers: body.carriers as Array<Record<string, unknown>> };
}

beforeEach(() => {
  vi.clearAllMocks();
  // A fake database that honours the two fences the controller can send.
  mockPrisma.carrierProfile.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    [LIVE, ARCHIVED, TEST_ARCHIVED].filter((r) => {
      if ("deletedAt" in where && where.deletedAt === null && r.deletedAt !== null) return false;
      if (where.isTestAccount === false && r.isTestAccount) return false;
      return true;
    }),
  );
  mockPrisma.load.count.mockResolvedValue(0);
  mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { amount: null } });
});

describe("GET /carrier/all — the include_deleted fence", () => {
  it("absent: keeps deletedAt: null exactly, and no archived row comes back", async () => {
    const { where, carriers } = await list({});
    expect(where).toEqual({ deletedAt: null, isTestAccount: false });
    expect(carriers.map((c) => c.id)).toEqual(["live"]);
  });

  it.each(["false", "TRUE", "1", "yes", "garbage", ""])(
    "include_deleted=%j is not the literal \"true\" and keeps the fence — no truthy-string bug",
    async (value) => {
      const { where, carriers } = await list({ include_deleted: value });
      expect(where).toEqual({ deletedAt: null, isTestAccount: false });
      expect(carriers.map((c) => c.id)).toEqual(["live"]);
    },
  );

  it("include_deleted=true: drops the deletedAt fence, keeps the test-account fence, and the archived row is present", async () => {
    const { where, carriers } = await list({ include_deleted: "true" });
    expect(where).toEqual({ isTestAccount: false });
    expect(carriers.map((c) => c.id)).toEqual(["live", "arch"]); // test-arch stays fenced
  });

  it("the two fences compose: include_deleted=true&include_test=true returns everything", async () => {
    const { where, carriers } = await list({ include_deleted: "true", include_test: "true" });
    expect(where).toEqual({});
    expect(carriers.map((c) => c.id)).toEqual(["live", "arch", "test-arch"]);
  });
});

describe("GET /carrier/all — the four archive fields on the row", () => {
  it("an archived row carries all four, populated", async () => {
    const { carriers } = await list({ include_deleted: "true" });
    const arch = carriers.find((c) => c.id === "arch")!;
    expect(arch.deletedAt).toEqual(new Date("2026-09-18T15:00:00Z"));
    expect(arch.deletedBy).toBe("admin@srl.invalid");
    expect(arch.archiveReason).toBe("CEASED_OPERATIONS");
    expect(arch.archiveNote).toBe("Owner retired");
  });

  it("a live row carries all four as null — present, not absent, so the shape is one shape", async () => {
    const { carriers } = await list({});
    const live = carriers[0];
    for (const k of ["deletedAt", "deletedBy", "archiveReason", "archiveNote"]) {
      expect(live).toHaveProperty(k);
      expect(live[k]).toBeNull();
    }
  });

  it("archiveReason is the raw enum member, never a label — the label is display copy", async () => {
    const { carriers } = await list({ include_deleted: "true" });
    const arch = carriers.find((c) => c.id === "arch")!;
    expect(Object.values(PrismaCarrierArchiveReason)).toContain(arch.archiveReason);
    expect(Object.values(CARRIER_ARCHIVE_REASON_LABELS)).not.toContain(arch.archiveReason);
  });
});

describe("shared/constants/carrierArchiveReasons — parity with the Prisma enum (runtime, both directions)", () => {
  const prismaMembers = [...Object.values(PrismaCarrierArchiveReason)].sort();

  it("the ordered list names exactly the enum members", () => {
    expect(prismaMembers.length).toBe(7); // R6 — the ratified vocabulary; a vacuity tripwire for the checks below
    expect([...CARRIER_ARCHIVE_REASONS].sort()).toEqual(prismaMembers);
  });

  it("the label map is keyed by exactly the enum members, each with a non-empty label", () => {
    expect(Object.keys(CARRIER_ARCHIVE_REASON_LABELS).sort()).toEqual(prismaMembers);
    for (const m of prismaMembers) expect(CARRIER_ARCHIVE_REASON_LABELS[m as keyof typeof CARRIER_ARCHIVE_REASON_LABELS].trim().length).toBeGreaterThan(0);
  });

  it("labels are operator copy: no em dash, no contraction, no raw enum leaking through", () => {
    for (const label of Object.values(CARRIER_ARCHIVE_REASON_LABELS)) {
      expect(label).not.toMatch(/—/);
      expect(label).not.toMatch(/'/);
      expect(label).not.toMatch(/_/);
    }
  });

  it("carrierArchiveReasonLabel: the label for a member, the raw code for a stranger, null for nothing", () => {
    expect(carrierArchiveReasonLabel("INSURANCE_LAPSED_UNRESPONSIVE")).toBe("Insurance lapsed, unresponsive");
    expect(carrierArchiveReasonLabel("NOT_A_REASON")).toBe("NOT_A_REASON");
    expect(carrierArchiveReasonLabel(null)).toBeNull();
    expect(carrierArchiveReasonLabel(undefined)).toBeNull();
  });
});

describe("shared/constants/carrierArchiveReasons — the label map is exhaustive AT THE TYPE LEVEL", () => {
  const SHARED_FILE = path.resolve(__dirname, "../../../../shared/constants/carrierArchiveReasons.ts");
  const PROBE = path.join(path.dirname(SHARED_FILE), "__b4a_typecheck_probe__.ts");
  const norm = (p: string) => path.resolve(p).replace(/\\/g, "/").toLowerCase();
  const IMPORT = 'import { CARRIER_ARCHIVE_REASON_LABELS, type CarrierArchiveReason } from "./carrierArchiveReasons";';

  /** Type-check a probe that sits beside the real shared file. Never touches disk. */
  function diagnosticsFor(source: string): string[] {
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      skipLibCheck: true,
      types: [],
    };
    const host = ts.createCompilerHost(options);
    const { getSourceFile, fileExists, readFile } = host;
    const isProbe = (p: string) => norm(p) === norm(PROBE);
    host.fileExists = (p) => isProbe(p) || fileExists.call(host, p);
    host.readFile = (p) => (isProbe(p) ? source : readFile.call(host, p));
    host.getSourceFile = (p, lang, onError, shouldCreate) =>
      isProbe(p) ? ts.createSourceFile(p, source, lang) : getSourceFile.call(host, p, lang, onError, shouldCreate);
    const program = ts.createProgram([PROBE], options, host);
    return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  }

  it("control: the exact Record over the union compiles clean (proves the probe reaches the real file)", () => {
    const diags = diagnosticsFor(`${IMPORT}\nconst ok: Record<CarrierArchiveReason, string> = CARRIER_ARCHIVE_REASON_LABELS;\nexport { ok };\n`);
    expect(diags).toEqual([]);
  });

  it("an eighth reason with no label fails to compile, naming the member", () => {
    const diags = diagnosticsFor(
      `${IMPORT}\ntype Widened = CarrierArchiveReason | "NEW_EIGHTH";\nconst bad: Record<Widened, string> = CARRIER_ARCHIVE_REASON_LABELS;\nexport { bad };\n`,
    );
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.join("\n")).toContain("NEW_EIGHTH");
  });

  it("a label for a reason the union does not name fails to compile, naming the key", () => {
    // Built from the real list so this probe never carries its own copy of the vocabulary.
    const every = CARRIER_ARCHIVE_REASONS.map((r) => `${r}: "x"`).join(", ");
    const diags = diagnosticsFor(
      `${IMPORT}\nconst bad: Readonly<Record<CarrierArchiveReason, string>> = { ${every}, NEW_EIGHTH: "x" };\nexport { bad };\n`,
    );
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.join("\n")).toContain("NEW_EIGHTH");
  });
});
