/**
 * FMCSA Bulk Monitor — Daily automated compliance monitoring for all carriers.
 * Snapshots FMCSA data, diffs against previous, triggers alerts / auto-suspension.
 */
import { prisma } from "../config/database";
import { verifyCarrierWithFMCSA } from "./fmcsaService";
import { log } from "../lib/logger";

// ─── Types ────────────────────────────────────────────────────────
type Severity = "CRITICAL" | "WARNING" | "INFO";

interface CarrierSnapshot {
  carrierId: string; dotNumber: string; companyName: string;
  operatingStatus: string | null; safetyRating: string | null;
  insuranceOnFile: boolean; outOfServiceDate: string | null;
  totalDrivers: number | null; totalPowerUnits: number | null;
  verified: boolean; snapshotDate: string;
}

interface SnapshotChange {
  carrierId: string; dotNumber: string; companyName: string;
  field: string; previousValue: string | null; currentValue: string | null;
  severity: Severity;
}

interface MonitorResult {
  date: string; carriersChecked: number; carriersWithChanges: number;
  criticalChanges: number; warningChanges: number; infoChanges: number;
  autoSuspended: string[]; errors: string[];
}

const TRACKED_FIELDS: { key: keyof CarrierSnapshot; severity: Severity }[] = [
  { key: "operatingStatus", severity: "CRITICAL" }, { key: "verified", severity: "CRITICAL" },
  { key: "insuranceOnFile", severity: "CRITICAL" }, { key: "outOfServiceDate", severity: "CRITICAL" },
  { key: "safetyRating", severity: "WARNING" },
  { key: "totalDrivers", severity: "INFO" }, { key: "totalPowerUnits", severity: "INFO" },
];

// ─── Snapshot All Carriers ────────────────────────────────────────
export async function snapshotAllCarriers(): Promise<CarrierSnapshot[]> {
  const carriers = await prisma.carrierProfile.findMany({
    where: { onboardingStatus: "APPROVED" },
    select: { id: true, dotNumber: true, companyName: true },
  });

  log.info(`[FMCSA Bulk] Snapshotting ${carriers.length} approved carriers`);
  const snapshots: CarrierSnapshot[] = [];
  const batchSize = 5; // parallel batch size to avoid overwhelming FMCSA

  for (let i = 0; i < carriers.length; i += batchSize) {
    const batch = carriers.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (carrier) => {
        if (!carrier.dotNumber) return null;
        const fmcsa = await verifyCarrierWithFMCSA(carrier.dotNumber);
        return {
          carrierId: carrier.id,
          dotNumber: carrier.dotNumber,
          companyName: carrier.companyName,
          operatingStatus: fmcsa.operatingStatus,
          safetyRating: fmcsa.safetyRating,
          insuranceOnFile: fmcsa.insuranceOnFile,
          outOfServiceDate: fmcsa.outOfServiceDate,
          totalDrivers: fmcsa.totalDrivers,
          totalPowerUnits: fmcsa.totalPowerUnits,
          verified: fmcsa.verified,
          snapshotDate: new Date().toISOString(),
        } as CarrierSnapshot;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) snapshots.push(r.value);
    }

    // Brief delay between batches to respect rate limits
    if (i + batchSize < carriers.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  log.info(`[FMCSA Bulk] Snapshot complete: ${snapshots.length}/${carriers.length} carriers`);
  return snapshots;
}

// ─── Diff Snapshots ───────────────────────────────────────────────
export function diffSnapshots(
  previous: CarrierSnapshot[],
  current: CarrierSnapshot[]
): SnapshotChange[] {
  const prevMap = new Map(previous.map((s) => [s.carrierId, s]));
  const changes: SnapshotChange[] = [];

  for (const curr of current) {
    const prev = prevMap.get(curr.carrierId);
    if (!prev) continue; // New carrier in snapshot, no previous to compare

    for (const { key, severity } of TRACKED_FIELDS) {
      const prevVal = String(prev[key] ?? "");
      const currVal = String(curr[key] ?? "");
      if (prevVal !== currVal) {
        changes.push({
          carrierId: curr.carrierId,
          dotNumber: curr.dotNumber,
          companyName: curr.companyName,
          field: key,
          previousValue: prevVal || null,
          currentValue: currVal || null,
          severity,
        });
      }
    }
  }

  return changes;
}

// ─── Process Changes ──────────────────────────────────────────────
export async function processChanges(changes: SnapshotChange[]): Promise<string[]> {
  const autoSuspended: string[] = [];

  for (const change of changes) {
    // Create ComplianceAlert for every change
    try {
      await prisma.complianceAlert.create({
        data: {
          type: change.severity === "CRITICAL" ? "FMCSA_STATUS_CHANGE" : "FMCSA_CHANGE",
          entityType: "CARRIER",
          entityId: change.carrierId,
          entityName: change.companyName || change.dotNumber,
          severity: change.severity,
          status: "ACTIVE",
          expiryDate: new Date(Date.now() + 30 * 86_400_000),
        },
      });
    } catch (err) {
      log.error({ err: err }, `[FMCSA Bulk] Failed to create alert for ${change.carrierId}:`);
    }

    // Auto-suspend if authority revoked or insurance dropped
    if (change.severity === "CRITICAL") {
      const shouldSuspend =
        (change.field === "operatingStatus" && change.currentValue !== "AUTHORIZED") ||
        (change.field === "verified" && change.currentValue === "false") ||
        (change.field === "insuranceOnFile" && change.currentValue === "false") ||
        (change.field === "outOfServiceDate" && change.currentValue && change.currentValue !== "null");

      if (shouldSuspend) {
        try {
          await prisma.carrierProfile.update({
            where: { id: change.carrierId },
            data: { onboardingStatus: "SUSPENDED", suspensionReason: `FMCSA change: ${change.field} → ${change.currentValue}`, suspendedAt: new Date() },
          });
          autoSuspended.push(change.carrierId);
          log.warn(
            `[FMCSA Bulk] AUTO-SUSPENDED carrier ${change.companyName} (${change.dotNumber}): ${change.field} changed to ${change.currentValue}`
          );
        } catch (err) {
          log.error({ err: err }, `[FMCSA Bulk] Failed to suspend ${change.carrierId}:`);
        }
      }
    }
  }

  return autoSuspended;
}

// ─── Snapshot Storage (in-memory + SystemLog for persistence) ───────────
let previousSnapshot: CarrierSnapshot[] = [];

async function loadPreviousSnapshot(): Promise<CarrierSnapshot[]> {
  if (previousSnapshot.length > 0) return previousSnapshot;
  try {
    const log = await prisma.systemLog.findFirst({
      where: { logType: "CRON_JOB", source: "fmcsa-bulk-monitor" },
      orderBy: { createdAt: "desc" },
    });
    if (log?.details) {
      const parsed = log.details as any;
      previousSnapshot = Array.isArray(parsed?.snapshots) ? parsed.snapshots : [];
      return previousSnapshot;
    }
  } catch {
    log.warn("[FMCSA Bulk] No previous snapshot found, treating as first run");
  }
  return [];
}

async function saveSnapshot(snapshots: CarrierSnapshot[]): Promise<void> {
  previousSnapshot = snapshots;
  try {
    await prisma.systemLog.create({
      data: {
        logType: "CRON_JOB",
        severity: "INFO",
        source: "fmcsa-bulk-monitor",
        message: `FMCSA bulk snapshot: ${snapshots.length} carriers`,
        details: { snapshots } as any,
      },
    });
  } catch (err) {
    log.error({ err: err }, "[FMCSA Bulk] Failed to persist snapshot:");
  }
}

// ─── Main Entry: Daily Monitor ────────────────────────────────────
export async function runDailyMonitor(): Promise<MonitorResult> {
  const date = new Date().toISOString().split("T")[0];
  log.info(`[FMCSA Bulk] Starting daily monitor for ${date}`);
  const errors: string[] = [];

  // 1. Load previous snapshot
  const previous = await loadPreviousSnapshot();

  // 2. Take new snapshot
  let current: CarrierSnapshot[] = [];
  try {
    current = await snapshotAllCarriers();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Snapshot failed: ${msg}`);
    log.error({ err: msg }, "[FMCSA Bulk] Snapshot failed:");
  }

  const changes = previous.length > 0 ? diffSnapshots(previous, current) : [];
  const critical = changes.filter((c) => c.severity === "CRITICAL").length;
  const warn = changes.filter((c) => c.severity === "WARNING").length;
  const info = changes.filter((c) => c.severity === "INFO").length;

  let autoSuspended: string[] = [];
  if (changes.length > 0) {
    try { autoSuspended = await processChanges(changes); }
    catch (err) { errors.push(`Processing failed: ${err instanceof Error ? err.message : String(err)}`); }
  }

  if (current.length > 0) {
    try { await saveSnapshot(current); }
    catch (err) { errors.push(`Snapshot save failed: ${err instanceof Error ? err.message : String(err)}`); }
  }

  const result: MonitorResult = {
    date, carriersChecked: current.length,
    carriersWithChanges: new Set(changes.map((c) => c.carrierId)).size,
    criticalChanges: critical, warningChanges: warn, infoChanges: info,
    autoSuspended, errors,
  };
  log.info(`[FMCSA Bulk] Complete: ${current.length} carriers, ${changes.length} changes (${critical} critical), ${autoSuspended.length} suspended`);
  return result;
}
