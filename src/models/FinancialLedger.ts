import mongoose, { Document, Schema } from "mongoose";

export type LedgerPaymentStatus = "success" | "failed" | "refunded";
export type SettlementStatus = "pending" | "settled" | "held" | "refunded";

export interface IFinancialLedger extends Document {
  transactionId: string; // Unique EduPye transaction reference (e.g. TXN-...)
  paymentPlanId?: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  provider: mongoose.Types.ObjectId;
  learner: mongoose.Types.ObjectId;
  enrollment?: mongoose.Types.ObjectId;
  instalmentNumber: number; // 0 for full payment, 1..N for instalment
  grossAmount: number; // Gross amount paid by learner
  currency: string;
  providerShare: number; // 80% default
  platformShare: number; // 20% default
  providerSharePercentage: number; // default: 80
  platformSharePercentage: number; // default: 20
  settlementStatus: SettlementStatus;
  paymentStatus: LedgerPaymentStatus;
  gatewayProvider: string; // e.g. "edupye_mock", "razorpay", "stripe"
  gatewayTransactionId: string; // External transaction reference from payment provider
  gatewaySignature?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const financialLedgerSchema = new Schema<IFinancialLedger>(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    paymentPlanId: {
      type: Schema.Types.ObjectId,
      ref: "CoursePaymentPlan",
      index: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    provider: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    learner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    enrollment: {
      type: Schema.Types.ObjectId,
      ref: "Enrollment",
      index: true,
    },
    instalmentNumber: {
      type: Number,
      required: true,
      default: 0,
    },
    grossAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
      trim: true,
    },
    providerShare: {
      type: Number,
      required: true,
      min: 0,
    },
    platformShare: {
      type: Number,
      required: true,
      min: 0,
    },
    providerSharePercentage: {
      type: Number,
      default: 80,
    },
    platformSharePercentage: {
      type: Number,
      default: 20,
    },
    settlementStatus: {
      type: String,
      enum: ["pending", "settled", "held", "refunded"],
      default: "pending",
      required: true,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["success", "failed", "refunded"],
      default: "success",
      required: true,
      index: true,
    },
    gatewayProvider: {
      type: String,
      required: true,
      default: "edupye_secure_gateway",
      trim: true,
    },
    gatewayTransactionId: {
      type: String,
      required: true,
      trim: true,
    },
    gatewaySignature: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Idempotency: Prevent duplicate payment recording by gateway transaction ID
financialLedgerSchema.index({ gatewayTransactionId: 1 }, { unique: true });

// Prevent duplicate charges for the same plan instalment
financialLedgerSchema.index(
  { paymentPlanId: 1, instalmentNumber: 1, paymentStatus: 1 },
  { unique: true, partialFilterExpression: { paymentStatus: "success", paymentPlanId: { $exists: true } } }
);

const FinancialLedger = mongoose.model<IFinancialLedger>(
  "FinancialLedger",
  financialLedgerSchema
);

export default FinancialLedger;
