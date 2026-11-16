import mongoose, { Document, Schema } from "mongoose";

export interface ICertificate extends Document {
  certificateNumber: string; // e.g. "CERT-2026-XXXXXX"
  course: mongoose.Types.ObjectId;
  learner: mongoose.Types.ObjectId;
  enrollment: mongoose.Types.ObjectId;
  recipientName: string;
  courseTitle: string;
  providerName?: string;
  issueDate: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const certificateSchema = new Schema<ICertificate>(
  {
    certificateNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    learner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    enrollment: {
      type: Schema.Types.ObjectId,
      ref: "Enrollment",
      required: true,
      index: true,
    },
    recipientName: {
      type: String,
      required: true,
      trim: true,
    },
    courseTitle: {
      type: String,
      required: true,
      trim: true,
    },
    providerName: {
      type: String,
      trim: true,
    },
    issueDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// A student can only have 1 certificate per course enrollment
certificateSchema.index({ course: 1, learner: 1 }, { unique: true });

const Certificate = mongoose.model<ICertificate>("Certificate", certificateSchema);

export default Certificate;

