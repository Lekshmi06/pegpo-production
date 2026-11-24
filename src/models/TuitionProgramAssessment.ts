import mongoose, { Document, Schema } from "mongoose";

export interface IMCQQuestion {
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  marks?: number;
  explanation?: string;
}

export interface IMCQStudentAnswer {
  questionIndex: number;
  questionText?: string;
  selectedOptionIndex: number;
  isCorrect: boolean;
  marksAwarded: number;
}

export interface IAssessmentSubmission {
  _id?: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  studentName?: string;
  studentCode?: string;
  studentEmail?: string;
  submittedAt: Date;
  // MCQ Test fields
  answers?: IMCQStudentAnswer[];
  score?: number;
  totalMarks?: number;
  percentage?: number;
  // Assignment / Homework fields
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  notes?: string;
  grade?: number;
  feedback?: string;
  gradedAt?: Date;
  gradedBy?: mongoose.Types.ObjectId;
}

export interface ITuitionProgramAssessment extends Document {
  programId: mongoose.Types.ObjectId;
  assignedBy: mongoose.Types.ObjectId;
  assignedByName?: string;
  type: "mcq_test" | "assignment";
  title: string;
  subject?: string;
  topic?: string;
  instructions?: string;
  durationMinutes?: number;
  dueDate?: Date;
  referenceFileUrl?: string;
  referenceFileName?: string;
  totalMarks: number;
  questions: IMCQQuestion[];
  submissions: IAssessmentSubmission[];
  status: "active" | "closed";
  createdAt: Date;
  updatedAt: Date;
}

const mcqQuestionSchema = new Schema<IMCQQuestion>(
  {
    questionText: { type: String, required: true, trim: true },
    options: [{ type: String, trim: true }],
    correctOptionIndex: { type: Number, required: true, default: 0 },
    marks: { type: Number, default: 1, min: 0 },
    explanation: { type: String, trim: true },
  },
  { _id: false }
);

const submissionAnswerSchema = new Schema<IMCQStudentAnswer>(
  {
    questionIndex: { type: Number, required: true },
    questionText: { type: String, trim: true },
    selectedOptionIndex: { type: Number, required: true },
    isCorrect: { type: Boolean, required: true },
    marksAwarded: { type: Number, default: 0 },
  },
  { _id: false }
);

const assessmentSubmissionSchema = new Schema<IAssessmentSubmission>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentName: { type: String, trim: true },
    studentCode: { type: String, trim: true },
    studentEmail: { type: String, trim: true },
    submittedAt: { type: Date, default: Date.now },
    // MCQ fields
    answers: [submissionAnswerSchema],
    score: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    // Assignment fields
    fileUrl: { type: String, trim: true },
    fileName: { type: String, trim: true },
    fileSize: { type: Number },
    notes: { type: String, trim: true },
    grade: { type: Number, min: 0 },
    feedback: { type: String, trim: true },
    gradedAt: { type: Date },
    gradedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true }
);

const tuitionProgramAssessmentSchema = new Schema<ITuitionProgramAssessment>(
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
    assignedByName: { type: String, trim: true },
    type: {
      type: String,
      enum: ["mcq_test", "assignment"],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    subject: { type: String, trim: true },
    topic: { type: String, trim: true },
    instructions: { type: String, trim: true },
    durationMinutes: { type: Number, default: 30 },
    dueDate: { type: Date },
    referenceFileUrl: { type: String, trim: true },
    referenceFileName: { type: String, trim: true },
    totalMarks: { type: Number, default: 100 },
    questions: [mcqQuestionSchema],
    submissions: [assessmentSubmissionSchema],
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.TuitionProgramAssessment ||
  mongoose.model<ITuitionProgramAssessment>(
    "TuitionProgramAssessment",
    tuitionProgramAssessmentSchema
  );
