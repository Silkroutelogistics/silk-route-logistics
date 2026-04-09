/**
 * Morning Briefing Generator — Sonnet-powered daily operations summary.
 *
 * Queries the database for key operational metrics and generates a
 * natural-language briefing for the Account Executive.
 *
 * Gate: Phase 1 (150+ loads/month). Below threshold, sends raw data summary.
 */

import { callClaude, logAutomationEvent } from "../../ai/client";
import { prisma } from "../../config/database";
import fs from "fs";
import path from "path";
import { log } from "../../lib/logger";

// ─── System Prompt ──────────────────────────────────────────────────────────

const PROMPT_PATH = path.join(__dirname, "../../ai/prompts/morning-briefing.md");
let systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!systemPrompt) {
    systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");
  }
  return systemPrompt;
}

// ─── Data Collection ────────────────────────────────────────────────────────

interface BriefingData {
  date: string;
  activeLoads: { inTransit: number; awaitingPickup: number; deliveredYesterday: number };
  atRiskLoads: Array<{ loadNumber: string | null; status: string; issue: string }>;
  complianceAlerts: number;
  financials: { pendingInvoices: number; pendingInvoiceTotal: number; overdueCount: number };
  upcomingPickups: number;
}

async function collectBriefingData(): Promise<BriefingData> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const [
    inTransitCount,
    awaitingPickupCount,
    deliveredYesterdayCount,
    overdueInvoices,
    pendingInvoices,
    complianceAlerts,
    upcomingPickups,
  ] = await Promise.all([
    prisma.load.count({
      where: { status: { in: ["IN_TRANSIT", "AT_DELIVERY", "LOADED"] } },
    }),
    prisma.load.count({
      where: { status: { in: ["BOOKED", "DISPATCHED", "CONFIRMED"] } },
    }),
    prisma.load.count({
      where: {
        status: "DELIVERED",
        updatedAt: { gte: yesterday, lt: today },
      },
    }),
    prisma.invoice.count({
      where: { status: "OVERDUE" },
    }),
    prisma.invoice.aggregate({
      where: { status: { in: ["SENT", "SUBMITTED", "APPROVED"] } },
      _count: true,
      _sum: { totalAmount: true },
    }),
    prisma.complianceAlert.count({
      where: { status: "ACTIVE", createdAt: { gte: yesterday } },
    }),
    prisma.load.count({
      where: {
        status: { in: ["BOOKED", "DISPATCHED", "CONFIRMED"] },
        pickupDate: { gte: today, lt: tomorrow },
      },
    }),
  ]);

  // Find at-risk loads (in transit with recent delays)
  const riskyLoads = await prisma.load.findMany({
    where: {
      status: { in: ["IN_TRANSIT", "AT_DELIVERY", "LOADED", "DISPATCHED"] },
    },
    select: { loadNumber: true, status: true, referenceNumber: true },
    take: 5,
    orderBy: { updatedAt: "asc" }, // Oldest updates first = most likely stale
  });

  return {
    date: today.toISOString().slice(0, 10),
    activeLoads: {
      inTransit: inTransitCount,
      awaitingPickup: awaitingPickupCount,
      deliveredYesterday: deliveredYesterdayCount,
    },
    atRiskLoads: riskyLoads.map((l) => ({
      loadNumber: l.loadNumber ?? l.referenceNumber,
      status: l.status,
      issue: "No recent update",
    })),
    complianceAlerts,
    financials: {
      pendingInvoices: pendingInvoices._count,
      pendingInvoiceTotal: Math.round((pendingInvoices._sum.totalAmount ?? 0) * 100) / 100,
      overdueCount: overdueInvoices,
    },
    upcomingPickups,
  };
}

// ─── Plain-Text Fallback ────────────────────────────────────────────────────

function generatePlainBriefing(data: BriefingData): string {
  return [
    `SRL Operations Briefing — ${data.date}`,
    "",
    `Active Loads: ${data.activeLoads.inTransit} in transit, ${data.activeLoads.awaitingPickup} awaiting pickup`,
    `Delivered Yesterday: ${data.activeLoads.deliveredYesterday}`,
    `Upcoming Pickups Today: ${data.upcomingPickups}`,
    `Compliance Alerts (new): ${data.complianceAlerts}`,
    `Pending Invoices: ${data.financials.pendingInvoices} ($${data.financials.pendingInvoiceTotal.toLocaleString()})`,
    `Overdue Invoices: ${data.financials.overdueCount}`,
    "",
    data.atRiskLoads.length > 0
      ? `At-Risk Loads:\n${data.atRiskLoads.map((l) => `  - ${l.loadNumber}: ${l.status} — ${l.issue}`).join("\n")}`
      : "No at-risk loads flagged.",
  ].join("\n");
}

// ─── Main Briefing Generator ────────────────────────────────────────────────

export interface BriefingResult {
  briefing: string;
  data: BriefingData;
  fallbackUsed: boolean;
  aiCostUsd: number;
}

export async function generateMorningBriefing(): Promise<BriefingResult> {
  const data = await collectBriefingData();
  const dataText = JSON.stringify(data, null, 2);

  try {
    const result = await callClaude({
      model: "sonnet",
      system: getSystemPrompt(),
      userMessage: `Here is today's operational data:\n\n${dataText}`,
      functionName: "morning_briefing",
      skipRedaction: true, // Internal data, no PII
      skipSanitize: true,
      maxTokens: 800,
    });

    await logAutomationEvent({
      type: "morning_briefing",
      source: "cron",
      entityType: "system",
      entityId: data.date,
      data: {
        loadCount: data.activeLoads.inTransit + data.activeLoads.awaitingPickup,
        alertCount: data.complianceAlerts,
        fallbackUsed: false,
      },
      actionTaken: "briefing_generated",
    });

    return {
      briefing: result.content,
      data,
      fallbackUsed: false,
      aiCostUsd: result.costUsd,
    };
  } catch (err) {
    log.error({ err }, "[MorningBriefing] AI call failed, using plain text:");

    await logAutomationEvent({
      type: "morning_briefing",
      source: "cron",
      entityType: "system",
      entityId: data.date,
      data: {
        fallbackUsed: true,
        error: err instanceof Error ? err.message : "Unknown",
      },
      actionTaken: "fallback_plain_text",
    });

    return {
      briefing: generatePlainBriefing(data),
      data,
      fallbackUsed: true,
      aiCostUsd: 0,
    };
  }
}
