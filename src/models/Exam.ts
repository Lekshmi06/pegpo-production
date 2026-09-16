import mongoose, { Document, Schema } from "mongoose";

export interface IExamSection {
  id: string;
  name: string;
  subject: string;
  totalQuestions: number;
  marksPerQuestion: number;
  negativeMarks: number;
  durationMinutes?: number;
  questionTypes: Array<"mcq" | "nat" | "descriptive">;
  instructions?: string;
}

export interface IExamMarkingScheme {
  correctMarks: number;
  negativeMarks: number;
  numericalTolerance?: number;
  maxScore: number;
  cutOffScore?: number;
  sectionalCutOff?: boolean;
}

export interface IExam extends Document {
  name: string;
  code: string;
  category: string;
  conductingBody?: string;
  description: string;
  supportedSubjects: string[];
  tier?: string;
  sections: IExamSection[];
  markingScheme: IExamMarkingScheme;
  durationMinutes: number;
  questionTypes: Array<"mcq" | "nat" | "descriptive">;
  isActive: boolean;
  totalCandidatesEstimate?: number;
  syllabusOverview?: string;
  eligibility?: string;
  createdAt: Date;
  updatedAt: Date;
}

const examSectionSchema = new Schema<IExamSection>(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    totalQuestions: {
      type: Number,
      required: true,
      default: 25,
      min: 1,
    },
    marksPerQuestion: {
      type: Number,
      required: true,
      default: 1,
    },
    negativeMarks: {
      type: Number,
      required: true,
      default: 0,
    },
    durationMinutes: {
      type: Number,
      min: 0,
    },
    questionTypes: {
      type: [String],
      enum: ["mcq", "nat", "descriptive"],
      default: ["mcq"],
    },
    instructions: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const examMarkingSchemeSchema = new Schema<IExamMarkingScheme>(
  {
    correctMarks: {
      type: Number,
      required: true,
      default: 4,
    },
    negativeMarks: {
      type: Number,
      required: true,
      default: 1,
    },
    numericalTolerance: {
      type: Number,
      default: 0,
    },
    maxScore: {
      type: Number,
      required: true,
      default: 300,
    },
    cutOffScore: {
      type: Number,
      default: 90,
    },
    sectionalCutOff: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const examSchema = new Schema<IExam>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    conductingBody: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    supportedSubjects: {
      type: [String],
      required: true,
      default: [],
    },
    tier: {
      type: String,
      trim: true,
      default: "Tier 1",
    },
    sections: {
      type: [examSectionSchema],
      required: true,
      default: [],
    },
    markingScheme: {
      type: examMarkingSchemeSchema,
      required: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      default: 180,
      min: 1,
    },
    questionTypes: {
      type: [String],
      enum: ["mcq", "nat", "descriptive"],
      default: ["mcq"],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    totalCandidatesEstimate: {
      type: Number,
      default: 100000,
    },
    syllabusOverview: {
      type: String,
      trim: true,
    },
    eligibility: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Exam = mongoose.model<IExam>("Exam", examSchema);

export default Exam;
