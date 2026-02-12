import { Router } from "express";
import {
  createCustomer, getCustomers, getCustomerById, updateCustomer,
} from "../controllers/customerController";
import { authenticate, authorize } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import { createCustomerSchema, updateCustomerSchema, customerQuerySchema } from "../validators/customer";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"));

router.get("/", validateQuery(customerQuerySchema), getCustomers);
router.post("/", validateBody(createCustomerSchema), createCustomer);
router.get("/:id", getCustomerById);
router.put("/:id", validateBody(updateCustomerSchema), updateCustomer);

export default router;
