import { Request, Response } from "express";
import {
  createCoursePaymentOrder,
  verifyAndProcessPayment,
  createNextInstalmentOrder,
  getProviderFinancialSummary,
  verifyPaymentSignature,
} from "../services/payment_service";

export const createPaymentOrderController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const learnerId = req.user?._id?.toString();
    if (!learnerId) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const { courseId, planType = "full", numberOfInstalments } = req.body;
    if (!courseId) {
      res.status(400).json({ success: false, message: "Course ID is required" });
      return;
    }

    const order = await createCoursePaymentOrder({
      learnerId,
      courseId,
      planType,
      numberOfInstalments,
    });

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || "Failed to create payment order",
    });
  }
};

export const verifyPaymentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const learnerId = req.user?._id?.toString();
    if (!learnerId) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const {
      paymentPlanId,
      instalmentNumber,
      orderId,
      gatewayTransactionId,
      signature,
      gatewayProvider,
    } = req.body;

    if (!paymentPlanId || !orderId || !gatewayTransactionId) {
      res.status(400).json({
        success: false,
        message: "paymentPlanId, orderId, and gatewayTransactionId are required",
      });
      return;
    }

    const result = await verifyAndProcessPayment({
      learnerId,
      paymentPlanId,
      instalmentNumber: Number(instalmentNumber) || 1,
      orderId,
      gatewayTransactionId,
      signature,
      gatewayProvider,
    });

    res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || "Payment verification failed",
    });
  }
};

export const createNextInstalmentOrderController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const learnerId = req.user?._id?.toString();
    if (!learnerId) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const { paymentPlanId } = req.body;
    if (!paymentPlanId) {
      res.status(400).json({ success: false, message: "paymentPlanId is required" });
      return;
    }

    const order = await createNextInstalmentOrder(learnerId, paymentPlanId);
    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || "Failed to generate next instalment order",
    });
  }
};

export const getProviderFinancialsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const providerId = req.user?._id?.toString();
    if (!providerId) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const financials = await getProviderFinancialSummary(providerId);
    res.status(200).json({
      success: true,
      data: financials,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve provider financials",
    });
  }
};

/**
 * Asynchronous webhook handler for payment gateways with HMAC signature verification
 * and idempotent processing.
 */
export const paymentWebhookController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const signature = req.headers["x-edupye-signature"] as string;
    const {
      event,
      learnerId,
      paymentPlanId,
      instalmentNumber,
      orderId,
      gatewayTransactionId,
      gatewayProvider,
    } = req.body;

    if (event !== "payment.success") {
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    // Webhook signature is MANDATORY: Never process unauthenticated webhook calls
    if (!signature) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: Missing webhook signature header (x-edupye-signature)",
      });
      return;
    }

    if (!verifyPaymentSignature(orderId, gatewayTransactionId, signature)) {
      res.status(400).json({ success: false, message: "Invalid webhook signature" });
      return;
    }

    const result = await verifyAndProcessPayment({
      learnerId,
      paymentPlanId,
      instalmentNumber: Number(instalmentNumber) || 1,
      orderId,
      gatewayTransactionId,
      signature,
      gatewayProvider: gatewayProvider || "webhook_gateway",
    });

    res.status(200).json({
      success: true,
      received: true,
      transactionId: result.transactionId,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message || "Webhook processing failed",
    });
  }
};

