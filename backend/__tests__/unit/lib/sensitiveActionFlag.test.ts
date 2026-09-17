/**
 * B5b-1 (2026-09-17) — a sensitive act shortly after a flagged login is
 * recorded on the login.
 *
 * NEW_DEVICE and NEW_COUNTRY alone are weak signals; what sharpens them is a
 * payment-terms change, an insurance update or a document upload inside a
 * day. The flag lands on the LOGIN row (the row an AE reads back) and one
 * SystemLog SECURITY/WARNING row is written for the digest. Informational:
 * the act is never blocked, and a failure here is swallowed.
 *
 * Adversarially verified at authoring: dropping the 24h check turns the
 * "30 hours later" control red; dropping the NEW_DEVICE/NEW_COUNTRY
 * precondition turns the clean-login control red; removing the call from the
 * insurance PATCH turns its wiring case red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";
import {
  flagSensitiveActionAfterNewLogin,
  SENSITIVE_ACTION_WINDOW_HOURS,
  SENSITIVE_LOGIN_RISK_SOURCE,
} from "../../../src/lib/loginFlags";

const mockPrisma = prisma as any;
const NOW = new Date("2026-09-17T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const login = (flags: string[], at: Date) => ({ id: "al-1", createdAt: at, details: { device: "Chrome on Windows", flags } });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.auditLog.findFirst = vi.fn();
  mockPrisma.auditLog.update = vi.fn().mockResolvedValue({});
  mockPrisma.systemLog.create = vi.fn().mockResolvedValue({});
});

describe("when it fires", () => {
  it("an insurance update one hour after a NEW_DEVICE login: flag appended to THAT row, one SECURITY/WARNING SystemLog with [uid:]", async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue(login(["NEW_DEVICE"], hoursAgo(1)));
    const r = await flagSensitiveActionAfterNewLogin("u-1", "insurance-update", NOW);
    expect(r).toEqual({ flagged: true });
    expect(mockPrisma.auditLog.findFirst.mock.calls[0][0]).toMatchObject({ where: { userId: "u-1", action: "LOGIN" }, orderBy: { createdAt: "desc" } });
    expect(mockPrisma.auditLog.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.update.mock.calls[0][0]).toMatchObject({
      where: { id: "al-1" },
      data: { details: { device: "Chrome on Windows", flags: ["NEW_DEVICE", "SENSITIVE_ACTION_AFTER_NEW_LOGIN:insurance-update"] } },
    });
    expect(mockPrisma.systemLog.create).toHaveBeenCalledTimes(1);
    const row = mockPrisma.systemLog.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ logType: "SECURITY", severity: "WARNING", source: SENSITIVE_LOGIN_RISK_SOURCE, userId: "u-1" });
    expect(row.message).toContain("[uid:u-1]");
    expect(row.message).toContain("insurance-update");
  });

  it("NEW_COUNTRY qualifies as well; IMPOSSIBLE_TRAVEL alone does not", async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue(login(["NEW_COUNTRY"], hoursAgo(2)));
    expect(await flagSensitiveActionAfterNewLogin("u-1", "quickpay-election", NOW)).toEqual({ flagged: true });
    mockPrisma.auditLog.findFirst.mockResolvedValue(login(["IMPOSSIBLE_TRAVEL"], hoursAgo(2)));
    expect(await flagSensitiveActionAfterNewLogin("u-1", "quickpay-election", NOW)).toEqual({ flagged: false });
  });

  it("is idempotent per action — a second upload does not append a second flag or a second SystemLog", async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue(login(["NEW_DEVICE", "SENSITIVE_ACTION_AFTER_NEW_LOGIN:document-upload"], hoursAgo(1)));
    expect(await flagSensitiveActionAfterNewLogin("u-1", "document-upload", NOW)).toEqual({ flagged: true });
    expect(mockPrisma.auditLog.update).not.toHaveBeenCalled();
    expect(mockPrisma.systemLog.create).not.toHaveBeenCalled();
  });
});

describe("when it does not", () => {
  it("an insurance update after a CLEAN login writes nothing", async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue(login([], hoursAgo(1)));
    expect(await flagSensitiveActionAfterNewLogin("u-1", "insurance-update", NOW)).toEqual({ flagged: false });
    expect(mockPrisma.auditLog.update).not.toHaveBeenCalled();
    expect(mockPrisma.systemLog.create).not.toHaveBeenCalled();
  });
  it("a flagged login 30 hours old is outside the window — control for the 24h check", async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue(login(["NEW_DEVICE"], hoursAgo(30)));
    expect(await flagSensitiveActionAfterNewLogin("u-1", "insurance-update", NOW)).toEqual({ flagged: false });
    expect(mockPrisma.auditLog.update).not.toHaveBeenCalled();
    expect(SENSITIVE_ACTION_WINDOW_HOURS).toBe(24);
  });
  it("no LOGIN row at all writes nothing", async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue(null);
    expect(await flagSensitiveActionAfterNewLogin("u-1", "insurance-update", NOW)).toEqual({ flagged: false });
  });
  it("never throws — the act it decorates has already succeeded", async () => {
    mockPrisma.auditLog.findFirst.mockRejectedValue(new Error("db down"));
    await expect(flagSensitiveActionAfterNewLogin("u-1", "insurance-update", NOW)).resolves.toEqual({ flagged: false });
    mockPrisma.auditLog.findFirst.mockResolvedValue(login(["NEW_DEVICE"], hoursAgo(1)));
    mockPrisma.auditLog.update.mockRejectedValue(new Error("db down"));
    await expect(flagSensitiveActionAfterNewLogin("u-1", "insurance-update", NOW)).resolves.toEqual({ flagged: false });
  });
});

describe("the three B5b-1 call sites are wired (read from source)", () => {
  const read = (f: string) =>
    fs.readFileSync(path.join(__dirname, "../../../src/routes/", f), "utf8")
      .split(/\r?\n/).map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");
  const between = (src: string, from: string, to: string) => {
    const a = src.indexOf(from); expect(a, from).toBeGreaterThan(0);
    const b = src.indexOf(to, a + 1); expect(b, to).toBeGreaterThan(a);
    return src.slice(a, b);
  };
  it("quickpay-election fires it on both the enable and the disable path", () => {
    const block = between(read("carrierAuth.ts"), 'router.post("/quickpay-election"', 'router.post("/quickpay-pilot-request"');
    expect(block.split('flagSensitiveActionAfterNewLogin(req.user!.id, "quickpay-election")').length - 1).toBe(2);
  });
  it("quickpay-pilot-request fires it after the request is created", () => {
    const src = read("carrierAuth.ts");
    const a = src.indexOf('router.post("/quickpay-pilot-request"');
    expect(a).toBeGreaterThan(0);
    const block = src.slice(a, src.indexOf("\nrouter.", a + 1));
    expect(block).toContain('flagSensitiveActionAfterNewLogin(req.user!.id, "quickpay-pilot-request")');
  });
  it("the insurance PATCH fires it after the write", () => {
    const block = between(read("carrierCompliance.ts"), 'router.patch("/insurance"', "export default");
    expect(block).toContain('flagSensitiveActionAfterNewLogin(req.user!.id, "insurance-update")');
  });
});
