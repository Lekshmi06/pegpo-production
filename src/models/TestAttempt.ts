import mongoose, { Document, Schema } from "mongoose";
import "./Test";
import "./Question";

export type QuestionAttemptStatus = "attempted" | "revise" | "skipped";

export interface ITestAnswerItem {
  questionId: mongoose.Types.ObjectId;
  selectedOption?: string;
  status: QuestionAttemptStatus;
  isCorrect?: boolean;
  marksAwarded: number;
}

export interface ITestAttempt extends Document {
  testId: mongoose.Types.ObjectId;
  studentProfileId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: Date;
  completedAt?: Date;
  timeSpentSeconds: number;
  answers: ITestAnswerItem[];
  attemptedCount: number;
  reviseCount: number;
  skippedCount: number;
  correctCount: number;
  incorrectCount: number;
  score: number;
  maxScore: number;
  percentage: number;
  accuracy: number;
  createdAt: Date;
  updatedAt: Date;
}

const testAnswerItemSchema = new Schema<ITestAnswerItem>(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    selectedOption: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["attempted", "revise", "skipped"],
      default: "skipped",
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
    marksAwarded: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const testAttemptSchema = new Schema<ITestAttempt>(
  {
    testId: {
      type: Schema.Types.ObjectId,
      ref: "Test",
      required: true,
      index: true,
    },
    studentProfileId: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["in_progress", "completed", "abandoned"],
      default: "in_progress",
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
    timeSpentSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    answers: {
      type: [testAnswerItemSchema],
      default: [],
    },
    attemptedCount: {
      type: Number,
      default: 0,
    },
    reviseCount: {
      type: Number,
      default: 0,
    },
    skippedCount: {
      type: Number,
      default: 0,
    },
    correctCount: {
      type: Number,
      default: 0,
    },
    incorrectCount: {
      type: Number,
      default: 0,
    },
    score: {
      type: Number,
      default: 0,
    },
    maxScore: {
      type: Number,
      default: 0,
    },
    percentage: {
      type: Number,
      default: 0,
    },
    accuracy: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

testAttemptSchema.index({ studentProfileId: 1, testId: 1, createdAt: -1 });

const TestAttempt = mongoose.model<ITestAttempt>(
  "TestAttempt",
  testAttemptSchema
);

export default TestAttempt;
