import mongoose, { Document, Schema } from "mongoose";

export interface IStudySession extends Document {
  userId: mongoose.Types.ObjectId;
  studentProfileId?: mongoose.Types.ObjectId;
  activityType: "practice" | "reading" | "video" | "note_taking" | "general";
  subject?: string;
  durationSeconds: number; // Active study time in seconds (idle time excluded)
  startedAt: Date;
  endedAt: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const studySessionSchema = new Schema<IStudySession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentProfileId: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
      index: true,
    },
    activityType: {
      type: String,
      enum: ["practice", "reading", "video", "note_taking", "general"],
      default: "general",
    },
    subject: {
      type: String,
      trim: true,
      default: "General",
    },
    durationSeconds: {
      type: Number,
      required: true,
      min: 0,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: Date.now,
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

studySessionSchema.index({ userId: 1, startedAt: -1 });

const StudySession = mongoose.model<IStudySession>("StudySession", studySessionSchema);

export default StudySession;
