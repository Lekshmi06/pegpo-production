import mongoose, { Document, Schema } from "mongoose";

export type SessionChatSenderRole = "teacher" | "student" | "system" | "admin";

export interface ISessionChat extends Document {
  sessionId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  senderRole: SessionChatSenderRole;
  senderName?: string;
  message: string;
  timestamp: Date;
  expiresAt: Date; // 365 days retention
  isPurged: boolean;
  purgedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sessionChatSchema = new Schema<ISessionChat>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionSession",
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
      enum: ["teacher", "student", "system", "admin"],
      required: true,
    },
    senderName: {
      type: String,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
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
  },
  {
    timestamps: true,
  }
);

sessionChatSchema.index({ sessionId: 1, timestamp: 1 });
sessionChatSchema.index({ expiresAt: 1, isPurged: 1 });

const SessionChat = mongoose.model<ISessionChat>(
  "SessionChat",
  sessionChatSchema
);

export default SessionChat;

