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

export interface IAssessmentUsages {
  studyMaterial: boolean;
  practice: boolean;
  scheduledTest: boolean;
}

export interface IAssessmentSchedule {
  teachingContextId?: mongoose.Types.ObjectId;
  scheduledDate?: Date;
  startTime?: string;
  endTime?: string;
  startDate?: Date;
  endDate?: Date;
  timezoneOffset?: number;
  batchOrSection?: string;
  targetGroups?: mongoose.Types.ObjectId[];
  instructions?: string;
}

export interface IOriginalDocumentReference {
  storageType: "local" | "s3" | "gcs" | "azure";
  fileName: string;
  fileKey: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  uploadedAt: Date;
  extractedText?: string;
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
  teacherProfileId?: mongoose.Types.ObjectId;
  teachingContextId?: mongoose.Types.ObjectId;
  targetClassSectionIds?: mongoose.Types.ObjectId[];
  usages?: IAssessmentUsages;
  schedule?: IAssessmentSchedule;
  resultsPublished?: boolean;
  originalDocument?: IOriginalDocumentReference;
  sourceFormat?: "ai_generated" | "uploaded_document" | "pdf" | "docx" | "doc" | "txt" | "manual";
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
    teacherProfileId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherProfile",
      index: true,
    },
    teachingContextId: {
      type: Schema.Types.ObjectId,
      ref: "TeachingContext",
      index: true,
    },
    targetClassSectionIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "ClassSection",
        index: true,
      },
    ],
    usages: {
      studyMaterial: { type: Boolean, default: false },
      practice: { type: Boolean, default: false },
      scheduledTest: { type: Boolean, default: false },
    },
    schedule: {
      teachingContextId: { type: Schema.Types.ObjectId, ref: "TeachingContext" },
      scheduledDate: { type: Date },
      startTime: { type: String, trim: true },
      endTime: { type: String, trim: true },
      startDate: { type: Date },
      endDate: { type: Date },
      timezoneOffset: { type: Number },
      batchOrSection: { type: String, trim: true },
      targetGroups: [
        {
          type: Schema.Types.ObjectId,
          ref: "ClassSection",
        },
      ],
      instructions: { type: String, trim: true },
    },
    resultsPublished: { type: Boolean, default: false },
    originalDocument: {
      type: {
        storageType: {
          type: String,
          enum: ["local", "s3", "gcs", "azure"],
          default: "local",
        },
        fileName: { type: String, trim: true },
        fileKey: { type: String, trim: true },
        fileUrl: { type: String, trim: true },
        mimeType: { type: String, trim: true },
        fileSize: { type: Number },
        uploadedAt: { type: Date, default: Date.now },
        extractedText: { type: String },
      },
      default: undefined,
      required: false,
      _id: false,
    },
    sourceFormat: {
      type: String,
      enum: ["ai_generated", "uploaded_document", "pdf", "docx", "doc", "txt", "manual"],
      default: "ai_generated",
    },
  },
  {
    timestamps: true,
  }
);

testSchema.index({ board: 1, classLevel: 1, subject: 1 });
testSchema.index({ isLocked: 1, status: 1 });
testSchema.index({ teacherProfileId: 1, createdAt: -1 });
testSchema.index({ "usages.studyMaterial": 1, subject: 1, classLevel: 1 });
testSchema.index({ "usages.practice": 1, subject: 1, classLevel: 1 });
testSchema.index({ "usages.scheduledTest": 1, "schedule.scheduledDate": 1 });

const Test = mongoose.model<ITest>("Test", testSchema);

export default Test;
