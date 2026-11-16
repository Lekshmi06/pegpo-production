import mongoose, { Document, Schema } from "mongoose";

export type PaymentPlanType = "full" | "instalment";
export type PaymentPlanStatus = "pending" | "active" | "completed" | "defaulted" | "cancelled";
export type InstalmentStatus = "pending" | "paid" | "overdue" | "failed";

export interface IInstalmentItem {
  instalmentNumber: number;
  amount: number;
  dueDate: Date;
  status: InstalmentStatus;
  paidAt?: Date;
  transactionId?: string;
  gatewayPaymentId?: string;
}

export interface ICoursePaymentPlan extends Document {
  learner: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  enrollment?: mongoose.Types.ObjectId;
  planType: PaymentPlanType;
  totalAmount: number;
  currency: string;
  totalInstalments: number;
  paidInstalmentsCount: number;
  status: PaymentPlanStatus;
  schedule: IInstalmentItem[];
  createdAt: Date;
  updatedAt: Date;
}

const instalmentItemSchema = new Schema<IInstalmentItem>(
  {
    instalmentNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "overdue", "failed"],
      default: "pending",
      required: true,
    },
    paidAt: {
      type: Date,
    },
    transactionId: {
      type: String,
      trim: true,
    },
    gatewayPaymentId: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const coursePaymentPlanSchema = new Schema<ICoursePaymentPlan>(
  {
    learner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    enrollment: {
      type: Schema.Types.ObjectId,
      ref: "Enrollment",
      index: true,
    },
    planType: {
      type: String,
      enum: ["full", "instalment"],
      default: "full",
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
      trim: true,
    },
    totalInstalments: {
      type: Number,
      default: 1,
      min: 1,
    },
    paidInstalmentsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "active", "completed", "defaulted", "cancelled"],
      default: "pending",
      required: true,
      index: true,
    },
    schedule: {
      type: [instalmentItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// Compound index to quickly find active payment plan for learner & course
coursePaymentPlanSchema.index({ learner: 1, course: 1, status: 1 });

const CoursePaymentPlan = mongoose.model<ICoursePaymentPlan>(
  "CoursePaymentPlan",
  coursePaymentPlanSchema
);

export default CoursePaymentPlan;

