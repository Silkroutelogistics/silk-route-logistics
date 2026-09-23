/**
 * lib/lifecycleAudit — lifecycle-gaps B6a, finding #24.
 *
 * The record every lifecycle act leaves: who, why, whose fault, from/to. The
 * shape is asserted field by field because B6b's writers and the coverage
 * guard both depend on it, and because the never-throws property is the one
 * that keeps a broken audit table from breaking a cancel.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("../../../src/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { prisma } from "../../../src/config/database";
import { log } from "../../../src/lib/logger";
import { recordLifecycleEvent, LIFECYCLE_ACTION, type LifecycleActionDetail } from "../../../src/lib/lifecycleAudit";

const mockPrisma = prisma as any;
const ROOT = path.resolve(__dirname, "../../..");

function readSchemaEnum(name: string): string[] {
  const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  const m = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\}`));
  if (!m) throw new Error(`enum ${name} not found in schema.prisma`);
  return m[1]
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter((l) => l && /^[A-Z_]+$/.test(l));
}

const loadCancel = {
  actionDetail: "LOAD_CANCELLED" as const,
  entityType: "Load" as const,
  entityId: "ld-1",
  entityName: "SRL-121492",
  reasonCode: "SHIPPER_CANCELLED",
  reason: "Shipper pulled the order by phone",
  faultParty: "SHIPPER",
  previous: { status: "BOOKED" },
  new: { status: "CANCELLED" },
  actor: { userId: "u-ae", email: "ae@srl.test" },
  req: { headers: { "x-forwarded-for": "203.0.113.9" }, ip: "203.0.113.9", socket: { remoteAddress: "203.0.113.9" } } as any,
};

describe("recordLifecycleEvent — the row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.auditTrail.create.mockResolvedValue({ id: "at-1" });
  });

  it("writes an AuditTrail row with actor, reason, fault party and previous/new under the mapped action", async () => {
    await recordLifecycleEvent(loadCancel);
    expect(mockPrisma.auditTrail.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.auditTrail.create.mock.calls[0][0].data;
    expect(data.action).toBe("CANCEL");
    expect(data.entityType).toBe("Load");
    expect(data.entityId).toBe("ld-1");
    expect(data.performedById).toBe("u-ae");
    expect(data.ipAddress).toBe("203.0.113.9");
    expect(data.changedFields).toEqual({
      actionDetail: "LOAD_CANCELLED",
      entityName: "SRL-121492",
      reasonCode: "SHIPPER_CANCELLED",
      reason: "Shipper pulled the order by phone",
      faultParty: "SHIPPER",
      previous: { status: "BOOKED" },
      new: { status: "CANCELLED" },
      actor: { kind: "USER", userId: "u-ae", email: "ae@srl.test" },
    });
  });

  it("a TONU lands under CANCEL with actionDetail LOAD_TONU, so a reader can tell the two apart", async () => {
    await recordLifecycleEvent({
      ...loadCancel,
      actionDetail: "LOAD_TONU",
      reasonCode: null,
      faultParty: "CUSTOMER",
      new: { status: "TONU", tonuFaultSide: "CUSTOMER" },
    });
    const data = mockPrisma.auditTrail.create.mock.calls[0][0].data;
    expect(data.action).toBe("CANCEL");
    expect(data.changedFields.actionDetail).toBe("LOAD_TONU");
    expect(data.changedFields.faultParty).toBe("CUSTOMER");
    expect(data.changedFields.reasonCode).toBeNull();
  });

  it("absent optionals are recorded as null, never dropped — a reader must not have to guess whether a field was omitted", async () => {
    await recordLifecycleEvent({
      actionDetail: "CUSTOMER_REACTIVATED",
      entityType: "Customer",
      entityId: "c-1",
      entityName: "Acme",
      previous: { isActive: false },
      new: { isActive: true },
      actor: { userId: "u-ae" },
    });
    const data = mockPrisma.auditTrail.create.mock.calls[0][0].data;
    expect(data.action).toBe("STATUS_CHANGE");
    expect(data.ipAddress).toBeNull();
    expect(data.changedFields.reasonCode).toBeNull();
    expect(data.changedFields.reason).toBeNull();
    expect(data.changedFields.faultParty).toBeNull();
    expect(data.changedFields.actor).toEqual({ kind: "USER", userId: "u-ae", email: null });
  });

  it("never throws: a rejected write resolves, and the failure is logged with the actionDetail", async () => {
    mockPrisma.auditTrail.create.mockRejectedValue(new Error("audit_trails is down"));
    await expect(recordLifecycleEvent(loadCancel)).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledTimes(1);
    const [ctx, msg] = (log.error as any).mock.calls[0];
    expect(ctx.actionDetail).toBe("LOAD_CANCELLED");
    expect(ctx.entityId).toBe("ld-1");
    expect(String(msg)).toContain("transition stands");
  });
});

describe("LIFECYCLE_ACTION — the enum it lands on", () => {
  const details: LifecycleActionDetail[] = [
    "LOAD_CANCELLED", "LOAD_TONU", "LOAD_ARCHIVED", "LOAD_RESTORED",
    "CUSTOMER_INACTIVATED", "CUSTOMER_REACTIVATED", "CUSTOMER_DELETED", "CUSTOMER_RESTORED",
    "CARRIER_ARCHIVED", "CARRIER_RESTORED",
    "CONTACT_DELETED", "CONTACT_CONSENT_CHANGED",
  ];

  it("every action detail maps to a member of the AuditAction enum as declared in schema.prisma", () => {
    const members = readSchemaEnum("AuditAction");
    expect(members.length).toBeGreaterThan(5); // vacuity tripwire on the schema read
    for (const d of details) {
      expect(members, `${d} → ${LIFECYCLE_ACTION[d]}`).toContain(LIFECYCLE_ACTION[d]);
    }
  });

  it("CANCEL and DEACTIVATE are in the schema AND added by the migration, in that name — the two halves of B6a", () => {
    const members = readSchemaEnum("AuditAction");
    expect(members).toContain("CANCEL");
    expect(members).toContain("DEACTIVATE");
    const sql = fs
      .readFileSync(path.join(ROOT, "prisma/migrations/20260918203633_audit_action_cancel_deactivate/migration.sql"), "utf8")
      // A commented-out statement is prose, not a statement: strip `-- …` before
      // matching, or a value that stopped being added still reads as added.
      .replace(/--[^\r\n]*/g, "");
    const added = [...sql.matchAll(/ALTER TYPE "AuditAction" ADD VALUE '([A-Z_]+)'/g)].map((m) => m[1]).sort();
    expect(added).toEqual(["CANCEL", "DEACTIVATE"]);
  });

  it("the load acts land under CANCEL, the deactivations under DEACTIVATE, and every detail is mapped", () => {
    expect(LIFECYCLE_ACTION.LOAD_CANCELLED).toBe("CANCEL");
    expect(LIFECYCLE_ACTION.LOAD_TONU).toBe("CANCEL");
    expect(LIFECYCLE_ACTION.CUSTOMER_INACTIVATED).toBe("DEACTIVATE");
    expect(LIFECYCLE_ACTION.CARRIER_ARCHIVED).toBe("DEACTIVATE");
    expect(LIFECYCLE_ACTION.CUSTOMER_DELETED).toBe("DELETE");
    expect(LIFECYCLE_ACTION.LOAD_ARCHIVED).toBe("DELETE");
    expect(LIFECYCLE_ACTION.LOAD_RESTORED).toBe("STATUS_CHANGE");
    expect(LIFECYCLE_ACTION.CONTACT_DELETED).toBe("DELETE");
    // A consent change is an edit to a field, so it lands under UPDATE and
    // actionDetail is what a reader greps to find it — see the lib header.
    expect(LIFECYCLE_ACTION.CONTACT_CONSENT_CHANGED).toBe("UPDATE");
    expect(Object.keys(LIFECYCLE_ACTION).sort()).toEqual([...details].sort());
  });
});
