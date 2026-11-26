import mongoose, { Document, Schema } from "mongoose";

export type AcademyEnquiryStatus = "New" | "Contacted" | "Demo Scheduled" | "Converted" | "Closed";
export type AcademyDemoStatus = "scheduled" | "live" | "completed" | "cancelled";

export interface IAcademyEnquiry extends Document {
  studentName: string;
  parentName: string;
  phone: string;
  email?: string;
  grade: string;
  subjects: string[];
  status: AcademyEnquiryStatus;
  notes?: string;
  followUpDate?: string;
  session: string;
  convertedStudentId?: mongoose.Types.ObjectId;
  // Demo Trial Meeting Room Fields
  demoRoomId?: string;
  studentToken?: string;
  teacherToken?: string;
  assignedTutorId?: mongoose.Types.ObjectId;
  assignedTutorCode?: string;
  assignedTutorName?: string;
  demoSubject?: string;
  demoScheduledAt?: Date;
  demoStatus?: AcademyDemoStatus;
  teacherFeedback?: string;
  studentDecision?: string;
  createdAt: Date;
  updatedAt: Date;
}

const academyEnquirySchema = new Schema<IAcademyEnquiry>(
  {
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    parentName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    grade: {
      type: String,
      required: true,
      default: "Class 12",
      trim: true,
    },
    subjects: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["New", "Contacted", "Demo Scheduled", "Converted", "Closed"],
      required: true,
      default: "New",
    },
    notes: {
      type: String,
      trim: true,
    },
    followUpDate: {
      type: String,
      trim: true,
    },
    session: {
      type: String,
      required: true,
      default: "2026-27",
      trim: true,
    },
    convertedStudentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    demoRoomId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    studentToken: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    teacherToken: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    assignedTutorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    assignedTutorCode: {
      type: String,
      trim: true,
      index: true,
    },
    assignedTutorName: {
      type: String,
      trim: true,
    },
    demoSubject: {
      type: String,
      trim: true,
    },
    demoScheduledAt: {
      type: Date,
      index: true,
    },
    demoStatus: {
      type: String,
      enum: ["scheduled", "live", "completed", "cancelled"],
      default: "scheduled",
    },
    teacherFeedback: {
      type: String,
      trim: true,
    },
    studentDecision: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

academyEnquirySchema.index({ status: 1, session: 1, createdAt: -1 });
academyEnquirySchema.index({ studentToken: 1 });
academyEnquirySchema.index({ teacherToken: 1 });
academyEnquirySchema.index({ demoRoomId: 1 });
academyEnquirySchema.index({ assignedTutorCode: 1, demoScheduledAt: -1 });

export default mongoose.models.AcademyEnquiry || mongoose.model<IAcademyEnquiry>("AcademyEnquiry", academyEnquirySchema);
