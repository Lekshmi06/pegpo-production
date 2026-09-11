import mongoose, { Document, Schema } from "mongoose";
import "./Question";

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
  sourceType?: "curriculum" | "ai_generated" | "teacher" | "system";
  studentProfileId?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  sourceId?: mongoose.Types.ObjectId;
  topic?: string;
  chapter?: string;
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
      enum: ["curriculum", "ai_generated", "teacher", "system"],
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
  },
  {
    timestamps: true,
  }
);

testSchema.index({ board: 1, classLevel: 1, subject: 1 });
testSchema.index({ isLocked: 1, status: 1 });

const Test = mongoose.model<ITest>("Test", testSchema);

export default Test;
