import mongoose, { Document, Schema } from "mongoose";

export interface IQuestionOption {
  id: "A" | "B" | "C" | "D" | string;
  text: string;
}

export type QuestionType = "mcq" | "nat" | "descriptive";
export type QuestionSourceType =
  | "previous_year"
  | "curriculum"
  | "ai_generated"
  | "teacher"
  | "system";

export interface IQuestion extends Document {
  testId?: mongoose.Types.ObjectId;
  question: string;
  sidebarTitle?: string;
  questionType: QuestionType;
  options: IQuestionOption[];
  correctAnswer: string;
  numericalAnswer?: number;
  numericalTolerance?: number;
  explanation: string;
  marks: number;
  negativeMarks?: number;
  order: number;
  subject?: string;
  board?: string;
  classLevel?: string;
  hint?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  topic?: string;
  chapter?: string;
  stepByStepSolution?: string[];

  // PYQ & Competitive exam metadata
  sourceType: QuestionSourceType;
  sourceYear?: number;
  sourceExam?: string; // e.g. "JEE_MAIN", "NEET_UG", "SSC_CGL", "BANKING_IBPS_PO", "UPSC_CSE"
  sourceShift?: string; // e.g. "27 Jan Shift 1", "Session 1 Morning"
  sourceReference?: string; // e.g. "JEE Main 2024 Session 1 Q.14"
  isVerifiedSource?: boolean;
  sectionId?: string;
  sectionName?: string;

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
    questionType: {
      type: String,
      enum: ["mcq", "nat", "descriptive"],
      default: "mcq",
      index: true,
    },
    options: {
      type: [questionOptionSchema],
      default: [],
      validate: [
        function (this: any, val: IQuestionOption[]) {
          if (this.questionType === "nat" || this.questionType === "descriptive") {
            return true;
          }
          return Array.isArray(val) && val.length >= 2;
        },
        "Multiple choice questions must have at least 2 options",
      ],
    },
    correctAnswer: {
      type: String,
      trim: true,
      default: "",
    },
    numericalAnswer: {
      type: Number,
    },
    numericalTolerance: {
      type: Number,
      default: 0,
      min: 0,
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
    negativeMarks: {
      type: Number,
      default: 0,
    },
    order: {
      type: Number,
      default: 1,
    },
    subject: {
      type: String,
      trim: true,
      index: true,
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
    hint: {
      type: String,
      trim: true,
    },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      default: "Medium",
    },
    topic: {
      type: String,
      trim: true,
      index: true,
    },
    chapter: {
      type: String,
      trim: true,
    },
    stepByStepSolution: {
      type: [String],
      default: [],
    },

    // PYQ & Competitive exam metadata
    sourceType: {
      type: String,
      enum: ["previous_year", "curriculum", "ai_generated", "teacher", "system"],
      default: "curriculum",
      index: true,
    },
    sourceYear: {
      type: Number,
      index: true,
    },
    sourceExam: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    sourceShift: {
      type: String,
      trim: true,
    },
    sourceReference: {
      type: String,
      trim: true,
    },
    isVerifiedSource: {
      type: Boolean,
      default: false,
      index: true,
    },
    sectionId: {
      type: String,
      trim: true,
    },
    sectionName: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

questionSchema.index({ sourceType: 1, sourceExam: 1, sourceYear: 1 });
questionSchema.index({ sourceType: 1, subject: 1, topic: 1 });

const Question = mongoose.model<IQuestion>("Question", questionSchema);

export default Question;
