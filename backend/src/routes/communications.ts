import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { getCommunications, createCommunication } from "../controllers/communicationController";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "AE") as any);

router.get("/", getCommunications as any);
router.post("/", createCommunication as any);

export default router;
