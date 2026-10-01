import mongoose, { Document, Schema } from "mongoose";

export type ResearchNoteType =
  | "hypothesis"
  | "methodology"
  | "critique"
  | "finding"
  | "observation"
  | "idea"
  | "limitation"
  | "quote"
  | "general";

export type HypothesisStatus = "idea" | "testing" | "supported" | "rejected";

export interface IResearchNote extends Document {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  paperId?: mongoose.Types.ObjectId;
  paperIds?: mongoose.Types.ObjectId[];
  title: string;
  content: string;
  noteType: ResearchNoteType;
  hypothesisStatus?: HypothesisStatus;
  aiGenerated?: boolean;
  aiAssisted?: boolean;
  sourceText?: string;
  tags: string[];
  excerpt?: string;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const researchNoteSchema = new Schema<IResearchNote>(
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
    paperId: {
      type: Schema.Types.ObjectId,
      ref: "ResearchPaper",
      index: true,
    },
    paperIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "ResearchPaper",
      },
    ],
    title: {
      type: String,
      required: true,
      trim: true,
      default: "Untitled Research Note",
    },
    content: {
      type: String,
      required: true,
      default: "",
    },
    noteType: {
      type: String,
      enum: [
        "hypothesis",
        "methodology",
        "critique",
        "finding",
        "observation",
        "idea",
        "limitation",
        "quote",
        "general",
      ],
      default: "general",
      index: true,
    },
    hypothesisStatus: {
      type: String,
      enum: ["idea", "testing", "supported", "rejected"],
      default: function (this: any) {
        return this.noteType === "hypothesis" ? "idea" : undefined;
      },
    },
    aiGenerated: {
      type: Boolean,
      default: false,
    },
    aiAssisted: {
      type: Boolean,
      default: false,
    },
    sourceText: {
      type: String,
      trim: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    excerpt: {
      type: String,
      trim: true,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

researchNoteSchema.index({ projectId: 1, createdAt: -1 });

const ResearchNote = mongoose.model<IResearchNote>(
  "ResearchNote",
  researchNoteSchema
);

export default ResearchNote;
