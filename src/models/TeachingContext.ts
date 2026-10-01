import mongoose, { Document, Schema } from "mongoose";

export type ContextType = "institution" | "tuition";

export interface ITeachingContext extends Document {
  teacherId: mongoose.Types.ObjectId;
  contextType: ContextType;
  classSectionId?: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  institution?: string;
  tuitionCentre?: string;
  classLevel: string;
  section?: string;
  subject: string;
  curriculumBoard: string;
  academicYear: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const teachingContextSchema = new Schema<ITeachingContext>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherProfile",
      required: true,
      index: true,
    },

    classSectionId: {
      type: Schema.Types.ObjectId,
      ref: "ClassSection",
      index: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      index: true,
    },

    contextType: {
      type: String,
      enum: ["institution", "tuition"],
      default: "institution",
      required: true,
    },

    institution: {
      type: String,
      trim: true,
    },

    tuitionCentre: {
      type: String,
      trim: true,
    },

    classLevel: {
      type: String,
      required: true,
      trim: true,
    },

    section: {
      type: String,
      trim: true,
      default: "",
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    curriculumBoard: {
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

    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure fast querying and prevent accidental identical duplicates
teachingContextSchema.index(
  { teacherId: 1, classLevel: 1, section: 1, subject: 1, academicYear: 1 },
  { unique: false }
);

const TeachingContext = mongoose.model<ITeachingContext>(
  "TeachingContext",
  teachingContextSchema
);

export default TeachingContext;
