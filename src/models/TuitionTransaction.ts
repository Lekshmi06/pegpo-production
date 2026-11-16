import mongoose, { Document, Schema } from "mongoose";

export type TuitionTransactionStatus = "paid" | "refunded" | "pending";

export interface ITuitionTransaction extends Document {
  studentId: mongoose.Types.ObjectId;
  providerId: mongoose.Types.ObjectId;
  offeringId?: mongoose.Types.ObjectId;
  requestId: mongoose.Types.ObjectId;
  enrollmentId?: mongoose.Types.ObjectId;
  grossAmount: number;
  currency: string;
  status: TuitionTransactionStatus;
  gatewayTransactionId: string;
  paymentMethod: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const tuitionTransactionSchema = new Schema<ITuitionTransaction>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    offeringId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionOffering",
      index: true,
    },
    requestId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionRequest",
      required: true,
      unique: true,
      index: true,
    },
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionEnrollment",
      index: true,
    },
    grossAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    status: {
      type: String,
      enum: ["paid", "refunded", "pending"],
      default: "paid",
      index: true,
    },
    gatewayTransactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paymentMethod: {
      type: String,
      default: "simulated_gateway",
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

tuitionTransactionSchema.index({ providerId: 1, createdAt: -1 });
tuitionTransactionSchema.index({ studentId: 1, createdAt: -1 });

const TuitionTransaction = mongoose.model<ITuitionTransaction>(
  "TuitionTransaction",
  tuitionTransactionSchema
);

export default TuitionTransaction;

