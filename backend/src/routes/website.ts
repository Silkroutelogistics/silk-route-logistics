import { Router } from "express";
import { createWebsiteLead, createContactSubmission } from "../controllers/websiteController";

const router = Router();

// Public endpoints — no auth required
router.post("/leads/website", createWebsiteLead);
router.post("/contact/website", createContactSubmission);

export default router;
