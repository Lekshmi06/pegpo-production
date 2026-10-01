import mongoose, { Document, Schema } from "mongoose";

export type MaterialCategory =
  | "slides"
  | "notes"
  | "textbook"
  | "worksheet"
  | "syllabus"
  | "other";

export type MaterialStatus = "draft" | "published";

export interface ITeacherMaterial extends Document {
  teacherId: mongoose.Types.ObjectId;
  teacherName: string;
  title: string;
  description?: string;
  category: MaterialCategory;
  subject: string;
  classLevel: string;
  classSectionId?: mongoose.Types.ObjectId;
  targetAudience: "all" | "class_section";

  // File attributes
  originalName: string;
  storedName: string;
  fileUrl: string;
  storagePath: string;
  fileSize: number;
  mimeType: string;

  // Publishing & permissions
  status: MaterialStatus;
  publishedAt?: Date | null;
  allowStudentDownload: boolean;
  allowAIChat: boolean;
  downloadsCount: number;

  createdAt: Date;
  updatedAt: Date;
}

const teacherMaterialSchema = new Schema<ITeacherMaterial>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherProfile",
      required: true,
      index: true,
    },
    teacherName: {
      type: String,
      required: true,
      trim: true,
      default: "Teacher",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    category: {
      type: String,
      enum: ["slides", "notes", "textbook", "worksheet", "syllabus", "other"],
      default: "notes",
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    classLevel: {
      type: String,
      required: true,
      trim: true,
      default: "All Classes",
      index: true,
    },
    classSectionId: {
      type: Schema.Types.ObjectId,
      ref: "ClassSection",
      index: true,
    },
    targetAudience: {
      type: String,
      enum: ["all", "class_section"],
      default: "all",
      required: true,
    },

    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    storedName: {
      type: String,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    storagePath: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      required: true,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    allowStudentDownload: {
      type: Boolean,
      default: true,
    },
    allowAIChat: {
      type: Boolean,
      default: true,
    },
    downloadsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

teacherMaterialSchema.index({ teacherId: 1, status: 1, createdAt: -1 });
teacherMaterialSchema.index({ status: 1, subject: 1, classLevel: 1 });
teacherMaterialSchema.index({ classSectionId: 1, status: 1 });

const TeacherMaterial = mongoose.model<ITeacherMaterial>(
  "TeacherMaterial",
  teacherMaterialSchema
);

export default TeacherMaterial;
