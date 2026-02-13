import { prisma } from "../config/database";

/**
 * Customer Intelligence Engine — Self-Learning Shipper Behavior Predictor
 *
 * Learns from shipping patterns to:
 * - Predict churn risk before customers leave
 * - Identify upsell/cross-sell opportunities
 * - Detect seasonal shipping patterns
 * - Calculate true customer lifetime value
 * - Recommend proactive engagement actions
 *
 * COMPETITIVE EDGE: Retain shippers before they leave. Grow accounts proactively.
 */

// ─── Get Customer Insights ────────────────────────────────────────
export async function getCustomerInsights(customerId: string) {
  const intel = await prisma.customerIntelligence.findUnique({
    where: { customerId },
    include: { customer: { select: { name: true, status: true, avgLoadsPerMonth: true } } },
  });

  if (!intel) return null;

  return {
    ...intel,
    actionPriority: intel.churnRisk > 0.5 ? "URGENT" : intel.churnRisk > 0.3 ? "HIGH" : "NORMAL",
    healthScore: Math.round(intel.engagementScore * (1 - intel.churnRisk)),
  };
}

// ─── Weekly Learning Cycle ────────────────────────────────────────
export async function runCustomerLearningCycle(): Promise<{
  customersProcessed: number;
  churnAlerts: number;
  upsellOpportunities: number;
}> {
  const startTime = Date.now();
  console.log("[CustomerIntelligence] Starting learning cycle...");

  const customers = await prisma.customer.findMany({
    where: { status: "Active" },
    select: { id: true, name: true, createdAt: true, avgLoadsPerMonth: true, preferredEquipment: true },
  });

  let churnAlerts = 0;
  let upsellOpportunities = 0;

  for (const customer of customers) {
    const loads = await prisma.load.findMany({
      where: { customerId: customer.id },
      select: {
        id: true,
        customerRate: true,
        status: true,
        createdAt: true,
        originState: true,
        destState: true,
        equipmentType: true,
        deliveryDate: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    if (loads.length === 0) {
      // Customer with no loads — nurture
      await prisma.customerIntelligence.upsert({
        where: { customerId: customer.id },
        create: {
          customerId: customer.id,
          churnRisk: 0.2,
          engagementScore: 20,
          recommendedAction: "NURTURE",
          lastTrainedAt: new Date(),
        },
        update: {
          churnRisk: 0.2,
          engagementScore: 20,
          recommendedAction: "NURTURE",
          lastTrainedAt: new Date(),
        },
      });
      continue;
    }

    // Lifetime value
    const completedLoads = loads.filter((l) => ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"].includes(l.status));
    const lifetimeValue = completedLoads.reduce((s, l) => s + (l.customerRate || 0), 0);
    const avgLoadValue = completedLoads.length > 0 ? lifetimeValue / completedLoads.length : 0;

    // Load frequency (loads per month)
    const accountAgeMonths = Math.max(1, (Date.now() - customer.createdAt.getTime()) / (30 * 86_400_000));
    const avgLoadFrequency = loads.length / accountAgeMonths;

    // Days since last load
    const lastLoadDate = loads[0].createdAt;
    const daysSinceLastLoad = Math.floor((Date.now() - lastLoadDate.getTime()) / 86_400_000);

    // Churn risk calculation
    const expectedInterval = avgLoadFrequency > 0 ? 30 / avgLoadFrequency : 30;
    let churnRisk = 0;
    if (daysSinceLastLoad > expectedInterval * 3) churnRisk = 0.8;
    else if (daysSinceLastLoad > expectedInterval * 2) churnRisk = 0.5;
    else if (daysSinceLastLoad > expectedInterval * 1.5) churnRisk = 0.3;
    else churnRisk = 0.05;

    // Trend analysis
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000);
    const recentLoads = loads.filter((l) => l.createdAt >= thirtyDaysAgo).length;
    const olderLoads = loads.filter((l) => l.createdAt >= sixtyDaysAgo && l.createdAt < thirtyDaysAgo).length;

    if (olderLoads > 0 && recentLoads < olderLoads * 0.5) {
      churnRisk = Math.min(1, churnRisk + 0.2); // Volume dropping
    }

    let churnReason: string | null = null;
    if (churnRisk > 0.4) {
      if (daysSinceLastLoad > expectedInterval * 2) churnReason = "Shipping frequency declined significantly";
      else if (recentLoads < olderLoads * 0.5) churnReason = "Volume trending downward";
      else churnReason = "Extended gap between shipments";
    }

    // Growth potential
    let growthPotential = 0.5;
    if (recentLoads > olderLoads) growthPotential = 0.8; // Growing
    if (avgLoadFrequency > 10) growthPotential = 0.3; // Already high-volume, less upside %

    // Payment reliability
    const invoices = await prisma.invoice.findMany({
      where: { load: { customerId: customer.id } },
      select: { dueDate: true, paidAt: true, status: true },
      take: 50,
    });
    const paidInvoices = invoices.filter((i) => i.paidAt && i.dueDate);
    let paymentReliability = 1.0;
    let avgPaymentDays = 30;
    if (paidInvoices.length > 0) {
      const latePct = paidInvoices.filter((i) => i.paidAt! > i.dueDate!).length / paidInvoices.length;
      paymentReliability = 1 - latePct;
      avgPaymentDays = paidInvoices.reduce((s, i) => {
        return s + (i.paidAt!.getTime() - i.dueDate!.getTime()) / 86_400_000;
      }, 0) / paidInvoices.length + 30;
    }

    // Preferred lanes
    const laneCounts = new Map<string, number>();
    for (const load of completedLoads) {
      if (load.originState && load.destState) {
        const key = `${load.originState}:${load.destState}`;
        laneCounts.set(key, (laneCounts.get(key) || 0) + 1);
      }
    }
    const preferredLanes = [...laneCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([lane, count]) => ({ lane, loads: count }));

    // Equipment preference
    const equipCounts = new Map<string, number>();
    for (const load of completedLoads) {
      if (load.equipmentType) {
        equipCounts.set(load.equipmentType, (equipCounts.get(load.equipmentType) || 0) + 1);
      }
    }
    const preferredEquipment = [...equipCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));

    // Seasonal patterns
    const monthlyLoads: Record<string, number> = {};
    for (const load of loads) {
      const m = load.createdAt.toLocaleString("en", { month: "short" }).toLowerCase();
      monthlyLoads[m] = (monthlyLoads[m] || 0) + 1;
    }

    // Engagement score (0-100)
    const recencyScore = Math.max(0, 100 - daysSinceLastLoad * 2);
    const frequencyScore = Math.min(100, avgLoadFrequency * 10);
    const valueScore = Math.min(100, (avgLoadValue / 5000) * 100);
    const engagementScore = Math.round(recencyScore * 0.4 + frequencyScore * 0.35 + valueScore * 0.25);

    // Recommended action
    let recommendedAction = "MAINTAIN";
    if (churnRisk > 0.5) { recommendedAction = "RETAIN"; churnAlerts++; }
    else if (daysSinceLastLoad > expectedInterval * 1.5) recommendedAction = "RE-ENGAGE";
    else if (growthPotential > 0.6 && engagementScore > 50) { recommendedAction = "UPSELL"; upsellOpportunities++; }
    else if (engagementScore < 30) recommendedAction = "NURTURE";

    await prisma.customerIntelligence.upsert({
      where: { customerId: customer.id },
      create: {
        customerId: customer.id,
        lifetimeValue: Math.round(lifetimeValue),
        avgLoadFrequency: Math.round(avgLoadFrequency * 100) / 100,
        avgLoadValue: Math.round(avgLoadValue),
        churnRisk: Math.round(churnRisk * 100) / 100,
        churnReason,
        growthPotential: Math.round(growthPotential * 100) / 100,
        paymentReliability: Math.round(paymentReliability * 100) / 100,
        avgPaymentDays: Math.round(avgPaymentDays),
        preferredLanes,
        preferredEquipment,
        seasonalPattern: monthlyLoads,
        lastShipmentAt: lastLoadDate,
        daysSinceLastLoad,
        engagementScore,
        recommendedAction,
        lastTrainedAt: new Date(),
      },
      update: {
        lifetimeValue: Math.round(lifetimeValue),
        avgLoadFrequency: Math.round(avgLoadFrequency * 100) / 100,
        avgLoadValue: Math.round(avgLoadValue),
        churnRisk: Math.round(churnRisk * 100) / 100,
        churnReason,
        growthPotential: Math.round(growthPotential * 100) / 100,
        paymentReliability: Math.round(paymentReliability * 100) / 100,
        avgPaymentDays: Math.round(avgPaymentDays),
        preferredLanes,
        preferredEquipment,
        seasonalPattern: monthlyLoads,
        lastShipmentAt: lastLoadDate,
        daysSinceLastLoad,
        engagementScore,
        recommendedAction,
        lastTrainedAt: new Date(),
      },
    });
  }

  await prisma.aILearningCycle.create({
    data: {
      serviceName: "customer_intelligence",
      cycleType: "WEEKLY",
      dataPointsProcessed: customers.length,
      modelsUpdated: customers.length,
      durationMs: Date.now() - startTime,
      improvements: [{ churnAlerts, upsellOpportunities }],
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  console.log(`[CustomerIntelligence] Cycle complete: ${customers.length} customers, ${churnAlerts} churn alerts, ${upsellOpportunities} upsell ops`);
  return { customersProcessed: customers.length, churnAlerts, upsellOpportunities };
}

// ─── Dashboard ────────────────────────────────────────────────────
export async function getCustomerDashboard() {
  const [churnRisks, topCustomers, reEngageList, totalCustomers] = await Promise.all([
    prisma.customerIntelligence.findMany({
      where: { churnRisk: { gte: 0.3 } },
      orderBy: { churnRisk: "desc" },
      take: 10,
      include: { customer: { select: { name: true, status: true } } },
    }),
    prisma.customerIntelligence.findMany({
      orderBy: { lifetimeValue: "desc" },
      take: 10,
      include: { customer: { select: { name: true, status: true } } },
    }),
    prisma.customerIntelligence.findMany({
      where: { recommendedAction: { in: ["RE-ENGAGE", "RETAIN"] } },
      orderBy: { daysSinceLastLoad: "desc" },
      take: 10,
      include: { customer: { select: { name: true, status: true } } },
    }),
    prisma.customerIntelligence.count(),
  ]);

  return { churnRisks, topCustomers, reEngageList, totalCustomers };
}
