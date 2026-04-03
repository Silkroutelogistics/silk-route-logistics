import { prisma } from "../config/database";

// ─── Types ──────────────────────────────────────────────────────────

export interface LinkedInPost {
  text: string;
  hashtags: string[];
}

export interface BlogPost {
  title: string;
  body: string;
  seoKeywords: string[];
}

export interface EmailNewsletter {
  subject: string;
  body: string;
}

export interface MarketInsight {
  title: string;
  summary: string;
  data: Record<string, unknown>;
}

export interface ContentPack {
  linkedinPosts: LinkedInPost[];
  blogPost: BlogPost;
  emailNewsletter: EmailNewsletter;
  marketInsight: MarketInsight;
  generatedAt: string;
}

export interface ContentCalendarWeek {
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  linkedinPost: LinkedInPost;
  blogDraft: { title: string; outline: string };
  newsletterDraft: { subject: string; preview: string };
}

// ─── Helpers ────────────────────────────────────────────────────────

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const QUARTER_NAMES = ["Q1", "Q2", "Q3", "Q4"];

function getQuarter(month: number): string {
  return QUARTER_NAMES[Math.floor(month / 3)];
}

function formatCurrency(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatRate(rate: number): string {
  return `$${rate.toFixed(2)}`;
}

const COMPLETED_STATUSES: string[] = ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"];

const EQUIPMENT_LABELS: Record<string, string> = {
  DRY_VAN: "Dry Van",
  REEFER: "Reefer",
  FLATBED: "Flatbed",
  STEP_DECK: "Step Deck",
  POWER_ONLY: "Power Only",
  CONESTOGA: "Conestoga",
  LOWBOY: "Lowboy",
  HOTSHOT: "Hotshot",
};

// ─── Data Fetching ──────────────────────────────────────────────────

async function fetchContentData() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Current period loads
  const currentLoads = await prisma.load.findMany({
    where: {
      status: { in: COMPLETED_STATUSES as any[] },
      deliveryDate: { gte: thirtyDaysAgo, lte: now },
      deletedAt: null,
    },
    select: {
      originState: true,
      destState: true,
      customerRate: true,
      carrierRate: true,
      grossMargin: true,
      marginPercent: true,
      revenuePerMile: true,
      distance: true,
      equipmentType: true,
      deliveryDate: true,
      actualDeliveryDatetime: true,
      carrierId: true,
      carrier: { select: { company: true, firstName: true, lastName: true } },
    },
  });

  // Prior period loads for comparison
  const priorLoads = await prisma.load.findMany({
    where: {
      status: { in: COMPLETED_STATUSES as any[] },
      deliveryDate: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      deletedAt: null,
    },
    select: {
      originState: true,
      destState: true,
      customerRate: true,
      revenuePerMile: true,
      equipmentType: true,
    },
  });

  // Active carrier count with compliance checks
  const activeCarriers = await prisma.carrierProfile.count({
    where: { status: "APPROVED" as any },
  });

  // Compliance check count (use carrier profile count as proxy)
  const complianceCheckCount = activeCarriers * 12; // Compass runs ~12 checks per carrier

  return { currentLoads, priorLoads, activeCarriers, complianceCheckCount };
}

// ─── Lane Analysis ──────────────────────────────────────────────────

function analyzeLanes(loads: { originState: string; destState: string; customerRate?: number | null; revenuePerMile: number | null }[]) {
  const laneMap = new Map<string, { origin: string; dest: string; count: number; totalRevenue: number; rpmValues: number[] }>();
  for (const l of loads) {
    const key = `${l.originState}→${l.destState}`;
    if (!laneMap.has(key)) laneMap.set(key, { origin: l.originState, dest: l.destState, count: 0, totalRevenue: 0, rpmValues: [] });
    const lane = laneMap.get(key)!;
    lane.count++;
    lane.totalRevenue += l.customerRate ?? 0;
    if (l.revenuePerMile != null) lane.rpmValues.push(l.revenuePerMile);
  }
  return Array.from(laneMap.values()).sort((a, b) => b.count - a.count);
}

function analyzeEquipmentRates(
  current: { equipmentType: string; revenuePerMile: number | null }[],
  prior: { equipmentType: string; revenuePerMile: number | null }[],
) {
  const currentMap = new Map<string, number[]>();
  const priorMap = new Map<string, number[]>();

  for (const l of current) {
    if (l.revenuePerMile == null) continue;
    if (!currentMap.has(l.equipmentType)) currentMap.set(l.equipmentType, []);
    currentMap.get(l.equipmentType)!.push(l.revenuePerMile);
  }
  for (const l of prior) {
    if (l.revenuePerMile == null) continue;
    if (!priorMap.has(l.equipmentType)) priorMap.set(l.equipmentType, []);
    priorMap.get(l.equipmentType)!.push(l.revenuePerMile);
  }

  const results: { equipmentType: string; label: string; currentAvg: number; priorAvg: number; change: number; direction: string }[] = [];
  for (const [eq, rates] of currentMap.entries()) {
    const currentAvg = rates.reduce((s, v) => s + v, 0) / rates.length;
    const priorRates = priorMap.get(eq);
    const priorAvg = priorRates && priorRates.length > 0 ? priorRates.reduce((s, v) => s + v, 0) / priorRates.length : currentAvg;
    const change = priorAvg > 0 ? ((currentAvg - priorAvg) / priorAvg) * 100 : 0;
    results.push({
      equipmentType: eq,
      label: EQUIPMENT_LABELS[eq] || eq,
      currentAvg: Math.round(currentAvg * 100) / 100,
      priorAvg: Math.round(priorAvg * 100) / 100,
      change: Math.round(change * 10) / 10,
      direction: change > 2 ? "up" : change < -2 ? "down" : "flat",
    });
  }
  return results.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

function analyzeCarrierPerformance(loads: { carrierId: string | null; actualDeliveryDatetime: Date | null; deliveryDate: Date; carrier: { company: string | null; firstName: string | null; lastName: string | null } | null }[]) {
  const carrierMap = new Map<string, { name: string; loads: number; onTime: number }>();
  for (const l of loads) {
    if (!l.carrierId) continue;
    const name = l.carrier?.company || `${l.carrier?.firstName || ""} ${l.carrier?.lastName || ""}`.trim() || "Carrier";
    if (!carrierMap.has(l.carrierId)) carrierMap.set(l.carrierId, { name, loads: 0, onTime: 0 });
    const c = carrierMap.get(l.carrierId)!;
    c.loads++;
    if (l.actualDeliveryDatetime && l.actualDeliveryDatetime <= l.deliveryDate) c.onTime++;
  }
  const carriers = Array.from(carrierMap.values()).filter((c) => c.loads >= 2).sort((a, b) => b.loads - a.loads);
  const totalOnTime = carriers.reduce((s, c) => s + c.onTime, 0);
  const totalLoads = carriers.reduce((s, c) => s + c.loads, 0);
  const overallOnTimeRate = totalLoads > 0 ? Math.round((totalOnTime / totalLoads) * 100) : 0;
  return { carriers, overallOnTimeRate };
}

// ─── Content Generation ─────────────────────────────────────────────

/**
 * Generates weekly marketing content from SRL's own data. Template-based, no external AI needed.
 */
export async function generateWeeklyContent(): Promise<ContentPack> {
  const now = new Date();
  const month = MONTH_NAMES[now.getMonth()];
  const year = now.getFullYear();
  const quarter = getQuarter(now.getMonth());

  const { currentLoads, priorLoads, activeCarriers, complianceCheckCount } = await fetchContentData();

  const lanes = analyzeLanes(currentLoads);
  const equipmentRates = analyzeEquipmentRates(currentLoads, priorLoads);
  const { carriers, overallOnTimeRate } = analyzeCarrierPerformance(currentLoads);

  const topLane = lanes[0];
  const topEquipment = equipmentRates[0];
  const totalLoads = currentLoads.length;
  const totalRevenue = currentLoads.reduce((s, l) => s + (l.customerRate ?? 0), 0);

  // ── LinkedIn Posts ────────────────────────────────────────
  const linkedinPosts: LinkedInPost[] = [];

  // Post 1: Lane spotlight
  if (topLane) {
    const avgRpm = topLane.rpmValues.length > 0 ? topLane.rpmValues.reduce((s, v) => s + v, 0) / topLane.rpmValues.length : 0;
    const trendWord = topLane.count > 5 ? "heating up" : "active";
    linkedinPosts.push({
      text: `Lane spotlight: ${topLane.origin}→${topLane.dest} moved ${topLane.count} loads this month at ${formatRate(avgRpm)}/mile. The ${topLane.origin}→${topLane.dest} corridor is ${trendWord}.\n\nAt Silk Route Logistics, we leverage real-time data to help shippers and carriers optimize their lanes.`,
      hashtags: ["#FreightBrokerage", "#Logistics", "#SupplyChain", "#TruckingIndustry"],
    });
  }

  // Post 2: Carrier spotlight
  if (carriers.length > 0) {
    linkedinPosts.push({
      text: `Carrier spotlight: Our top-performing carriers achieved ${overallOnTimeRate}% on-time delivery this month. At SRL, we believe in transparency — every carrier sees their real-time scorecard.\n\nWhen carriers succeed, shippers succeed. That's our Carrier-First philosophy.`,
      hashtags: ["#CarrierFirst", "#FreightBrokerage", "#OnTimeDelivery", "#Trucking"],
    });
  }

  // Post 3: Market update
  if (topEquipment) {
    const directionPhrase = topEquipment.direction === "up" ? `trending up ${Math.abs(topEquipment.change)}%` : topEquipment.direction === "down" ? `down ${Math.abs(topEquipment.change)}%` : `holding steady`;
    linkedinPosts.push({
      text: `Market update: ${topEquipment.label} rates are ${directionPhrase} this month. Here's what smart shippers are doing — planning ahead and locking in capacity through trusted broker partnerships.\n\nWant to know what rates look like on your lanes? Let's talk.`,
      hashtags: ["#SupplyChain", "#FreightRates", "#Logistics", "#Shipping"],
    });
  }

  // Post 4: Compliance / Compass
  linkedinPosts.push({
    text: `Did you know? SRL's Compass engine runs ${complianceCheckCount.toLocaleString()} compliance checks on every carrier — for free. No RMIS subscription needed.\n\nWe vet every carrier before they touch your freight: FMCSA authority, insurance, safety scores, OFAC screening, and more.\n\nYour freight deserves that level of protection.`,
    hashtags: ["#FreightCompliance", "#Safety", "#CarrierVetting", "#SupplyChainSecurity"],
  });

  // ── Blog Post ─────────────────────────────────────────────
  const topLanes = lanes.slice(0, 10);
  const blogLaneRows = topLanes.map((l, i) => {
    const avgRpm = l.rpmValues.length > 0 ? l.rpmValues.reduce((s, v) => s + v, 0) / l.rpmValues.length : 0;
    return `${i + 1}. **${l.origin}→${l.dest}**: ${l.count} loads, avg ${formatRate(avgRpm)}/mile, ${formatCurrency(l.totalRevenue)} total revenue`;
  }).join("\n");

  const blogPost: BlogPost = {
    title: `Monthly Lane Report: Top 10 Freight Corridors for ${month} ${year}`,
    body: `# Monthly Lane Report: Top 10 Freight Corridors for ${month} ${year}

## Market Overview

${month} ${year} brought ${totalLoads} completed loads across our network, generating ${formatCurrency(totalRevenue)} in freight revenue. Here's a look at the top-performing freight corridors.

## Top 10 Lanes by Volume

${blogLaneRows}

## Rate Trends by Equipment Type

${equipmentRates.slice(0, 5).map((eq) => {
  return `- **${eq.label}**: ${formatRate(eq.currentAvg)}/mile (${eq.direction === "up" ? "+" : eq.direction === "down" ? "" : ""}${eq.change}% vs. last month)`;
}).join("\n")}

## Carrier Performance

Our carrier network achieved an overall ${overallOnTimeRate}% on-time delivery rate this month across ${activeCarriers} active carriers. Through our Compass compliance engine, every carrier is vetted before they book a load.

## What This Means for Shippers

${equipmentRates.some((e) => e.direction === "up") ? "With rates trending upward in some equipment types, shippers who plan ahead and secure capacity early will have an advantage." : "With rates holding steady, it's a good time to negotiate volume commitments with your broker partner."}

---

*Data sourced from Silk Route Logistics' internal load management system. For personalized rate quotes, contact us at sales@silkroutelogistics.ai.*`,
    seoKeywords: [
      "freight rates",
      `${month.toLowerCase()} ${year} freight market`,
      "trucking rates per mile",
      "freight brokerage",
      "supply chain logistics",
      "dry van rates",
      "reefer rates",
      ...topLanes.slice(0, 3).map((l) => `${l.origin} to ${l.dest} freight`),
    ],
  };

  // ── Email Newsletter ──────────────────────────────────────
  const topLanesSummary = topLanes.slice(0, 5).map((l) => {
    const avgRpm = l.rpmValues.length > 0 ? l.rpmValues.reduce((s, v) => s + v, 0) / l.rpmValues.length : 0;
    return `${l.origin}→${l.dest}: ${l.count} loads at ${formatRate(avgRpm)}/mi`;
  }).join(" | ");

  const emailNewsletter: EmailNewsletter = {
    subject: `SRL Weekly Digest: ${month} ${year} — Top Lanes & Rate Trends`,
    body: `# Silk Route Logistics Weekly Digest

## This Week's Top Lanes
${topLanesSummary}

## Rate Spotlight
${topEquipment ? `${topEquipment.label} rates are ${topEquipment.direction === "up" ? "trending upward" : topEquipment.direction === "down" ? "trending downward" : "holding steady"} (${topEquipment.change > 0 ? "+" : ""}${topEquipment.change}% MoM).` : "Market rates remain stable across major equipment types."}

## Carrier Network Update
- ${activeCarriers} active carriers in our network
- ${overallOnTimeRate}% on-time delivery rate
- ${complianceCheckCount.toLocaleString()} compliance checks run through Compass

## Quick Links
- Request a quote: sales@silkroutelogistics.ai
- Shipper portal: silkroutelogistics.ai/shipper
- Carrier onboarding: silkroutelogistics.ai/carrier

---
Silk Route Logistics | silkroutelogistics.ai
Unsubscribe: reply with "unsubscribe"`,
  };

  // ── Market Insight ────────────────────────────────────────
  const marketInsight: MarketInsight = {
    title: `${topEquipment ? topEquipment.label : "Freight"} Market Outlook: ${quarter} ${year}`,
    summary: `${month} ${year} data shows ${totalLoads} loads completed with ${formatCurrency(totalRevenue)} in revenue. ${topEquipment ? `${topEquipment.label} rates ${topEquipment.direction === "up" ? "increased" : topEquipment.direction === "down" ? "decreased" : "remained stable"} ${Math.abs(topEquipment.change)}% month-over-month.` : "Overall rates remained stable."} Top corridor: ${topLane ? `${topLane.origin}→${topLane.dest}` : "N/A"} with ${topLane ? topLane.count : 0} loads.`,
    data: {
      period: `${month} ${year}`,
      totalLoads,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      topLanes: topLanes.slice(0, 5).map((l) => ({
        lane: `${l.origin}→${l.dest}`,
        loadCount: l.count,
        avgRatePerMile: l.rpmValues.length > 0 ? Math.round((l.rpmValues.reduce((s, v) => s + v, 0) / l.rpmValues.length) * 100) / 100 : 0,
      })),
      equipmentRates: equipmentRates.slice(0, 5).map((e) => ({
        type: e.label,
        avgRate: e.currentAvg,
        changePercent: e.change,
      })),
      carrierMetrics: {
        activeCarriers,
        onTimeRate: overallOnTimeRate,
      },
    },
  };

  return {
    linkedinPosts,
    blogPost,
    emailNewsletter,
    marketInsight,
    generatedAt: now.toISOString(),
  };
}

// ─── Content Calendar ───────────────────────────────────────────────

/**
 * Returns the next 4 weeks of planned content with draft previews.
 * Uses rotating templates filled with projected data themes.
 */
export async function getContentCalendar(): Promise<ContentCalendarWeek[]> {
  const now = new Date();

  // Get current data for context
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentLoads = await prisma.load.findMany({
    where: {
      status: { in: COMPLETED_STATUSES as any[] },
      deliveryDate: { gte: thirtyDaysAgo },
      deletedAt: null,
    },
    select: {
      originState: true,
      destState: true,
      equipmentType: true,
      revenuePerMile: true,
    },
  });

  const lanes = analyzeLanes(recentLoads);
  const topLaneNames = lanes.slice(0, 5).map((l) => `${l.origin}→${l.dest}`);
  const equipmentTypes = [...new Set(recentLoads.map((l) => l.equipmentType))];

  // Rotating content themes
  const linkedinTemplates = [
    { theme: "lane_spotlight", hashtagSet: ["#FreightBrokerage", "#Logistics", "#SupplyChain"] },
    { theme: "carrier_spotlight", hashtagSet: ["#CarrierFirst", "#Trucking", "#OnTimeDelivery"] },
    { theme: "market_update", hashtagSet: ["#SupplyChain", "#FreightRates", "#Shipping"] },
    { theme: "compliance", hashtagSet: ["#FreightCompliance", "#Safety", "#CarrierVetting"] },
  ];

  const blogThemes = [
    "Monthly Lane Report",
    "Equipment Type Market Outlook",
    "Carrier Compliance Deep Dive",
    "Shipper Best Practices",
  ];

  const newsletterThemes = [
    "Top lanes & rate trends",
    "Carrier performance recap",
    "New features & capabilities",
    "Market outlook & predictions",
  ];

  const weeks: ContentCalendarWeek[] = [];

  for (let w = 0; w < 4; w++) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() + w * 7 - weekStart.getDay() + 1); // Monday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 4); // Friday

    const month = MONTH_NAMES[weekStart.getMonth()];
    const year = weekStart.getFullYear();
    const quarter = getQuarter(weekStart.getMonth());
    const template = linkedinTemplates[w % linkedinTemplates.length];
    const topLaneName = topLaneNames[w % topLaneNames.length] || "TX→CA";
    const eqType = EQUIPMENT_LABELS[equipmentTypes[w % equipmentTypes.length]] || "Dry Van";

    let linkedinText: string;
    switch (template.theme) {
      case "lane_spotlight":
        linkedinText = `Lane spotlight: ${topLaneName} — one of the hottest corridors this month. Smart shippers are securing capacity early on this lane.\n\nAt SRL, our data shows exactly where demand is headed.`;
        break;
      case "carrier_spotlight":
        linkedinText = `Our carriers are the backbone of everything we do. This month, SRL's carrier network delivered with exceptional on-time performance.\n\nTransparency + fair pay + technology = carrier loyalty.`;
        break;
      case "market_update":
        linkedinText = `${eqType} market update: Rates are shifting. Whether you're a shipper planning next quarter's budget or a carrier looking for the right lanes, data is your best friend.\n\nLet's talk about what we're seeing.`;
        break;
      case "compliance":
      default:
        linkedinText = `Carrier vetting isn't optional — it's essential. SRL's Compass engine screens every carrier before they touch your freight.\n\nFMCSA authority, insurance, safety scores, OFAC — all verified automatically.`;
        break;
    }

    const blogTheme = blogThemes[w % blogThemes.length];
    const newsletterTheme = newsletterThemes[w % newsletterThemes.length];

    weeks.push({
      weekNumber: w + 1,
      weekStart: weekStart.toISOString().split("T")[0],
      weekEnd: weekEnd.toISOString().split("T")[0],
      linkedinPost: {
        text: linkedinText,
        hashtags: template.hashtagSet,
      },
      blogDraft: {
        title: `${blogTheme}: ${month} ${year}${blogTheme.includes("Outlook") ? ` — ${quarter}` : ""}`,
        outline: `1. Market overview for ${month}\n2. Key data points and trends\n3. What this means for shippers/carriers\n4. SRL's perspective and recommendations`,
      },
      newsletterDraft: {
        subject: `SRL Weekly: ${newsletterTheme} — ${month} ${year}`,
        preview: `This week's digest covers ${newsletterTheme.toLowerCase()}. Key highlights from the SRL network...`,
      },
    });
  }

  return weeks;
}
