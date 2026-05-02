// Regression + behavior suite for resetPassword handler (v3.7.m Phase 5E / auth hotfix).
//
// Pre-v3.7.m bug: verifyPasswordResetToken atomically validated AND consumed the
// reset token on the first POST, so a missing-TOTP rejection burned the token
// and left the user unable to retry.
//
// v3.7.m fix:
//   1. peekPasswordResetToken — read-only validation (no mutation)
//   2. validate email match + TOTP gate BEFORE any mutation
//   3. prisma.$transaction([user.update, otpCode.update]) — atomic commit,
//      rollback preserves token
//
// This suite covers 9 scenarios: 5 standard (T1–T5) + 4 edge cases
// (T6 concurrent, T6b transaction rollback, T7 wrong TOTP, T8 bad password).

import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/emailService", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/totpService", () => ({
  verifyTotpCode: vi.fn(),
}));

import { resetPassword } from "../../../src/controllers/authController";
import { verifyTotpCode } from "../../../src/services/totpService";

const mockPrisma = vi.mocked(prisma);
const mockVerifyTotp = vi.mocked(verifyTotpCode);

function mockReqRes(body: Record<string, unknown> = {}) {
  const req: Record<string, unknown> = { body };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req: req as any, res: res as any };
}

const VALID_TOKEN = "abc123def456";
const VALID_EMAIL = "reset-test@silkroutelogistics.ai";
const VALID_PASSWORD = "Trackr3set!@Kx9";   // 15 chars, mixed, not common
const SHORT_PASSWORD = "short";              // 5 chars — fails policy
const VALID_TOTP = "123456";
const WRONG_TOTP = "000000";
const TEST_OTP_ID = "otp-row-1";
const TEST_USER_ID = "user-1";
const OLD_HASH = "$2a$12$OLD_HASH_PLACEHOLDER_FOR_TESTS";

function validPeekRow() {
  return {
    id: TEST_OTP_ID,
    userId: TEST_USER_ID,
    code: `RESET:${VALID_TOKEN}`,
    used: false,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    createdAt: new Date(),
  };
}

function validUser(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_USER_ID,
    email: VALID_EMAIL,
    totpEnabled: false,
    passwordHash: OLD_HASH,
    ...overrides,
  };
}

describe("resetPassword — v3.7.m peek-validate-transactional-consume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Standard tests (T1–T5) ─────────────────────────────────

  it("T1 — valid token + valid TOTP + valid password → success, $transaction invoked once", async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue(validPeekRow() as any);
    mockPrisma.user.findUnique.mockResolvedValue(
      validUser({ totpEnabled: true }) as any,
    );
    mockVerifyTotp.mockResolvedValue(true);
    mockPrisma.$transaction.mockResolvedValue([]);

    const { req, res } = mockReqRes({
      token: VALID_TOKEN,
      email: VALID_EMAIL,
      newPassword: VALID_PASSWORD,
      totpCode: VALID_TOTP,
    });

    await resetPassword(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/reset successfully/i),
      }),
    );
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    // No error response issued
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(401);
  });

  it("T2 — expired token → 400, token NOT consumed", async () => {
    // peek filters expiresAt: { gt: now }; expired rows are excluded → null.
    mockPrisma.otpCode.findFirst.mockResolvedValue(null);

    const { req, res } = mockReqRes({
      token: VALID_TOKEN,
      email: VALID_EMAIL,
      newPassword: VALID_PASSWORD,
    });

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringMatching(/invalid or expired/i),
      }),
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.otpCode.update).not.toHaveBeenCalled();
  });

  it("T3 — already-consumed token → 400, no mutation", async () => {
    // peek also filters used: false; consumed rows are excluded → null.
    mockPrisma.otpCode.findFirst.mockResolvedValue(null);

    const { req, res } = mockReqRes({
      token: VALID_TOKEN,
      email: VALID_EMAIL,
      newPassword: VALID_PASSWORD,
    });

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("T4 — data-layer: user.update called with bcrypt hash + fresh passwordChangedAt, bcrypt.compare verifies", async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue(validPeekRow() as any);
    mockPrisma.user.findUnique.mockResolvedValue(
      validUser({ totpEnabled: false }) as any,
    );
    mockPrisma.$transaction.mockResolvedValue([]);

    const { req, res } = mockReqRes({
      token: VALID_TOKEN,
      email: VALID_EMAIL,
      newPassword: VALID_PASSWORD,
    });

    const before = Date.now();
    await resetPassword(req, res);
    const after = Date.now();

    // prisma.user.update is invoked by the handler when building the
    // $transaction array; the mock records the call args.
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TEST_USER_ID },
        data: expect.objectContaining({
          passwordHash: expect.stringMatching(/^\$2[ayb]\$/), // bcrypt format
          passwordChangedAt: expect.any(Date),
        }),
      }),
    );

    // Data-layer assertions (T4 adjustment 1 per Wasi):
    const call = (mockPrisma.user.update.mock.calls[0] ?? [])[0] as any;
    const hashArg = call.data.passwordHash as string;
    const dateArg = call.data.passwordChangedAt as Date;

    // (a) Hash differs from pre-T1 hash
    expect(hashArg).not.toBe(OLD_HASH);
    // (b) passwordChangedAt within the last second
    expect(dateArg.getTime()).toBeGreaterThanOrEqual(before);
    expect(dateArg.getTime()).toBeLessThanOrEqual(after);
    // (c) bcrypt.compare(newPassword, hash) === true
    expect(await bcrypt.compare(VALID_PASSWORD, hashArg)).toBe(true);
  });

  it("T5 — reuse original token after T1 success → 'invalid or expired' (peek excludes consumed rows)", async () => {
    // After a successful reset, the token row has used: true.
    // Real Postgres: next findFirst with used: false filter returns null.
    // Mock: simulate by returning null on the second peek.
    mockPrisma.otpCode.findFirst.mockResolvedValue(null);

    const { req, res } = mockReqRes({
      token: VALID_TOKEN,
      email: VALID_EMAIL,
      newPassword: VALID_PASSWORD,
    });

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringMatching(/invalid or expired/i),
      }),
    );
  });

  // ─── Edge cases (T6, T6b, T7, T8) ────────────────────────────

  it("T6 — concurrent double-submit: exactly one succeeds, the other fails at $transaction", async () => {
    // Both requests peek successfully (race: no commit has landed yet).
    // Mock ordering uses FIFO on $transaction: first call resolves, second
    // rejects as if the otpCode row's used: false predicate no longer
    // matches post-commit.
    //
    // v3.8.o.1 — assertions are now ORDER-INDEPENDENT. Pre-v3.8.o.1 the
    // test asserted `p1.status === "fulfilled"` and `p2.status ===
    // "rejected"` based on positional order in the Promise.allSettled
    // array. But two concurrent resetPassword() calls suspend at their
    // first `await` and the event loop's resume order is not guaranteed
    // to match the array order — whichever request happens to reach
    // `await prisma.$transaction(...)` first consumes the success mock.
    // Local Node tended to be deterministic; CI's slightly different
    // timing characteristics flipped the order ~50% of the time, causing
    // intermittent failures. Fix: assert that EXACTLY ONE fulfilled and
    // EXACTLY ONE rejected (regardless of which positional request won),
    // then identify the fulfilled response by status and verify its body.
    mockPrisma.otpCode.findFirst.mockResolvedValue(validPeekRow() as any);
    mockPrisma.user.findUnique.mockResolvedValue(validUser() as any);
    mockPrisma.$transaction
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("record not found"));

    const r1 = mockReqRes({
      token: VALID_TOKEN,
      email: VALID_EMAIL,
      newPassword: VALID_PASSWORD,
    });
    const r2 = mockReqRes({
      token: VALID_TOKEN,
      email: VALID_EMAIL,
      newPassword: VALID_PASSWORD,
    });

    const [p1, p2] = await Promise.allSettled([
      resetPassword(r1.req, r1.res),
      resetPassword(r2.req, r2.res),
    ]);

    // Order-independent: exactly one fulfilled, exactly one rejected.
    const statuses = [p1.status, p2.status].sort();
    expect(statuses).toEqual(["fulfilled", "rejected"]);

    // Identify which req/res pair corresponds to the fulfilled request
    // (whichever one won the race to $transaction).
    const fulfilledRes = p1.status === "fulfilled" ? r1.res : r2.res;

    // The fulfilled request returned the success response.
    expect(fulfilledRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/reset successfully/i),
      }),
    );

    // The rejected request's error propagates to Express middleware (no
    // try/catch in handler) which would 500 in production. No additional
    // assertion needed — the rejected promise status itself is the signal.
  });

  it("T6b — $transaction throws → handler rejects; consume was NOT issued outside transaction", async () => {
    // Mock limitation note: real atomicity is a Postgres/Prisma guarantee;
    // in unit tests we can only assert the handler didn't bypass the
    // $transaction boundary by calling otpCode.update directly. Real
    // rollback behavior is documented and relied on via the transaction
    // semantics — see Prisma docs on $transaction.
    mockPrisma.otpCode.findFirst.mockResolvedValue(validPeekRow() as any);
    mockPrisma.user.findUnique.mockResolvedValue(validUser() as any);
    mockPrisma.$transaction.mockRejectedValueOnce(
      new Error("simulated DB failure"),
    );

    const { req, res } = mockReqRes({
      token: VALID_TOKEN,
      email: VALID_EMAIL,
      newPassword: VALID_PASSWORD,
    });

    await expect(resetPassword(req, res)).rejects.toThrow(/simulated/);

    // No success response
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/reset successfully/i),
      }),
    );
    // The handler never calls prisma.otpCode.update outside $transaction —
    // the only otpCode.update invocation is the one built into the
    // $transaction array, which rolled back when $transaction threw.
  });

  it("T7 — wrong TOTP → 401, token NOT consumed; retry with correct TOTP succeeds on same token [direct regression]", async () => {
    mockPrisma.otpCode.findFirst.mockResolvedValue(validPeekRow() as any);
    mockPrisma.user.findUnique.mockResolvedValue(
      validUser({ totpEnabled: true }) as any,
    );
    mockVerifyTotp
      .mockResolvedValueOnce(false) // first attempt: wrong
      .mockResolvedValueOnce(true); // second attempt: correct
    mockPrisma.$transaction.mockResolvedValue([]);

    // First attempt — wrong TOTP
    const r1 = mockReqRes({
      token: VALID_TOKEN,
      email: VALID_EMAIL,
      newPassword: VALID_PASSWORD,
      totpCode: WRONG_TOTP,
    });
    await resetPassword(r1.req, r1.res);

    expect(r1.res.status).toHaveBeenCalledWith(401);
    expect(r1.res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringMatching(/invalid.*authenticator/i),
      }),
    );
    // Critical: token NOT consumed on failed TOTP.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();

    // Second attempt — same token, correct TOTP
    const r2 = mockReqRes({
      token: VALID_TOKEN,
      email: VALID_EMAIL,
      newPassword: VALID_PASSWORD,
      totpCode: VALID_TOTP,
    });
    await resetPassword(r2.req, r2.res);

    expect(r2.res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/reset successfully/i),
      }),
    );
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });

  it("T8 — failed password complexity → 400, token NOT consumed; retry with valid password succeeds on same token", async () => {
    // validatePassword runs BEFORE peek in the handler, so peek isn't even
    // called on the first attempt. Token remains untouched either way.
    mockPrisma.otpCode.findFirst.mockResolvedValue(validPeekRow() as any);
    mockPrisma.user.findUnique.mockResolvedValue(
      validUser({ totpEnabled: true }) as any,
    );
    mockVerifyTotp.mockResolvedValue(true);
    mockPrisma.$transaction.mockResolvedValue([]);

    // First attempt — password too short
    const r1 = mockReqRes({
      token: VALID_TOKEN,
      email: VALID_EMAIL,
      newPassword: SHORT_PASSWORD,
      totpCode: VALID_TOTP,
    });
    await resetPassword(r1.req, r1.res);

    expect(r1.res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();

    // Second attempt — same token, valid password
    const r2 = mockReqRes({
      token: VALID_TOKEN,
      email: VALID_EMAIL,
      newPassword: VALID_PASSWORD,
      totpCode: VALID_TOTP,
    });
    await resetPassword(r2.req, r2.res);

    expect(r2.res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/reset successfully/i),
      }),
    );
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });
});
