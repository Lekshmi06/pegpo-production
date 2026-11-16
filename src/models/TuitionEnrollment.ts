import mongoose, { Document, Schema } from "mongoose";
import {
  TuitionClassFormat,
  TuitionOfferingTeachingMode,
  TuitionScheduleModel,
} from "./TuitionOffering";

export type TuitionEnrollmentStatus = "active" | "completed" | "cancelled" | "paused";

export interface ITuitionEnrollment extends Document {
  studentId: mongoose.Types.ObjectId;
  providerId: mongoose.Types.ObjectId; // Assigned teacher
  teacherId?: mongoose.Types.ObjectId; // Alias for providerId
  offeringId?: mongoose.Types.ObjectId; // Optional in centralized model
  batchId?: mongoose.Types.ObjectId;
  requestId: mongoose.Types.ObjectId;
  subject: string;
  classLevel: string;
  curriculum?: string;
  classFormat: TuitionClassFormat;
  teachingMode: TuitionOfferingTeachingMode;
  scheduleModel: TuitionScheduleModel;
  scheduleDetails: {
    daysOfWeek?: string[];
    startTime?: string;
    endTime?: string;
    slotDay?: string;
  };
  hourlyRate: number; // Historical student billing rate snapshot
  teacherHourlyPayoutRate: number; // Historical teacher payout rate snapshot
  hoursPurchased: number;
  hoursRemaining: number;
  hoursCompleted: number;
  trialCompleted: boolean;
  trialRequestId?: mongoose.Types.ObjectId;
  status: TuitionEnrollmentStatus;
  feePaid: number;
  currency: string;
  paymentTransactionId: string;
  enrolledAt: Date;
  sessionsAttended: number;
  totalSessionsConducted: number;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tuitionEnrollmentSchema = new Schema<ITuitionEnrollment>(
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
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    offeringId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionOffering",
      index: true,
    },
    batchId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionBatch",
      index: true,
    },
    requestId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionRequest",
      required: true,
      unique: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    classLevel: {
      type: String,
      required: true,
      trim: true,
    },
    curriculum: {
      type: String,
      trim: true,
      default: "CBSE",
    },
    classFormat: {
      type: String,
      enum: ["1:1", "1:2", "group"],
      default: "1:1",
      required: true,
    },
    teachingMode: {
      type: String,
      enum: ["online", "offline", "hybrid"],
      default: "online",
      required: true,
    },
    scheduleModel: {
      type: String,
      enum: ["fixed_batch", "flexible_slot"],
      default: "flexible_slot",
      required: true,
    },
    scheduleDetails: {
      daysOfWeek: [{ type: String }],
      startTime: { type: String },
      endTime: { type: String },
      slotDay: { type: String },
    },
    hourlyRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    teacherHourlyPayoutRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    hoursPurchased: {
      type: Number,
      default: 0,
      min: 0,
    },
    hoursRemaining: {
      type: Number,
      default: 0,
      min: 0,
    },
    hoursCompleted: {
      type: Number,
      default: 0,
      min: 0,
    },
    trialCompleted: {
      type: Boolean,
      default: false,
    },
    trialRequestId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionRequest",
    },
    status: {
      type: String,
      enum: ["active", "completed", "cancelled", "paused"],
      default: "active",
      index: true,
    },
    feePaid: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    paymentTransactionId: {
      type: String,
      required: true,
      index: true,
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    sessionsAttended: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalSessionsConducted: {
      type: Number,
      default: 0,
      min: 0,
    },
    completedAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

tuitionEnrollmentSchema.pre("save", function (this: any) {
  if (this.providerId && !this.teacherId) {
    this.teacherId = this.providerId;
  }
  if (this.teacherId && !this.providerId) {
    this.providerId = this.teacherId;
  }
});

tuitionEnrollmentSchema.index(
  { studentId: 1, offeringId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      offeringId: { $exists: true, $type: "objectId" },
      status: "active",
    },
  }
);
tuitionEnrollmentSchema.index({ studentId: 1, status: 1 });
tuitionEnrollmentSchema.index({ providerId: 1, status: 1 });
tuitionEnrollmentSchema.index({ teacherId: 1, status: 1 });

const TuitionEnrollment = mongoose.model<ITuitionEnrollment>(
  "TuitionEnrollment",
  tuitionEnrollmentSchema
);

export default TuitionEnrollment;
