import mongoose, { Document, Schema } from "mongoose";

export type TeacherPayoutStatus =
  | "pending_review"
  | "approved"
  | "disbursed"
  | "rejected"
  | "withheld";

export interface ITeacherPayout extends Document {
  teacherId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  enrollmentId?: mongoose.Types.ObjectId;
  requestId?: mongoose.Types.ObjectId;
  isTrial: boolean;
  trialIndex?: number;
  subject: string;
  durationHours: number; // e.g. 0.5 for trial, 1.0 for regular
  payoutRate: number; // historical snapshot hourly payout rate
  totalAmount: number; // durationHours * payoutRate
  currency: string;
  attendanceVerified: boolean;
  status: TeacherPayoutStatus;
  reviewedByAdminId?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  disbursedAt?: Date;
  paymentReference?: string;
  adminNotes?: string;
  statusHistory: Array<{
    status: TeacherPayoutStatus;
    changedAt: Date;
    changedBy?: mongoose.Types.ObjectId;
    note?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const teacherPayoutSchema = new Schema<ITeacherPayout>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionSession",
      required: true,
      unique: true,
      index: true,
    },
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionEnrollment",
      index: true,
    },
    requestId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionRequest",
      index: true,
    },
    isTrial: {
      type: Boolean,
      default: false,
      index: true,
    },
    trialIndex: {
      type: Number,
      enum: [1, 2, 3],
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    durationHours: {
      type: Number,
      required: true,
      min: 0.1,
    },
    payoutRate: {
      type: Number,
      required: true,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
    },
    attendanceVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending_review", "approved", "disbursed", "rejected", "withheld"],
      default: "pending_review",
      index: true,
    },
    reviewedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: {
      type: Date,
    },
    disbursedAt: {
      type: Date,
    },
    paymentReference: {
      type: String,
      trim: true,
    },
    adminNotes: {
      type: String,
      trim: true,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: "User" },
        note: { type: String, trim: true },
      },
    ],
  },
  {
    timestamps: true,
  }
);

teacherPayoutSchema.index({ teacherId: 1, status: 1 });
teacherPayoutSchema.index({ status: 1, createdAt: 1 });

const TeacherPayout = mongoose.model<ITeacherPayout>(
  "TeacherPayout",
  teacherPayoutSchema
);

export default TeacherPayout;

