import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { carrierNotificationScope } from "../lib/carrierNotificationTypes";

// carrier-portal-upgrade M2 — every read is the caller's own rows, and for a
// carrier only the allowlisted types (lib/carrierNotificationTypes). The list,
// the count and mark-all use the same scope, so the badge counts exactly what
// the panel shows and mark-all clears exactly that.

export async function getNotifications(req: AuthRequest, res: Response) {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id, ...carrierNotificationScope(req.user!.role) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(notifications);
}

// G38 — this updated by id alone, so any signed-in user could mark anyone's
// notification read. The id now has to belong to the caller; a row that is not
// theirs is indistinguishable from one that does not exist.
export async function markAsRead(req: AuthRequest, res: Response) {
  const { count } = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user!.id },
    data: { readAt: new Date() },
  });
  if (count === 0) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json({ success: true });
}

export async function markAllRead(req: AuthRequest, res: Response) {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null, ...carrierNotificationScope(req.user!.role) },
    data: { readAt: new Date() },
  });
  res.json({ success: true });
}

export async function getUnreadCount(req: AuthRequest, res: Response) {
  const count = await prisma.notification.count({
    where: { userId: req.user!.id, readAt: null, ...carrierNotificationScope(req.user!.role) },
  });
  res.json({ count });
}
