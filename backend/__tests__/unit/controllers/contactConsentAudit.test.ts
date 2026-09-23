/**
 * Removing a contact, or moving its consent, leaves a record.
 *
 * WHY. On 2026-09-23 the CRM contact that had been receiving a customer's
 * operational mail was removed, and NOTHING recorded it — not who, not when,
 * not what the flags had been. The route declares
 * auditLog("DELETE", "CustomerContact"), which reads as covered; that
 * middleware wraps res.json and the handler answers res.status(204).send(), so
 * the declared audit has never once fired. Reading the route file tells you
 * deletion is audited. It was not. (§19 Sub-pattern 16.)
 *
 * TABLE: AuditTrail, through lib/lifecycleAudit, for the reasons that file's
 * own header gives — `action` is the enum, `performedById` is a required FK to
 * the person who did it, and one table with `actionDetail` as the discriminator
 * beats a second convention.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";
import { updateCustomerContact, deleteCustomerContact } from "../../../src/controllers/customerController";

const mockPrisma = vi.mocked(prisma) as any;

const BEFORE = {
  id: "ct-1",
  name: "Pat Ops",
  email: "pat@example.com",
  receivesOperationalUpdates: false,
  receivesTrackingLink: false,
  doNotContact: false,
};

function call(fn: (req: any, res: any) => Promise<any>, body: Record<string, unknown> = {}) {
  const req = {
    params: { id: "cust-1", cid: "ct-1" },
    body,
    user: { id: "ae-1", email: "ae@srl.test", role: "OPERATIONS" },
    headers: {},
  } as any;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as any;
  return { req, res, run: () => fn(req, res) };
}

function theRow() {
  expect(mockPrisma.auditTrail.create, "exactly one audit row").toHaveBeenCalledTimes(1);
  return mockPrisma.auditTrail.create.mock.calls[0][0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.customerContact.findFirst.mockResolvedValue(BEFORE);
  mockPrisma.customerContact.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.customerContact.delete.mockResolvedValue(BEFORE);
  mockPrisma.auditTrail.create.mockResolvedValue({ id: "at-1" });
});

describe("contact removal is recorded", () => {
  it("DELETE / CONTACT_DELETED naming the contact and the consent it carried", async () => {
    const c = call(deleteCustomerContact);
    await c.run();
    const row = theRow();
    expect(row.action).toBe("DELETE");
    expect(row.entityType).toBe("CustomerContact");
    expect(row.entityId).toBe("ct-1");
    expect(row.changedFields.actionDetail).toBe("CONTACT_DELETED");
    expect(row.changedFields.actor).toMatchObject({ kind: "USER", userId: "ae-1" });
    // The consent it HELD is the point: "was this contact receiving mail when
    // it was removed" is the question, and an empty previous cannot answer it.
    expect(row.changedFields.previous).toMatchObject({
      email: "pat@example.com",
      receivesOperationalUpdates: false,
      receivesTrackingLink: false,
      doNotContact: false,
    });
    expect(c.res.status).toHaveBeenCalledWith(204);
  });

  it("records the consent as it stood, not as a default", async () => {
    mockPrisma.customerContact.findFirst.mockResolvedValue({
      ...BEFORE,
      receivesOperationalUpdates: true,
    });
    await call(deleteCustomerContact).run();
    expect(theRow().changedFields.previous.receivesOperationalUpdates).toBe(true);
  });
});

describe("a consent change is recorded with both sides", () => {
  it("UPDATE / CONTACT_CONSENT_CHANGED carrying before AND after", async () => {
    mockPrisma.customerContact.update.mockResolvedValue({
      ...BEFORE,
      receivesOperationalUpdates: true,
    });
    await call(updateCustomerContact, { receivesOperationalUpdates: true }).run();
    const row = theRow();
    expect(row.action).toBe("UPDATE");
    expect(row.changedFields.actionDetail).toBe("CONTACT_CONSENT_CHANGED");
    expect(row.changedFields.previous.receivesOperationalUpdates).toBe(false);
    expect(row.changedFields.new.receivesOperationalUpdates).toBe(true);
    expect(row.changedFields.reason).toContain("receivesOperationalUpdates");
  });

  it("covers the other two consents, not only the new one", async () => {
    mockPrisma.customerContact.update.mockResolvedValue({ ...BEFORE, doNotContact: true });
    await call(updateCustomerContact, { doNotContact: true }).run();
    expect(theRow().changedFields.reason).toContain("doNotContact");
  });

  it("an edit that moves NO consent records nothing — the log stays readable", async () => {
    mockPrisma.customerContact.update.mockResolvedValue({ ...BEFORE, name: "Pat O." });
    await call(updateCustomerContact, { name: "Pat O." }).run();
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
  });
});

describe("the middleware declaration is not the record", () => {
  it("the delete handler still answers 204 via .send(), which auditLog cannot see", () => {
    const mw = fs.readFileSync(path.resolve(__dirname, "../../../src/middleware/audit.ts"), "utf8");
    // If this ever stops being true, the controller-side row is redundant rather
    // than load-bearing — but until then, removing it loses the record entirely.
    expect(mw, "auditLog wraps res.json").toContain("res.json = function");
    expect(mw, "auditLog does NOT wrap res.send").not.toContain("res.send = function");
    const ctrl = fs.readFileSync(
      path.resolve(__dirname, "../../../src/controllers/customerController.ts"),
      "utf8",
    );
    expect(ctrl, "deleteCustomerContact answers 204 .send()").toContain("res.status(204).send()");
  });
});
