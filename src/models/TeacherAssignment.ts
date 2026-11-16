import mongoose, { Document, Schema } from "mongoose";

export type TeacherAssignmentType = "trial" | "regular";
export type TeacherAssignmentStatus =
  | "assigned"
  | "accepted"
  | "declined"
  | "completed"
  | "revoked";

export interface ITeacherAssignment extends Document {
  requestId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  assignedByAdminId: mongoose.Types.ObjectId;
  assignmentType: TeacherAssignmentType;
  trialIndex?: number; // 1, 2, or 3 for trial assignments
  subject: string;
  classLevel?: string;
  curriculum?: string;
  studentHourlyRate: number; // historical snapshot
  teacherHourlyPayoutRate: number; // historical snapshot
  currency: string;
  status: TeacherAssignmentStatus;
  assignedAt: Date;
  acceptedAt?: Date;
  declinedAt?: Date;
  completedAt?: Date;
  statusHistory: Array<{
    status: TeacherAssignmentStatus;
    changedAt: Date;
    changedBy?: mongoose.Types.ObjectId;
    reason?: string;
  }>;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const teacherAssignmentSchema = new Schema<ITeacherAssignment>(
  {
    requestId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionRequest",
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    assignedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignmentType: {
      type: String,
      enum: ["trial", "regular"],
      required: true,
      index: true,
    },
    trialIndex: {
      type: Number,
      enum: [1, 2, 3],
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    classLevel: {
      type: String,
      trim: true,
    },
    curriculum: {
      type: String,
      trim: true,
      default: "CBSE",
    },
    studentHourlyRate: {
      type: Number,
      required: true,
      min: 0,
    },
    teacherHourlyPayoutRate: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
    },
    status: {
      type: String,
      enum: ["assigned", "accepted", "declined", "completed", "revoked"],
      default: "assigned",
      index: true,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    acceptedAt: {
      type: Date,
    },
    declinedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: "User" },
        reason: { type: String, trim: true },
      },
    ],
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

teacherAssignmentSchema.index({ requestId: 1, teacherId: 1, assignmentType: 1 });
teacherAssignmentSchema.index({ teacherId: 1, status: 1 });
teacherAssignmentSchema.index({ studentId: 1, status: 1 });

const TeacherAssignment = mongoose.model<ITeacherAssignment>(
  "TeacherAssignment",
  teacherAssignmentSchema
);

export default TeacherAssignment;

