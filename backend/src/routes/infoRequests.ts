// v3.8.ajh — InfoRequest workflow endpoints.
//
// Two route groups under separate auth contexts:
//
// AE side (authenticated AE Console users):
//   POST   /api/info-requests              — create new request
//   GET    /api/info-requests?carrierId=X  — list for a carrier
//   PATCH  /api/info-requests/:id/cancel   — cancel an OPEN request
//
// Carrier side: piggybacks on /api/carrier-auth/* for cookie scoping.
// These two endpoints live in routes/carrierAuth.ts:
//   GET    /api/carrier-auth/info-requests          — carrier's own
//   POST   /api/carrier-auth/info-requests/:id/resolve  — carrier resolves
//
// Splitting the AE side into its own router keeps the surface clean +
// matches the existing routes/carriers.ts (AE-facing) vs carrierAuth.ts
// (carrier-facing) separation.

import { Router, Response } from "express";
import { z } from "zod";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import { prisma } from "../config/database";
import { createInfoRequest, cancelInfoRequest, getCategoryLabel } from "../services/infoRequestService";
import { log } from "../lib/logger";

const router = Router();

// All AE-side endpoints require ADMIN or CEO. Same gate as the existing
// approve/reject buttons on the carrier detail surface.
router.use(authenticate);
router.use(authorize("ADMIN", "CEO"));

const createSchema = z.object({
  carrierId: z.string().min(1),
  category: z.enum([
    "COI_UPDATE",
    "W9_UPDATE",
    "AUTHORITY_LETTER",
    "SAFETY_CLARIFICATION",
    "EIN_VERIFICATION",
    "VOIDED_CHECK",
    "ADDRESS_PROOF",
    "REFERENCES",
    "OTHER",
  ]),
  message: z.string().min(10, "Message must be at least 10 characters").max(2000, "Message must be 2000 characters or less"),
});

router.post("/", validateBody(createSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { carrierId, category, message } = req.body;
    const request = await createInfoRequest({
      carrierId,
      createdById: req.user!.id,
      category,
      message,
    });
    res.status(201).json({
      request: {
        ...request,
        categoryLabel: getCategoryLabel(request.category),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create info request";
    log.error({ err }, "[InfoRequest] Create failed");
    res.status(msg === "Carrier not found" ? 404 : 500).json({ error: msg });
  }
});

const listSchema = z.object({
  carrierId: z.string().min(1),
  status: z.enum(["OPEN", "RESOLVED", "CANCELLED"]).optional(),
});

router.get("/", validateQuery(listSchema), async (req: AuthRequest, res: Response) => {
  const { carrierId, status } = req.query as { carrierId: string; status?: string };

  const requests = await prisma.infoRequest.findMany({
    where: {
      carrierId,
      ...(status ? { status: status as any } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      cancelledBy: { select: { id: true, firstName: true, lastName: true } },
      // v3.8.aji — Include attachments inline so the AE UI can render
      // file links without a second round-trip. Each Document carries
      // fileName + fileUrl + fileType + fileSize for display + download.
      attachments: {
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          fileType: true,
          fileSize: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  res.json({
    requests: requests.map((r) => ({
      ...r,
      categoryLabel: getCategoryLabel(r.category),
    })),
  });
});

router.patch("/:id/cancel", async (req: AuthRequest, res: Response) => {
  try {
    const updated = await cancelInfoRequest({
      requestId: req.params.id,
      cancelledById: req.user!.id,
    });
    res.json({ request: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to cancel info request";
    log.error({ err, requestId: req.params.id }, "[InfoRequest] Cancel failed");
    res.status(msg === "Info request not found" ? 404 : 400).json({ error: msg });
  }
});

export default router;
