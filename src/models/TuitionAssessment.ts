import mongoose, { Document, Schema } from "mongoose";

export interface ITuitionSubmission {
  studentId: mongoose.Types.ObjectId;
  fileUrl?: string;
  notes?: string;
  submittedAt: Date;
  marksAwarded?: number;
  feedback?: string;
  evaluatedAt?: Date;
}

export interface ITuitionAssessment extends Document {
  providerId: mongoose.Types.ObjectId;
  offeringId: mongoose.Types.ObjectId;
  batchId?: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  totalMarks: number;
  dueDate: Date;
  submissions: ITuitionSubmission[];
  createdAt: Date;
  updatedAt: Date;
}

const tuitionAssessmentSchema = new Schema<ITuitionAssessment>(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    offeringId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionOffering",
      required: true,
      index: true,
    },
    batchId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionBatch",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    totalMarks: {
      type: Number,
      required: true,
      min: 1,
      default: 100,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    submissions: [
      {
        studentId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        fileUrl: { type: String, trim: true },
        notes: { type: String, trim: true },
        submittedAt: { type: Date, default: Date.now },
        marksAwarded: { type: Number, min: 0 },
        feedback: { type: String, trim: true },
        evaluatedAt: { type: Date },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const TuitionAssessment = mongoose.model<ITuitionAssessment>(
  "TuitionAssessment",
  tuitionAssessmentSchema
);

export default TuitionAssessment;
