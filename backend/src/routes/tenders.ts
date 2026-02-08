import { Router } from "express";
import { createTender, acceptTender, counterTender, declineTender, getCarrierTenders } from "../controllers/tenderController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.post("/loads/:id/tender", authorize("BROKER", "SHIPPER", "ADMIN"), createTender);
router.post("/tenders/:id/accept", acceptTender);
router.post("/tenders/:id/counter", counterTender);
router.post("/tenders/:id/decline", declineTender);
router.get("/carrier/tenders", getCarrierTenders);

export default router;
