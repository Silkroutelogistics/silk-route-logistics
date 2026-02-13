import { Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import * as complianceMonitorService from "../services/complianceMonitorService";
import { sendEmail } from "../services/emailService";

const alertQuerySchema = z.object({
  status: z.string().optional(),
  severity: z.string().optional(),
  entityType: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});

export async function getAlerts(req: AuthRequest, res: Response) {
  const query = alertQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};

  if (query.status) where.status = query.status;
  if (query.severity) where.severity = query.severity;
  if (query.entityType) where.entityType = query.entityType;

  const [alerts, total] = await Promise.all([
    prisma.complianceAlert.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.complianceAlert.count({ where }),
  ]);

  res.json({ alerts, total, page: query.page, totalPages: Math.ceil(total / query.limit) });
}

export async function scanCompliance(req: AuthRequest, res: Response) {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const newAlerts: Array<{
    type: string;
    entityType: string;
    entityId: string;
    entityName: string;
    expiryDate: Date;
    severity: string;
  }> = [];

  // Scan Drivers
  const drivers = await prisma.driver.findMany({
    where: {
      status: { not: "INACTIVE" },
    },
  });

  for (const driver of drivers) {
    const name = `${driver.firstName} ${driver.lastName}`;

    if (driver.licenseExpiry) {
      if (driver.licenseExpiry <= now) {
        newAlerts.push({ type: "LICENSE_EXPIRY", entityType: "Driver", entityId: driver.id, entityName: name, expiryDate: driver.licenseExpiry, severity: "CRITICAL" });
      } else if (driver.licenseExpiry <= thirtyDaysFromNow) {
        newAlerts.push({ type: "LICENSE_EXPIRY", entityType: "Driver", entityId: driver.id, entityName: name, expiryDate: driver.licenseExpiry, severity: "WARNING" });
      }
    }

    if (driver.medicalCardExpiry) {
      if (driver.medicalCardExpiry <= now) {
        newAlerts.push({ type: "MEDICAL_CARD", entityType: "Driver", entityId: driver.id, entityName: name, expiryDate: driver.medicalCardExpiry, severity: "CRITICAL" });
      } else if (driver.medicalCardExpiry <= thirtyDaysFromNow) {
        newAlerts.push({ type: "MEDICAL_CARD", entityType: "Driver", entityId: driver.id, entityName: name, expiryDate: driver.medicalCardExpiry, severity: "WARNING" });
      }
    }

    if (driver.twicExpiry) {
      if (driver.twicExpiry <= now) {
        newAlerts.push({ type: "TWIC_EXPIRY", entityType: "Driver", entityId: driver.id, entityName: name, expiryDate: driver.twicExpiry, severity: "CRITICAL" });
      } else if (driver.twicExpiry <= thirtyDaysFromNow) {
        newAlerts.push({ type: "TWIC_EXPIRY", entityType: "Driver", entityId: driver.id, entityName: name, expiryDate: driver.twicExpiry, severity: "WARNING" });
      }
    }
  }

  // Scan Trucks
  const trucks = await prisma.truck.findMany({
    where: {
      status: { not: "OUT_OF_SERVICE" },
    },
  });

  for (const truck of trucks) {
    const name = `Truck ${truck.unitNumber}`;

    if (truck.registrationExpiry) {
      if (truck.registrationExpiry <= now) {
        newAlerts.push({ type: "REGISTRATION_EXPIRY", entityType: "Truck", entityId: truck.id, entityName: name, expiryDate: truck.registrationExpiry, severity: "CRITICAL" });
      } else if (truck.registrationExpiry <= thirtyDaysFromNow) {
        newAlerts.push({ type: "REGISTRATION_EXPIRY", entityType: "Truck", entityId: truck.id, entityName: name, expiryDate: truck.registrationExpiry, severity: "WARNING" });
      }
    }

    if (truck.insuranceExpiry) {
      if (truck.insuranceExpiry <= now) {
        newAlerts.push({ type: "INSURANCE_EXPIRY", entityType: "Truck", entityId: truck.id, entityName: name, expiryDate: truck.insuranceExpiry, severity: "CRITICAL" });
      } else if (truck.insuranceExpiry <= thirtyDaysFromNow) {
        newAlerts.push({ type: "INSURANCE_EXPIRY", entityType: "Truck", entityId: truck.id, entityName: name, expiryDate: truck.insuranceExpiry, severity: "WARNING" });
      }
    }

    if (truck.nextInspectionDate) {
      if (truck.nextInspectionDate <= now) {
        newAlerts.push({ type: "INSPECTION_DUE", entityType: "Truck", entityId: truck.id, entityName: name, expiryDate: truck.nextInspectionDate, severity: "CRITICAL" });
      } else if (truck.nextInspectionDate <= thirtyDaysFromNow) {
        newAlerts.push({ type: "INSPECTION_DUE", entityType: "Truck", entityId: truck.id, entityName: name, expiryDate: truck.nextInspectionDate, severity: "WARNING" });
      }
    }

    if (truck.iftaExpiry) {
      if (truck.iftaExpiry <= now) {
        newAlerts.push({ type: "IFTA_EXPIRY", entityType: "Truck", entityId: truck.id, entityName: name, expiryDate: truck.iftaExpiry, severity: "CRITICAL" });
      } else if (truck.iftaExpiry <= thirtyDaysFromNow) {
        newAlerts.push({ type: "IFTA_EXPIRY", entityType: "Truck", entityId: truck.id, entityName: name, expiryDate: truck.iftaExpiry, severity: "WARNING" });
      }
    }
  }

  // Scan Trailers
  const trailers = await prisma.trailer.findMany({
    where: {
      status: { not: "OUT_OF_SERVICE" },
    },
  });

  for (const trailer of trailers) {
    const name = `Trailer ${trailer.unitNumber}`;

    if (trailer.registrationExpiry) {
      if (trailer.registrationExpiry <= now) {
        newAlerts.push({ type: "REGISTRATION_EXPIRY", entityType: "Trailer", entityId: trailer.id, entityName: name, expiryDate: trailer.registrationExpiry, severity: "CRITICAL" });
      } else if (trailer.registrationExpiry <= thirtyDaysFromNow) {
        newAlerts.push({ type: "REGISTRATION_EXPIRY", entityType: "Trailer", entityId: trailer.id, entityName: name, expiryDate: trailer.registrationExpiry, severity: "WARNING" });
      }
    }

    if (trailer.nextInspectionDate) {
      if (trailer.nextInspectionDate <= now) {
        newAlerts.push({ type: "INSPECTION_DUE", entityType: "Trailer", entityId: trailer.id, entityName: name, expiryDate: trailer.nextInspectionDate, severity: "CRITICAL" });
      } else if (trailer.nextInspectionDate <= thirtyDaysFromNow) {
        newAlerts.push({ type: "INSPECTION_DUE", entityType: "Trailer", entityId: trailer.id, entityName: name, expiryDate: trailer.nextInspectionDate, severity: "WARNING" });
      }
    }
  }

  // Scan Carrier Profiles
  const carriers = await prisma.carrierProfile.findMany({
    where: {
      onboardingStatus: "APPROVED",
    },
    include: {
      user: { select: { company: true, firstName: true, lastName: true } },
    },
  });

  for (const carrier of carriers) {
    const name = carrier.user.company || `${carrier.user.firstName} ${carrier.user.lastName}`;

    if (carrier.insuranceExpiry) {
      if (carrier.insuranceExpiry <= now) {
        newAlerts.push({ type: "INSURANCE_EXPIRY", entityType: "CarrierProfile", entityId: carrier.id, entityName: name, expiryDate: carrier.insuranceExpiry, severity: "CRITICAL" });
      } else if (carrier.insuranceExpiry <= thirtyDaysFromNow) {
        newAlerts.push({ type: "INSURANCE_EXPIRY", entityType: "CarrierProfile", entityId: carrier.id, entityName: name, expiryDate: carrier.insuranceExpiry, severity: "WARNING" });
      }
    }
  }

  // Create alerts, skipping duplicates (same type + entityType + entityId that are still ACTIVE)
  let created = 0;
  for (const alert of newAlerts) {
    const existing = await prisma.complianceAlert.findFirst({
      where: {
        type: alert.type,
        entityType: alert.entityType,
        entityId: alert.entityId,
        status: "ACTIVE",
      },
    });

    if (!existing) {
      await prisma.complianceAlert.create({ data: alert });
      created++;
    }
  }

  res.json({
    scannedDrivers: drivers.length,
    scannedTrucks: trucks.length,
    scannedTrailers: trailers.length,
    scannedCarriers: carriers.length,
    totalIssuesFound: newAlerts.length,
    newAlertsCreated: created,
  });
}

export async function dismissAlert(req: AuthRequest, res: Response) {
  const alert = await prisma.complianceAlert.findUnique({ where: { id: req.params.id } });
  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  const updated = await prisma.complianceAlert.update({
    where: { id: req.params.id },
    data: { status: "DISMISSED" },
  });
  res.json(updated);
}

export async function resolveAlert(req: AuthRequest, res: Response) {
  const alert = await prisma.complianceAlert.findUnique({ where: { id: req.params.id } });
  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  const updated = await prisma.complianceAlert.update({
    where: { id: req.params.id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  res.json(updated);
}

export async function getComplianceStats(req: AuthRequest, res: Response) {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [bySeverity, byEntityType, upcomingExpirations] = await Promise.all([
    // Counts by severity for ACTIVE alerts
    Promise.all([
      prisma.complianceAlert.count({ where: { status: "ACTIVE", severity: "CRITICAL" } }),
      prisma.complianceAlert.count({ where: { status: "ACTIVE", severity: "WARNING" } }),
      prisma.complianceAlert.count({ where: { status: "ACTIVE", severity: "INFO" } }),
    ]),
    // Counts by entityType for ACTIVE alerts
    Promise.all([
      prisma.complianceAlert.count({ where: { status: "ACTIVE", entityType: "Driver" } }),
      prisma.complianceAlert.count({ where: { status: "ACTIVE", entityType: "Truck" } }),
      prisma.complianceAlert.count({ where: { status: "ACTIVE", entityType: "Trailer" } }),
      prisma.complianceAlert.count({ where: { status: "ACTIVE", entityType: "CarrierProfile" } }),
    ]),
    // Upcoming expirations in next 7 days
    prisma.complianceAlert.findMany({
      where: {
        status: "ACTIVE",
        expiryDate: { gte: now, lte: sevenDaysFromNow },
      },
      orderBy: { expiryDate: "asc" },
    }),
  ]);

  res.json({
    severity: {
      critical: bySeverity[0],
      warning: bySeverity[1],
      info: bySeverity[2],
    },
    entityType: {
      driver: byEntityType[0],
      truck: byEntityType[1],
      trailer: byEntityType[2],
      carrierProfile: byEntityType[3],
    },
    upcomingExpirations,
  });
}

// ─── New Compliance Console Endpoints ───────────────────────

// GET /compliance/dashboard
export async function getDashboard(req: AuthRequest, res: Response) {
  try {
    const data = await complianceMonitorService.getDashboardData();
    res.json(data);
  } catch (err) {
    console.error("[Compliance] Dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard data" });
  }
}

// GET /compliance/overview
export async function getOverview(req: AuthRequest, res: Response) {
  try {
    const filters = {
      sortBy: req.query.sortBy as string | undefined,
      status: req.query.status as string | undefined,
      tier: req.query.tier as string | undefined,
    };
    const data = await complianceMonitorService.getOverviewMatrix(filters);
    res.json(data);
  } catch (err) {
    console.error("[Compliance] Overview error:", err);
    res.status(500).json({ error: "Failed to load overview data" });
  }
}

// GET /compliance/carrier/:carrierId
export async function getCarrierDetail(req: AuthRequest, res: Response) {
  try {
    const data = await complianceMonitorService.getCarrierCompliance(req.params.carrierId);
    if (!data) {
      res.status(404).json({ error: "Carrier not found" });
      return;
    }
    res.json(data);
  } catch (err) {
    console.error("[Compliance] Carrier detail error:", err);
    res.status(500).json({ error: "Failed to load carrier compliance data" });
  }
}

// POST /compliance/alerts/:id/snooze
export async function snoozeAlert(req: AuthRequest, res: Response) {
  try {
    const { days } = req.body;
    const validDays = [7, 14, 30];
    if (!validDays.includes(days)) {
      res.status(400).json({ error: "Days must be 7, 14, or 30" });
      return;
    }

    const alert = await prisma.complianceAlert.findUnique({ where: { id: req.params.id } });
    if (!alert) {
      res.status(404).json({ error: "Alert not found" });
      return;
    }

    const snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const updated = await prisma.complianceAlert.update({
      where: { id: req.params.id },
      data: {
        status: "SNOOZED",
        snoozedUntil,
        notifiedAt: new Date(),
      },
    });
    res.json(updated);
  } catch (err) {
    console.error("[Compliance] Snooze error:", err);
    res.status(500).json({ error: "Failed to snooze alert" });
  }
}

// POST /compliance/carrier/:carrierId/send-reminder
export async function sendReminder(req: AuthRequest, res: Response) {
  try {
    const carrier = await prisma.carrierProfile.findUnique({
      where: { id: req.params.carrierId },
      include: {
        user: { select: { company: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!carrier) {
      res.status(404).json({ error: "Carrier not found" });
      return;
    }

    const carrierName = carrier.user.company || `${carrier.user.firstName} ${carrier.user.lastName}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #0f172a;">Silk Route Logistics - Compliance Reminder</h2>
        <p>Dear ${carrierName},</p>
        <p>This is a reminder to review and update your compliance documents in the SRL carrier portal.</p>
        <p>Please ensure the following are current:</p>
        <ul>
          <li>Certificate of Insurance (COI)</li>
          <li>W-9 Form</li>
          <li>Authority Documentation</li>
        </ul>
        ${carrier.insuranceExpiry ? `<p><strong>Insurance Expiry:</strong> ${carrier.insuranceExpiry.toISOString().split("T")[0]}</p>` : ""}
        <p>Log into your carrier portal to upload any updated documents.</p>
        <p>Thank you,<br/>SRL Compliance Team</p>
      </div>
    `;

    try {
      await sendEmail(carrier.user.email, `Compliance Reminder - ${carrierName}`, html);
    } catch {
      console.log(`[Compliance] Email send failed for ${carrier.user.email}`);
    }

    // Record the reminder
    await prisma.complianceReminder.create({
      data: {
        carrierId: carrier.id,
        itemType: "MANUAL_REMINDER",
        tier: "MANUAL",
        emailStatus: "SENT",
      },
    });

    res.json({ success: true, message: `Reminder sent to ${carrier.user.email}` });
  } catch (err) {
    console.error("[Compliance] Send reminder error:", err);
    res.status(500).json({ error: "Failed to send reminder" });
  }
}

// POST /compliance/carrier/:carrierId/run-fmcsa-check
export async function runFmcsaCheck(req: AuthRequest, res: Response) {
  try {
    const result = await complianceMonitorService.runFmcsaScan(req.params.carrierId);
    res.json(result);
  } catch (err: any) {
    console.error("[Compliance] FMCSA check error:", err);
    res.status(500).json({ error: err.message || "Failed to run FMCSA check" });
  }
}

// POST /compliance/carrier/:carrierId/override-block
export async function overrideBlock(req: AuthRequest, res: Response) {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim().length < 10) {
      res.status(400).json({ error: "Override reason must be at least 10 characters" });
      return;
    }

    const carrierId = req.params.carrierId;
    const adminId = req.user!.id;

    // Check: max 2 overrides per carrier per month
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentOverrides = await prisma.complianceOverride.count({
      where: {
        carrierId,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    if (recentOverrides >= 2) {
      res.status(429).json({
        error: "Maximum 2 overrides per carrier per month. Contact VP of Operations for additional overrides.",
      });
      return;
    }

    const carrier = await prisma.carrierProfile.findUnique({
      where: { id: carrierId },
      include: { user: { select: { company: true, firstName: true, lastName: true } } },
    });

    if (!carrier) {
      res.status(404).json({ error: "Carrier not found" });
      return;
    }

    // Create override with 24hr expiry
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const override = await prisma.complianceOverride.create({
      data: {
        carrierId,
        reason: reason.trim(),
        adminId,
        expiresAt,
      },
    });

    // Create audit trail entry
    await prisma.auditTrail.create({
      data: {
        action: "COMPLIANCE_OVERRIDE",
        entityType: "CarrierProfile",
        entityId: carrierId,
        performedById: adminId,
        changedFields: {
          reason: reason.trim(),
          overrideId: override.id,
          expiresAt: expiresAt.toISOString(),
          carrierName: carrier.user.company || `${carrier.user.firstName} ${carrier.user.lastName}`,
        } as any,
      },
    });

    res.json({
      override,
      message: `Override created. Expires at ${expiresAt.toISOString()}`,
    });
  } catch (err) {
    console.error("[Compliance] Override error:", err);
    res.status(500).json({ error: "Failed to create override" });
  }
}

// POST /compliance/carrier/:carrierId/suspend
export async function suspendCarrier(req: AuthRequest, res: Response) {
  try {
    const carrier = await prisma.carrierProfile.findUnique({
      where: { id: req.params.carrierId },
      include: { user: { select: { company: true, firstName: true, lastName: true } } },
    });

    if (!carrier) {
      res.status(404).json({ error: "Carrier not found" });
      return;
    }

    const updated = await prisma.carrierProfile.update({
      where: { id: req.params.carrierId },
      data: { onboardingStatus: "SUSPENDED" },
    });

    // Create audit trail
    await prisma.auditTrail.create({
      data: {
        action: "CARRIER_SUSPENDED",
        entityType: "CarrierProfile",
        entityId: carrier.id,
        performedById: req.user!.id,
        changedFields: {
          carrierName: carrier.user.company || `${carrier.user.firstName} ${carrier.user.lastName}`,
          previousStatus: carrier.onboardingStatus,
        } as any,
      },
    });

    res.json({ success: true, carrier: updated });
  } catch (err) {
    console.error("[Compliance] Suspend error:", err);
    res.status(500).json({ error: "Failed to suspend carrier" });
  }
}

// POST /compliance/carrier/:carrierId/notes
export async function addNote(req: AuthRequest, res: Response) {
  try {
    const { content } = req.body;
    if (!content || content.trim().length === 0) {
      res.status(400).json({ error: "Note content is required" });
      return;
    }

    const carrier = await prisma.carrierProfile.findUnique({
      where: { id: req.params.carrierId },
    });

    if (!carrier) {
      res.status(404).json({ error: "Carrier not found" });
      return;
    }

    const note = await prisma.complianceNote.create({
      data: {
        carrierId: req.params.carrierId,
        authorId: req.user!.id,
        content: content.trim(),
      },
      include: {
        author: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    res.json(note);
  } catch (err) {
    console.error("[Compliance] Add note error:", err);
    res.status(500).json({ error: "Failed to add note" });
  }
}

// GET /compliance/carrier/:carrierId/notes
export async function getNotes(req: AuthRequest, res: Response) {
  try {
    const notes = await prisma.complianceNote.findMany({
      where: { carrierId: req.params.carrierId },
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    res.json(notes);
  } catch (err) {
    console.error("[Compliance] Get notes error:", err);
    res.status(500).json({ error: "Failed to load notes" });
  }
}

// GET /compliance/export
export async function exportCSV(req: AuthRequest, res: Response) {
  try {
    const matrixData = await complianceMonitorService.getOverviewMatrix();

    const headers = [
      "Carrier Name",
      "Email",
      "MC Number",
      "DOT Number",
      "Tier",
      "Status",
      "Authority",
      "Insurance Auto",
      "Insurance Cargo",
      "W9",
      "COI",
      "Authority Doc",
      "FMCSA Status",
      "Insurance Expiry",
      "Last FMCSA Check",
    ];

    const rows = matrixData.carriers.map((c) => [
      `"${c.name}"`,
      c.email,
      c.mcNumber || "",
      c.dotNumber || "",
      c.tier,
      c.overallStatus,
      c.items.authority,
      c.items.insuranceAuto,
      c.items.insuranceCargo,
      c.items.w9,
      c.items.coi,
      c.items.authorityDoc,
      c.items.fmcsaStatus,
      c.insuranceExpiry ? c.insuranceExpiry.toISOString().split("T")[0] : "",
      c.fmcsaLastChecked ? c.fmcsaLastChecked.toISOString().split("T")[0] : "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=compliance-export-${new Date().toISOString().split("T")[0]}.csv`);
    res.send(csv);
  } catch (err) {
    console.error("[Compliance] Export error:", err);
    res.status(500).json({ error: "Failed to export compliance data" });
  }
}

// GET /compliance/scans/:carrierId
export async function getScanHistory(req: AuthRequest, res: Response) {
  try {
    const scans = await prisma.complianceScan.findMany({
      where: { carrierId: req.params.carrierId },
      orderBy: { scannedAt: "desc" },
      take: 50,
    });

    res.json(scans);
  } catch (err) {
    console.error("[Compliance] Scan history error:", err);
    res.status(500).json({ error: "Failed to load scan history" });
  }
}

// GET /compliance/scans/latest
export async function getLatestScan(req: AuthRequest, res: Response) {
  try {
    const latestScans = await prisma.complianceScan.findMany({
      orderBy: { scannedAt: "desc" },
      take: 20,
      include: {
        carrier: {
          include: {
            user: { select: { company: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    res.json(
      latestScans.map((s) => ({
        ...s,
        carrierName:
          s.carrier.user.company ||
          `${s.carrier.user.firstName} ${s.carrier.user.lastName}`,
      }))
    );
  } catch (err) {
    console.error("[Compliance] Latest scan error:", err);
    res.status(500).json({ error: "Failed to load latest scans" });
  }
}

// POST /compliance/carrier/:carrierId/check
export async function checkCarrier(req: AuthRequest, res: Response) {
  try {
    const result = await complianceMonitorService.complianceCheck(req.params.carrierId);
    res.json(result);
  } catch (err) {
    console.error("[Compliance] Check carrier error:", err);
    res.status(500).json({ error: "Failed to check carrier compliance" });
  }
}
