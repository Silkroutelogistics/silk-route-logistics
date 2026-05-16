import { Router } from "express";
import { verifyRC } from "../controllers/verifyController";

// Sprint 51 (Item 129) — RC verification public endpoint. Mounted at
// /api/verify per routes/index.ts public-routes block. No auth — anti-fraud
// verification surface is meant to be shared (URL printed on every RC PDF
// header). Pattern mirrors /api/tracking/:token (public, no auth, token-
// gated) per apiDocs.ts:65 canonical.
const router = Router();

router.get("/:token", verifyRC);

export default router;
