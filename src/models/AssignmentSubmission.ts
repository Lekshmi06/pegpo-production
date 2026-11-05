import mongoose, { Document, Schema } from "mongoose";

export type SubmissionStatus = "draft" | "submitted" | "late" | "evaluated";

export interface ISubmissionAttachment {
  _id?: mongoose.Types.ObjectId;
  originalName: string;
  storedName: string;
  storageKey: string;
  fileUrl?: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
}

export interface ISubmissionHistoryItem {
  _id?: mongoose.Types.ObjectId;
  version: number;
  submittedAt: Date;
  content?: string;
  attachments: ISubmissionAttachment[];
  comment?: string;
}

export interface IEvaluationHistoryItem {
  _id?: mongoose.Types.ObjectId;
  evaluatedAt: Date;
  evaluatedBy: mongoose.Types.ObjectId;
  evaluatorName?: string;
  marksAwarded?: number;
  maxMarks?: number;
  grade?: string;
  feedback?: string;
}

export interface ISubmissionEvaluation {
  marksAwarded?: number;
  maxMarks?: number;
  grade?: string;
  feedback?: string;
  evaluatedAt?: Date | null;
  evaluatedBy?: mongoose.Types.ObjectId;
  evaluatorName?: string;
}

export interface IAssignmentSubmission extends Document {
  assignmentId: mongoose.Types.ObjectId;
  studentProfileId: mongoose.Types.ObjectId;
  studentName: string;
  studentEmail: string;
  classSectionId: mongoose.Types.ObjectId;
  content?: string;
  attachments: ISubmissionAttachment[];
  status: SubmissionStatus;
  submittedAt?: Date | null;
  isLate: boolean;
  evaluation?: ISubmissionEvaluation;
  submissionHistory: ISubmissionHistoryItem[];
  evaluationHistory: IEvaluationHistoryItem[];
  createdAt: Date;
  updatedAt: Date;
}

const submissionAttachmentSchema = new Schema<ISubmissionAttachment>(
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

const submissionHistorySchema = new Schema<ISubmissionHistoryItem>(
  {
    version: {
      type: Number,
      required: true,
    },
    submittedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    content: {
      type: String,
      default: "",
    },
    attachments: {
      type: [submissionAttachmentSchema],
      default: [],
    },
    comment: {
      type: String,
      default: "",
    },
  },
  { _id: true }
);

const evaluationHistorySchema = new Schema<IEvaluationHistoryItem>(
  {
    evaluatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    evaluatedBy: {
      type: Schema.Types.ObjectId,
      ref: "TeacherProfile",
      required: true,
    },
    evaluatorName: {
      type: String,
      trim: true,
    },
    marksAwarded: {
      type: Number,
      min: 0,
    },
    maxMarks: {
      type: Number,
      min: 0,
    },
    grade: {
      type: String,
      trim: true,
    },
    feedback: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: true }
);

const evaluationSchema = new Schema<ISubmissionEvaluation>(
  {
    marksAwarded: {
      type: Number,
      min: 0,
    },
    maxMarks: {
      type: Number,
      min: 0,
    },
    grade: {
      type: String,
      trim: true,
    },
    feedback: {
      type: String,
      trim: true,
      default: "",
    },
    evaluatedAt: {
      type: Date,
      default: null,
    },
    evaluatedBy: {
      type: Schema.Types.ObjectId,
      ref: "TeacherProfile",
    },
    evaluatorName: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const assignmentSubmissionSchema = new Schema<IAssignmentSubmission>(
  {
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
      index: true,
    },
    studentProfileId: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
      index: true,
    },
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    studentEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    classSectionId: {
      type: Schema.Types.ObjectId,
      ref: "ClassSection",
      required: true,
      index: true,
    },
    content: {
      type: String,
      default: "",
      trim: true,
    },
    attachments: {
      type: [submissionAttachmentSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["draft", "submitted", "late", "evaluated"],
      default: "draft",
      required: true,
      index: true,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    isLate: {
      type: Boolean,
      default: false,
    },
    evaluation: {
      type: evaluationSchema,
      default: undefined,
    },
    submissionHistory: {
      type: [submissionHistorySchema],
      default: [],
    },
    evaluationHistory: {
      type: [evaluationHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Strictly enforce one submission record per student per assignment
assignmentSubmissionSchema.index(
  { assignmentId: 1, studentProfileId: 1 },
  { unique: true }
);

// Query optimization indexes
assignmentSubmissionSchema.index({ assignmentId: 1, status: 1 });
assignmentSubmissionSchema.index({ classSectionId: 1, status: 1 });
assignmentSubmissionSchema.index({ studentProfileId: 1, status: 1 });
assignmentSubmissionSchema.index({ assignmentId: 1, submittedAt: -1 });

export const AssignmentSubmission = mongoose.model<IAssignmentSubmission>(
  "AssignmentSubmission",
  assignmentSubmissionSchema
);

export default AssignmentSubmission;
