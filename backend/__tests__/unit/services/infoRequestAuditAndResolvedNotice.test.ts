/**
 * An info request leaves an audit row at both ends, and the AE's "resolved"
 * email tells the truth about what arrived and where the application stands.
 *
 * v3.8.bcc. Before this, create and resolve wrote no AuditLog/SystemLog row —
 * the only trace was the email. And that email said "Their application has
 * returned to active review" UNCONDITIONALLY (false while other requests were
 * still open — the v3.8.bav class) and omitted the attachment line at zero, so
 * an AE went looking for a file that had never been sent.
 *
 * Templates are rendered by the real service with the network stubbed; the
 * assertions read the HTML that would have gone out. Audit rows are asserted
 * on the actor each event genuinely has: the AE on create, the carrier's own
 * User on resolve.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

const { confirmAnswered } = vi.hoisted(() => ({ confirmAnswered: vi.fn(async () => undefined) }));
vi.mock("../../../src/services/onboardingLifecycleService", () => ({
  notifyInfoRequestWithdrawn: vi.fn(async () => undefined),
  confirmInfoRequestAnswered: confirmAnswered,
}));
vi.mock("../../../src/services/emailService", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  wrap: (s: string) => s,
}));
vi.mock("../../../src/lib/logger", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { sendEmail } from "../../../src/services/emailService";
import { createInfoRequest, resolveInfoRequest } from "../../../src/services/infoRequestService";

const mockPrisma = prisma as any;
const mockSend = vi.mocked(sendEmail);

/** The last email sent — for resolve that is the AE notice (the carrier one is stubbed). */
function sentHtml(): string {
  expect(mockSend, "no email was sent at all").toHaveBeenCalled();
  return String(mockSend.mock.calls[mockSend.mock.calls.length - 1][2]);
}
const auditRows = () => (mockPrisma.auditLog.create.mock.calls as any[]).map((c) => c[0].data);
const flush = () => new Promise((r) => setImmediate(r));

const REQUEST = {
  id: "ir-1", status: "OPEN", category: "W9_UPDATE", message: "Please send a current W-9.",
  carrier: { id: "cp-1", userId: "u-carrier", companyName: "CJ MASTER FREIGHT INC", onboardingStatus: "INFO_REQUESTED", mcNumber: "MC-1300321", dotNumber: "4123456" },
  createdBy: { id: "u-ae", email: "ae@srl.invalid", firstName: "Sam" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  mockPrisma.auditLog.create = vi.fn(async () => ({}));
  mockPrisma.infoRequest.findUnique = vi.fn(async () => REQUEST);
  mockPrisma.infoRequest.update = vi.fn(async () => ({ id: "ir-1", status: "RESOLVED" }));
  mockPrisma.infoRequest.count = vi.fn(async () => 0);
  mockPrisma.infoRequest.create = vi.fn(async () => ({ id: "ir-1", category: "W9_UPDATE" }));
  mockPrisma.carrierProfile.update = vi.fn(async () => ({}));
  mockPrisma.carrierProfile.findUnique = vi.fn(async () => ({ id: "cp-1", onboardingStatus: "REVIEWING", companyName: "CJ MASTER FREIGHT INC", user: { email: "c@srl.invalid", firstName: "Chris" } }));
});

async function resolve(extra: Partial<{ attachmentCount: number; attachmentIds: string[] }> = {}) {
  await resolveInfoRequest({ requestId: "ir-1", carrierUserId: "u-carrier", resolvedNote: "Doc attached", ...extra });
  await flush();
}

describe("the AE resolved-email states the attachment count, always", () => {
  it("says 'No file attached' at zero rather than omitting the line", async () => {
    await resolve({ attachmentCount: 0 });
    const html = sentHtml();
    expect(html).toMatch(/Attachments/);
    expect(html).toMatch(/No file attached/);
  });
  it("counts the files when there are some", async () => {
    await resolve({ attachmentCount: 2, attachmentIds: ["d1", "d2"] });
    expect(sentHtml()).toMatch(/2 files uploaded/);
    expect(sentHtml()).not.toMatch(/No file attached/);
  });
});

describe("'returned to active review' is claimed only when it is true", () => {
  it("last open request answered → the sentence appears", async () => {
    mockPrisma.infoRequest.count = vi.fn(async () => 0);
    await resolve();
    expect(sentHtml()).toMatch(/returned to active review/);
    expect(sentHtml()).not.toMatch(/still open/);
  });
  it("other requests still open → it says so, and does NOT claim the return", async () => {
    mockPrisma.infoRequest.count = vi.fn(async () => 2);
    await resolve();
    expect(sentHtml()).toMatch(/Other requests are still open/);
    expect(sentHtml()).not.toMatch(/returned to active review/);
  });
});

describe("audit rows", () => {
  it("resolve writes INFO_REQUEST_RESOLVED as the carrier's own User, with the attachment ids", async () => {
    await resolve({ attachmentCount: 2, attachmentIds: ["d1", "d2"] });
    const row = auditRows().find((r) => r.action === "INFO_REQUEST_RESOLVED");
    expect(row).toBeTruthy();
    expect(row.userId).toBe("u-carrier");
    expect(row.entity).toBe("InfoRequest");
    expect(row.entityId).toBe("ir-1");
    expect(JSON.parse(row.changes)).toMatchObject({ attachmentCount: 2, attachmentIds: ["d1", "d2"], remainingOpen: 0 });
  });
  it("create writes INFO_REQUEST_CREATED as the AE who raised it", async () => {
    await createInfoRequest({ carrierId: "cp-1", createdById: "u-ae", category: "W9_UPDATE", message: "Please send a current W-9 form." });
    await flush();
    const row = auditRows().find((r) => r.action === "INFO_REQUEST_CREATED");
    expect(row).toBeTruthy();
    expect(row.userId).toBe("u-ae");
    expect(row.entityId).toBe("ir-1");
    expect(JSON.parse(row.changes)).toMatchObject({ carrierId: "cp-1", category: "W9_UPDATE" });
  });
  it("a rejecting audit write never fails the resolve", async () => {
    mockPrisma.auditLog.create = vi.fn(async () => { throw new Error("audit down"); });
    await expect(resolve()).resolves.toBeUndefined();
    expect(mockPrisma.infoRequest.update).toHaveBeenCalledTimes(1);
  });
  it("a SYNCHRONOUS throw from the client never fails the resolve or the create either", async () => {
    // The shared test double returns undefined from a bare vi.fn(), which is
    // exactly the shape that escaped as a TypeError on .catch and turned three
    // green status-gate cases red. The contract is never-fatal, not
    // never-fatal-if-the-client-behaves.
    mockPrisma.auditLog.create = vi.fn(() => { throw new Error("sync down"); });
    await expect(resolve()).resolves.toBeUndefined();
    mockPrisma.auditLog.create = vi.fn(() => undefined as any);
    await expect(createInfoRequest({ carrierId: "cp-1", createdById: "u-ae", category: "W9_UPDATE", message: "Please send a current W-9 form." })).resolves.toBeTruthy();
  });
});
