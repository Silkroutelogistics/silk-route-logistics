import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { getMileage, getMileageProvider, batchMileage } from "../controllers/mileageController";

const router = Router();

router.use(authenticate);

router.get("/calculate", getMileage);
router.get("/provider", getMileageProvider);
router.post("/batch", batchMileage);

export default router;
