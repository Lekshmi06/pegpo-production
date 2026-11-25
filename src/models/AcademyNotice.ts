import mongoose, { Document, Schema } from "mongoose";

export type AcademyNoticeAudience = "All" | "Students" | "Tutors" | "Specific Batch";
export type AcademyNoticePriority = "Normal" | "Important" | "Schedule Change";

export interface IAcademyNotice extends Document {
  title: string;
  message: string;
  audience: AcademyNoticeAudience;
  programId?: mongoose.Types.ObjectId;
  priority: AcademyNoticePriority;
  postedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const academyNoticeSchema = new Schema<IAcademyNotice>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    audience: {
      type: String,
      enum: ["All", "Students", "Tutors", "Specific Batch"],
      required: true,
      default: "All",
    },
    programId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionProgram",
    },
    priority: {
      type: String,
      enum: ["Normal", "Important", "Schedule Change"],
      required: true,
      default: "Normal",
    },
    postedBy: {
      type: String,
      required: true,
      default: "Academy Admin",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

academyNoticeSchema.index({ createdAt: -1, audience: 1 });

export default mongoose.models.AcademyNotice || mongoose.model<IAcademyNotice>("AcademyNotice", academyNoticeSchema);
