import { z } from "zod";

/**
 * v3.8.auf — roles a member of the public may self-assign at POST /api/auth/register.
 *
 * That endpoint is UNAUTHENTICATED and authController.register spreads the
 * validated body straight into prisma.user.create with no second role check,
 * so THIS LIST IS THE ONLY GATE on what role a stranger can mint.
 *
 * BROKER was removed here. It is a staff role: authController's AE_ROLES set
 * admits it to the AE console, and it reaches ~278 authorize() gates including
 * the full margin/P&L, fund and payment-preparation surfaces. Anyone on the
 * internet could self-issue one.
 *
 * This is an ALLOWLIST, so every role is unregisterable unless named here —
 * ADMIN, CEO, DISPATCH, OPERATIONS, ACCOUNTING, ACCOUNT_EXECUTIVE and the
 * deprecated AE are all excluded by construction rather than by omission.
 * Adding a staff role to this array re-opens the hole; there is a guard test
 * that fails if BROKER or ACCOUNT_EXECUTIVE ever reappear.
 */
export const PUBLIC_REGISTERABLE_ROLES = ["CARRIER", "SHIPPER", "FACTOR"] as const;

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, "Password must be at least 10 characters"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().optional(),
  role: z.enum(PUBLIC_REGISTERABLE_ROLES),
  phone: z.string().optional(),
  mcNumber: z.string().optional(),
  dotNumber: z.string().optional(),
});

// Sprint 174 (v3.8.acf) — Portal-boundary role gate. Optional
// expectedRole param identifies which portal initiated the login so
// the controller can reject cross-portal credential entry (e.g.,
// CARRIER creds used on /shipper/login). "AE" maps to the set
// {ADMIN, CEO, BROKER, DISPATCH, OPERATIONS, ACCOUNTING}; "SHIPPER"
// maps to the single SHIPPER role. Carrier portal flow is unaffected —
// it uses /api/carrier-auth/* which has its own gate.
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  expectedRole: z.enum(["AE", "SHIPPER"]).optional(),
});
