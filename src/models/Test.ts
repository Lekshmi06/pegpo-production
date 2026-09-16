import mongoose, { Document, Schema } from "mongoose";
import "./Question";

export interface ITestSection {
  id: string;
  name: string;
  subject: string;
  totalQuestions: number;
  marksPerQuestion: number;
  negativeMarks: number;
  passingMarks?: number;
  durationMinutes?: number;
  questionIds?: mongoose.Types.ObjectId[];
}

export interface ITest extends Document {
  title: string;
  description: string;
  subject: string;
  board: string;
  classLevel: string;
  durationMinutes: number;
  isUntimed?: boolean;
  totalMarks: number;
  passingMarks: number;
  isLocked: boolean;
  category: string;
  questions: mongoose.Types.ObjectId[];
  status: "draft" | "published" | "archived";
  sourceType?: "curriculum" | "ai_generated" | "teacher" | "system" | "previous_year";
  studentProfileId?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  sourceId?: mongoose.Types.ObjectId;
  topic?: string;
  chapter?: string;
  isCompetitiveExam?: boolean;
  examCategory?: string;
  examCode?: string;
  examTier?: string;
  sections?: ITestSection[];
  negativeMarkingRate?: number;
  isPYQ?: boolean;
  pyqYear?: number;
  totalCandidatesEstimate?: number;
  cutOffScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

const testSchema = new Schema<ITest>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      default: "Science",
    },
    board: {
      type: String,
      required: true,
      trim: true,
      default: "CBSE",
    },
    classLevel: {
      type: String,
      required: true,
      trim: true,
      default: "Class 10",
    },
    durationMinutes: {
      type: Number,
      required: true,
      default: 15,
      min: 0,
    },
    isUntimed: {
      type: Boolean,
      default: false,
    },
    totalMarks: {
      type: Number,
      default: 0,
    },
    passingMarks: {
      type: Number,
      default: 0,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    category: {
      type: String,
      trim: true,
      default: "CBSE Class 10",
    },
    questions: [
      {
        type: Schema.Types.ObjectId,
        ref: "Question",
      },
    ],
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "published",
    },
    sourceType: {
      type: String,
      enum: ["curriculum", "ai_generated", "teacher", "system", "previous_year"],
      default: "curriculum",
    },
    studentProfileId: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    sourceId: {
      type: Schema.Types.ObjectId,
      ref: "Source",
    },
    topic: {
      type: String,
      trim: true,
    },
    chapter: {
      type: String,
      trim: true,
    },
    isCompetitiveExam: {
      type: Boolean,
      default: false,
      index: true,
    },
    examCategory: {
      type: String,
      trim: true,
      index: true,
    },
    examCode: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    examTier: {
      type: String,
      trim: true,
    },
    sections: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        subject: { type: String, required: true },
        totalQuestions: { type: Number, required: true, default: 0 },
        marksPerQuestion: { type: Number, required: true, default: 1 },
        negativeMarks: { type: Number, required: true, default: 0 },
        passingMarks: { type: Number },
        durationMinutes: { type: Number },
        questionIds: [{ type: Schema.Types.ObjectId, ref: "Question" }],
      },
    ],
    negativeMarkingRate: {
      type: Number,
      default: 0,
    },
    isPYQ: {
      type: Boolean,
      default: false,
      index: true,
    },
    pyqYear: {
      type: Number,
    },
    totalCandidatesEstimate: {
      type: Number,
      default: 25000,
    },
    cutOffScore: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

testSchema.index({ board: 1, classLevel: 1, subject: 1 });
testSchema.index({ isLocked: 1, status: 1 });

const Test = mongoose.model<ITest>("Test", testSchema);

export default Test;
