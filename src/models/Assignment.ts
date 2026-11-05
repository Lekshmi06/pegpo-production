import mongoose, { Document, Schema } from "mongoose";

export type AssignmentType = "homework" | "assignment" | "project";
export type AssignmentStatus = "draft" | "published" | "archived";
export type AssignmentTargetType = "all" | "selected";

export interface IAssignmentAttachment {
  _id?: mongoose.Types.ObjectId;
  originalName: string;
  storedName: string;
  storageKey: string;
  fileUrl?: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
}

export interface IAssignment extends Document {
  teacherId: mongoose.Types.ObjectId;
  teacherName: string;
  classSectionId: mongoose.Types.ObjectId;
  teachingContextId?: mongoose.Types.ObjectId;
  title: string;
  subject: string;
  description: string;
  instructions?: string;
  type: AssignmentType;
  targetType: AssignmentTargetType;
  targetStudentProfileIds: mongoose.Types.ObjectId[];
  assignedDate: Date;
  dueDate: Date;
  dueTime: string;
  totalMarks: number;
  passingMarks?: number;
  attachments: IAssignmentAttachment[];
  allowLateSubmission: boolean;
  lateSubmissionDeadline?: Date;
  status: AssignmentStatus;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const assignmentAttachmentSchema = new Schema<IAssignmentAttachment>(
  {
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    storedName: {
      type: String,
      required: true,
      trim: true,
    },
    storageKey: {
      type: String,
      required: true,
      trim: true,
    },
    fileUrl: {
      type: String,
      trim: true,
    },
    fileSize: {
      type: Number,
      required: true,
      min: 0,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const assignmentSchema = new Schema<IAssignment>(
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
    classSectionId: {
      type: Schema.Types.ObjectId,
      ref: "ClassSection",
      required: true,
      index: true,
    },
    teachingContextId: {
      type: Schema.Types.ObjectId,
      ref: "TeachingContext",
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
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    instructions: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      enum: ["homework", "assignment", "project"],
      default: "homework",
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ["all", "selected"],
      default: "all",
      required: true,
    },
    targetStudentProfileIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "StudentProfile",
      },
    ],
    assignedDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    dueTime: {
      type: String,
      required: true,
      trim: true,
      default: "23:59",
    },
    totalMarks: {
      type: Number,
      required: true,
      default: 100,
      min: 0,
    },
    passingMarks: {
      type: Number,
      default: 40,
      min: 0,
    },
    attachments: {
      type: [assignmentAttachmentSchema],
      default: [],
    },
    allowLateSubmission: {
      type: Boolean,
      default: true,
    },
    lateSubmissionDeadline: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      required: true,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for teacher and student query patterns
assignmentSchema.index({ classSectionId: 1, status: 1, dueDate: 1 });
assignmentSchema.index({ teacherId: 1, status: 1, createdAt: -1 });
assignmentSchema.index({ classSectionId: 1, type: 1, status: 1 });
assignmentSchema.index({ subject: 1, status: 1 });
assignmentSchema.index({ teachingContextId: 1, status: 1 });

export const Assignment = mongoose.model<IAssignment>(
  "Assignment",
  assignmentSchema
);

export default Assignment;
