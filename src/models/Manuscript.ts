import mongoose, { Document, Schema } from "mongoose";

export type ManuscriptStatus = "draft" | "in_progress" | "completed";

export interface IManuscript extends Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  status: ManuscriptStatus;
  citationStyle: string;
  sectionIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const manuscriptSchema = new Schema<IManuscript>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "ResearcherProfile",
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "ResearchProject",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["draft", "in_progress", "completed"],
      default: "draft",
      index: true,
    },
    citationStyle: {
      type: String,
      default: "APA",
      trim: true,
    },
    sectionIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "ManuscriptSection",
      },
    ],
  },
  {
    timestamps: true,
  }
);

manuscriptSchema.index({ ownerId: 1, projectId: 1, updatedAt: -1 });

const Manuscript = mongoose.model<IManuscript>("Manuscript", manuscriptSchema);

export default Manuscript;
