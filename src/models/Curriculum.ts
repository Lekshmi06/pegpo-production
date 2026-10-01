import mongoose, { Document, Schema } from "mongoose";

export type CurriculumSourceType = "uploaded_file" | "manual";
export type CurriculumStatus = "uploaded" | "processing" | "processed" | "failed";

export interface ICurriculumChapter {
  title: string;
  topics: string[];
}

export interface ICurriculumUnit {
  unitNumber: number;
  title: string;
  chapters: ICurriculumChapter[];
}

export interface ICurriculum extends Document {
  teacherId: mongoose.Types.ObjectId;
  contextId: mongoose.Types.ObjectId;
  title: string;
  subject: string;
  board: string;
  classLevel: string;
  academicYear: string;
  sourceType: CurriculumSourceType;
  fileUrl?: string;
  originalFileName?: string;
  extractedText?: string;
  units: ICurriculumUnit[];
  status: CurriculumStatus;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const curriculumChapterSchema = new Schema<ICurriculumChapter>(
  {
    title: { type: String, required: true, trim: true },
    topics: { type: [String], default: [] },
  },
  { _id: false }
);

const curriculumUnitSchema = new Schema<ICurriculumUnit>(
  {
    unitNumber: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    chapters: { type: [curriculumChapterSchema], default: [] },
  },
  { _id: false }
);

const curriculumSchema = new Schema<ICurriculum>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherProfile",
      required: true,
      index: true,
    },
    contextId: {
      type: Schema.Types.ObjectId,
      ref: "TeachingContext",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
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
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      default: "2026-2027",
    },
    sourceType: {
      type: String,
      enum: ["uploaded_file", "manual"],
      default: "uploaded_file",
      required: true,
    },
    fileUrl: {
      type: String,
      trim: true,
    },
    originalFileName: {
      type: String,
      trim: true,
    },
    extractedText: {
      type: String,
    },
    units: {
      type: [curriculumUnitSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["uploaded", "processing", "processed", "failed"],
      default: "uploaded",
      required: true,
      index: true,
    },
    errorMessage: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

curriculumSchema.index({ contextId: 1, createdAt: -1 });

const Curriculum = mongoose.model<ICurriculum>("Curriculum", curriculumSchema);

export default Curriculum;
