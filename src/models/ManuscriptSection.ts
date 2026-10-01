import mongoose, { Document, Schema } from "mongoose";

export type ManuscriptSectionType =
  | "abstract"
  | "introduction"
  | "literature_review"
  | "research_gap"
  | "methodology"
  | "results"
  | "discussion"
  | "conclusion"
  | "references"
  | "custom";

export interface IManuscriptSection extends Document {
  ownerId: mongoose.Types.ObjectId;
  manuscriptId: mongoose.Types.ObjectId;
  title: string;
  sectionType: ManuscriptSectionType | string;
  order: number;
  content: string;
  evidencePaperIds: mongoose.Types.ObjectId[];
  evidenceNoteIds: mongoose.Types.ObjectId[];
  aiAssisted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const manuscriptSectionSchema = new Schema<IManuscriptSection>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "ResearcherProfile",
      required: true,
      index: true,
    },
    manuscriptId: {
      type: Schema.Types.ObjectId,
      ref: "Manuscript",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: "Untitled Section",
    },
    sectionType: {
      type: String,
      default: "custom",
      index: true,
    },
    order: {
      type: Number,
      required: true,
      default: 0,
    },
    content: {
      type: String,
      default: "",
    },
    evidencePaperIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "ResearchPaper",
      },
    ],
    evidenceNoteIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "ResearchNote",
      },
    ],
    aiAssisted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

manuscriptSectionSchema.index({ manuscriptId: 1, order: 1 });
manuscriptSectionSchema.index({ ownerId: 1, createdAt: -1 });

const ManuscriptSection = mongoose.model<IManuscriptSection>(
  "ManuscriptSection",
  manuscriptSectionSchema
);

export default ManuscriptSection;
