import { prisma } from "../config/database";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolContext {
  userId: string;
  role: string;
  email?: string;
  firstName?: string;
  carrierId?: string; // for carrier users, their carrier profile ID
}

/** @deprecated Use ToolContext instead */
export type UserContext = ToolContext;

// ─── Role Helpers ─────────────────────────────────────────────────────────────

const ADMIN_ROLES = ["ADMIN", "CEO"];
const FINANCE_ROLES = ["ACCOUNTING", ...ADMIN_ROLES];
const OPERATIONS_ROLES = ["DISPATCH", "OPERATIONS", ...ADMIN_ROLES];
const BROKER_ROLES = ["BROKER", "AE"];
const INTERNAL_ROLES = [...BROKER_ROLES, ...OPERATIONS_ROLES, ...FINANCE_ROLES];

function isAdmin(role: string): boolean {
  return ADMIN_ROLES.includes(role);
}

function isFinance(role: string): boolean {
  return FINANCE_ROLES.includes(role);
}

function isOperations(role: string): boolean {
  return OPERATIONS_ROLES.includes(role);
}

function isBroker(role: string): boolean {
  return BROKER_ROLES.includes(role);
}

function isCarrier(role: string): boolean {
  return role === "CARRIER";
}

function canSeeAllLoads(role: string): boolean {
  return isAdmin(role) || isOperations(role) || role === "ACCOUNTING";
}

// ─── Date Range Helpers ───────────────────────────────────────────────────────

function getDateRange(dateRange?: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  switch (dateRange) {
    case "today": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      return { start, end };
    }
    case "this_week": {
      const dayOfWeek = now.getUTCDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset, 0, 0, 0, 0));
      return { start, end };
    }
    case "this_month": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      return { start, end };
    }
    case "last_30d":
    default: {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30, 0, 0, 0, 0));
      return { start, end };
    }
  }
}

// ─── Load Role Filters ───────────────────────────────────────────────────────

function applyLoadRoleFilter(ctx: UserContext): Record<string, any> {
  if (canSeeAllLoads(ctx.role)) return {};
  if (isCarrier(ctx.role)) return { carrierId: ctx.userId };
  if (isBroker(ctx.role)) return { posterId: ctx.userId };
  return { posterId: ctx.userId }; // default: own loads only
}

// ─── Sanitize Load for Role ──────────────────────────────────────────────────

function sanitizeLoadForRole(load: any, role: string): any {
  const copy = { ...load };
  // Carriers should NOT see the shipper rate (customerRate) or gross margin
  if (isCarrier(role)) {
    delete copy.customerRate;
    delete copy.grossMargin;
    delete copy.marginPercent;
    delete copy.marginPerMile;
    delete copy.revenuePerMile;
  }
  // Brokers/AE can see both rates but not fund-level data (handled elsewhere)
  return copy;
}

// ─── 1. getLoadInfo ──────────────────────────────────────────────────────────

export async function getLoadInfo(ctx: UserContext, loadId?: string) {
  try {
    const roleFilter = applyLoadRoleFilter(ctx);

    if (loadId) {
      // Try by ID or by reference number
      const load = await prisma.load.findFirst({
        where: {
          ...roleFilter,
          OR: [
            { id: loadId },
            { referenceNumber: loadId },
            { loadNumber: loadId },
          ],
        },
        include: {
          carrier: {
            select: {
              id: true, firstName: true, lastName: true, company: true,
              carrierProfile: { select: { companyName: true, mcNumber: true, tier: true } },
            },
          },
          poster: { select: { id: true, firstName: true, lastName: true, email: true } },
          customer: { select: { id: true, name: true, email: true } },
          checkCalls: { orderBy: { createdAt: "desc" }, take: 5 },
          invoices: { select: { id: true, invoiceNumber: true, status: true, amount: true, totalAmount: true, dueDate: true, paidAt: true } },
          carrierPays: { select: { id: true, amount: true, netAmount: true, status: true, paidAt: true, paymentTier: true } },
          claims: { select: { id: true, claimNumber: true, claimType: true, status: true, estimatedValue: true } },
        },
      });

      if (!load) {
        return { error: "Load not found or you do not have access to this load." };
      }

      return { load: sanitizeLoadForRole(load, ctx.role) };
    }

    // No loadId: return recent 10 loads
    const loads = await prisma.load.findMany({
      where: roleFilter,
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        referenceNumber: true,
        loadNumber: true,
        status: true,
        originCity: true,
        originState: true,
        destCity: true,
        destState: true,
        rate: true,
        customerRate: true,
        carrierRate: true,
        equipmentType: true,
        pickupDate: true,
        deliveryDate: true,
        distance: true,
        carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
        customer: { select: { id: true, name: true } },
      },
    });

    return {
      loads: loads.map((l) => sanitizeLoadForRole(l, ctx.role)),
      count: loads.length,
    };
  } catch (err: any) {
    return { error: "Failed to fetch load info: " + err.message };
  }
}

// ─── 2. getLoadsByStatus ─────────────────────────────────────────────────────

export async function getLoadsByStatus(ctx: UserContext, status: string) {
  try {
    const roleFilter = applyLoadRoleFilter(ctx);
    const statusUpper = status?.toUpperCase().replace(/\s+/g, "_");

    const loads = await prisma.load.findMany({
      where: {
        ...roleFilter,
        status: statusUpper as any,
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        referenceNumber: true,
        loadNumber: true,
        status: true,
        originCity: true,
        originState: true,
        destCity: true,
        destState: true,
        rate: true,
        customerRate: true,
        carrierRate: true,
        equipmentType: true,
        pickupDate: true,
        deliveryDate: true,
        distance: true,
        carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
        customer: { select: { id: true, name: true } },
      },
    });

    return {
      status: statusUpper,
      loads: loads.map((l) => sanitizeLoadForRole(l, ctx.role)),
      count: loads.length,
    };
  } catch (err: any) {
    return { error: "Failed to fetch loads by status: " + err.message };
  }
}

// ─── 3. getCarrierInfo ───────────────────────────────────────────────────────

export async function getCarrierInfo(ctx: UserContext, carrierId?: string) {
  try {
    // Carrier users can only see their own info
    if (isCarrier(ctx.role) && carrierId && carrierId !== ctx.carrierId && carrierId !== ctx.userId) {
      return { error: "Access denied. Carrier users can only view their own profile." };
    }

    // Determine which carrier to look up
    let profileWhere: any;
    if (carrierId) {
      // Try by profile ID, user ID, MC#, or DOT#
      profileWhere = {
        OR: [
          { id: carrierId },
          { userId: carrierId },
          { mcNumber: carrierId },
          { dotNumber: carrierId },
        ],
      };
    } else if (isCarrier(ctx.role)) {
      profileWhere = { userId: ctx.userId };
    } else {
      return { error: "Please provide a carrier ID, MC number, or DOT number to look up." };
    }

    const profile = await prisma.carrierProfile.findFirst({
      where: profileWhere,
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true, company: true, phone: true, isActive: true,
          },
        },
        scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 },
      },
    });

    if (!profile) {
      return { error: "Carrier profile not found." };
    }

    // Get compliance alerts
    const alerts = await prisma.complianceAlert.findMany({
      where: { entityType: "CARRIER", entityId: profile.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // Get recent loads count
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentLoadsCount = await prisma.load.count({
      where: {
        carrierId: profile.userId,
        createdAt: { gte: thirtyDaysAgo },
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
    });

    const totalLoadsCount = await prisma.load.count({
      where: {
        carrierId: profile.userId,
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
    });

    return {
      carrier: {
        profileId: profile.id,
        userId: profile.userId,
        name: profile.companyName || `${profile.user.firstName} ${profile.user.lastName}`,
        email: profile.user.email,
        phone: profile.user.phone || profile.contactPhone,
        mcNumber: profile.mcNumber,
        dotNumber: profile.dotNumber,
        tier: profile.srcppTier !== "NONE" ? profile.srcppTier : profile.tier,
        srcppTotalLoads: profile.srcppTotalLoads,
        srcppTotalMiles: profile.srcppTotalMiles,
        equipmentTypes: profile.equipmentTypes,
        operatingRegions: profile.operatingRegions,
        insuranceExpiry: profile.insuranceExpiry,
        safetyRating: profile.safetyRating,
        onboardingStatus: profile.onboardingStatus,
        applicationStatus: profile.status,
        isActive: profile.user.isActive,
        numberOfTrucks: profile.numberOfTrucks,
        numberOfDrivers: profile.numberOfDrivers,
        paymentPreference: profile.paymentPreference,
        latestScorecard: profile.scorecards[0] || null,
        complianceAlerts: alerts,
        recentLoadsCount,
        totalLoadsCount,
      },
    };
  } catch (err: any) {
    return { error: "Failed to fetch carrier info: " + err.message };
  }
}

// ─── 4. getShipperInfo ───────────────────────────────────────────────────────

export async function getShipperInfo(ctx: UserContext, shipperId?: string) {
  try {
    if (isCarrier(ctx.role)) {
      return { error: "Access denied. Carrier users cannot view shipper/customer information." };
    }

    if (!shipperId && !isAdmin(ctx.role) && !isFinance(ctx.role)) {
      // AE/Broker: list shippers they work with
      const loads = await prisma.load.findMany({
        where: { posterId: ctx.userId, customerId: { not: null } },
        select: { customerId: true },
        distinct: ["customerId"],
        take: 20,
      });

      const customerIds = loads.map((l) => l.customerId).filter(Boolean) as string[];
      if (customerIds.length === 0) {
        return { shippers: [], count: 0 };
      }

      const customers = await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        include: {
          shipperCredit: true,
          _count: { select: { loads: true } },
        },
      });

      return {
        shippers: customers.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          city: c.city,
          state: c.state,
          status: c.status,
          creditLimit: c.creditLimit,
          creditStatus: c.creditStatus,
          paymentTerms: c.paymentTerms,
          loadsCount: c._count.loads,
          creditGrade: c.shipperCredit?.creditGrade,
          avgDaysToPay: c.shipperCredit?.avgDaysToPay,
        })),
        count: customers.length,
      };
    }

    if (shipperId) {
      // Specific shipper
      const customer = await prisma.customer.findFirst({
        where: {
          OR: [
            { id: shipperId },
            { name: { contains: shipperId, mode: "insensitive" } },
          ],
        },
        include: {
          shipperCredit: true,
          _count: { select: { loads: true } },
        },
      });

      if (!customer) {
        return { error: "Shipper/customer not found." };
      }

      // If AE/Broker, verify they work with this shipper
      if (isBroker(ctx.role)) {
        const hasLoads = await prisma.load.findFirst({
          where: { posterId: ctx.userId, customerId: customer.id },
        });
        if (!hasLoads) {
          return { error: "Access denied. You do not have loads with this shipper." };
        }
      }

      // Recent loads
      const recentLoads = await prisma.load.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true, referenceNumber: true, status: true, rate: true, customerRate: true,
          originCity: true, originState: true, destCity: true, destState: true, pickupDate: true,
        },
      });

      // Invoice payment history
      const invoices = await prisma.invoice.findMany({
        where: { load: { customerId: customer.id } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true, invoiceNumber: true, status: true, amount: true, totalAmount: true,
          dueDate: true, paidAt: true, createdAt: true,
        },
      });

      return {
        shipper: {
          id: customer.id,
          name: customer.name,
          type: customer.type,
          contactName: customer.contactName,
          email: customer.email,
          phone: customer.phone,
          city: customer.city,
          state: customer.state,
          status: customer.status,
          industry: customer.industry,
          creditLimit: customer.creditLimit,
          creditStatus: customer.creditStatus,
          paymentTerms: customer.paymentTerms,
          avgLoadsPerMonth: customer.avgLoadsPerMonth,
          preferredEquipment: customer.preferredEquipment,
          totalLoads: customer._count.loads,
          credit: customer.shipperCredit ? {
            creditGrade: customer.shipperCredit.creditGrade,
            creditLimit: customer.shipperCredit.creditLimit,
            currentUtilized: customer.shipperCredit.currentUtilized,
            avgDaysToPay: customer.shipperCredit.avgDaysToPay,
            onTimePayments: customer.shipperCredit.onTimePayments,
            latePayments: customer.shipperCredit.latePayments,
            autoBlocked: customer.shipperCredit.autoBlocked,
          } : null,
          recentLoads,
          recentInvoices: invoices,
        },
      };
    }

    // Admin/Accounting with no shipperId: return top shippers
    const customers = await prisma.customer.findMany({
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: {
        shipperCredit: true,
        _count: { select: { loads: true } },
      },
    });

    return {
      shippers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        status: c.status,
        creditLimit: c.creditLimit,
        creditStatus: c.creditStatus,
        paymentTerms: c.paymentTerms,
        loadsCount: c._count.loads,
        creditGrade: c.shipperCredit?.creditGrade,
        avgDaysToPay: c.shipperCredit?.avgDaysToPay,
      })),
      count: customers.length,
    };
  } catch (err: any) {
    return { error: "Failed to fetch shipper info: " + err.message };
  }
}

// ─── 5. getAnalyticsSummary ──────────────────────────────────────────────────

export async function getAnalyticsSummary(ctx: UserContext, metric: string, dateRange?: string) {
  try {
    const { start, end } = getDateRange(dateRange);
    const roleFilter = applyLoadRoleFilter(ctx);

    // Carrier users can only see "loads" and "on_time"
    if (isCarrier(ctx.role) && !["loads", "on_time"].includes(metric)) {
      return { error: "Access denied. Carrier users can only view load and on-time metrics." };
    }

    switch (metric) {
      case "revenue": {
        const loads = await prisma.load.findMany({
          where: {
            ...roleFilter,
            pickupDate: { gte: start, lte: end },
            status: { notIn: ["DRAFT", "CANCELLED"] },
          },
          select: { rate: true, customerRate: true, carrierRate: true, totalCarrierPay: true, distance: true },
        });

        let totalRevenue = 0, totalCost = 0, totalMiles = 0;
        loads.forEach((l) => {
          totalRevenue += l.customerRate || l.rate || 0;
          totalCost += l.carrierRate || l.totalCarrierPay || 0;
          totalMiles += l.distance || 0;
        });

        const grossMargin = totalRevenue - totalCost;
        const marginPct = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;

        return {
          metric: "revenue",
          period: dateRange || "last_30d",
          totalRevenue,
          totalCost,
          grossMargin,
          marginPct: Math.round(marginPct * 100) / 100,
          loadCount: loads.length,
          totalMiles,
          revenuePerLoad: loads.length > 0 ? totalRevenue / loads.length : 0,
          revenuePerMile: totalMiles > 0 ? totalRevenue / totalMiles : 0,
        };
      }

      case "loads": {
        const loads = await prisma.load.findMany({
          where: {
            ...roleFilter,
            createdAt: { gte: start, lte: end },
          },
          select: { status: true },
        });

        const statusCounts: Record<string, number> = {};
        loads.forEach((l) => {
          statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
        });

        const activeStatuses = ["DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY"];
        const activeCount = loads.filter((l) => activeStatuses.includes(l.status)).length;

        return {
          metric: "loads",
          period: dateRange || "last_30d",
          totalLoads: loads.length,
          activeLoads: activeCount,
          statusBreakdown: statusCounts,
        };
      }

      case "on_time": {
        const deliveredLoads = await prisma.load.findMany({
          where: {
            ...roleFilter,
            deliveryDate: { gte: start, lte: end },
            status: { in: ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"] },
          },
          select: { deliveryDate: true, actualDeliveryDatetime: true },
        });

        let onTime = 0, late = 0;
        deliveredLoads.forEach((l) => {
          if (!l.actualDeliveryDatetime || l.actualDeliveryDatetime <= l.deliveryDate) {
            onTime++;
          } else {
            late++;
          }
        });

        const total = onTime + late;
        const onTimePct = total > 0 ? (onTime / total) * 100 : 100;

        return {
          metric: "on_time",
          period: dateRange || "last_30d",
          totalDelivered: total,
          onTime,
          late,
          onTimePercentage: Math.round(onTimePct * 100) / 100,
        };
      }

      case "risk_loads": {
        if (isCarrier(ctx.role)) {
          return { error: "Access denied. Carrier users cannot view risk analytics." };
        }

        // Loads that are in-transit with overdue check calls or approaching deadlines
        const now = new Date();
        const activeLoads = await prisma.load.findMany({
          where: {
            ...roleFilter,
            status: { in: ["DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY"] },
          },
          select: {
            id: true,
            referenceNumber: true,
            status: true,
            originCity: true,
            originState: true,
            destCity: true,
            destState: true,
            deliveryDate: true,
            carrier: { select: { firstName: true, lastName: true, company: true } },
            checkCalls: { orderBy: { createdAt: "desc" }, take: 1 },
            riskLogs: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        });

        const riskLoads = activeLoads.filter((l) => {
          const lastCheckCall = l.checkCalls[0];
          const lastRisk = l.riskLogs[0];
          const hoursUntilDelivery = (l.deliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60);

          // Check call overdue (more than 6 hours since last one)
          const checkCallOverdue = !lastCheckCall || (now.getTime() - lastCheckCall.createdAt.getTime()) > 6 * 60 * 60 * 1000;

          // Approaching deadline (less than 12 hours)
          const approachingDeadline = hoursUntilDelivery > 0 && hoursUntilDelivery < 12;

          // Past deadline
          const pastDeadline = hoursUntilDelivery < 0;

          // Has RED risk score
          const highRisk = lastRisk?.level === "RED";

          return checkCallOverdue || approachingDeadline || pastDeadline || highRisk;
        });

        return {
          metric: "risk_loads",
          period: dateRange || "last_30d",
          totalActiveLoads: activeLoads.length,
          riskLoadsCount: riskLoads.length,
          riskLoads: riskLoads.map((l) => ({
            id: l.id,
            referenceNumber: l.referenceNumber,
            status: l.status,
            route: `${l.originCity}, ${l.originState} → ${l.destCity}, ${l.destState}`,
            deliveryDate: l.deliveryDate,
            carrierName: l.carrier?.company || (l.carrier ? `${l.carrier.firstName} ${l.carrier.lastName}` : "Unassigned"),
            lastCheckCall: l.checkCalls[0]?.createdAt || null,
            riskLevel: l.riskLogs[0]?.level || "UNKNOWN",
          })),
        };
      }

      case "top_lanes": {
        const loads = await prisma.load.findMany({
          where: {
            ...roleFilter,
            pickupDate: { gte: start, lte: end },
            status: { notIn: ["DRAFT", "CANCELLED"] },
          },
          select: { originState: true, destState: true, rate: true, customerRate: true, carrierRate: true, distance: true },
        });

        const lanes: Record<string, { origin: string; dest: string; loads: number; revenue: number; cost: number; miles: number }> = {};
        loads.forEach((l) => {
          const key = `${l.originState}-${l.destState}`;
          if (!lanes[key]) lanes[key] = { origin: l.originState, dest: l.destState, loads: 0, revenue: 0, cost: 0, miles: 0 };
          lanes[key].loads++;
          lanes[key].revenue += l.customerRate || l.rate || 0;
          lanes[key].cost += l.carrierRate || 0;
          lanes[key].miles += l.distance || 0;
        });

        const topLanes = Object.values(lanes)
          .sort((a, b) => b.loads - a.loads)
          .slice(0, 5)
          .map((l) => ({
            lane: `${l.origin} → ${l.dest}`,
            loads: l.loads,
            revenue: l.revenue,
            margin: l.revenue - l.cost,
            avgRatePerMile: l.miles > 0 ? l.revenue / l.miles : 0,
          }));

        return {
          metric: "top_lanes",
          period: dateRange || "last_30d",
          topLanes,
        };
      }

      default:
        return { error: `Unknown metric "${metric}". Supported: revenue, loads, on_time, risk_loads, top_lanes` };
    }
  } catch (err: any) {
    return { error: "Failed to fetch analytics: " + err.message };
  }
}

// ─── 6. getComplianceStatus ──────────────────────────────────────────────────

export async function getComplianceStatus(ctx: UserContext, carrierId?: string) {
  try {
    let where: any = { status: "ACTIVE" };

    if (isCarrier(ctx.role)) {
      // Only their own alerts
      if (!ctx.carrierId) {
        const profile = await prisma.carrierProfile.findUnique({ where: { userId: ctx.userId } });
        if (!profile) return { error: "Carrier profile not found." };
        where.entityType = "CARRIER";
        where.entityId = profile.id;
      } else {
        where.entityType = "CARRIER";
        where.entityId = ctx.carrierId;
      }
    } else if (carrierId) {
      where.entityType = "CARRIER";
      // Try profile ID or user ID
      const profile = await prisma.carrierProfile.findFirst({
        where: {
          OR: [
            { id: carrierId },
            { userId: carrierId },
          ],
        },
      });
      if (profile) {
        where.entityId = profile.id;
      } else {
        where.entityId = carrierId;
      }
    }
    // If no carrierId and user is admin/AE, show all active alerts

    const alerts = await prisma.complianceAlert.findMany({
      where,
      orderBy: [{ severity: "asc" }, { expiryDate: "asc" }],
      take: 25,
    });

    // Count by severity
    const severityCounts: Record<string, number> = {};
    alerts.forEach((a) => {
      severityCounts[a.severity] = (severityCounts[a.severity] || 0) + 1;
    });

    return {
      alerts: alerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        entityType: a.entityType,
        entityId: a.entityId,
        entityName: a.entityName,
        expiryDate: a.expiryDate,
        status: a.status,
        createdAt: a.createdAt,
      })),
      totalAlerts: alerts.length,
      severityBreakdown: severityCounts,
    };
  } catch (err: any) {
    return { error: "Failed to fetch compliance status: " + err.message };
  }
}

// ─── 7. getFinancialSummary ──────────────────────────────────────────────────

export async function getFinancialSummary(ctx: UserContext) {
  try {
    if (isCarrier(ctx.role)) {
      return { error: "Access denied. Carrier users cannot view financial summaries." };
    }

    // AE/Broker: limited view
    if (isBroker(ctx.role)) {
      const roleFilter = applyLoadRoleFilter(ctx);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const loads = await prisma.load.findMany({
        where: {
          ...roleFilter,
          pickupDate: { gte: thirtyDaysAgo },
          status: { notIn: ["DRAFT", "CANCELLED"] },
        },
        select: { rate: true, customerRate: true, carrierRate: true, totalCarrierPay: true },
      });

      let revenue = 0, cost = 0;
      loads.forEach((l) => {
        revenue += l.customerRate || l.rate || 0;
        cost += l.carrierRate || l.totalCarrierPay || 0;
      });

      return {
        view: "limited",
        totalRevenue: revenue,
        totalCost: cost,
        grossMargin: revenue - cost,
        marginPct: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) / 100 : 0,
        loadCount: loads.length,
        period: "last_30d",
      };
    }

    // Full view for ACCOUNTING, ADMIN, CEO
    // Fund balance
    const latestFund = await prisma.factoringFund.findFirst({
      orderBy: { createdAt: "desc" },
      select: { runningBalance: true },
    });
    const fundBalance = latestFund?.runningBalance || 0;

    // Total AR (outstanding invoices)
    const arInvoices = await prisma.invoice.findMany({
      where: { status: { in: ["SENT", "SUBMITTED", "OVERDUE", "PARTIAL", "UNDER_REVIEW", "APPROVED"] } },
      select: { amount: true, totalAmount: true, paidAmount: true, dueDate: true, status: true },
    });

    let totalAR = 0, overdueAR = 0;
    const now = new Date();
    arInvoices.forEach((inv) => {
      const outstanding = (inv.totalAmount || inv.amount) - (inv.paidAmount || 0);
      if (outstanding > 0) {
        totalAR += outstanding;
        if (inv.dueDate && inv.dueDate < now) {
          overdueAR += outstanding;
        }
      }
    });

    // Total AP (pending carrier payments)
    const apPayments = await prisma.carrierPay.findMany({
      where: { status: { in: ["PENDING", "PREPARED", "SUBMITTED", "APPROVED", "PROCESSING", "SCHEDULED"] } },
      select: { netAmount: true, dueDate: true },
    });

    let totalAP = 0, overdueAP = 0;
    apPayments.forEach((p) => {
      totalAP += p.netAmount;
      if (p.dueDate && p.dueDate < now) {
        overdueAP += p.netAmount;
      }
    });

    // Revenue last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentLoads = await prisma.load.findMany({
      where: {
        pickupDate: { gte: thirtyDaysAgo },
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
      select: { rate: true, customerRate: true, carrierRate: true, totalCarrierPay: true },
    });

    let revenue = 0, cost = 0;
    recentLoads.forEach((l) => {
      revenue += l.customerRate || l.rate || 0;
      cost += l.carrierRate || l.totalCarrierPay || 0;
    });

    // Pending approvals count
    const pendingApprovals = await prisma.approvalQueue.count({
      where: { status: "PENDING" },
    });

    // Open disputes count
    const openDisputes = await prisma.paymentDispute.count({
      where: { status: { in: ["OPEN", "INVESTIGATING"] } },
    });

    return {
      view: "full",
      fundBalance,
      totalAR,
      overdueAR,
      totalAP,
      overdueAP,
      revenue30d: revenue,
      cost30d: cost,
      grossMargin30d: revenue - cost,
      marginPct30d: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) / 100 : 0,
      pendingApprovals,
      openDisputes,
      loadCount30d: recentLoads.length,
    };
  } catch (err: any) {
    return { error: "Failed to fetch financial summary: " + err.message };
  }
}

// ─── 8. searchLoads ──────────────────────────────────────────────────────────

export async function searchLoads(ctx: UserContext, query: string) {
  try {
    if (!query || query.trim().length === 0) {
      return { error: "Please provide a search query." };
    }

    const roleFilter = applyLoadRoleFilter(ctx);
    const q = query.trim();

    const loads = await prisma.load.findMany({
      where: {
        ...roleFilter,
        OR: [
          { referenceNumber: { contains: q, mode: "insensitive" } },
          { loadNumber: { contains: q, mode: "insensitive" } },
          { originCity: { contains: q, mode: "insensitive" } },
          { originState: { contains: q, mode: "insensitive" } },
          { destCity: { contains: q, mode: "insensitive" } },
          { destState: { contains: q, mode: "insensitive" } },
          { carrier: { company: { contains: q, mode: "insensitive" } } },
          { carrier: { firstName: { contains: q, mode: "insensitive" } } },
          { carrier: { lastName: { contains: q, mode: "insensitive" } } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
          { commodity: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 15,
      select: {
        id: true,
        referenceNumber: true,
        loadNumber: true,
        status: true,
        originCity: true,
        originState: true,
        destCity: true,
        destState: true,
        rate: true,
        customerRate: true,
        carrierRate: true,
        equipmentType: true,
        pickupDate: true,
        deliveryDate: true,
        carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
        customer: { select: { id: true, name: true } },
      },
    });

    return {
      query: q,
      results: loads.map((l) => sanitizeLoadForRole(l, ctx.role)),
      count: loads.length,
    };
  } catch (err: any) {
    return { error: "Failed to search loads: " + err.message };
  }
}

// ─── 9. searchCarriers ───────────────────────────────────────────────────────

export async function searchCarriers(ctx: UserContext, query: string) {
  try {
    if (isCarrier(ctx.role)) {
      return { error: "Access denied. Carrier users cannot search other carriers." };
    }

    if (!query || query.trim().length === 0) {
      return { error: "Please provide a search query." };
    }

    const q = query.trim();

    const profiles = await prisma.carrierProfile.findMany({
      where: {
        OR: [
          { companyName: { contains: q, mode: "insensitive" } },
          { mcNumber: { contains: q, mode: "insensitive" } },
          { dotNumber: { contains: q, mode: "insensitive" } },
          { contactName: { contains: q, mode: "insensitive" } },
          { user: { company: { contains: q, mode: "insensitive" } } },
          { user: { firstName: { contains: q, mode: "insensitive" } } },
          { user: { lastName: { contains: q, mode: "insensitive" } } },
        ],
      },
      take: 15,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, company: true, isActive: true } },
        _count: { select: { scorecards: true } },
      },
    });

    // Get loads count for each carrier
    const results = await Promise.all(
      profiles.map(async (p) => {
        const loadsCount = await prisma.load.count({
          where: { carrierId: p.userId, status: { notIn: ["DRAFT", "CANCELLED"] } },
        });

        return {
          profileId: p.id,
          userId: p.userId,
          name: p.companyName || `${p.user.firstName} ${p.user.lastName}`,
          mcNumber: p.mcNumber,
          dotNumber: p.dotNumber,
          tier: p.srcppTier !== "NONE" ? p.srcppTier : p.tier,
          srcppTotalLoads: p.srcppTotalLoads,
          srcppTotalMiles: p.srcppTotalMiles,
          equipmentTypes: p.equipmentTypes,
          operatingRegions: p.operatingRegions,
          applicationStatus: p.status,
          isActive: p.user.isActive,
          loadsCount,
        };
      })
    );

    return {
      query: q,
      results,
      count: results.length,
    };
  } catch (err: any) {
    return { error: "Failed to search carriers: " + err.message };
  }
}

// ─── 10. getRecentActivity ───────────────────────────────────────────────────

export async function getRecentActivity(ctx: UserContext) {
  try {
    if (isCarrier(ctx.role)) {
      // Only events related to their loads
      const carrierLoadIds = await prisma.load.findMany({
        where: { carrierId: ctx.userId },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      const loadIds = carrierLoadIds.map((l) => l.id);

      const audits = await prisma.auditTrail.findMany({
        where: {
          OR: [
            { entityType: "Load", entityId: { in: loadIds } },
            { entityType: "CarrierPay", performedById: ctx.userId },
            { performedById: ctx.userId },
          ],
        },
        orderBy: { performedAt: "desc" },
        take: 10,
        include: {
          performedBy: { select: { firstName: true, lastName: true } },
        },
      });

      return {
        activities: audits.map((a) => ({
          id: a.id,
          entityType: a.entityType,
          entityId: a.entityId,
          action: a.action,
          performedBy: `${a.performedBy.firstName} ${a.performedBy.lastName}`,
          performedAt: a.performedAt,
          changes: a.changedFields,
        })),
        count: audits.length,
      };
    }

    let auditWhere: any = {};

    if (isBroker(ctx.role)) {
      // Events related to loads they posted or carriers they work with
      const postedLoadIds = await prisma.load.findMany({
        where: { posterId: ctx.userId },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      const loadIds = postedLoadIds.map((l) => l.id);

      auditWhere = {
        OR: [
          { entityType: "Load", entityId: { in: loadIds } },
          { performedById: ctx.userId },
        ],
      };
    }
    // ADMIN: no filter (all events)

    const audits = await prisma.auditTrail.findMany({
      where: auditWhere,
      orderBy: { performedAt: "desc" },
      take: 10,
      include: {
        performedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return {
      activities: audits.map((a) => ({
        id: a.id,
        entityType: a.entityType,
        entityId: a.entityId,
        action: a.action,
        performedBy: `${a.performedBy.firstName} ${a.performedBy.lastName}`,
        performedAt: a.performedAt,
        changes: a.changedFields,
      })),
      count: audits.length,
    };
  } catch (err: any) {
    return { error: "Failed to fetch recent activity: " + err.message };
  }
}

// ─── 11. getMyLoads ──────────────────────────────────────────────────────────

export async function getMyLoads(ctx: UserContext) {
  try {
    let where: any;

    if (isCarrier(ctx.role)) {
      where = { carrierId: ctx.userId };
    } else if (isBroker(ctx.role)) {
      where = { posterId: ctx.userId };
    } else if (canSeeAllLoads(ctx.role)) {
      where = {};
    } else {
      where = { posterId: ctx.userId };
    }

    // Active loads first, then recent completed
    const activeStatuses = [
      "POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED",
      "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY",
    ];

    const activeLoads = await prisma.load.findMany({
      where: { ...where, status: { in: activeStatuses as any[] } },
      orderBy: { pickupDate: "asc" },
      take: 20,
      select: {
        id: true,
        referenceNumber: true,
        loadNumber: true,
        status: true,
        originCity: true,
        originState: true,
        destCity: true,
        destState: true,
        rate: true,
        customerRate: true,
        carrierRate: true,
        equipmentType: true,
        pickupDate: true,
        deliveryDate: true,
        actualPickupDatetime: true,
        actualDeliveryDatetime: true,
        distance: true,
        weight: true,
        carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
        customer: { select: { id: true, name: true } },
        poster: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const recentCompleted = await prisma.load.findMany({
      where: {
        ...where,
        status: { in: ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        referenceNumber: true,
        loadNumber: true,
        status: true,
        originCity: true,
        originState: true,
        destCity: true,
        destState: true,
        rate: true,
        customerRate: true,
        carrierRate: true,
        equipmentType: true,
        pickupDate: true,
        deliveryDate: true,
        actualDeliveryDatetime: true,
        distance: true,
        carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
        customer: { select: { id: true, name: true } },
      },
    });

    return {
      activeLoads: activeLoads.map((l) => sanitizeLoadForRole(l, ctx.role)),
      recentCompleted: recentCompleted.map((l) => sanitizeLoadForRole(l, ctx.role)),
      activeCount: activeLoads.length,
      completedCount: recentCompleted.length,
    };
  } catch (err: any) {
    return { error: "Failed to fetch my loads: " + err.message };
  }
}

// ─── 12. getMyPayments ───────────────────────────────────────────────────────

export async function getMyPayments(ctx: UserContext) {
  try {
    if (isBroker(ctx.role)) {
      return { error: "Access denied. Broker/AE users cannot view payment details." };
    }

    if (isCarrier(ctx.role)) {
      // Carrier: their own payments
      const payments = await prisma.carrierPay.findMany({
        where: { carrierId: ctx.userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          netAmount: true,
          grossAmount: true,
          quickPayFeeAmount: true,
          quickPayFeePercent: true,
          paymentTier: true,
          status: true,
          paymentMethod: true,
          dueDate: true,
          paidAt: true,
          scheduledDate: true,
          createdAt: true,
          load: {
            select: {
              id: true,
              referenceNumber: true,
              originCity: true,
              originState: true,
              destCity: true,
              destState: true,
            },
          },
        },
      });

      // Summary
      let totalPaid = 0, totalPending = 0, totalQpFees = 0;
      payments.forEach((p) => {
        if (p.status === "PAID") totalPaid += p.netAmount;
        else if (["PENDING", "PREPARED", "SUBMITTED", "APPROVED", "PROCESSING", "SCHEDULED"].includes(p.status)) {
          totalPending += p.netAmount;
        }
        totalQpFees += p.quickPayFeeAmount || 0;
      });

      return {
        payments: payments.map((p) => ({
          id: p.id,
          paymentNumber: p.paymentNumber,
          amount: p.amount,
          netAmount: p.netAmount,
          quickPayFee: p.quickPayFeeAmount,
          paymentTier: p.paymentTier,
          status: p.status,
          paymentMethod: p.paymentMethod,
          dueDate: p.dueDate,
          paidAt: p.paidAt,
          loadId: p.load.id,
          loadRef: p.load.referenceNumber,
          route: `${p.load.originCity}, ${p.load.originState} → ${p.load.destCity}, ${p.load.destState}`,
        })),
        summary: {
          totalPaid,
          totalPending,
          totalQpFees,
          paymentCount: payments.length,
        },
      };
    }

    // ACCOUNTING/ADMIN: all recent payments
    const payments = await prisma.carrierPay.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        paymentNumber: true,
        amount: true,
        netAmount: true,
        quickPayFeeAmount: true,
        paymentTier: true,
        status: true,
        paymentMethod: true,
        dueDate: true,
        paidAt: true,
        createdAt: true,
        carrier: { select: { id: true, firstName: true, lastName: true, company: true } },
        load: { select: { id: true, referenceNumber: true } },
      },
    });

    // Status summary
    const statusCounts: Record<string, number> = {};
    let totalAmount = 0;
    payments.forEach((p) => {
      statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
      totalAmount += p.netAmount;
    });

    return {
      payments: payments.map((p) => ({
        id: p.id,
        paymentNumber: p.paymentNumber,
        carrierName: p.carrier?.company || `${p.carrier?.firstName} ${p.carrier?.lastName}`,
        carrierId: p.carrier?.id,
        amount: p.amount,
        netAmount: p.netAmount,
        quickPayFee: p.quickPayFeeAmount,
        paymentTier: p.paymentTier,
        status: p.status,
        paymentMethod: p.paymentMethod,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        loadId: p.load?.id,
        loadRef: p.load?.referenceNumber,
      })),
      summary: {
        statusBreakdown: statusCounts,
        totalAmount,
        paymentCount: payments.length,
      },
    };
  } catch (err: any) {
    return { error: "Failed to fetch payments: " + err.message };
  }
}

// ─── 13. getMyScore ──────────────────────────────────────────────────────────

export async function getMyScore(ctx: UserContext) {
  try {
    let profileUserId: string;

    if (isCarrier(ctx.role)) {
      profileUserId = ctx.userId;
    } else if (isAdmin(ctx.role) || isBroker(ctx.role)) {
      return { error: "Please provide a carrier_id to look up a carrier's score." };
    } else {
      return { error: "Access denied." };
    }

    const profile = await prisma.carrierProfile.findUnique({
      where: { userId: profileUserId },
      include: {
        scorecards: { orderBy: { calculatedAt: "desc" }, take: 5 },
        bonuses: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });

    if (!profile) {
      return { error: "Carrier profile not found." };
    }

    const currentTier = profile.srcppTier !== "NONE" ? profile.srcppTier : profile.tier;
    const latestScorecard = profile.scorecards[0];

    // Calculate bonus percentage
    const bonusPercent = (() => {
      switch (currentTier) {
        case "PLATINUM": return 3;
        case "GOLD": return 1.5;
        default: return 0;
      }
    })();

    // Next tier info
    const nextTierInfo = (() => {
      switch (currentTier) {
        case "BRONZE":
          return { nextTier: "SILVER", requirement: "Maintain overall score >= 90" };
        case "SILVER":
          return { nextTier: "GOLD", requirement: "Maintain overall score >= 95" };
        case "GOLD":
          return { nextTier: "PLATINUM", requirement: "Maintain overall score >= 98" };
        case "PLATINUM":
          return { nextTier: null, requirement: "You are at the highest tier!" };
        case "GUEST":
          return { nextTier: "BRONZE", requirement: "Complete 3 loads with average score >= 70" };
        default:
          return { nextTier: "GUEST", requirement: "Complete onboarding to join The Caravan" };
      }
    })();

    // Total earnings from bonuses
    const totalBonusEarned = profile.bonuses
      .filter((b) => b.status === "PAID")
      .reduce((sum, b) => sum + b.amount, 0);

    return {
      score: {
        currentTier,
        overallScore: latestScorecard?.overallScore || 0,
        onTimePickupPct: latestScorecard?.onTimePickupPct || 0,
        onTimeDeliveryPct: latestScorecard?.onTimeDeliveryPct || 0,
        communicationScore: latestScorecard?.communicationScore || 0,
        claimRatio: latestScorecard?.claimRatio || 0,
        documentTimeliness: latestScorecard?.documentSubmissionTimeliness || 0,
        acceptanceRate: latestScorecard?.acceptanceRate || 0,
        gpsCompliancePct: latestScorecard?.gpsCompliancePct || 0,
      },
      stats: {
        totalLoads: profile.srcppTotalLoads,
        totalMiles: profile.srcppTotalMiles,
        bonusPercentage: bonusPercent,
        totalBonusEarned,
      },
      nextTierInfo,
      recentScorecards: profile.scorecards.map((s) => ({
        period: s.period,
        overallScore: s.overallScore,
        tierAtTime: s.tierAtTime,
        bonusEarned: s.bonusEarned,
        calculatedAt: s.calculatedAt,
      })),
      recentBonuses: profile.bonuses.map((b) => ({
        type: b.type,
        amount: b.amount,
        status: b.status,
        description: b.description,
        createdAt: b.createdAt,
      })),
    };
  } catch (err: any) {
    return { error: "Failed to fetch score: " + err.message };
  }
}

// Overload for admin/broker to look up a specific carrier
export async function getCarrierScore(ctx: UserContext, carrierId: string) {
  try {
    if (isCarrier(ctx.role)) {
      return { error: "Access denied. Use getMyScore for your own score." };
    }

    if (!isAdmin(ctx.role) && !isBroker(ctx.role) && !isOperations(ctx.role)) {
      return { error: "Access denied." };
    }

    const profile = await prisma.carrierProfile.findFirst({
      where: {
        OR: [
          { id: carrierId },
          { userId: carrierId },
        ],
      },
      include: {
        user: { select: { firstName: true, lastName: true, company: true } },
        scorecards: { orderBy: { calculatedAt: "desc" }, take: 5 },
        bonuses: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });

    if (!profile) {
      return { error: "Carrier profile not found." };
    }

    const currentTier = profile.srcppTier !== "NONE" ? profile.srcppTier : profile.tier;
    const latestScorecard = profile.scorecards[0];

    const bonusPercent = (() => {
      switch (currentTier) {
        case "PLATINUM": return 3;
        case "GOLD": return 1.5;
        default: return 0;
      }
    })();

    const nextTierInfo = (() => {
      switch (currentTier) {
        case "BRONZE": return { nextTier: "SILVER", requirement: "Maintain overall score >= 90" };
        case "SILVER": return { nextTier: "GOLD", requirement: "Maintain overall score >= 95" };
        case "GOLD": return { nextTier: "PLATINUM", requirement: "Maintain overall score >= 98" };
        case "PLATINUM": return { nextTier: null, requirement: "Highest tier achieved" };
        case "GUEST": return { nextTier: "BRONZE", requirement: "Complete 3 loads with average score >= 70" };
        default: return { nextTier: "GUEST", requirement: "Complete onboarding" };
      }
    })();

    return {
      carrier: {
        profileId: profile.id,
        userId: profile.userId,
        name: profile.companyName || `${profile.user.firstName} ${profile.user.lastName}`,
      },
      score: {
        currentTier,
        overallScore: latestScorecard?.overallScore || 0,
        onTimePickupPct: latestScorecard?.onTimePickupPct || 0,
        onTimeDeliveryPct: latestScorecard?.onTimeDeliveryPct || 0,
        communicationScore: latestScorecard?.communicationScore || 0,
        claimRatio: latestScorecard?.claimRatio || 0,
        documentTimeliness: latestScorecard?.documentSubmissionTimeliness || 0,
        acceptanceRate: latestScorecard?.acceptanceRate || 0,
        gpsCompliancePct: latestScorecard?.gpsCompliancePct || 0,
      },
      stats: {
        totalLoads: profile.srcppTotalLoads,
        totalMiles: profile.srcppTotalMiles,
        bonusPercentage: bonusPercent,
      },
      nextTierInfo,
      recentScorecards: profile.scorecards.map((s) => ({
        period: s.period,
        overallScore: s.overallScore,
        tierAtTime: s.tierAtTime,
        bonusEarned: s.bonusEarned,
        calculatedAt: s.calculatedAt,
      })),
    };
  } catch (err: any) {
    return { error: "Failed to fetch carrier score: " + err.message };
  }
}

// ─── Tool Definitions (Gemini Function Calling Format) ────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: "getLoadInfo",
    description: "Get detailed information about a specific load by ID or reference number, or list recent loads if no ID provided. Returns load details including route, status, carrier, customer, check calls, invoices, and carrier payments.",
    parameters: {
      type: "object",
      properties: {
        load_id: {
          type: "string",
          description: "Optional load ID, reference number, or load number to look up. If omitted, returns the 10 most recent loads.",
        },
      },
    },
  },
  {
    name: "getLoadsByStatus",
    description: "Get loads filtered by their current status. Useful for finding all in-transit loads, delivered loads, posted loads, etc.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Load status to filter by. Values: DRAFT, PLANNED, POSTED, TENDERED, CONFIRMED, BOOKED, DISPATCHED, AT_PICKUP, LOADED, IN_TRANSIT, AT_DELIVERY, DELIVERED, POD_RECEIVED, INVOICED, COMPLETED, TONU, CANCELLED",
        },
      },
      required: ["status"],
    },
  },
  {
    name: "getCarrierInfo",
    description: "Get detailed carrier profile information including tier, SRCPP score, compliance alerts, equipment types, and recent load count. Can look up by carrier profile ID, user ID, MC number, or DOT number.",
    parameters: {
      type: "object",
      properties: {
        carrier_id: {
          type: "string",
          description: "Optional carrier profile ID, user ID, MC number, or DOT number. If omitted, returns the current user's carrier profile (for carrier users).",
        },
      },
    },
  },
  {
    name: "getShipperInfo",
    description: "Get shipper/customer information including credit details, recent loads, and payment history. Not available to carrier users.",
    parameters: {
      type: "object",
      properties: {
        shipper_id: {
          type: "string",
          description: "Optional shipper/customer ID or company name. If omitted, lists shippers the user works with.",
        },
      },
    },
  },
  {
    name: "getAnalyticsSummary",
    description: "Get quick analytics summaries for different metrics including revenue, load counts, on-time performance, at-risk loads, and top lanes. Carrier users can only access 'loads' and 'on_time' metrics.",
    parameters: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          description: "The metric to retrieve. Values: 'revenue' (revenue, cost, margin), 'loads' (count by status), 'on_time' (on-time delivery percentage), 'risk_loads' (loads at risk), 'top_lanes' (top 5 lanes by volume)",
        },
        date_range: {
          type: "string",
          description: "Time period to analyze. Values: 'today', 'this_week', 'this_month', 'last_30d' (default)",
        },
      },
      required: ["metric"],
    },
  },
  {
    name: "getComplianceStatus",
    description: "Get active compliance alerts including insurance expirations, authority issues, and safety concerns. Carrier users see only their own alerts.",
    parameters: {
      type: "object",
      properties: {
        carrier_id: {
          type: "string",
          description: "Optional carrier ID to filter alerts for a specific carrier. If omitted, shows all active alerts (admin) or own alerts (carrier).",
        },
      },
    },
  },
  {
    name: "getFinancialSummary",
    description: "Get a financial overview including fund balance, accounts receivable, accounts payable, and revenue metrics. Not available to carrier users. AE/Broker users see a limited view (revenue and margin only). Full view available to Accounting, Admin, and CEO roles.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "searchLoads",
    description: "Search for loads by reference number, origin/destination city or state, carrier name, shipper name, or commodity. Results are filtered based on user role.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - can be a reference number, city name, state abbreviation, carrier company name, shipper name, or commodity type",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "searchCarriers",
    description: "Search for carriers by company name, MC number, or DOT number. Returns carrier profiles with tier, score, and load count. Not available to carrier users.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - can be a company name, MC number, or DOT number",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "getRecentActivity",
    description: "Get the last 10 system events (audit trail) relevant to the user. Carrier users see events related to their loads. AE/Broker users see events related to their posted loads. Admin users see all events.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "getMyLoads",
    description: "Get the current user's loads - active loads (sorted by pickup date) and recently completed loads. For carriers: loads assigned to them. For AE/Broker: loads they posted. For Admin: all loads.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "getMyPayments",
    description: "Get payment information. For carrier users: their payment history from CarrierPay with amounts, statuses, and quick pay details. For Accounting/Admin: all recent payments. Not available to AE/Broker users.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "getMyScore",
    description: "Get SRCPP score and tier information. For carrier users: their own score, tier, total loads, total miles, bonus percentage, and next tier requirements. For AE/Admin: requires a carrier_id parameter to look up a specific carrier's score.",
    parameters: {
      type: "object",
      properties: {
        carrier_id: {
          type: "string",
          description: "Carrier profile ID or user ID to look up (required for non-carrier users, ignored for carrier users who always see their own score)",
        },
      },
    },
  },
];

// ─── Tool Executor ────────────────────────────────────────────────────────────

export async function executeTool(toolName: string, args: any, ctx: UserContext): Promise<any> {
  switch (toolName) {
    case "getLoadInfo":
      return getLoadInfo(ctx, args?.load_id);
    case "getLoadsByStatus":
      return getLoadsByStatus(ctx, args?.status);
    case "getCarrierInfo":
      return getCarrierInfo(ctx, args?.carrier_id);
    case "getShipperInfo":
      return getShipperInfo(ctx, args?.shipper_id);
    case "getAnalyticsSummary":
      return getAnalyticsSummary(ctx, args?.metric, args?.date_range);
    case "getComplianceStatus":
      return getComplianceStatus(ctx, args?.carrier_id);
    case "getFinancialSummary":
      return getFinancialSummary(ctx);
    case "searchLoads":
      return searchLoads(ctx, args?.query);
    case "searchCarriers":
      return searchCarriers(ctx, args?.query);
    case "getRecentActivity":
      return getRecentActivity(ctx);
    case "getMyLoads":
      return getMyLoads(ctx);
    case "getMyPayments":
      return getMyPayments(ctx);
    case "getMyScore": {
      // If carrier user, return their own score; otherwise use carrier_id
      if (isCarrier(ctx.role)) {
        return getMyScore(ctx);
      }
      if (args?.carrier_id) {
        return getCarrierScore(ctx, args.carrier_id);
      }
      return getMyScore(ctx);
    }
    default:
      return { error: `Unknown tool: ${toolName}. Available tools: ${TOOL_DEFINITIONS.map((t) => t.name).join(", ")}` };
  }
}
