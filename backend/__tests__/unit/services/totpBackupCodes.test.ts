// Backup codes are password-equivalent under mandatory 2FA (Arc 10 B1-RECOVERY).
//
// They used to be AES-encrypted, which is reversible: anyone holding
// ENCRYPTION_KEY could read every code back. Defensible while TOTP was optional
// and a backup code was a convenience; not defensible once a backup code is a
// complete authentication factor. And the consume path did a read-modify-write,
// so the same code presented twice concurrently could be spent twice — which is
// the one thing a consume-once credential must not do.

import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));

// Transparent "encryption" so the test can read what was stored. The real
// encrypt/decrypt are exercised by their own tests; what matters here is the
// CONTENT of the envelope, which is the thing that changed.
vi.mock("../../../src/utils/encryption", () => ({
  encrypt: (v: string) => `enc(${v})`,
  decrypt: (v: string) => (v.startsWith("enc(") ? v.slice(4, -1) : v),
}));

vi.mock("otpauth", () => ({
  TOTP: class {
    secret = { base32: "TESTSECRET" };
    toString() { return "otpauth://totp/test"; }
    validate() { return null; } // never a valid TOTP, so tests exercise backup codes
  },
  Secret: { fromBase32: () => ({}) },
}));
vi.mock("qrcode", () => ({ toDataURL: async () => "data:image/png;base64,x" }));

import { generateTotpSetup, verifyTotpCode } from "../../../src/services/totpService";

describe("backup codes at rest", () => {
  beforeEach(() => vi.resetAllMocks());

  it("stores bcrypt hashes, never the codes themselves", async () => {
    mockPrisma.user.update.mockResolvedValue({});
    const { backupCodes } = await generateTotpSetup("u1", "carrier@example.com");

    const stored = JSON.parse(
      mockPrisma.user.update.mock.calls[0][0].data.totpBackupCodes.slice(4, -1),
    ) as string[];

    expect(stored).toHaveLength(8);
    for (const entry of stored) expect(entry.startsWith("$2")).toBe(true);
    // The decisive assertion: no plaintext code appears anywhere in storage.
    for (const code of backupCodes) expect(stored).not.toContain(code);
  });

  it("returns the plaintext codes exactly once, to be shown to the carrier", async () => {
    mockPrisma.user.update.mockResolvedValue({});
    const { backupCodes } = await generateTotpSetup("u1", "carrier@example.com");

    expect(backupCodes).toHaveLength(8);
    for (const c of backupCodes) expect(c).toMatch(/^[0-9A-F]{8}$/);
  });

  it("hashes verify against the codes handed out", async () => {
    mockPrisma.user.update.mockResolvedValue({});
    const { backupCodes } = await generateTotpSetup("u1", "carrier@example.com");
    const stored = JSON.parse(
      mockPrisma.user.update.mock.calls[0][0].data.totpBackupCodes.slice(4, -1),
    ) as string[];

    expect(await bcrypt.compare(backupCodes[0], stored[0])).toBe(true);
  });
});

describe("consume-once", () => {
  beforeEach(() => vi.resetAllMocks());

  async function armWith(codes: string[]) {
    const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, 4)));
    const envelope = `enc(${JSON.stringify(hashes)})`;
    mockPrisma.user.findUnique.mockResolvedValue({
      totpSecret: "enc(TESTSECRET)",
      totpEnabled: true,
      totpBackupCodes: envelope,
    });
    return envelope;
  }

  it("accepts a valid backup code once", async () => {
    await armWith(["AAAA1111", "BBBB2222"]);
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

    expect(await verifyTotpCode("u1", "AAAA1111")).toBe(true);
  });

  it("removes the used code, leaving the others", async () => {
    await armWith(["AAAA1111", "BBBB2222"]);
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

    await verifyTotpCode("u1", "AAAA1111");

    const written = JSON.parse(
      mockPrisma.user.updateMany.mock.calls[0][0].data.totpBackupCodes.slice(4, -1),
    ) as string[];
    expect(written).toHaveLength(1);
    expect(await bcrypt.compare("BBBB2222", written[0])).toBe(true);
    expect(await bcrypt.compare("AAAA1111", written[0])).toBe(false);
  });

  it("compare-and-swaps on the exact value it read, so a concurrent spend loses", async () => {
    // The old code read, spliced and wrote blindly. Two requests with the same
    // code both found it and both succeeded.
    const envelope = await armWith(["AAAA1111"]);
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

    await verifyTotpCode("u1", "AAAA1111");

    const where = mockPrisma.user.updateMany.mock.calls[0][0].where;
    expect(where.id).toBe("u1");
    expect(where.totpBackupCodes).toBe(envelope);
  });

  it("rejects when the swap matches nothing — someone else spent it first", async () => {
    await armWith(["AAAA1111"]);
    mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });

    expect(await verifyTotpCode("u1", "AAAA1111")).toBe(false);
  });

  it("rejects a code that was never issued", async () => {
    await armWith(["AAAA1111"]);
    expect(await verifyTotpCode("u1", "ZZZZ9999")).toBe(false);
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("is case-insensitive, matching how the codes are displayed", async () => {
    await armWith(["AAAA1111"]);
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    expect(await verifyTotpCode("u1", "aaaa1111")).toBe(true);
  });
});

describe("legacy plaintext entries", () => {
  beforeEach(() => vi.resetAllMocks());

  it("still accepts a pre-upgrade plaintext code, so nobody is locked out", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      totpSecret: "enc(TESTSECRET)",
      totpEnabled: true,
      totpBackupCodes: `enc(${JSON.stringify(["AAAA1111", "BBBB2222"])})`,
    });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

    expect(await verifyTotpCode("u1", "AAAA1111")).toBe(true);
  });

  it("rewrites the survivors as hashes, so the set converges", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      totpSecret: "enc(TESTSECRET)",
      totpEnabled: true,
      totpBackupCodes: `enc(${JSON.stringify(["AAAA1111", "BBBB2222"])})`,
    });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

    await verifyTotpCode("u1", "AAAA1111");

    const written = JSON.parse(
      mockPrisma.user.updateMany.mock.calls[0][0].data.totpBackupCodes.slice(4, -1),
    ) as string[];
    expect(written[0].startsWith("$2")).toBe(true);
    expect(await bcrypt.compare("BBBB2222", written[0])).toBe(true);
  });
});

describe("failure modes fail closed", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects when the payload is unreadable rather than falling through", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      totpSecret: "enc(TESTSECRET)",
      totpEnabled: true,
      totpBackupCodes: "enc(not-json)",
    });
    expect(await verifyTotpCode("u1", "AAAA1111")).toBe(false);
  });

  it("rejects when there is no secret at all", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ totpSecret: null, totpEnabled: false, totpBackupCodes: null });
    expect(await verifyTotpCode("u1", "AAAA1111")).toBe(false);
  });
});
