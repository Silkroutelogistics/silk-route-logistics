/**
 * Load Compliance Service
 * Post-booking load-level compliance monitoring.
 *
 * After a load is assigned to a carrier, this service continuously checks
 * that the carrier remains compliant throughout transit.
 *
 * - checkLoadCompliance: single-load compliance check
 * - checkAllActiveLoadCompliance: batch check all active loads
 * - onLoadAssigned: gate-check when a carrier is assigned to a load
 */

import { prisma } from "../config/database";
import { createNotification } from "./notificationService";


// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface LoadComplianceResult {
  loadId: string;
  carrierId: string | null;
  compliant: boolean;
  issues: string[];
  severity: "CLEAR" | "WARNING" | "CRITICAL";
  checkedAt: string;
}

interface BatchComplianceStats {
  total: number;
  compliant: number;
  warnings: number;
  critical: number;
}

// Active load statuses that require ongoing compliance monitoring
const ACTIVE_LOAD_STATUSES: any[] = ["IN_TRANSIT", "DISPATCHED", "AT_PICKUP", "LOADED"];

// Insurance grace period: 14 days after expiry is a WARNING, beyond that is CRITICAL
const INSURANCE_GRACE_WARNING_DAYS = 14;

// ────────────────────────────────────────────────────────────
// checkLoadCompliance
// ────────────────────────────────────────────────────────────

/**
 * Checks the assigned carrier's compliance status for a specific load.
 *
 * Checks performed:
 *  1. Carrier authority still active (fmcsaAuthorityStatus)
 *  2. Insurance not expired (insuranceExpiry, respecting grace periods)
 *  3. Carrier not suspended (onboardingStatus !== SUSPENDED)
 *  4. No active OOS (from FMCSA auto-suspend status)
 *  5. OFAC status is CLEAR
 */
export async function checkLoadCompliance(
  loadId: string,
  /**
   * Check THIS carrier instead of the one on the load. A **User.id**, matching
   * `Load.carrierId` — not a CarrierProfile.id.
   *
   * v3.8.axn — this argument is what lets the pre-assignment gate ask "would
   * this carrier be compliant on this load" without writing them onto it first.
   * See onLoadAssigned.
   */
  candidateCarrierId?: string,
): Promise<LoadComplianceResult> {
  const now = new Date();

  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: { id: true, carrierId: true, referenceNumber: true, status: true },
  });

  if (!load) {
    return {
      loadId,
      carrierId: null,
      compliant: false,
      issues: ["Load not found"],
      severity: "CRITICAL",
      checkedAt: now.toISOString(),
    };
  }

  // The candidate wins when supplied: the caller is asking about a carrier that
  // is not on the load yet, which is the whole point of the argument.
  const subjectCarrierId = candidateCarrierId ?? load.carrierId;

  if (!subjectCarrierId) {
    return {
      loadId,
      carrierId: null,
      compliant: true,
      issues: [],
      severity: "CLEAR",
      checkedAt: now.toISOString(),
    };
  }

  const carrier = await prisma.carrierProfile.findUnique({
    where: { userId: subjectCarrierId },
    select: {
      id: true,
      userId: true,
      companyName: true,
      fmcsaAuthorityStatus: true,
      insuranceExpiry: true,
      insuranceGracePeriodEnd: true,
      onboardingStatus: true,
      autoSuspendedAt: true,
      autoSuspendReason: true,
      ofacStatus: true,
    },
  });

  if (!carrier) {
    return {
      loadId,
      carrierId: load.carrierId,
      compliant: false,
      issues: ["Carrier profile not found for assigned carrier"],
      severity: "CRITICAL",
      checkedAt: now.toISOString(),
    };
  }

  const issues: string[] = [];
  let severity: "CLEAR" | "WARNING" | "CRITICAL" = "CLEAR";

  // Helper to escalate severity
  const escalate = (level: "WARNING" | "CRITICAL") => {
    if (level === "CRITICAL" || (level === "WARNING" && severity === "CLEAR")) {
      severity = level;
    }
  };

  // ── 1. FMCSA Authority Status ────────────────────────────
  if (carrier.fmcsaAuthorityStatus) {
    const authStatus = carrier.fmcsaAuthorityStatus.toUpperCase();
    if (authStatus === "REVOKED" || authStatus === "NOT AUTHORIZED") {
      issues.push(`Carrier FMCSA authority is ${carrier.fmcsaAuthorityStatus}`);
      escalate("CRITICAL");
    } else if (authStatus === "INACTIVE" || authStatus === "PENDING") {
      issues.push(`Carrier FMCSA authority is ${carrier.fmcsaAuthorityStatus}`);
      escalate("WARNING");
    }
  }

  // ── 2. Insurance Expiry ──────────────────────────────────
  if (carrier.insuranceExpiry) {
    if (carrier.insuranceExpiry <= now) {
      // Insurance is expired — check grace period
      if (carrier.insuranceGracePeriodEnd && carrier.insuranceGracePeriodEnd > now) {
        const graceDaysLeft = Math.ceil(
          (carrier.insuranceGracePeriodEnd.getTime() - now.getTime()) / 86_400_000
        );
        issues.push(`Insurance expired but grace period active (${graceDaysLeft} days remaining)`);
        escalate("WARNING");
      } else {
        // Beyond grace period or no grace period granted
        const daysPastExpiry = Math.floor(
          (now.getTime() - carrier.insuranceExpiry.getTime()) / 86_400_000
        );
        if (daysPastExpiry > INSURANCE_GRACE_WARNING_DAYS) {
          issues.push(`Insurance expired ${daysPastExpiry} days ago — no grace period`);
          escalate("CRITICAL");
        } else {
          issues.push(`Insurance expired ${daysPastExpiry} days ago`);
          escalate("WARNING");
        }
      }
    }
  } else {
    // No insurance expiry date on file
    issues.push("No insurance expiry date on file");
    escalate("WARNING");
  }

  // ── 3. Carrier Suspended ─────────────────────────────────
  if (carrier.onboardingStatus === "SUSPENDED") {
    issues.push("Carrier is suspended");
    escalate("CRITICAL");
  }

  // ── 4. FMCSA Out-of-Service (auto-suspend) ──────────────
  if (carrier.autoSuspendedAt) {
    const reason = carrier.autoSuspendReason ?? "FMCSA Out-of-Service";
    issues.push(`Carrier auto-suspended: ${reason}`);
    escalate("CRITICAL");
  }
  if (carrier.fmcsaAuthorityStatus) {
    const authStatus = carrier.fmcsaAuthorityStatus.toUpperCase();
    if (authStatus === "OUT_OF_SERVICE" || authStatus === "OOS") {
      // Only add if not already flagged by auto-suspend
      if (!carrier.autoSuspendedAt) {
        issues.push("Carrier is FMCSA Out-of-Service");
        escalate("CRITICAL");
      }
    }
  }

  // ── 5. OFAC Status ───────────────────────────────────────
  if (carrier.ofacStatus) {
    if (carrier.ofacStatus === "CONFIRMED_MATCH") {
      issues.push("Carrier has a CONFIRMED OFAC match — cannot operate");
      escalate("CRITICAL");
    } else if (carrier.ofacStatus === "POTENTIAL_MATCH") {
      issues.push("Carrier has a potential OFAC match — review required");
      escalate("WARNING");
    }
  }

  return {
    loadId,
    carrierId: load.carrierId,
    compliant: severity === "CLEAR",
    issues,
    severity,
    checkedAt: now.toISOString(),
  };
}

// ────────────────────────────────────────────────────────────
// checkAllActiveLoadCompliance
// ────────────────────────────────────────────────────────────

/**
 * Batch check all loads with an active transit status.
 * For non-compliant loads: opens ONE ComplianceAlert per load and notifies the
 * load poster and DISPATCH users when it opens or its severity changes.
 *
 * §13.3 Item 320 — this ran every two hours with no fence and no dedupe, so a
 * load soft-deleted in July (carrier also deleted and a test account) produced
 * 320 identical alerts and notifications, and a real load's genuine warning
 * repeated until it read as noise. Now: deleted and test loads and carriers are
 * out of scope, and the dedupe key is load + LOAD_COMPLIANCE + any status that
 * is not RESOLVED — a human's DISMISS or SNOOZE suppresses repeats too, or the
 * next run would overrule it. A load that comes back CLEAR resolves its open
 * alert, so a later recurrence alerts again.
 */
export async function checkAllActiveLoadCompliance(): Promise<BatchComplianceStats> {
  const activeLoads = await prisma.load.findMany({
    where: {
      status: { in: ACTIVE_LOAD_STATUSES as any },
      carrierId: { not: null },
      deletedAt: null,
      isTestAccount: false,
      carrier: { carrierProfile: { deletedAt: null, isTestAccount: false } },
    },
    select: { id: true, referenceNumber: true, posterId: true, carrierId: true },
  });

  const stats: BatchComplianceStats = {
    total: activeLoads.length,
    compliant: 0,
    warnings: 0,
    critical: 0,
  };

  for (const load of activeLoads) {
    const result = await checkLoadCompliance(load.id);
    const alertKey = { type: "LOAD_COMPLIANCE", entityType: "LOAD", entityId: load.id, status: { not: "RESOLVED" } };

    if (result.severity === "CLEAR") {
      stats.compliant++;
      await prisma.complianceAlert.updateMany({
        where: alertKey,
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
      continue;
    }

    if (result.severity === "WARNING") {
      stats.warnings++;
    } else if (result.severity === "CRITICAL") {
      stats.critical++;
    }

    const open = await prisma.complianceAlert.findFirst({ where: alertKey, orderBy: { createdAt: "desc" } });
    if (open && open.severity === result.severity) continue; // already alerted at this level

    if (open) {
      await prisma.complianceAlert.update({
        where: { id: open.id },
        data: { severity: result.severity, notifiedAt: new Date() },
      });
    } else {
      await prisma.complianceAlert.create({
        data: {
          type: "LOAD_COMPLIANCE",
          entityType: "LOAD",
          entityId: load.id,
          entityName: load.referenceNumber ?? load.id,
          expiryDate: new Date(), // alert is immediate
          status: "ACTIVE",
          severity: result.severity,
          notifiedAt: new Date(),
        },
      });
    }

    // Build notification message
    const issuesSummary = result.issues.join("; ");
    const title = `Load ${load.referenceNumber ?? load.id} — Compliance ${result.severity}`;
    const message = `Compliance issues detected: ${issuesSummary}`;
    const actionUrl = `/dashboard/loads`;

    // Notify load poster
    if (load.posterId) {
      await createNotification(load.posterId, "GENERAL" as any, title, message, { actionUrl });
    }

    // Notify all DISPATCH users
    const dispatchUsers = await prisma.user.findMany({
      where: { role: "DISPATCH", isActive: true },
      select: { id: true },
    });

    for (const dispatcher of dispatchUsers) {
      // Skip if dispatcher is the poster (already notified)
      if (dispatcher.id === load.posterId) continue;
      await createNotification(dispatcher.id, "GENERAL" as any, title, message, { actionUrl });
    }
  }

  return stats;
}

// onLoadAssigned was REMOVED in carrier-archive recut B2d (2026-09-21). Its only
// caller was updateLoad's carrierId branch, itself removed; it was invoked
// fire-and-forget with a .catch(log.error), so its throw prevented nothing (the
// v3.8.axn docstring said as much). The gate is now inside assignCarrier
// (lib/carrierEligibility); the read-only scan it wrapped is checkLoadCompliance,
// which carrierVettingController still calls.
