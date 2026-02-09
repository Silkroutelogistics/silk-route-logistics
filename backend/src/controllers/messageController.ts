import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { sendMessageSchema } from "../validators/message";

export async function sendMessage(req: AuthRequest, res: Response) {
  const data = sendMessageSchema.parse(req.body);
  const message = await prisma.message.create({
    data: { senderId: req.user!.id, ...data } as any,
    include: { sender: { select: { id: true, firstName: true, lastName: true } } },
  });
  res.status(201).json(message);
}

export async function getConversation(req: AuthRequest, res: Response) {
  const otherId = req.query.conversationWith as string;
  if (!otherId) { res.status(400).json({ error: "conversationWith is required" }); return; }

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: req.user!.id, receiverId: otherId },
        { senderId: otherId, receiverId: req.user!.id },
      ],
    },
    include: { sender: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Mark unread messages as read
  await prisma.message.updateMany({
    where: { senderId: otherId, receiverId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });

  res.json(messages);
}

export async function getConversations(req: AuthRequest, res: Response) {
  const userId = req.user!.id;

  // Get all messages involving this user
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, company: true, role: true, email: true } },
      receiver: { select: { id: true, firstName: true, lastName: true, company: true, role: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Group by conversation partner
  const convMap = new Map<string, { partner: { id: string; firstName: string; lastName: string; company: string | null; role: string; email: string }; lastMessage: string; lastMessageAt: Date; unreadCount: number }>();

  for (const msg of messages) {
    const partnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;
    const partner = msg.senderId === userId ? msg.receiver : msg.sender;

    if (!convMap.has(partnerId)) {
      convMap.set(partnerId, {
        partner: { id: partner.id, firstName: partner.firstName, lastName: partner.lastName, company: partner.company, role: partner.role, email: partner.email },
        lastMessage: msg.content,
        lastMessageAt: msg.createdAt,
        unreadCount: 0,
      });
    }

    // Count unread messages from this partner
    if (msg.senderId !== userId && !msg.readAt) {
      const conv = convMap.get(partnerId)!;
      conv.unreadCount++;
    }
  }

  const conversations = Array.from(convMap.values()).sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  res.json(conversations);
}

export async function getUnreadCount(req: AuthRequest, res: Response) {
  const count = await prisma.message.count({
    where: { receiverId: req.user!.id, readAt: null },
  });
  res.json({ unreadCount: count });
}

export async function getUsers(req: AuthRequest, res: Response) {
  const search = req.query.search as string;
  const where: Record<string, unknown> = { id: { not: req.user!.id } };
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { company: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    select: { id: true, firstName: true, lastName: true, company: true, role: true, email: true },
    take: 20,
    orderBy: { firstName: "asc" },
  });
  res.json(users);
}
