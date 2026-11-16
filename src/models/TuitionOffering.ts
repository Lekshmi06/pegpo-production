import mongoose, { Document, Schema } from "mongoose";

export type TuitionClassFormat = "1:1" | "1:2" | "group" | "1:N";
export type TuitionOfferingTeachingMode = "online" | "offline" | "hybrid";
export type TuitionScheduleModel = "fixed_batch" | "flexible_slot";
export type TuitionBillingUnit = "per_session" | "monthly" | "batch" | "hourly";
export type TuitionOfferingStatus = "published" | "draft" | "archived";

export interface IOfferingTimeSlot {
  day: string; // e.g. "Monday"
  startTime: string; // "17:00"
  endTime: string; // "18:00"
}

export interface ITuitionOffering extends Document {
  providerId: mongoose.Types.ObjectId; // User ID of the tuition provider
  providerProfileId: mongoose.Types.ObjectId; // Ref to TuitionProviderProfile
  title: string;
  subject: string;
  classLevel: string; // e.g. "Class 10", "Grade 12", "Undergraduate"
  description: string;
  teachingMode: TuitionOfferingTeachingMode;
  classFormat: TuitionClassFormat;
  scheduleModel: TuitionScheduleModel;
  maxCapacity: number;
  feeAmount: number;
  billingUnit: TuitionBillingUnit;
  currency: string;
  availableDays: string[];
  timeSlots: IOfferingTimeSlot[];
  startDate?: Date;
  durationWeeks?: number;
  duration?: string;
  totalSessionsPlanned?: number;
  status: TuitionOfferingStatus;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const tuitionOfferingSchema = new Schema<ITuitionOffering>(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    providerProfileId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionProviderProfile",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    classLevel: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    teachingMode: {
      type: String,
      enum: ["online", "offline", "hybrid"],
      default: "online",
      index: true,
    },
    classFormat: {
      type: String,
      enum: ["1:1", "1:2", "group", "1:N"],
      required: true,
      index: true,
    },
    scheduleModel: {
      type: String,
      enum: ["fixed_batch", "flexible_slot"],
      default: "fixed_batch",
      index: true,
    },
    maxCapacity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    feeAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    billingUnit: {
      type: String,
      enum: ["per_session", "monthly", "batch", "hourly"],
      default: "monthly",
    },
    currency: {
      type: String,
      default: "INR",
    },
    availableDays: [{ type: String, trim: true }],
    timeSlots: [
      {
        day: { type: String, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
      },
    ],
    startDate: { type: Date },
    durationWeeks: { type: Number, min: 1 },
    duration: { type: String, trim: true },
    totalSessionsPlanned: { type: Number, min: 1 },
    status: {
      type: String,
      enum: ["published", "draft", "archived"],
      default: "published",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

tuitionOfferingSchema.index({
  providerId: 1,
  subject: 1,
  classLevel: 1,
  isActive: 1,
});
tuitionOfferingSchema.index({ providerId: 1, status: 1 });
tuitionOfferingSchema.index({ status: 1, isActive: 1 });
tuitionOfferingSchema.index({ feeAmount: 1 });

const TuitionOffering = mongoose.model<ITuitionOffering>(
  "TuitionOffering",
  tuitionOfferingSchema
);

export default TuitionOffering;

