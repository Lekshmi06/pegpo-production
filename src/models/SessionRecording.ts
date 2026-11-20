import mongoose, { Document, Schema } from "mongoose";

export type SessionRecordingStatus =
  | "processing"
  | "ready"
  | "failed"
  | "archived"
  | "deleted";

export interface ISessionRecording extends Document {
  sessionId: mongoose.Types.ObjectId;
  enrollmentId?: mongoose.Types.ObjectId;
  requestId?: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  recordingUrl: string; // Internal/Admin-only media URI
  storageKey: string; // Path or cloud storage key
  fileSizeBytes: number;
  durationSeconds: number;
  mimeType: string;
  accessLevel: "admin_only" | "program_members" | "public";
  status: SessionRecordingStatus;
  retentionDays: number;
  expiresAt: Date; // 365 days from recording creation
  isPurged: boolean;
  purgedAt?: Date;
  purgedBy?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const sessionRecordingSchema = new Schema<ISessionRecording>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionSession",
      required: true,
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
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recordingUrl: {
      type: String,
      required: true,
      trim: true,
    },
    storageKey: {
      type: String,
      required: true,
      trim: true,
    },
    fileSizeBytes: {
      type: Number,
      default: 0,
      min: 0,
    },
    durationSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    mimeType: {
      type: String,
      default: "video/webm",
      trim: true,
    },
    accessLevel: {
      type: String,
      enum: ["admin_only", "program_members", "public"],
      default: "program_members",
      required: true,
    },
    status: {
      type: String,
      enum: ["processing", "ready", "failed", "archived", "deleted"],
      default: "ready",
      index: true,
    },
    retentionDays: {
      type: Number,
      default: 365,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      index: true,
    },
    isPurged: {
      type: Boolean,
      default: false,
      index: true,
    },
    purgedAt: {
      type: Date,
    },
    purgedBy: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

sessionRecordingSchema.index({ expiresAt: 1, isPurged: 1 });
sessionRecordingSchema.index({ sessionId: 1, accessLevel: 1 });

const SessionRecording = mongoose.model<ISessionRecording>(
  "SessionRecording",
  sessionRecordingSchema
);

export default SessionRecording;

