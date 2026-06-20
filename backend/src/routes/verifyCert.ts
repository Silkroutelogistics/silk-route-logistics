import { Router } from "express";
import { verifyCert } from "../controllers/verifyCertController";

// v3.8.aob (Sprint E1) — public Driver Academy certificate verifier. Mounted at
// /api/verify-cert per routes/index.ts public-routes block. No auth — the QR-borne
// code on the cert IS the lookup key. Mirrors the RC /api/verify pattern.
const router = Router();

router.get("/:code", verifyCert);

export default router;
