import { Request, Response } from "express";
import { prisma } from "../config/database";

/**
 * v3.8.aob (Sprint E1) — public SRL Driver Academy certificate verifier.
 *
 * A shipper / auditor / insurer scans the QR on a completion certificate (or
 * types the code at silkroutelogistics.ai/verify-cert) to confirm the cert is
 * genuine. No auth — the code IS the lookup key (lazily minted, unique-indexed
 * on DriverCourseProgress for O(1) lookup, unlike the RC verifier's scan).
 *
 * PII is intentionally minimized on this PUBLIC surface: driver shown as first
 * name + last initial only. Expired certs are returned (with `expired: true`)
 * rather than 404'd, so an auditor sees "completed but lapsed" instead of a
 * confusing not-found.
 */
export async function verifyCert(req: Request, res: Response) {
  const code = String(req.params.code || "");
  if (!/^[a-f0-9]{16}$/.test(code)) {
    res.status(400).json({ valid: false, error: "Malformed verification code" });
    return;
  }

  const progress = await prisma.driverCourseProgress.findUnique({
    where: { verifyCode: code },
    select: {
      status: true, completedAt: true, expiresAt: true, bestScorePct: true,
      driver: { select: { firstName: true, lastName: true, carrierProfile: { select: { companyName: true } } } },
      course: { select: { title: true, category: true, status: true } },
    },
  });

  // Only a genuinely PASSED completion on a still-PUBLISHED course verifies.
  if (!progress || progress.status !== "PASSED" || !progress.completedAt || progress.course.status !== "PUBLISHED") {
    res.status(404).json({ valid: false, error: "Certificate not found." });
    return;
  }

  const lastInitial = progress.driver.lastName ? `${progress.driver.lastName.trim().charAt(0)}.` : "";
  const driverName = `${progress.driver.firstName} ${lastInitial}`.trim();
  const expired = !!progress.expiresAt && progress.expiresAt.getTime() < Date.now();

  res.json({
    valid: true,
    expired,
    driverName,
    course: progress.course.title,
    category: progress.course.category,
    scorePct: progress.bestScorePct ?? null,
    completedAt: progress.completedAt,
    expiresAt: progress.expiresAt,
    carrierName: progress.driver.carrierProfile?.companyName ?? null,
  });
}
