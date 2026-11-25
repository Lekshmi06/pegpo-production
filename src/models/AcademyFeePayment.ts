import mongoose, { Document, Schema } from "mongoose";

export type FeePaymentMode = "Cash" | "UPI" | "Bank Transfer" | "Card";
export type FeePaymentStatus = "Paid" | "Partial" | "Pending";

export interface IAcademyFeePayment extends Document {
  receiptNo: string;
  studentId: mongoose.Types.ObjectId;
  studentCode: string;
  studentName: string;
  programId?: mongoose.Types.ObjectId;
  feeStructureId?: mongoose.Types.ObjectId;
  monthOrTerm: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  paymentMode: FeePaymentMode;
  status: FeePaymentStatus;
  paidAt: Date;
  remarks?: string;
  session: string;
  createdAt: Date;
  updatedAt: Date;
}

const academyFeePaymentSchema = new Schema<IAcademyFeePayment>(
  {
    receiptNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    programId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionProgram",
      default: null,
    },
    feeStructureId: {
      type: Schema.Types.ObjectId,
      ref: "AcademyFeeStructure",
      default: null,
    },
    monthOrTerm: {
      type: String,
      required: true,
      default: "November 2026",
      trim: true,
    },
    amountDue: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    amountPaid: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
    },
    paymentMode: {
      type: String,
      enum: ["Cash", "UPI", "Bank Transfer", "Card"],
      required: true,
      default: "UPI",
    },
    status: {
      type: String,
      enum: ["Paid", "Partial", "Pending"],
      required: true,
      default: "Paid",
    },
    paidAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
    session: {
      type: String,
      required: true,
      default: "2026-27",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

academyFeePaymentSchema.index({ studentId: 1, session: 1 });
academyFeePaymentSchema.index({ programId: 1, paidAt: -1 });

export default mongoose.models.AcademyFeePayment ||
  mongoose.model<IAcademyFeePayment>("AcademyFeePayment", academyFeePaymentSchema);
