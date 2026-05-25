import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import {
  registerCarrier, uploadCarrierDocuments, getOnboardingStatus, verifyCarrier,
  getDashboard, getScorecard, getRevenue, getBonuses,
  getAllCarriers, getCarrierDetail, updateCarrier, setupAdminCarrierProfile, setAuthorityGrantDate,
} from "../controllers/carrierController";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { prisma } from "../config/database";
import { upload } from "../config/upload";
import { auditLog } from "../middleware/audit";
import { validateBody } from "../middleware/validate";
import { carrierRegisterSchema, verifyCarrierSchema } from "../validators/carrier";
import { verifyCarrierWithFMCSA, lookupByMcNumber, getCarrierAuthority, calendarMonthsBetween } from "../services/fmcsaService";
import { z } from "zod";
import { log } from "../lib/logger";

const router = Router();

// Rate limiter for public FMCSA lookup endpoints: 30 requests per 15 min per IP
const fmcsaLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many FMCSA lookup requests, please try again later" },
});

// v3.8.aku §13.3 Item 182 sprint 5 — authority age verdict shape returned
// alongside FMCSA lookup data. Frontend /onboarding renders verdict pill
// based on `verdict` enum: AUTO_ALLOW (≥18mo), OVERRIDE_ELIGIBLE (12-18mo),
// WAITING_LIST (<12mo OR null grant date). Computed from
// `getCarrierAuthority()` + `calendarMonthsBetween()` — same primitives the
// post-approval gate uses in complianceMonitorService.complianceCheck.
type AuthorityVerdict = "AUTO_ALLOW" | "OVERRIDE_ELIGIBLE" | "WAITING_LIST";

function buildAuthorityVerdict(grantDate: Date | null): {
  verdict: AuthorityVerdict;
  authorityAgeMonths: number | null;
  eligibilityDate: Date | null;
} {
  if (!grantDate) {
    return { verdict: "WAITING_LIST", authorityAgeMonths: null, eligibilityDate: null };
  }
  const months = calendarMonthsBetween(grantDate, new Date());
  // Projected 18-month threshold (grantDate + 18 months) — used for
  // WaitingList row's eligibilityDate so Sprint 6 cron can notify the
  // carrier when they cross the threshold.
  const projected = new Date(grantDate);
  projected.setMonth(projected.getMonth() + 18);
  if (months >= 18) {
    return { verdict: "AUTO_ALLOW", authorityAgeMonths: months, eligibilityDate: projected };
  }
  if (months >= 12) {
    return { verdict: "OVERRIDE_ELIGIBLE", authorityAgeMonths: months, eligibilityDate: projected };
  }
  return { verdict: "WAITING_LIST", authorityAgeMonths: months, eligibilityDate: projected };
}

// Public: FMCSA DOT lookup for onboarding form auto-verification
router.get("/fmcsa-lookup/:dotNumber", fmcsaLookupLimiter, async (req: Request, res: Response) => {
  const dot = String(req.params.dotNumber);
  if (!dot || dot.length < 5 || !/^\d+$/.test(dot)) {
    res.status(400).json({ error: "Invalid DOT number. Must be at least 5 digits." });
    return;
  }
  try {
    const result = await verifyCarrierWithFMCSA(dot);
    // v3.8.aku Item 182 sprint 5 — enrich response with authority-age
    // verdict so the /onboarding page can surface auto-allow / override-
    // eligible / waiting-list pill inline at DOT-blur time. Failure here
    // is non-fatal: lookup still returns the rest of the carrier data
    // with `verdict: WAITING_LIST` + `authorityAgeMonths: null` (treats
    // unresolvable authority as waiting-list per the locked Option β
    // decision in Item 182).
    let authorityGrantDate: string | null = null;
    let verdictBlock = buildAuthorityVerdict(null);
    try {
      const authResult = await getCarrierAuthority(dot);
      if (authResult.authorityGrantDate) {
        authorityGrantDate = authResult.authorityGrantDate;
        verdictBlock = buildAuthorityVerdict(new Date(authResult.authorityGrantDate));
      }
    } catch (authErr) {
      log.warn({ err: authErr, dot }, "[FMCSA Lookup] Authority lookup failed; defaulting to WAITING_LIST verdict");
    }
    res.json({
      verified: result.verified,
      legalName: result.legalName,
      dbaName: result.dbaName,
      mcNumber: result.mcNumber,
      operatingStatus: result.operatingStatus,
      entityType: result.entityType,
      safetyRating: result.safetyRating,
      insuranceOnFile: result.insuranceOnFile,
      totalPowerUnits: result.totalPowerUnits,
      totalDrivers: result.totalDrivers,
      outOfServiceDate: result.outOfServiceDate,
      phyStreet: result.phyStreet,
      phyCity: result.phyCity,
      phyState: result.phyState,
      phyZipcode: result.phyZipcode,
      phone: result.phone,
      // v3.8.aku Item 182 sprint 5 enrichment
      authorityGrantDate,
      authorityAgeMonths: verdictBlock.authorityAgeMonths,
      authorityVerdict: verdictBlock.verdict,
      authorityEligibilityDate: verdictBlock.eligibilityDate?.toISOString() ?? null,
      errors: result.errors,
    });
  } catch (err) {
    log.error({ err: err }, "[FMCSA Lookup] Error:");
    res.status(500).json({ error: "FMCSA lookup failed. Please try again." });
  }
});

// Public: FMCSA MC# reverse lookup (MC → DOT + carrier data)
router.get("/fmcsa-mc-lookup/:mcNumber", fmcsaLookupLimiter, async (req: Request, res: Response) => {
  const mc = String(req.params.mcNumber).replace(/^MC-?/i, "").trim();
  if (!mc || !/^\d+$/.test(mc)) {
    res.status(400).json({ error: "Invalid MC number. Enter digits only (e.g. 156588)." });
    return;
  }
  try {
    const result = await lookupByMcNumber(mc);
    // v3.8.aku Item 182 sprint 5 — enrich with authority verdict. MC lookup
    // returns the DOT number which we then feed to getCarrierAuthority(dot)
    // — authority is keyed by DOT in QCMobile. Same defensive fallback as
    // the DOT endpoint: if authority lookup fails, default verdict to
    // WAITING_LIST (Option β locked decision).
    let authorityGrantDate: string | null = null;
    let verdictBlock = buildAuthorityVerdict(null);
    if (result.dotNumber) {
      try {
        const authResult = await getCarrierAuthority(result.dotNumber);
        if (authResult.authorityGrantDate) {
          authorityGrantDate = authResult.authorityGrantDate;
          verdictBlock = buildAuthorityVerdict(new Date(authResult.authorityGrantDate));
        }
      } catch (authErr) {
        log.warn({ err: authErr, mc, dot: result.dotNumber }, "[FMCSA MC Lookup] Authority lookup failed; defaulting to WAITING_LIST verdict");
      }
    }
    res.json({
      verified: result.verified,
      legalName: result.legalName,
      dbaName: result.dbaName,
      mcNumber: result.mcNumber,
      dotNumber: result.dotNumber,
      operatingStatus: result.operatingStatus,
      entityType: result.entityType,
      safetyRating: result.safetyRating,
      insuranceOnFile: result.insuranceOnFile,
      totalPowerUnits: result.totalPowerUnits,
      totalDrivers: result.totalDrivers,
      outOfServiceDate: result.outOfServiceDate,
      phyStreet: result.phyStreet,
      phyCity: result.phyCity,
      phyState: result.phyState,
      phyZipcode: result.phyZipcode,
      phone: result.phone,
      // v3.8.aku Item 182 sprint 5 enrichment
      authorityGrantDate,
      authorityAgeMonths: verdictBlock.authorityAgeMonths,
      authorityVerdict: verdictBlock.verdict,
      authorityEligibilityDate: verdictBlock.eligibilityDate?.toISOString() ?? null,
      errors: result.errors,
    });
  } catch (err) {
    log.error({ err: err }, "[FMCSA MC Lookup] Error:");
    res.status(500).json({ error: "FMCSA MC lookup failed. Please try again." });
  }
});

// v3.8.aku §13.3 Item 182 sprint 5/5 — waitlist write endpoint for carriers
// with authority age < 12 months. Public (no auth) per the same shape as
// the FMCSA lookup endpoints + carrier registration — these all serve
// pre-registration carriers. Upsert on (email, dotNumber) so the same
// carrier filling the form twice updates rather than duplicates. Sprint 6
// will add a cron job that queries WHERE eligibilityDate <= NOW() AND
// notifiedAt IS NULL and emails the carrier.
const waitlistSchema = z.object({
  email: z.string().email(),
  dotNumber: z.string().min(5).regex(/^\d+$/, "DOT number must be digits only"),
  mcNumber: z.string().optional(),
  // ISO date strings — client computes via the FMCSA-lookup response shape,
  // server validates + persists. authorityGrantDate is nullable (when null
  // grant carriers hit waiting-list because authority couldn't be resolved).
  authorityGrantDate: z.string().datetime().nullable().optional(),
  eligibilityDate: z.string().datetime().nullable().optional(),
});

router.post("/waitlist", fmcsaLookupLimiter, async (req: Request, res: Response) => {
  try {
    const data = waitlistSchema.parse(req.body);
    const entry = await prisma.waitingList.upsert({
      where: {
        email_dotNumber: {
          email: data.email,
          dotNumber: data.dotNumber,
        },
      },
      create: {
        email: data.email,
        dotNumber: data.dotNumber,
        mcNumber: data.mcNumber ?? null,
        authorityGrantedDate: data.authorityGrantDate ? new Date(data.authorityGrantDate) : null,
        eligibilityDate: data.eligibilityDate ? new Date(data.eligibilityDate) : null,
      },
      update: {
        mcNumber: data.mcNumber ?? null,
        authorityGrantedDate: data.authorityGrantDate ? new Date(data.authorityGrantDate) : null,
        eligibilityDate: data.eligibilityDate ? new Date(data.eligibilityDate) : null,
        // Don't reset notifiedAt on re-add — if Sprint 6 cron already
        // notified them once, don't re-notify.
      },
      select: { id: true, eligibilityDate: true, createdAt: true },
    });
    res.status(201).json({
      success: true,
      id: entry.id,
      eligibilityDate: entry.eligibilityDate?.toISOString() ?? null,
      message: data.eligibilityDate
        ? "You're on the list. We'll email you the moment your authority crosses 18 months."
        : "You're on the list. We'll re-check your authority status periodically.",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid waitlist payload", details: err.issues });
      return;
    }
    log.error({ err }, "[Waitlist] Error:");
    res.status(500).json({ error: "Failed to save waitlist entry. Please try again." });
  }
});

// Public: carrier self-registration (multipart/form-data for file uploads)
router.post("/register",
  upload.fields([
    { name: "photoId", maxCount: 1 },
    { name: "articlesOfInc", maxCount: 1 },
    // v3.8.ajr — Step 3 staged documents (W-9, COI, Authority, Safety
    // Cert when Canadian). Pre-ajr the frontend tried a post-register
    // authenticated upload with `Bearer ${data.token}` where data.token
    // was undefined since the v3.8.ajd login refactor (no JWT issued
    // at registration). Files silently 401'd. Now they come bundled
    // with the registration POST as `files[]` paired by index with
    // `docTypes[]` form-field arrays.
    { name: "files", maxCount: 10 },
  ]),
  (req: any, _res: any, next: any) => {
    // Normalize FormData array fields (equipmentTypes, operatingRegions come as repeated fields)
    if (typeof req.body.equipmentTypes === "string") req.body.equipmentTypes = [req.body.equipmentTypes];
    if (typeof req.body.operatingRegions === "string") req.body.operatingRegions = [req.body.operatingRegions];
    if (typeof req.body.docTypes === "string") req.body.docTypes = [req.body.docTypes];

    // v3.8.ajr — Coerce numeric strings to numbers. FormData fields are
    // always strings; Zod schema expects z.number() on these. Pre-ajr
    // the frontend sent JSON.stringify with native types so coercion
    // wasn't needed. Switching to FormData for file upload requires it.
    for (const k of ["numberOfTrucks", "autoLiabilityAmount", "cargoInsuranceAmount", "generalLiabilityAmount", "workersCompAmount"]) {
      if (typeof req.body[k] === "string" && req.body[k] !== "") {
        const n = Number(req.body[k]);
        if (!isNaN(n)) req.body[k] = n;
      } else if (req.body[k] === "") {
        delete req.body[k];
      }
    }

    // v3.8.ajr — Coerce boolean strings. Same FormData artifact.
    for (const k of ["additionalInsuredSRL", "waiverOfSubrogation", "thirtyDayCancellationNotice"]) {
      if (req.body[k] === "true") req.body[k] = true;
      else if (req.body[k] === "false") req.body[k] = false;
      else if (req.body[k] === "") delete req.body[k];
    }

    next();
  },
  validateBody(carrierRegisterSchema),
  registerCarrier
);

// Authenticated carrier
router.use(authenticate);
router.post("/documents", upload.array("files", 5), uploadCarrierDocuments);
router.get("/onboarding-status", getOnboardingStatus);
router.get("/dashboard", getDashboard);
router.get("/scorecard", getScorecard);
router.get("/revenue", getRevenue);
router.get("/bonuses", getBonuses);

// Admin carrier profile setup
router.post("/admin-setup", authorize("ADMIN", "CEO"), setupAdminCarrierProfile);

// Admin / Employee view
router.get("/all", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), getAllCarriers);
router.get("/:id/detail", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), getCarrierDetail);
router.patch("/:id", authorize("ADMIN", "CEO"), auditLog("UPDATE", "Carrier"), updateCarrier);

// POST /carrier/:id/authority-grant-date — dedicated, reason-required,
// audited admin endpoint that sets CarrierProfile.authorityGrantedDate
// and re-runs complianceCheck. See controller for design rationale.
router.post("/:id/authority-grant-date", authorize("ADMIN", "CEO"), setAuthorityGrantDate);

// Admin only
router.post("/verify/:id", authorize("ADMIN", "CEO"), validateBody(verifyCarrierSchema), auditLog("VERIFY", "Carrier"), verifyCarrier);

// Capacity feed — carriers who have posted availability
router.get("/capacity-feed", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (_req: AuthRequest, res: Response) => {
  try {
    const profiles = await prisma.carrierProfile.findMany({
      // v3.8.aim Build 1 test-carrier load-assignment fence: capacity-feed
      // surfaces carrier availability posts to AE/Broker/Dispatch/Operations
      // for active load matching. Test carriers must not appear in the feed.
      where: { preferredLanes: { not: undefined }, isTestAccount: false },
      select: {
        userId: true, companyName: true, mcNumber: true, equipmentTypes: true,
        operatingRegions: true, preferredLanes: true, activeLoadCount: true,
        numberOfTrucks: true,
      },
    });

    const feed = profiles
      .map((p) => {
        const lanes = p.preferredLanes as any;
        if (!lanes?.lastCapacityPost) return null;
        const post = lanes.lastCapacityPost;
        // Only include posts from the last 7 days
        const postedAt = new Date(post.postedAt);
        if (Date.now() - postedAt.getTime() > 7 * 24 * 60 * 60 * 1000) return null;
        return {
          carrierId: p.userId, companyName: p.companyName, mcNumber: p.mcNumber,
          equipmentTypes: p.equipmentTypes, trucks: p.numberOfTrucks,
          activeLoads: p.activeLoadCount,
          currentCity: post.currentCity, currentState: post.currentState,
          availableDate: post.availableDate, equipmentType: post.equipmentType,
          preferredDestStates: post.preferredDestStates, notes: post.notes,
          postedAt: post.postedAt,
        };
      })
      .filter(Boolean);

    res.json({ feed });
  } catch (err) {
    log.error({ err: err }, "[Capacity] Feed error:");
    res.status(500).json({ error: "Failed to fetch capacity feed" });
  }
});

export default router;
