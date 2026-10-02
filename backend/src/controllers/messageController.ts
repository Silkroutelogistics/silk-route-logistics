import { Response } from "express";
import type { UserRole } from "@prisma/client";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { sendMessageSchema } from "../validators/message";
import { isSrlStaffRole, SRL_STAFF_ROLES } from "../lib/documentTypes";
import { log } from "../lib/logger";

// carrier-portal-upgrade G8 — a carrier or shipper talks to SRL, not to each
// other. The user search returned every account on the platform (name, company,
// email) and send accepted any receiver, so a carrier could list and message
// other carriers and shippers. External callers now see and reach staff only;
// staff are unchanged. Replies still work, because the other side of every
// external conversation is staff.

export async function sendMessage(req: AuthRequest, res: Response) {
  const data = sendMessageSchema.parse(req.body);
  if (!isSrlStaffRole(req.user!.role)) {
    const receiver = await prisma.user.findUnique({ where: { id: data.receiverId }, select: { role: true } });
    if (!receiver || !isSrlStaffRole(receiver.role)) {
      res.status(403).json({ error: "Messages can be sent to the SRL team only" });
      return;
    }
  }
  const message = await prisma.message.create({
    data: { senderId: req.user!.id, ...data } as any,
    include: { sender: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (req.user!.role === "CARRIER") {
    // A notice that fails must not fail the message, which is already saved.
    await notifyStaffOfCarrierMessage(req.user!.id, data.receiverId, data.content).catch((err) =>
      log.error({ err, senderId: req.user!.id }, "[Messages] staff notification failed"),
    );
  }
  res.status(201).json(message);
}

// carrier-portal-upgrade R1 (G26, staff side) — a carrier's message notified
// nobody, so it sat unread until the rep happened to open Messages. The rep is
// the SRL staff member the carrier wrote to (the gate above makes that staff).
// When the rep is inactive, the operations team is told instead: no on-call
// roster exists, so "on call" is every active OPERATIONS and DISPATCH user.
// Every recipient is staff by construction, never another carrier.
const ON_CALL_ROLES: UserRole[] = ["OPERATIONS", "DISPATCH"];

async function notifyStaffOfCarrierMessage(senderId: string, receiverId: string, content: string) {
  const [sender, rep] = await Promise.all([
    prisma.user.findUnique({ where: { id: senderId }, select: { firstName: true, lastName: true, company: true } }),
    prisma.user.findUnique({ where: { id: receiverId }, select: { id: true, role: true, isActive: true } }),
  ]);
  const recipients =
    rep && rep.isActive !== false && isSrlStaffRole(rep.role)
      ? [rep.id]
      : (await prisma.user.findMany({ where: { isActive: true, role: { in: ON_CALL_ROLES } }, select: { id: true } })).map((u: { id: string }) => u.id);
  if (recipients.length === 0) {
    log.warn({ senderId, receiverId }, "[Messages] no active rep or on-call staff to notify");
    return;
  }
  const who = sender?.company || [sender?.firstName, sender?.lastName].filter(Boolean).join(" ") || "a carrier";
  const preview = content.length > 140 ? `${content.slice(0, 137)}...` : content;
  await prisma.notification.createMany({
    data: recipients.map((userId: string) => ({
      userId,
      type: "MESSAGE_RECEIVED",
      title: `New message from ${who}`,
      message: preview,
      link: "/dashboard/messages",
    })),
  });
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
  if (!isSrlStaffRole(req.user!.role)) where.role = { in: [...SRL_STAFF_ROLES] };
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
