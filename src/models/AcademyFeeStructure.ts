import mongoose, { Document, Schema } from "mongoose";

export type FeeBillingType = "Monthly" | "Per-Session Package" | "One-Time";

export interface IAcademyFeeStructure extends Document {
  programId?: mongoose.Types.ObjectId;
  className: string;
  title: string;
  amount: number;
  billingType: FeeBillingType;
  includedSessions?: number;
  session: string;
  createdAt: Date;
  updatedAt: Date;
}

const academyFeeStructureSchema = new Schema<IAcademyFeeStructure>(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionProgram",
      default: null,
    },
    className: {
      type: String,
      required: true,
      trim: true,
      default: "Class 12",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    billingType: {
      type: String,
      enum: ["Monthly", "Per-Session Package", "One-Time"],
      required: true,
      default: "Monthly",
    },
    includedSessions: {
      type: Number,
      default: null,
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

academyFeeStructureSchema.index({ session: 1, className: 1, billingType: 1 });

export default mongoose.models.AcademyFeeStructure ||
  mongoose.model<IAcademyFeeStructure>("AcademyFeeStructure", academyFeeStructureSchema);
