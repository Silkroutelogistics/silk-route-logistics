import { Router } from "express";
import { createCustomer, getCustomers, getCustomerById, getCustomerStats, updateCustomer, deleteCustomer } from "../controllers/customerController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate);
router.use(authorize("ADMIN", "BROKER", "OPERATIONS", "ACCOUNTING"));

router.post("/", createCustomer);
router.get("/", getCustomers);
router.get("/stats", getCustomerStats);
router.get("/:id", getCustomerById);
router.patch("/:id", updateCustomer);
router.delete("/:id", authorize("ADMIN"), deleteCustomer);

export default router;
