import mongoose, { Document, Schema } from "mongoose";

export type AcademyPayoutType = "Per-Session" | "Monthly Retainer + Bonus";
export type AcademyPayoutStatus = "Draft" | "Paid";

export interface IAcademyTutorPayout extends Document {
  teacherId: mongoose.Types.ObjectId;
  teacherCode: string;
  teacherName: string;
  payoutType: AcademyPayoutType;
  ratePer1on1Session: number;
  ratePerBatchSession: number;
  fixedRetainer: number;
  completed1on1Count: number;
  completedBatchCount: number;
  bonusAmount: number;
  deductions: number;
  netPayable: number;
  month: string; // YYYY-MM
  status: AcademyPayoutStatus;
  paymentMode: string;
  paidAt?: Date;
  session: string;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const academyTutorPayoutSchema = new Schema<IAcademyTutorPayout>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    teacherCode: {
      type: String,
      required: true,
      trim: true,
    },
    teacherName: {
      type: String,
      required: true,
      trim: true,
    },
    payoutType: {
      type: String,
      enum: ["Per-Session", "Monthly Retainer + Bonus"],
      default: "Per-Session",
      required: true,
    },
    ratePer1on1Session: {
      type: Number,
      required: true,
      default: 500,
    },
    ratePerBatchSession: {
      type: Number,
      required: true,
      default: 800,
    },
    fixedRetainer: {
      type: Number,
      required: true,
      default: 0,
    },
    completed1on1Count: {
      type: Number,
      required: true,
      default: 0,
    },
    completedBatchCount: {
      type: Number,
      required: true,
      default: 0,
    },
    bonusAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    deductions: {
      type: Number,
      required: true,
      default: 0,
    },
    netPayable: {
      type: Number,
      required: true,
      default: 0,
    },
    month: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Draft", "Paid"],
      default: "Draft",
      required: true,
    },
    paymentMode: {
      type: String,
      default: "Bank Transfer",
      trim: true,
    },
    paidAt: {
      type: Date,
    },
    session: {
      type: String,
      required: true,
      default: "2026-27",
      trim: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

academyTutorPayoutSchema.index({ teacherId: 1, month: 1 }, { unique: true });

export default mongoose.models.AcademyTutorPayout || mongoose.model<IAcademyTutorPayout>("AcademyTutorPayout", academyTutorPayoutSchema);
