import mongoose, { Document, Schema } from "mongoose";

export type CombinedStudyMessageType = "text" | "pdf" | "image" | "video";

export interface ICombinedStudyMessage extends Document {
  programId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  senderRole: "student" | "teacher" | "institution" | "admin";
  senderName: string;
  messageType: CombinedStudyMessageType;
  content?: string;
  fileUrl?: string;
  fileKey?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const combinedStudyMessageSchema = new Schema<ICombinedStudyMessage>(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionProgram",
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    senderRole: {
      type: String,
      enum: ["student", "teacher", "institution", "admin"],
      required: true,
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
    },
    messageType: {
      type: String,
      enum: ["text", "pdf", "image", "video"],
      required: true,
      default: "text",
    },
    content: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    fileUrl: {
      type: String,
      trim: true,
    },
    fileKey: {
      type: String,
      trim: true,
    },
    fileName: {
      type: String,
      trim: true,
    },
    fileSize: {
      type: Number,
      min: 0,
    },
    mimeType: {
      type: String,
      trim: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + ONE_YEAR_MS),
    },
  },
  {
    timestamps: true,
  }
);

combinedStudyMessageSchema.index({ programId: 1, createdAt: 1 });
combinedStudyMessageSchema.index({ expiresAt: 1 });

const CombinedStudyMessage = mongoose.model<ICombinedStudyMessage>(
  "CombinedStudyMessage",
  combinedStudyMessageSchema
);

export default CombinedStudyMessage;
