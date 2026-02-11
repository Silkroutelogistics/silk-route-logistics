import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { registerSchema, loginSchema } from "../validators/auth";
import { AuthRequest } from "../middleware/auth";
import { createOtp, verifyOtp as verifyOtpCode, getLastOtpCreatedAt, createPasswordResetToken, verifyPasswordResetToken } from "../services/otpService";
import { sendOtpEmail, sendPasswordResetEmail } from "../services/emailService";
import { setTokenCookie, clearTokenCookie } from "../utils/cookies";

const PASSWORD_EXPIRY_DAYS = 60;

export async function register(req: Request, res: Response) {
  const data = registerSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const { password: _, ...userData } = data;
  const user = await prisma.user.create({
    data: { ...userData, passwordHash, passwordChangedAt: new Date() } as any,
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
  setTokenCookie(res, token);
  res.status(201).json({ user, token });
}

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Send OTP instead of issuing JWT
  const code = await createOtp(user.id);
  // Fire-and-forget email send so SMTP issues don't block the response
  sendOtpEmail(user.email, user.firstName, code).catch((err) =>
    console.error("[OTP Email] Failed to send:", err.message),
  );

  res.json({ pendingOtp: true, email: user.email });
}

export async function handleVerifyOtp(req: Request, res: Response) {
  const { email, code } = req.body;
  if (!email || !code) {
    res.status(400).json({ error: "Email and code are required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const isValid = await verifyOtpCode(user.id, code);
  if (!isValid) {
    res.status(401).json({ error: "Invalid or expired code" });
    return;
  }

  // Check password expiry
  const baseDate = user.passwordChangedAt || user.createdAt;
  const daysSinceChange = (Date.now() - baseDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceChange >= PASSWORD_EXPIRY_DAYS) {
    // Issue a short-lived temp token for force-change only
    const tempToken = jwt.sign(
      { userId: user.id, purpose: "force-change-password" },
      env.JWT_SECRET,
      { expiresIn: "10m" } as jwt.SignOptions,
    );
    res.json({ passwordExpired: true, tempToken });
    return;
  }

  // Issue full JWT + audit log
  const ipAddress = req.headers["x-forwarded-for"] as string || req.ip || "";
  const userAgent = req.headers["user-agent"] || "";

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "LOGIN",
      entity: "Session",
      ipAddress: typeof ipAddress === "string" ? ipAddress : String(ipAddress),
      userAgent,
    },
  });

  setTokenCookie(res, token);
  res.json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    token,
  });
}

export async function handleResendOtp(req: Request, res: Response) {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Don't reveal whether user exists
    res.json({ message: "If an account exists, a new code has been sent" });
    return;
  }

  // Rate limit: last OTP must be at least 60s ago
  const lastCreated = await getLastOtpCreatedAt(user.id);
  if (lastCreated && Date.now() - lastCreated.getTime() < 60 * 1000) {
    res.status(429).json({ error: "Please wait before requesting a new code" });
    return;
  }

  const code = await createOtp(user.id);
  await sendOtpEmail(user.email, user.firstName, code);

  res.json({ message: "Code sent" });
}

export async function forceChangePassword(req: AuthRequest, res: Response) {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  // Verify this is a force-change-password token
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.split(" ")[1];
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string; purpose?: string };
      if (payload.purpose !== "force-change-password") {
        res.status(403).json({ error: "Invalid token for this operation" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { passwordHash, passwordChangedAt: new Date() },
  });

  // Issue full JWT
  const ipAddress = req.headers["x-forwarded-for"] as string || req.ip || "";
  const userAgent = req.headers["user-agent"] || "";

  const fullToken = jwt.sign({ userId: req.user!.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "LOGIN",
      entity: "Session",
      changes: "Password changed (expired)",
      ipAddress: typeof ipAddress === "string" ? ipAddress : String(ipAddress),
      userAgent,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });

  setTokenCookie(res, fullToken);
  res.json({ user, token: fullToken });
}

export async function getProfile(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      company: true, role: true, phone: true, isVerified: true, createdAt: true,
      carrierProfile: { select: { mcNumber: true, dotNumber: true, tier: true } },
    },
  });
  res.json(user);
}

export async function updateProfile(req: AuthRequest, res: Response) {
  const { firstName, lastName, phone, company } = req.body;
  const data: Record<string, string> = {};
  if (firstName) data.firstName = firstName;
  if (lastName) data.lastName = lastName;
  if (phone !== undefined) data.phone = phone;
  if (company !== undefined) data.company = company;

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data,
    select: { id: true, email: true, firstName: true, lastName: true, company: true, role: true, phone: true },
  });
  res.json(user);
}

export async function refreshToken(req: AuthRequest, res: Response) {
  const token = jwt.sign({ userId: req.user!.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
  setTokenCookie(res, token);
  res.json({ token });
}

export async function logout(_req: AuthRequest, res: Response) {
  clearTokenCookie(res);
  res.json({ message: "Logged out successfully" });
}

export async function changePassword(req: AuthRequest, res: Response) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) { res.status(401).json({ error: "Current password is incorrect" }); return; }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { passwordHash, passwordChangedAt: new Date() },
  });
  res.json({ message: "Password updated successfully" });
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  // Always return generic message to prevent user enumeration
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await createPasswordResetToken(user.id);
    const frontendUrl = env.CORS_ORIGIN.split(",")[0].trim();
    const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
    sendPasswordResetEmail(user.email, user.firstName, resetUrl).catch((err) =>
      console.error("[Password Reset Email] Failed:", err.message),
    );
  }

  res.json({ message: "If an account with that email exists, a password reset link has been sent." });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, email, newPassword } = req.body;
  if (!token || !email || !newPassword) {
    res.status(400).json({ error: "Token, email, and new password are required" });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  const userId = await verifyPasswordResetToken(token);
  if (!userId) {
    res.status(400).json({ error: "Invalid or expired reset link" });
    return;
  }

  // Verify the token belongs to the email provided
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.email !== email) {
    res.status(400).json({ error: "Invalid or expired reset link" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedAt: new Date() },
  });

  res.json({ message: "Password has been reset successfully. You can now log in." });
}
