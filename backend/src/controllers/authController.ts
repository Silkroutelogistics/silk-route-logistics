import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { registerSchema, loginSchema } from "../validators/auth";
import { AuthRequest } from "../middleware/auth";

export async function register(req: Request, res: Response) {
  const data = registerSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const { password: _, ...userData } = data;
  const user = await prisma.user.create({
    data: { ...userData, passwordHash } as any,
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
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

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
  res.json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    token,
  });
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
  res.json({ token });
}

export async function logout(_req: AuthRequest, res: Response) {
  // Client-side token removal is primary mechanism
  // This endpoint exists for future token blacklisting if needed
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

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: req.user!.id }, data: { passwordHash } });
  res.json({ message: "Password updated successfully" });
}
