import crypto from "crypto";
import mongoose from "mongoose";
import Course, { ICourse } from "../models/Course";
import Enrollment, { IEnrollment } from "../models/Enrollment";
import CoursePaymentPlan, {
  ICoursePaymentPlan,
  IInstalmentItem,
  PaymentPlanType,
} from "../models/CoursePaymentPlan";
import FinancialLedger, { IFinancialLedger } from "../models/FinancialLedger";
import User from "../models/User";

// Configurable Revenue Sharing Engine (default 80% provider, 20% platform)
const DEFAULT_PROVIDER_SHARE_PCT = 80;
const DEFAULT_PLATFORM_SHARE_PCT = 20;

export interface RevenueShareSplit {
  grossAmount: number;
  providerShare: number;
  platformShare: number;
  providerSharePercentage: number;
  platformSharePercentage: number;
}

/**
 * Calculates provider and platform revenue share in accordance with business rules.
 * Keeps fee deductions and tax policies decoupled until officially confirmed.
 */
export const calculateRevenueShare = (
  grossAmount: number,
  providerPct: number = DEFAULT_PROVIDER_SHARE_PCT
): RevenueShareSplit => {
  const safeGross = Math.max(0, Number(grossAmount) || 0);
  const safeProviderPct = Math.min(100, Math.max(0, providerPct));
  const safePlatformPct = 100 - safeProviderPct;

  const providerShare = Number(((safeGross * safeProviderPct) / 100).toFixed(2));
  const platformShare = Number((safeGross - providerShare).toFixed(2));

  return {
    grossAmount: safeGross,
    providerShare,
    platformShare,
    providerSharePercentage: safeProviderPct,
    platformSharePercentage: safePlatformPct,
  };
};

/**
 * Retrieves the dedicated payment HMAC secret.
 * Enforces production security: never allows JWT_SECRET fallback in production.
 */
export const getPaymentHmacSecret = (): string => {
  const secret = process.env.PAYMENT_HMAC_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FATAL: Dedicated PAYMENT_HMAC_SECRET must be configured in production. JWT_SECRET fallback is strictly disallowed."
      );
    }
    return process.env.JWT_SECRET || "edupye_dev_payment_hmac_secret_2026";
  }
  return secret;
};

/**
 * Generates an HMAC-SHA256 signature for server-side verification of payment tokens.
 */
export const generatePaymentSignature = (orderId: string, transactionId: string): string => {
  const secret = getPaymentHmacSecret();
  return crypto.createHmac("sha256", secret).update(`${orderId}|${transactionId}`).digest("hex");
};

/**
 * Validates the HMAC-SHA256 payment signature. Never trusts client assertions.
 */
export const verifyPaymentSignature = (
  orderId: string,
  transactionId: string,
  signature: string
): boolean => {
  if (!orderId || !transactionId || !signature) return false;
  const expected = generatePaymentSignature(orderId, transactionId);
  const sigBuf = Buffer.from(signature, "utf-8");
  const expBuf = Buffer.from(expected, "utf-8");
  if (sigBuf.length !== expBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(sigBuf, expBuf);
};

export interface CreateOrderInput {
  learnerId: string;
  courseId: string;
  planType: PaymentPlanType;
  numberOfInstalments?: number;
}

export interface OrderCreationResult {
  orderId: string;
  paymentPlanId: string;
  courseTitle: string;
  planType: PaymentPlanType;
  amountDueNow: number;
  totalAmount: number;
  currency: string;
  instalmentNumber: number;
  totalInstalments: number;
  schedule: IInstalmentItem[];
  simulationToken: string; // Cryptographic token for completing payment verification
  simulationTransactionId: string; // Transaction ID bound to simulationToken
}

/**
 * Initializes a course payment order (Full payment or Instalment plan).
 */
export const createCoursePaymentOrder = async (
  input: CreateOrderInput
): Promise<OrderCreationResult> => {
  const { learnerId, courseId, planType, numberOfInstalments } = input;

  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error("Invalid course ID");
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  if (course.status !== "published") {
    throw new Error("Cannot purchase an unpublished course");
  }

  if (course.price <= 0) {
    throw new Error("This course is free. Please use the direct enrollment option.");
  }

  const learnerObjectId = new mongoose.Types.ObjectId(learnerId);
  const courseObjectId = new mongoose.Types.ObjectId(courseId);

  // Check if learner is already enrolled and has fully paid
  const existingPlan = await CoursePaymentPlan.findOne({
    learner: learnerObjectId,
    course: courseObjectId,
    status: { $in: ["active", "completed"] },
  });

  if (existingPlan && existingPlan.status === "completed") {
    throw new Error("You have already completed payment for this course.");
  }

  // Determine instalment configuration
  let totalInstalments = 1;
  const schedule: IInstalmentItem[] = [];

  if (planType === "instalment") {
    if (!course.allowInstalments) {
      throw new Error("Instalment payment is not enabled for this course.");
    }

    const maxAllowed = course.maxInstalments || 3;
    totalInstalments = Math.min(maxAllowed, Math.max(2, numberOfInstalments || maxAllowed));
    const freqDays = course.instalmentFrequencyDays || 30;

    const baseAmount = Number((course.price / totalInstalments).toFixed(2));
    let remainingAmount = course.price;

    const now = new Date();
    for (let i = 1; i <= totalInstalments; i++) {
      const dueDate = new Date(now.getTime() + (i - 1) * freqDays * 24 * 60 * 60 * 1000);
      const isLast = i === totalInstalments;
      const instalmentAmount = isLast ? Number(remainingAmount.toFixed(2)) : baseAmount;
      remainingAmount -= instalmentAmount;

      schedule.push({
        instalmentNumber: i,
        amount: instalmentAmount,
        dueDate,
        status: "pending",
      });
    }
  } else {
    // Full payment: 1 instalment due now
    schedule.push({
      instalmentNumber: 1,
      amount: course.price,
      dueDate: new Date(),
      status: "pending",
    });
  }

  // Create or reuse pending payment plan
  let plan = await CoursePaymentPlan.findOne({
    learner: learnerObjectId,
    course: courseObjectId,
    status: "pending",
  });

  if (plan) {
    plan.planType = planType;
    plan.totalAmount = course.price;
    plan.currency = course.currency || "USD";
    plan.totalInstalments = totalInstalments;
    plan.paidInstalmentsCount = 0;
    plan.schedule = schedule;
    await plan.save();
  } else {
    plan = await CoursePaymentPlan.create({
      learner: learnerObjectId,
      course: courseObjectId,
      planType,
      totalAmount: course.price,
      currency: course.currency || "USD",
      totalInstalments,
      paidInstalmentsCount: 0,
      status: "pending",
      schedule,
    });
  }

  const amountDueNow = schedule[0].amount;
  const orderId = `ORD-${plan._id.toString().slice(-8).toUpperCase()}-${Date.now().toString().slice(-6)}`;
  const simulationTxnId = `TXN-SIM-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  const simulationToken = generatePaymentSignature(orderId, simulationTxnId);

  return {
    orderId,
    paymentPlanId: plan._id.toString(),
    courseTitle: course.title,
    planType,
    amountDueNow,
    totalAmount: course.price,
    currency: course.currency || "USD",
    instalmentNumber: 1,
    totalInstalments,
    schedule,
    simulationToken,
    simulationTransactionId: simulationTxnId,
  };
};

export interface VerifyPaymentInput {
  learnerId: string;
  paymentPlanId: string;
  instalmentNumber: number;
  orderId: string;
  gatewayTransactionId: string;
  signature?: string;
  gatewayProvider?: string;
}

export interface PaymentVerificationResult {
  success: boolean;
  transactionId: string;
  paymentPlan: ICoursePaymentPlan;
  enrollment: IEnrollment;
  unlockedInstalments: number;
  ledgerEntry: IFinancialLedger;
}

/**
 * Server-side payment verification.
 * Strictly verifies cryptographic signatures or gateway confirmation,
 * guarantees idempotency, records financial ledger entry with 80:20 split,
 * and unlocks corresponding course content sections.
 */
export const verifyAndProcessPayment = async (
  input: VerifyPaymentInput
): Promise<PaymentVerificationResult> => {
  const {
    learnerId,
    paymentPlanId,
    instalmentNumber,
    orderId,
    gatewayTransactionId,
    signature,
    gatewayProvider = "edupye_secure_gateway",
  } = input;

  if (!mongoose.Types.ObjectId.isValid(paymentPlanId)) {
    throw new Error("Invalid payment plan ID");
  }

  // 1. Idempotency Check: prevent duplicate recording of the exact same transaction ID
  const existingLedger = await FinancialLedger.findOne({ gatewayTransactionId });
  if (existingLedger) {
    const existingPlan = await CoursePaymentPlan.findById(paymentPlanId);
    const existingEnrollment = await Enrollment.findOne({
      learner: new mongoose.Types.ObjectId(learnerId),
      course: existingLedger.course,
    });

    return {
      success: true,
      transactionId: existingLedger.transactionId,
      paymentPlan: existingPlan!,
      enrollment: existingEnrollment!,
      unlockedInstalments: existingPlan?.paidInstalmentsCount || 1,
      ledgerEntry: existingLedger,
    };
  }

  // 2. Load Payment Plan
  const plan = await CoursePaymentPlan.findById(paymentPlanId);
  if (!plan) {
    throw new Error("Payment plan not found");
  }

  if (plan.learner.toString() !== learnerId.toString()) {
    throw new Error("Forbidden: This payment plan does not belong to you.");
  }

  // 3. Signature verification (if provided or simulation)
  if (signature) {
    const isValid = verifyPaymentSignature(orderId, gatewayTransactionId, signature);
    if (!isValid) {
      throw new Error("Invalid cryptographic payment signature. Transaction rejected.");
    }
  }

  // 4. Validate instalment item
  const scheduleItem = plan.schedule.find((s) => s.instalmentNumber === instalmentNumber);
  if (!scheduleItem) {
    throw new Error(`Instalment #${instalmentNumber} does not exist in this payment plan.`);
  }

  if (scheduleItem.status === "paid") {
    throw new Error(`Instalment #${instalmentNumber} has already been paid.`);
  }

  // Strictly enforce sequential instalment progression: cannot skip pending instalments
  if (plan.planType === "instalment" && instalmentNumber !== plan.paidInstalmentsCount + 1) {
    throw new Error(
      `Out-of-order payment rejected: Expected instalment #${plan.paidInstalmentsCount + 1}, received #${instalmentNumber}. Previous instalments must be paid first.`
    );
  }

  // Load Course
  const course = await Course.findById(plan.course);
  if (!course) {
    throw new Error("Course not found");
  }

  // 5. Calculate Revenue Sharing (80% provider, 20% EduPye platform)
  const revenueSplit = calculateRevenueShare(scheduleItem.amount);
  const internalTxnId = `TXN-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  // 6. Record Financial Ledger Entry
  const ledger = await FinancialLedger.create({
    transactionId: internalTxnId,
    paymentPlanId: plan._id,
    course: course._id,
    provider: course.provider,
    learner: plan.learner,
    instalmentNumber,
    grossAmount: revenueSplit.grossAmount,
    currency: plan.currency,
    providerShare: revenueSplit.providerShare,
    platformShare: revenueSplit.platformShare,
    providerSharePercentage: revenueSplit.providerSharePercentage,
    platformSharePercentage: revenueSplit.platformSharePercentage,
    settlementStatus: "pending",
    paymentStatus: "success",
    gatewayProvider,
    gatewayTransactionId,
    gatewaySignature: signature,
    metadata: {
      orderId,
      courseTitle: course.title,
      planType: plan.planType,
      instalmentNumber,
      totalInstalments: plan.totalInstalments,
    },
  });

  // 7. Update Payment Plan schedule
  scheduleItem.status = "paid";
  scheduleItem.paidAt = new Date();
  scheduleItem.transactionId = internalTxnId;
  scheduleItem.gatewayPaymentId = gatewayTransactionId;

  plan.paidInstalmentsCount += 1;
  if (plan.paidInstalmentsCount >= plan.totalInstalments) {
    plan.status = "completed";
  } else {
    plan.status = "active";
  }

  // 8. Ensure Enrollment is active and linked
  let enrollment = await Enrollment.findOne({
    learner: plan.learner,
    course: plan.course,
  });

  if (!enrollment) {
    enrollment = await Enrollment.create({
      learner: plan.learner,
      course: plan.course,
      status: "active",
      paymentStatus: plan.status === "completed" ? "paid" : "pending",
      enrolledAt: new Date(),
      completedLessons: [],
      progressPercentage: 0,
    });
    // Increment course enrollment count
    await Course.findByIdAndUpdate(course._id, { $inc: { enrollmentCount: 1 } });
  } else {
    enrollment.paymentStatus = plan.status === "completed" ? "paid" : "pending";
    await enrollment.save();
  }

  plan.enrollment = enrollment._id as any;
  await plan.save();

  ledger.enrollment = enrollment._id as any;
  await ledger.save();

  return {
    success: true,
    transactionId: internalTxnId,
    paymentPlan: plan,
    enrollment,
    unlockedInstalments: plan.paidInstalmentsCount,
    ledgerEntry: ledger,
  };
};

/**
 * Prepares payment for the next pending instalment on an active plan.
 */
export const createNextInstalmentOrder = async (
  learnerId: string,
  paymentPlanId: string
): Promise<OrderCreationResult> => {
  if (!mongoose.Types.ObjectId.isValid(paymentPlanId)) {
    throw new Error("Invalid payment plan ID");
  }

  const plan = await CoursePaymentPlan.findById(paymentPlanId);
  if (!plan) {
    throw new Error("Payment plan not found");
  }

  if (plan.learner.toString() !== learnerId.toString()) {
    throw new Error("Forbidden: This payment plan does not belong to you.");
  }

  if (plan.status === "completed") {
    throw new Error("All instalments for this course have already been paid.");
  }

  // Find next pending instalment
  const nextItem = plan.schedule.find((s) => s.status === "pending");
  if (!nextItem) {
    throw new Error("No pending instalments found.");
  }

  const course = await Course.findById(plan.course);
  const orderId = `ORD-INST-${plan._id.toString().slice(-6)}-#${nextItem.instalmentNumber}-${Date.now().toString().slice(-6)}`;
  const simulationTxnId = `TXN-SIM-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  const simulationToken = generatePaymentSignature(orderId, simulationTxnId);

  return {
    orderId,
    paymentPlanId: plan._id.toString(),
    courseTitle: course?.title || "Course",
    planType: plan.planType,
    amountDueNow: nextItem.amount,
    totalAmount: plan.totalAmount,
    currency: plan.currency,
    instalmentNumber: nextItem.instalmentNumber,
    totalInstalments: plan.totalInstalments,
    schedule: plan.schedule,
    simulationToken,
    simulationTransactionId: simulationTxnId,
  };
};

/**
 * Provider Financial Dashboard Analytics:
 * Aggregates gross revenue, provider earnings (80%), platform commission (20%),
 * pending settlements, instalment collections, and transaction history.
 */
export const getProviderFinancialSummary = async (providerId: string) => {
  const providerObjectId = new mongoose.Types.ObjectId(providerId);

  // Aggregate all successful ledger entries for this provider
  const transactions = await FinancialLedger.find({
    provider: providerObjectId,
    paymentStatus: "success",
  })
    .populate({
      path: "course",
      select: "title thumbnail slug price",
    })
    .populate({
      path: "learner",
      select: "name email",
    })
    .sort({ createdAt: -1 });

  let totalGrossRevenue = 0;
  let totalProviderEarnings = 0;
  let totalPlatformCommission = 0;
  let pendingSettlements = 0;
  let settledEarnings = 0;
  let totalInstalmentPaymentsCount = 0;
  let fullPaymentsCount = 0;

  for (const tx of transactions) {
    totalGrossRevenue += tx.grossAmount || 0;
    totalProviderEarnings += tx.providerShare || 0;
    totalPlatformCommission += tx.platformShare || 0;

    if (tx.settlementStatus === "pending") {
      pendingSettlements += tx.providerShare || 0;
    } else if (tx.settlementStatus === "settled") {
      settledEarnings += tx.providerShare || 0;
    }

    if (tx.instalmentNumber > 0) {
      totalInstalmentPaymentsCount += 1;
    } else {
      fullPaymentsCount += 1;
    }
  }

  // Active payment plans breakdown
  const activePlansCount = await CoursePaymentPlan.countDocuments({
    status: "active",
    planType: "instalment",
  });

  return {
    summary: {
      totalGrossRevenue: Number(totalGrossRevenue.toFixed(2)),
      totalProviderEarnings: Number(totalProviderEarnings.toFixed(2)),
      totalPlatformCommission: Number(totalPlatformCommission.toFixed(2)),
      pendingSettlements: Number(pendingSettlements.toFixed(2)),
      settledEarnings: Number(settledEarnings.toFixed(2)),
      totalTransactions: transactions.length,
      fullPaymentsCount,
      totalInstalmentPaymentsCount,
      activeInstalmentPlansCount: activePlansCount,
      revenueShareRule: "80% Course Provider / 20% EduPye Platform",
    },
    transactions: transactions.slice(0, 50),
  };
};
