import mongoose, { Document, Schema } from "mongoose";

export type TuitionBatchStatus = "upcoming" | "active" | "completed" | "cancelled";

export interface ITuitionBatch extends Document {
  offeringId: mongoose.Types.ObjectId;
  providerId: mongoose.Types.ObjectId;
  title: string;
  subject?: string;
  classLevel?: string;
  teachingMode?: "online" | "offline" | "hybrid";
  daysOfWeek: string[];
  startTime: string; // "18:00"
  endTime: string; // "19:30"
  maxCapacity: number;
  enrolledCount: number;
  timezone: string;
  startDate: Date;
  endDate?: Date;
  status: TuitionBatchStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tuitionBatchSchema = new Schema<ITuitionBatch>(
  {
    offeringId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionOffering",
      required: true,
      index: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
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
      trim: true,
      index: true,
    },
    classLevel: {
      type: String,
      trim: true,
    },
    teachingMode: {
      type: String,
      enum: ["online", "offline", "hybrid"],
      default: "online",
    },
    daysOfWeek: {
      type: [String],
      required: true,
    },
    startTime: {
      type: String,
      required: true,
      trim: true,
    },
    endTime: {
      type: String,
      required: true,
      trim: true,
    },
    maxCapacity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    enrolledCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["upcoming", "active", "completed", "cancelled"],
      default: "active",
      index: true,
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

tuitionBatchSchema.index({ offeringId: 1, status: 1 });
tuitionBatchSchema.index({ providerId: 1, status: 1 });

const TuitionBatch = mongoose.model<ITuitionBatch>("TuitionBatch", tuitionBatchSchema);

export default TuitionBatch;

