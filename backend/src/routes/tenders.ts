import { Router } from "express";
import { createTender, acceptTender, counterTender, declineTender, getCarrierTenders } from "../controllers/tenderController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.post("/loads/:id/tender", authorize("BROKER", "SHIPPER", "ADMIN", "CEO"), createTender);
router.post("/tenders/:id/accept", authorize("CARRIER", "BROKER", "ADMIN", "CEO"), acceptTender);
router.post("/tenders/:id/counter", authorize("CARRIER", "BROKER", "ADMIN", "CEO"), counterTender);
router.post("/tenders/:id/decline", authorize("CARRIER", "BROKER", "ADMIN", "CEO"), declineTender);
router.get("/carrier/tenders", authorize("CARRIER", "ADMIN", "CEO"), getCarrierTenders);

export default router;
