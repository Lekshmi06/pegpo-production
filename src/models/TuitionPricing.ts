import mongoose, { Document, Schema } from "mongoose";

export type TuitionCurriculum =
  | "CBSE"
  | "ICSE"
  | "State Board"
  | "IB"
  | "Cambridge"
  | "Competitive Exam"
  | "all";

export interface ITuitionTierRates {
  standard: number;
  silver: number;
  gold: number;
  platinum: number;
}

export interface ITuitionPricing extends Document {
  subject: string;
  classLevel: string;
  curriculum: TuitionCurriculum;
  studentHourlyRate: number;
  teacherHourlyPayoutRate: number;
  teacherTierRates?: ITuitionTierRates;
  currency: string;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo?: Date;
  createdBy?: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tuitionPricingSchema = new Schema<ITuitionPricing>(
  {
    subject: {
      type: String,
      required: true,
      default: "all",
      trim: true,
    },
    classLevel: {
      type: String,
      required: true,
      default: "all",
      trim: true,
    },
    curriculum: {
      type: String,
      enum: ["CBSE", "ICSE", "State Board", "IB", "Cambridge", "Competitive Exam", "all"],
      default: "all",
      required: true,
    },
    studentHourlyRate: {
      type: Number,
      required: true,
      min: 0,
    },
    teacherHourlyPayoutRate: {
      type: Number,
      required: true,
      min: 0,
    },
    teacherTierRates: {
      standard: { type: Number, min: 0 },
      silver: { type: Number, min: 0 },
      gold: { type: Number, min: 0 },
      platinum: { type: Number, min: 0 },
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    effectiveFrom: {
      type: Date,
      default: Date.now,
    },
    effectiveTo: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

tuitionPricingSchema.index(
  { subject: 1, classLevel: 1, curriculum: 1, isActive: 1 }
);

const TuitionPricing = mongoose.model<ITuitionPricing>(
  "TuitionPricing",
  tuitionPricingSchema
);

export default TuitionPricing;

