import mongoose, { Document, Schema } from "mongoose";

export type TuitionSessionStatus = "scheduled" | "live" | "completed" | "cancelled";
export type TuitionMeetingProvider =
  | "edupye_smartboard"
  | "custom_link"
  | "zoom_extensible"
  | "teams_extensible";
export type TuitionSessionType = "regular" | "trial";

export interface ITuitionSession extends Document {
  offeringId?: mongoose.Types.ObjectId; // Optional in centralized 1:1 model
  batchId?: mongoose.Types.ObjectId;
  enrollmentId?: mongoose.Types.ObjectId;
  requestId?: mongoose.Types.ObjectId;
  providerId: mongoose.Types.ObjectId; // Assigned teacher
  teacherId?: mongoose.Types.ObjectId; // Alias for providerId
  studentIds: mongoose.Types.ObjectId[];
  title: string;
  topic?: string;
  subject?: string;
  curriculum?: string;
  sessionDate: Date;
  startTime: string; // "18:00"
  endTime: string; // "19:00"
  durationMinutes: number; // e.g. 30 for trials, 60 for regular
  isTrial: boolean;
  trialIndex?: number;
  sessionType: TuitionSessionType;
  hourlyRate?: number; // Historical student rate snapshot
  teacherPayoutRate?: number; // Historical teacher payout rate snapshot
  status: TuitionSessionStatus;
  meetingProvider: TuitionMeetingProvider;
  meetingLink?: string;
  timezone: string;
  notes?: string;
  startedAt?: Date;
  endedAt?: Date;
  scheduledEndTime?: Date;
  autoEndedAt?: Date;
  isForceLoggedOut?: boolean;
  forceLogoutReason?: string;
  recordingId?: mongoose.Types.ObjectId;
  hasRecording: boolean;
  payoutId?: mongoose.Types.ObjectId;
  attendanceId?: mongoose.Types.ObjectId;
  rescheduledFromSessionId?: mongoose.Types.ObjectId;
  rescheduleReason?: string;
  cancelledAt?: Date;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tuitionSessionSchema = new Schema<ITuitionSession>(
  {
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
    studentIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    title: {
      type: String,
      required: true,
      trim: true,
    },
    topic: {
      type: String,
      trim: true,
    },
    subject: {
      type: String,
      trim: true,
    },
    curriculum: {
      type: String,
      trim: true,
      default: "CBSE",
    },
    sessionDate: {
      type: Date,
      required: true,
      index: true,
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
    durationMinutes: {
      type: Number,
      default: 60,
      min: 15,
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
    sessionType: {
      type: String,
      enum: ["regular", "trial"],
      default: "regular",
      index: true,
    },
    hourlyRate: {
      type: Number,
      min: 0,
    },
    teacherPayoutRate: {
      type: Number,
      min: 0,
    },
    status: {
      type: String,
      enum: ["scheduled", "live", "completed", "cancelled"],
      default: "scheduled",
      index: true,
    },
    meetingProvider: {
      type: String,
      enum: ["edupye_smartboard", "custom_link", "zoom_extensible", "teams_extensible"],
      default: "edupye_smartboard",
    },
    meetingLink: {
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    recordingId: {
      type: Schema.Types.ObjectId,
      ref: "SessionRecording",
    },
    hasRecording: {
      type: Boolean,
      default: false,
    },
    payoutId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherPayout",
    },
    attendanceId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionAttendance",
    },
    rescheduledFromSessionId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionSession",
    },
    rescheduleReason: {
      type: String,
      trim: true,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    startedAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
    scheduledEndTime: {
      type: Date,
      index: true,
    },
    autoEndedAt: {
      type: Date,
    },
    isForceLoggedOut: {
      type: Boolean,
      default: false,
    },
    forceLogoutReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

tuitionSessionSchema.pre("save", function (this: any) {
  if (this.providerId && !this.teacherId) {
    this.teacherId = this.providerId;
  }
  if (this.teacherId && !this.providerId) {
    this.providerId = this.teacherId;
  }
  if (this.isTrial) {
    this.sessionType = "trial";
    if (!this.durationMinutes || this.durationMinutes === 60) {
      this.durationMinutes = 30;
    }
  }
});

tuitionSessionSchema.index({ providerId: 1, sessionDate: 1 });
tuitionSessionSchema.index({ teacherId: 1, sessionDate: 1 });
tuitionSessionSchema.index({ studentIds: 1, sessionDate: 1 });
tuitionSessionSchema.index({ batchId: 1, sessionDate: 1 });
tuitionSessionSchema.index({ isTrial: 1, status: 1 });

const TuitionSession = mongoose.model<ITuitionSession>(
  "TuitionSession",
  tuitionSessionSchema
);

export default TuitionSession;
