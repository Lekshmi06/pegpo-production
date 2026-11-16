import mongoose, { Document, Schema } from "mongoose";
import {
  TuitionClassFormat,
  TuitionOfferingTeachingMode,
  TuitionScheduleModel,
} from "./TuitionOffering";

export type TuitionRequestStatus =
  | "pending"
  | "under_review"
  | "trial_assigned"
  | "trial_in_progress"
  | "trial_completed"
  | "teacher_assigned"
  | "payment_pending"
  | "enrolled"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "expired"
  | "paid";

export type TuitionCurriculum =
  | "CBSE"
  | "ICSE"
  | "State Board"
  | "IB"
  | "Cambridge"
  | "Competitive Exam"
  | "Other";

export interface IRequestedSlot {
  day?: string;
  startTime?: string;
  endTime?: string;
  specificDate?: Date;
}

export interface ITrialSessionSlot {
  trialIndex: number; // 1, 2, 3
  teacherId?: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  scheduledDate?: Date;
  startTime?: string;
  endTime?: string;
  status: "pending_assignment" | "scheduled" | "completed" | "cancelled" | "no_show";
  attendanceStatus?: "present" | "absent" | "late";
  attendedAt?: Date;
  teacherNotes?: string;
  studentRating?: number; // 1-5 scale
  studentFeedback?: string;
  feedbackSubmittedAt?: Date;
}

export interface ITuitionPricingSnapshot {
  studentHourlyRate: number;
  teacherHourlyPayoutRate?: number;
  currency: string;
  totalHoursRequested: number;
  totalAmount: number;
}

export interface ITuitionRequest extends Document {
  studentId: mongoose.Types.ObjectId;
  // Provider and offering are optional in centralized model (retained for backward compatibility)
  providerId?: mongoose.Types.ObjectId;
  offeringId?: mongoose.Types.ObjectId;
  batchId?: mongoose.Types.ObjectId;
  scheduleModel?: TuitionScheduleModel;
  classFormat: TuitionClassFormat;
  teachingMode: TuitionOfferingTeachingMode;
  subject: string;
  classLevel?: string;
  curriculum?: TuitionCurriculum;
  learningGoals?: string;
  preferredDays?: string[];
  preferredTimeSlot?: {
    startTime?: string;
    endTime?: string;
    timezone?: string;
  };
  requestType: "trial" | "regular";
  isTrialEligible: boolean;
  trialSessions: ITrialSessionSlot[];
  preferredTeacherId?: mongoose.Types.ObjectId;
  preferredTeacherNotes?: string;
  selectedTeacherId?: mongoose.Types.ObjectId;
  assignedByAdminId?: mongoose.Types.ObjectId;
  assignedAt?: Date;
  adminNotes?: string;
  requestedSlot?: IRequestedSlot;
  studentNotes?: string;
  providerResponseNotes?: string;
  feeAmount: number;
  currency: string;
  timezone: string;
  pricingSnapshot?: ITuitionPricingSnapshot;
  status: TuitionRequestStatus;
  statusHistory: Array<{
    status: TuitionRequestStatus;
    changedAt: Date;
    note?: string;
  }>;
  simulationPaymentToken?: string;
  simulationTransactionId?: string;
  enrollmentId?: mongoose.Types.ObjectId;
  paidAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const trialSessionSlotSchema = new Schema<ITrialSessionSlot>(
  {
    trialIndex: {
      type: Number,
      enum: [1, 2, 3],
      required: true,
    },
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionSession",
    },
    scheduledDate: {
      type: Date,
    },
    startTime: {
      type: String,
      trim: true,
    },
    endTime: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "pending_assignment",
        "scheduled",
        "completed",
        "cancelled",
        "no_show",
      ],
      default: "pending_assignment",
    },
    attendanceStatus: {
      type: String,
      enum: ["present", "absent", "late"],
    },
    attendedAt: {
      type: Date,
    },
    teacherNotes: {
      type: String,
      trim: true,
    },
    studentRating: {
      type: Number,
      min: 1,
      max: 5,
    },
    studentFeedback: {
      type: String,
      trim: true,
    },
    feedbackSubmittedAt: {
      type: Date,
    },
  },
  { _id: false }
);

const tuitionRequestSchema = new Schema<ITuitionRequest>(
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
    scheduleModel: {
      type: String,
      enum: ["fixed_batch", "flexible_slot"],
      default: "flexible_slot",
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
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    classLevel: {
      type: String,
      trim: true,
    },
    curriculum: {
      type: String,
      enum: ["CBSE", "ICSE", "State Board", "IB", "Cambridge", "Competitive Exam", "Other"],
      default: "CBSE",
    },
    learningGoals: {
      type: String,
      trim: true,
    },
    preferredDays: [{ type: String }],
    preferredTimeSlot: {
      startTime: { type: String, trim: true },
      endTime: { type: String, trim: true },
      timezone: { type: String, default: "Asia/Kolkata" },
    },
    requestType: {
      type: String,
      enum: ["trial", "regular"],
      default: "trial",
      index: true,
    },
    isTrialEligible: {
      type: Boolean,
      default: true,
    },
    trialSessions: {
      type: [trialSessionSlotSchema],
      default: [],
    },
    preferredTeacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    preferredTeacherNotes: {
      type: String,
      trim: true,
    },
    selectedTeacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    assignedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    assignedAt: {
      type: Date,
    },
    adminNotes: {
      type: String,
      trim: true,
    },
    requestedSlot: {
      day: { type: String },
      startTime: { type: String },
      endTime: { type: String },
      specificDate: { type: Date },
    },
    studentNotes: {
      type: String,
      trim: true,
    },
    providerResponseNotes: {
      type: String,
      trim: true,
    },
    feeAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    pricingSnapshot: {
      studentHourlyRate: { type: Number, min: 0 },
      teacherHourlyPayoutRate: { type: Number, min: 0 },
      currency: { type: String, default: "INR" },
      totalHoursRequested: { type: Number, default: 0 },
      totalAmount: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: [
        "pending",
        "under_review",
        "trial_assigned",
        "trial_in_progress",
        "trial_completed",
        "teacher_assigned",
        "payment_pending",
        "enrolled",
        "accepted",
        "rejected",
        "cancelled",
        "expired",
        "paid",
      ],
      default: "pending",
      index: true,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
        note: { type: String },
      },
    ],
    simulationPaymentToken: {
      type: String,
      trim: true,
    },
    simulationTransactionId: {
      type: String,
      trim: true,
    },
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionEnrollment",
    },
    paidAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

tuitionRequestSchema.index(
  { studentId: 1, offeringId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      offeringId: { $exists: true, $type: "objectId" },
      status: { $in: ["pending", "accepted"] },
    },
  }
);
tuitionRequestSchema.index({ providerId: 1, status: 1 });
tuitionRequestSchema.index({ studentId: 1, status: 1 });
tuitionRequestSchema.index({ selectedTeacherId: 1, status: 1 });
tuitionRequestSchema.index({ "trialSessions.teacherId": 1 });

const TuitionRequest = mongoose.model<ITuitionRequest>(
  "TuitionRequest",
  tuitionRequestSchema
);

export default TuitionRequest;
