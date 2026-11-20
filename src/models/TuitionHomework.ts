import mongoose, { Document, Schema } from "mongoose";

export interface IHomeworkSubmission {
  studentId: mongoose.Types.ObjectId;
  studentName?: string;
  studentCode?: string;
  submittedAt: Date;
  content?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  status: "submitted" | "graded" | "returned";
  grade?: number;
  feedback?: string;
  gradedAt?: Date;
  gradedBy?: mongoose.Types.ObjectId;
}

export interface ITuitionHomework extends Document {
  programId: mongoose.Types.ObjectId;
  assignedBy: mongoose.Types.ObjectId;
  teacherName?: string;
  title: string;
  description: string;
  subject?: string;
  dueDate: Date;
  attachments: Array<{
    name: string;
    url: string;
    size?: number;
    type?: string;
  }>;
  totalPoints: number;
  submissions: IHomeworkSubmission[];
  createdAt: Date;
  updatedAt: Date;
}

const submissionSchema = new Schema<IHomeworkSubmission>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentName: { type: String, trim: true },
    studentCode: { type: String, trim: true },
    submittedAt: { type: Date, default: Date.now },
    content: { type: String, trim: true },
    attachmentUrl: { type: String, trim: true },
    attachmentName: { type: String, trim: true },
    status: {
      type: String,
      enum: ["submitted", "graded", "returned"],
      default: "submitted",
    },
    grade: { type: Number, min: 0 },
    feedback: { type: String, trim: true },
    gradedAt: { type: Date },
    gradedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true }
);

const tuitionHomeworkSchema = new Schema<ITuitionHomework>(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionProgram",
      required: true,
      index: true,
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    teacherName: { type: String, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    subject: { type: String, trim: true },
    dueDate: { type: Date, required: true },
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        size: { type: Number },
        type: { type: String },
      },
    ],
    totalPoints: { type: Number, default: 100 },
    submissions: [submissionSchema],
  },
  { timestamps: true }
);

export default mongoose.models.TuitionHomework ||
  mongoose.model<ITuitionHomework>("TuitionHomework", tuitionHomeworkSchema);
