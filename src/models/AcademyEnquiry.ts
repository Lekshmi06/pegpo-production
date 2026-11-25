import mongoose, { Document, Schema } from "mongoose";

export type AcademyEnquiryStatus = "New" | "Contacted" | "Demo Scheduled" | "Converted" | "Closed";

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
  },
  {
    timestamps: true,
  }
);

academyEnquirySchema.index({ status: 1, session: 1, createdAt: -1 });

export default mongoose.models.AcademyEnquiry || mongoose.model<IAcademyEnquiry>("AcademyEnquiry", academyEnquirySchema);
