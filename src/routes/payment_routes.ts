import { Router } from "express";
import {
  authenticateUser,
  authenticateLearner,
  authenticateProvider,
} from "../middlewares/auth_middleware";
import {
  createPaymentOrderController,
  verifyPaymentController,
  createNextInstalmentOrderController,
  getProviderFinancialsController,
  paymentWebhookController,
} from "../controllers/payment_controller";

const router = Router();

// Order creation for Full payment or initial Instalment
router.post("/create-order", authenticateLearner, createPaymentOrderController);

// Server-side payment verification (cryptographic & idempotent)
router.post("/verify", authenticateLearner, verifyPaymentController);

// Order creation for subsequent instalment payment
router.post("/next-instalment", authenticateLearner, createNextInstalmentOrderController);

// Provider Financial Analytics (Revenue, 80:20 split, settlements, transactions)
router.get("/provider/financials", authenticateProvider, getProviderFinancialsController);

// Payment Gateway Webhook Endpoint
router.post("/webhook", paymentWebhookController);

export default router;

