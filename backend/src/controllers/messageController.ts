import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { sendMessageSchema } from "../validators/message";

export async function sendMessage(req: AuthRequest, res: Response) {
  const data = sendMessageSchema.parse(req.body);
  const message = await prisma.message.create({
    data: { senderId: req.user!.id, ...data },
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

export async function getUnreadCount(req: AuthRequest, res: Response) {
  const count = await prisma.message.count({
    where: { receiverId: req.user!.id, readAt: null },
  });
  res.json({ unreadCount: count });
}
