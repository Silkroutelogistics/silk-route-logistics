/**
 * CRM Customer upgrade routes (v3.4.m)
 *
 * Adds CRM-specific endpoints on top of the existing /api/customers
 * routes. Kept in a separate file to avoid bloating the legacy
 * customerController. Everything mounts under /api/customers and
 * shares the same authentication.
 */

import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { logCustomerActivity, getCustomerActivity } from "../services/customerActivityService";
import { customerCreditCheck } from "../services/secEdgarService";
import { CreditStatus } from "@prisma/client";
import { log } from "../lib/logger";

const router = Router();
router.use(authenticate);

const CRM_ROLES = ["ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING", "DISPATCH", "AE"] as const;

// ─── Account rep picker ───────────────────────────────────
// Lightweight user dropdown scoped to roles that can own an account.
// Admin-only /admin/users is too heavy and auth-gated. This stays in
// CRM routes because it's only useful to CRM.

router.get(
  "/account-rep-options",
  authorize(...CRM_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    const search = (req.query.search as string) || "";
    const where: any = {
      role: { in: ["BROKER", "OPERATIONS", "DISPATCH", "ADMIN", "CEO", "AE"] },
      isActive: true,
    };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    const users = await prisma.user.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 100,
    });
    res.json({ users });
  }
);

// ─── Tracking-link contact toggle ─────────────────────────

router.patch(
  "/:id/contacts/:contactId/tracking-link",
  authorize(...CRM_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const contact = await prisma.customerContact.findUnique({
        where: { id: req.params.contactId },
      });
      if (!contact || contact.customerId !== req.params.id) {
        return res.status(404).json({ error: "Contact not found" });
      }
      const { receivesTrackingLink } = req.body as { receivesTrackingLink: boolean };
      const updated = await prisma.customerContact.update({
        where: { id: contact.id },
        data: { receivesTrackingLink: !!receivesTrackingLink },
      });
      await logCustomerActivity({
        customerId: req.params.id,
        eventType: "tracking_link_toggled",
        description: `Tracking link ${receivesTrackingLink ? "enabled" : "disabled"} for ${contact.name}`,
        actorType: "USER",
        actorId: req.user?.id,
        actorName: req.user?.email,
        metadata: { contactId: contact.id, receivesTrackingLink: !!receivesTrackingLink },
      });
      res.json({ contact: updated });
    } catch (err) {
      log.error({ err }, "[CRM] tracking-link toggle error");
      res.status(500).json({ error: "Failed to toggle" });
    }
  }
);

// GET /:id/tracking-recipients — contacts who will be emailed on dispatch
router.get(
  "/:id/tracking-recipients",
  authorize(...CRM_ROLES, "CARRIER") as any,
  async (req: AuthRequest, res: Response) => {
    const contacts = await prisma.customerContact.findMany({
      where: { customerId: req.params.id, receivesTrackingLink: true },
      select: { id: true, name: true, email: true, phone: true, title: true },
    });
    res.json({ contacts });
  }
);

// ─── Facilities CRUD ──────────────────────────────────────

router.get("/:id/facilities", authorize(...CRM_ROLES) as any, async (req: AuthRequest, res: Response) => {
  const facilities = await prisma.customerFacility.findMany({
    where: { customerId: req.params.id },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
  });
  res.json({ facilities });
});

router.post(
  "/:id/facilities",
  authorize(...CRM_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const facility = await prisma.customerFacility.create({
        data: { ...req.body, customerId: req.params.id },
      });
      await logCustomerActivity({
        customerId: req.params.id,
        eventType: "facility_added",
        description: `Facility "${facility.name}" added`,
        actorType: "USER",
        actorId: req.user?.id,
        actorName: req.user?.email,
        metadata: { facilityId: facility.id },
      });
      res.status(201).json({ facility });
    } catch (err) {
      log.error({ err }, "[CRM] facility create error");
      res.status(500).json({ error: "Failed to create facility" });
    }
  }
);

router.patch(
  "/:id/facilities/:facilityId",
  authorize(...CRM_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const existing = await prisma.customerFacility.findUnique({ where: { id: req.params.facilityId } });
      if (!existing || existing.customerId !== req.params.id) {
        return res.status(404).json({ error: "Facility not found" });
      }
      const { customerId: _c, id: _i, createdAt: _ca, updatedAt: _ua, ...data } = req.body;
      const facility = await prisma.customerFacility.update({
        where: { id: req.params.facilityId },
        data,
      });
      await logCustomerActivity({
        customerId: req.params.id,
        eventType: "facility_updated",
        description: `Facility "${facility.name}" updated`,
        actorType: "USER",
        actorId: req.user?.id,
        actorName: req.user?.email,
        metadata: { facilityId: facility.id },
      });
      res.json({ facility });
    } catch (err) {
      log.error({ err }, "[CRM] facility update error");
      res.status(500).json({ error: "Failed to update facility" });
    }
  }
);

router.delete(
  "/:id/facilities/:facilityId",
  authorize(...CRM_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    const existing = await prisma.customerFacility.findUnique({ where: { id: req.params.facilityId } });
    if (!existing || existing.customerId !== req.params.id) {
      return res.status(404).json({ error: "Facility not found" });
    }
    await prisma.customerFacility.delete({ where: { id: req.params.facilityId } });
    await logCustomerActivity({
      customerId: req.params.id,
      eventType: "facility_deleted",
      description: `Facility "${existing.name}" removed`,
      actorType: "USER",
      actorId: req.user?.id,
      actorName: req.user?.email,
      metadata: { facilityId: existing.id },
    });
    res.json({ ok: true });
  }
);

// ─── Customer notes CRUD ──────────────────────────────────

router.get("/:id/notes", authorize(...CRM_ROLES) as any, async (req: AuthRequest, res: Response) => {
  const { type } = req.query as { type?: string };
  const where: any = { customerId: req.params.id };
  if (type) where.noteType = type;
  const notes = await prisma.customerNote.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { facility: { select: { id: true, name: true } } },
  });
  res.json({ notes });
});

// Auto-pull helper for Order Builder / tender generation
router.get(
  "/:id/notes/for-load",
  authorize(...CRM_ROLES, "CARRIER") as any,
  async (req: AuthRequest, res: Response) => {
    const notes = await prisma.customerNote.findMany({
      where: {
        customerId: req.params.id,
        noteType: { in: ["shipping_instruction", "receiving_instruction"] },
      },
      include: { facility: { select: { id: true, name: true } } },
    });
    res.json({ notes });
  }
);

router.post(
  "/:id/notes",
  authorize(...CRM_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const { noteType, facilityId, title, content, followUpDate, source } = req.body;
      if (!content) return res.status(400).json({ error: "content required" });
      const note = await prisma.customerNote.create({
        data: {
          customerId: req.params.id,
          noteType: noteType ?? "operational",
          facilityId: facilityId ?? null,
          title: title ?? null,
          content,
          followUpDate: followUpDate ? new Date(followUpDate) : null,
          source: source ?? "manual",
          createdById: req.user?.id,
          createdByName: req.user?.email,
        },
      });
      await logCustomerActivity({
        customerId: req.params.id,
        eventType: "note_added",
        description: `${(noteType ?? "operational").replace(/_/g, " ")} note added`,
        actorType: "USER",
        actorId: req.user?.id,
        actorName: req.user?.email,
        metadata: { noteId: note.id, noteType },
      });
      res.status(201).json({ note });
    } catch (err) {
      log.error({ err }, "[CRM] note create error");
      res.status(500).json({ error: "Failed to create note" });
    }
  }
);

router.patch(
  "/:id/notes/:noteId",
  authorize(...CRM_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    const existing = await prisma.customerNote.findUnique({ where: { id: req.params.noteId } });
    if (!existing || existing.customerId !== req.params.id) {
      return res.status(404).json({ error: "Note not found" });
    }
    const { customerId: _c, id: _i, createdAt: _ca, updatedAt: _ua, createdById: _cid, createdByName: _cn, ...data } = req.body;
    if (data.followUpDate) data.followUpDate = new Date(data.followUpDate);
    const note = await prisma.customerNote.update({ where: { id: req.params.noteId }, data });
    res.json({ note });
  }
);

router.delete(
  "/:id/notes/:noteId",
  authorize(...CRM_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    await prisma.customerNote.delete({ where: { id: req.params.noteId } });
    res.json({ ok: true });
  }
);

// ─── Customer documents (reuses generic Document model) ──

router.get(
  "/:id/documents",
  authorize(...CRM_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    const documents = await prisma.document.findMany({
      where: { entityType: "CUSTOMER", entityId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ documents });
  }
);

// ─── Customer activity feed ───────────────────────────────

router.get(
  "/:id/activity",
  authorize(...CRM_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    const activity = await getCustomerActivity(req.params.id);
    res.json({ activity });
  }
);

// ─── Customer loads (for the Loads tab) ───────────────────

router.get(
  "/:id/loads",
  authorize(...CRM_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    const loads = await prisma.load.findMany({
      where: { customerId: req.params.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        loadNumber: true,
        referenceNumber: true,
        status: true,
        originCity: true,
        originState: true,
        destCity: true,
        destState: true,
        equipmentType: true,
        pickupDate: true,
        deliveryDate: true,
        customerRate: true,
        carrierRate: true,
        rate: true,
        grossMargin: true,
        marginPercent: true,
      },
    });

    // Aggregate top lanes
    const laneMap = new Map<string, { origin: string; dest: string; count: number; totalRate: number }>();
    for (const l of loads) {
      const key = `${l.originState}|${l.destState}`;
      const existing = laneMap.get(key);
      if (existing) {
        existing.count++;
        existing.totalRate += (l.customerRate ?? l.rate ?? 0);
      } else {
        laneMap.set(key, {
          origin: `${l.originCity}, ${l.originState}`,
          dest: `${l.destCity}, ${l.destState}`,
          count: 1,
          totalRate: l.customerRate ?? l.rate ?? 0,
        });
      }
    }
    const topLanes = Array.from(laneMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((l) => ({ ...l, avgRate: Math.round(l.totalRate / l.count) }));

    const totalRevenue = loads.reduce((s, l) => s + (l.customerRate ?? l.rate ?? 0), 0);
    const avgMargin = loads.filter((l) => l.marginPercent).length > 0
      ? loads.reduce((s, l) => s + (l.marginPercent ?? 0), 0) / loads.length
      : 0;

    res.json({
      loads: loads.slice(0, 10),
      total: loads.length,
      totalRevenue,
      avgMargin,
      topLanes,
    });
  }
);

// ─── Credit check result persistence ──────────────────────

// ─── SEC EDGAR credit check (v3.4.n) ──────────────────────

router.post(
  "/:id/sec-credit-check",
  authorize(...CRM_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id },
        select: { id: true, name: true },
      });
      if (!customer) return res.status(404).json({ error: "Customer not found" });

      const lookup = await customerCreditCheck(customer.name);

      // Map SEC result → existing CreditStatus enum (Karpathy Rule 10: no new statuses)
      //   approved  → APPROVED
      //   flagged   → CONDITIONAL
      //   not_found → PENDING_REVIEW (manual review flow)
      const nextStatus: CreditStatus =
        lookup.result === "approved"  ? CreditStatus.APPROVED
      : lookup.result === "flagged"   ? CreditStatus.CONDITIONAL
      :                                 CreditStatus.PENDING_REVIEW;

      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          creditStatus: nextStatus,
          creditCheckSource: lookup.publiclyTraded ? "sec" : "sec_not_found",
          creditCheckResult: lookup.result,
          creditCheckDate: new Date(),
          creditCheckNotes: lookup.publiclyTraded
            ? `SEC ${lookup.risk} risk · ${lookup.legalName ?? customer.name} · CIK ${lookup.cik}`
            : "Not found in SEC EDGAR — private company, manual review required",
          secCikNumber: lookup.cik,
        },
      });

      await logCustomerActivity({
        customerId: customer.id,
        eventType: "credit_check_sec",
        description: `SEC credit check performed — ${lookup.result}${lookup.publiclyTraded ? ` (${lookup.risk} risk)` : " (not public)"}`,
        actorType: "USER",
        actorId: req.user?.id,
        actorName: req.user?.email,
        metadata: {
          publiclyTraded: lookup.publiclyTraded,
          risk: lookup.risk,
          cik: lookup.cik,
          result: lookup.result,
        },
      });

      res.json({ lookup });
    } catch (err) {
      log.error({ err }, "[CRM] SEC credit check error");
      res.status(500).json({ error: "SEC credit check failed" });
    }
  }
);

router.post(
  "/:id/mark-manually-reviewed",
  authorize(...CRM_ROLES) as any,
  async (req: AuthRequest, res: Response) => {
    const { notes } = req.body as { notes?: string };
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        creditCheckSource: "manual",
        creditCheckResult: "approved",
        creditCheckDate: new Date(),
        creditCheckNotes: notes ?? "Marked as manually reviewed",
      },
    });
    await logCustomerActivity({
      customerId: req.params.id,
      eventType: "credit_check_manual",
      description: "Credit marked as manually reviewed",
      actorType: "USER",
      actorId: req.user?.id,
      actorName: req.user?.email,
    });
    res.json({ customer });
  }
);

export default router;
