import { Router } from "express";
import {
  createCustomer, getCustomers, getCustomerById, getCustomerStats, updateCustomer, deleteCustomer,
  getCustomerContacts, addCustomerContact, updateCustomerContact, deleteCustomerContact, updateCustomerCredit,
} from "../controllers/customerController";
import { authenticate, authorize } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import { createCustomerSchema, updateCustomerSchema, customerQuerySchema } from "../validators/customer";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

const creditSchema = z.object({
  creditStatus: z.enum(["NOT_CHECKED", "APPROVED", "CONDITIONAL", "DENIED", "PENDING_REVIEW"]).optional(),
  creditLimit: z.number().positive().optional(),
  creditCheckDate: z.string().optional(),
});

const router = Router();
router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"));

router.post("/", validateBody(createCustomerSchema), createCustomer);
router.get("/", validateQuery(customerQuerySchema), getCustomers);
router.get("/stats", getCustomerStats);
router.get("/:id", getCustomerById);
router.patch("/:id", validateBody(updateCustomerSchema), updateCustomer);
router.delete("/:id", authorize("ADMIN", "CEO"), deleteCustomer);

// Customer contacts
router.get("/:id/contacts", getCustomerContacts);
router.post("/:id/contacts", validateBody(contactSchema), addCustomerContact);
router.patch("/:id/contacts/:cid", validateBody(contactSchema.partial()), updateCustomerContact);
router.delete("/:id/contacts/:cid", deleteCustomerContact);

// Customer credit
router.patch("/:id/credit", validateBody(creditSchema), updateCustomerCredit);

export default router;
