import { Router } from "express";
import adminCrmController from "../controllers/admin_crm_controller";
import { requireAdminAuth } from "../middlewares/admin_module_middleware";

const router = Router();

// Parties (Customers, Suppliers, CRM Leads)
router.get("/parties", adminCrmController.getParties);
router.post("/parties", requireAdminAuth, adminCrmController.createParty);
router.put("/parties/:id", requireAdminAuth, adminCrmController.updateParty);
router.delete("/parties/:id", requireAdminAuth, adminCrmController.deleteParty);

// Sales Quotes
router.get("/sales-quotes", adminCrmController.getSalesQuotes);
router.post("/sales-quotes", requireAdminAuth, adminCrmController.createSalesQuote);
router.put("/sales-quotes/:id", requireAdminAuth, adminCrmController.updateSalesQuote);
router.post("/sales-quotes/:id/convert", requireAdminAuth, adminCrmController.convertQuoteToInvoice);
router.delete("/sales-quotes/:id", requireAdminAuth, adminCrmController.deleteSalesQuote);

// Chart of Accounts
router.get("/accounts", adminCrmController.getAccounts);
router.post("/accounts", requireAdminAuth, adminCrmController.createAccount);
router.put("/accounts/:id", requireAdminAuth, adminCrmController.updateAccount);
router.delete("/accounts/:id", requireAdminAuth, adminCrmController.deleteAccount);

export default router;

