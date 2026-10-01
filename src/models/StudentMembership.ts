import mongoose, { Document, Schema } from "mongoose";

export interface IStudentMembership extends Document {
  studentProfileId: mongoose.Types.ObjectId;
  classSectionId: mongoose.Types.ObjectId;
  rollNumber?: string;
  academicYear: string;
  isActive: boolean;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const studentMembershipSchema = new Schema<IStudentMembership>(
  {
    studentProfileId: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
      index: true,
    },
    classSectionId: {
      type: Schema.Types.ObjectId,
      ref: "ClassSection",
      required: true,
      index: true,
    },
    rollNumber: {
      type: String,
      trim: true,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      default: "2026-2027",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

studentMembershipSchema.index(
  { studentProfileId: 1, classSectionId: 1, academicYear: 1 },
  { unique: true }
);
studentMembershipSchema.index({ classSectionId: 1, isActive: 1 });

const StudentMembership = mongoose.model<IStudentMembership>(
  "StudentMembership",
  studentMembershipSchema
);

export default StudentMembership;
