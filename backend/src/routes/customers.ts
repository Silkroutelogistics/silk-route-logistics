import { Router } from "express";
import {
  createCustomer, getCustomers, getCustomerById, getCustomerStats, updateCustomer, deleteCustomer,
  getCustomerContacts, addCustomerContact, updateCustomerContact, deleteCustomerContact, updateCustomerCredit,
} from "../controllers/customerController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();
router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"));

router.post("/", createCustomer);
router.get("/", getCustomers);
router.get("/stats", getCustomerStats);
router.get("/:id", getCustomerById);
router.patch("/:id", updateCustomer);
router.delete("/:id", authorize("ADMIN", "CEO"), deleteCustomer);

// Customer contacts
router.get("/:id/contacts", getCustomerContacts);
router.post("/:id/contacts", addCustomerContact);
router.patch("/:id/contacts/:cid", updateCustomerContact);
router.delete("/:id/contacts/:cid", deleteCustomerContact);

// Customer credit
router.patch("/:id/credit", updateCustomerCredit);

export default router;
