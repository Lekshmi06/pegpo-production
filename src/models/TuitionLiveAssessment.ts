import mongoose, { Document, Schema } from "mongoose";

export type LiveAssessmentType = "quiz" | "test" | "assignment";
export type LiveAssessmentStatus = "active" | "closed";

export interface ILiveAssessmentQuestion {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex?: number;
  points: number;
}

export interface ILiveAssessmentAnswer {
  questionId: string;
  selectedOptionIndex?: number;
  textAnswer?: string;
}

export interface ILiveAssessmentSubmission {
  studentId: string;
  studentName: string;
  studentRole?: string;
  answers: ILiveAssessmentAnswer[];
  score: number;
  totalPossible: number;
  percentage: number;
  submittedAt: Date;
}

export interface ITuitionLiveAssessment extends Document {
  sessionId: string;
  programId?: mongoose.Types.ObjectId;
  homeworkId?: mongoose.Types.ObjectId;
  type: LiveAssessmentType;
  title: string;
  instructions?: string;
  timeLimitMinutes?: number;
  totalPoints: number;
  status: LiveAssessmentStatus;
  questions: ILiveAssessmentQuestion[];
  submissions: ILiveAssessmentSubmission[];
  publishedBy: string;
  publishedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<ILiveAssessmentQuestion>(
  {
    id: { type: String, required: true },
    question: { type: String, required: true, trim: true },
    options: [{ type: String, trim: true }],
    correctOptionIndex: { type: Number },
    points: { type: Number, default: 1 },
  },
  { _id: false }
);

const submissionSchema = new Schema<ILiveAssessmentSubmission>(
  {
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    studentRole: { type: String, default: "student" },
    answers: [
      {
        questionId: { type: String, required: true },
        selectedOptionIndex: { type: Number },
        textAnswer: { type: String, trim: true },
      },
    ],
    score: { type: Number, default: 0 },
    totalPossible: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const liveAssessmentSchema = new Schema<ITuitionLiveAssessment>(
  {
    sessionId: { type: String, required: true, index: true },
    programId: { type: Schema.Types.ObjectId, ref: "TuitionProgram", index: true },
    homeworkId: { type: Schema.Types.ObjectId, ref: "TuitionHomework" },
    type: {
      type: String,
      enum: ["quiz", "test", "assignment"],
      default: "quiz",
      index: true,
    },
    title: { type: String, required: true, trim: true },
    instructions: { type: String, trim: true },
    timeLimitMinutes: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 100 },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
      index: true,
    },
    questions: [questionSchema],
    submissions: [submissionSchema],
    publishedBy: { type: String, required: true },
    publishedByName: { type: String, default: "Teacher" },
  },
  { timestamps: true }
);

const TuitionLiveAssessment =
  mongoose.models.TuitionLiveAssessment ||
  mongoose.model<ITuitionLiveAssessment>("TuitionLiveAssessment", liveAssessmentSchema);

export default TuitionLiveAssessment;
