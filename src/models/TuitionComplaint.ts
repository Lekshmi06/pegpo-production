import mongoose, { Document, Schema } from "mongoose";
import crypto from "crypto";

export type ComplaintCategory =
  | "Academic / Class"
  | "Conduct / Behavior"
  | "Technical / SmartBoard"
  | "Schedule / Billing"
  | "Other";

export type ComplaintStatus = "open" | "in_review" | "resolved" | "closed";

export interface IAdminProgressNote {
  message: string;
  updatedBy?: string;
  updatedAt: Date;
}

export interface ITuitionComplaint extends Document {
  ticketCode: string;
  isAnonymous: boolean;
  reporterId: mongoose.Types.ObjectId;
  reporterRole: "student" | "teacher";
  category: ComplaintCategory;
  subject: string;
  description: string;
  programId?: mongoose.Types.ObjectId;
  status: ComplaintStatus;
  adminProgressNotes: IAdminProgressNote[];
  createdAt: Date;
  updatedAt: Date;
}

export function generateComplaintTicketCode(prefix = "CMP"): string {
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${rand}`;
}

const tuitionComplaintSchema = new Schema<ITuitionComplaint>(
  {
    ticketCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      default: () => generateComplaintTicketCode(),
      index: true,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
      index: true,
    },
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reporterRole: {
      type: String,
      enum: ["student", "teacher"],
      required: true,
      default: "student",
    },
    category: {
      type: String,
      enum: [
        "Academic / Class",
        "Conduct / Behavior",
        "Technical / SmartBoard",
        "Schedule / Billing",
        "Other",
      ],
      required: true,
      default: "Other",
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    programId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionProgram",
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "in_review", "resolved", "closed"],
      default: "open",
      index: true,
    },
    adminProgressNotes: [
      {
        message: { type: String, required: true, trim: true },
        updatedBy: { type: String, trim: true },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const TuitionComplaint =
  mongoose.models.TuitionComplaint ||
  mongoose.model<ITuitionComplaint>("TuitionComplaint", tuitionComplaintSchema);

export default TuitionComplaint;
