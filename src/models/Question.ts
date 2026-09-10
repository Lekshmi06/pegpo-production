import mongoose, { Document, Schema } from "mongoose";

export interface IQuestionOption {
  id: "A" | "B" | "C" | "D" | string;
  text: string;
}

export interface IQuestion extends Document {
  testId?: mongoose.Types.ObjectId;
  question: string;
  sidebarTitle?: string;
  options: IQuestionOption[];
  correctAnswer: string;
  explanation: string;
  marks: number;
  order: number;
  subject?: string;
  board?: string;
  classLevel?: string;
  createdAt: Date;
  updatedAt: Date;
}

const questionOptionSchema = new Schema<IQuestionOption>(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const questionSchema = new Schema<IQuestion>(
  {
    testId: {
      type: Schema.Types.ObjectId,
      ref: "Test",
      index: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
    },
    sidebarTitle: {
      type: String,
      trim: true,
    },
    options: {
      type: [questionOptionSchema],
      required: true,
      validate: [
        (val: IQuestionOption[]) => val && val.length >= 2,
        "Question must have at least 2 options",
      ],
    },
    correctAnswer: {
      type: String,
      required: true,
      trim: true,
    },
    explanation: {
      type: String,
      required: true,
      trim: true,
    },
    marks: {
      type: Number,
      default: 1,
      min: 0,
    },
    order: {
      type: Number,
      default: 1,
    },
    subject: {
      type: String,
      trim: true,
    },
    board: {
      type: String,
      trim: true,
      default: "CBSE",
    },
    classLevel: {
      type: String,
      trim: true,
      default: "Class 10",
    },
  },
  {
    timestamps: true,
  }
);

const Question = mongoose.model<IQuestion>("Question", questionSchema);

export default Question;
