import mongoose, { Document, Schema } from "mongoose";

export type AcademicGroupType = "institution" | "tuition";

export interface IClassSection extends Document {
  organizationId?: mongoose.Types.ObjectId;
  name: string;
  classLevel: string;
  section: string;
  board: string;
  academicYear: string;
  type: AcademicGroupType;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const classSectionSchema = new Schema<IClassSection>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    classLevel: {
      type: String,
      required: true,
      trim: true,
    },
    section: {
      type: String,
      required: true,
      trim: true,
      default: "A",
    },
    board: {
      type: String,
      required: true,
      trim: true,
      default: "CBSE",
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      default: "2026-2027",
    },
    type: {
      type: String,
      enum: ["institution", "tuition"],
      default: "institution",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

classSectionSchema.index(
  { organizationId: 1, classLevel: 1, section: 1, academicYear: 1 },
  { unique: false }
);
classSectionSchema.index({ classLevel: 1, section: 1, board: 1 });

const ClassSection = mongoose.model<IClassSection>("ClassSection", classSectionSchema);

export default ClassSection;
