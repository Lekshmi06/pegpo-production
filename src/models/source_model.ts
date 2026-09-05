import mongoose, { Document, Schema } from "mongoose";

export type SourceType = "file";

export type SourceStatus =
  | "uploaded"
  | "processing"
  | "ready"
  | "failed";

export type AIStatus = "pending" | "processing" | "ready" | "failed";

export interface ISourceOverview {
  summary: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  readingTimeMinutes: number;
  wordCount: number;
  keyConcepts: string[];
  suggestedQuestions: string[];
}

export interface ISource extends Document {
  studentId: mongoose.Types.ObjectId;

  originalName: string;
  storedName: string;

  type: SourceType;
  mimeType: string;
  size: number;

  storagePath: string;

  status: SourceStatus;

  aiReady: boolean;
  aiStatus: AIStatus;
  aiOverview?: ISourceOverview;

  createdAt: Date;
  updatedAt: Date;
}

const sourceSchema = new Schema<ISource>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
      index: true,
    },

    originalName: {
      type: String,
      required: true,
      trim: true,
    },

    storedName: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: ["file"],
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
    },

    size: {
      type: Number,
      required: true,
    },

    storagePath: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["uploaded", "processing", "ready", "failed"],
      default: "uploaded",
      required: true,
    },

    aiReady: {
      type: Boolean,
      default: false,
    },

    aiStatus: {
      type: String,
      enum: ["pending", "processing", "ready", "failed"],
      default: "pending",
    },

    aiOverview: {
      summary: { type: String },
      difficulty: { type: String, enum: ["Beginner", "Intermediate", "Advanced"] },
      readingTimeMinutes: { type: Number },
      wordCount: { type: Number },
      keyConcepts: [{ type: String }],
      suggestedQuestions: [{ type: String }],
    },
  },
  {
    timestamps: true,
  }
);

const Source = mongoose.model<ISource>("Source", sourceSchema);

export default Source;