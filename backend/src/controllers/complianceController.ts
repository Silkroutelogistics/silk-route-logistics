import { Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";

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
