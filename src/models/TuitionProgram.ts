import mongoose, { Document, Schema } from "mongoose";
import crypto from "crypto";

export interface IProgramScheduleSlot {
  day: string;
  startTime: string; // "17:00"
  endTime: string;   // "18:30"
}

export type TuitionProgramStatus =
  | "draft"
  | "upcoming"
  | "active"
  | "completed"
  | "archived";

export interface ITuitionProgram extends Document {
  title: string;
  code: string; // Unique program code e.g. PRG-MATH-12 or PRG-A1B2C3
  subject: string;
  grade?: string;
  description?: string;
  syllabusTopics?: string[];
  requiredMaterials?: string[];
  nextSessionTopic?: string;
  schedule: IProgramScheduleSlot[];
  teacherIds: mongoose.Types.ObjectId[];
  enrolledStudentIds: mongoose.Types.ObjectId[];
  status: TuitionProgramStatus;
  startDate?: Date;
  endDate?: Date;
  maxCapacity?: number;
  createdAt: Date;
  updatedAt: Date;
}

export function generateProgramCode(prefix = "PRG"): string {
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${rand}`;
}

const tuitionProgramSchema = new Schema<ITuitionProgram>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
      default: () => generateProgramCode(),
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    grade: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    syllabusTopics: {
      type: [String],
      default: [],
    },
    requiredMaterials: {
      type: [String],
      default: [],
    },
    nextSessionTopic: {
      type: String,
      trim: true,
      default: "",
    },
    schedule: [
      {
        day: { type: String, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
      },
    ],
    teacherIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    enrolledStudentIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    status: {
      type: String,
      enum: ["draft", "upcoming", "active", "completed", "archived"],
      default: "active",
      index: true,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    maxCapacity: {
      type: Number,
      default: 30,
      min: 1,
    },
  },
  {
    timestamps: true,
  }
);

tuitionProgramSchema.index({ subject: 1, status: 1 });
tuitionProgramSchema.index({ teacherIds: 1, status: 1 });
tuitionProgramSchema.index({ enrolledStudentIds: 1, status: 1 });

const TuitionProgram = mongoose.model<ITuitionProgram>("TuitionProgram", tuitionProgramSchema);

export default TuitionProgram;

