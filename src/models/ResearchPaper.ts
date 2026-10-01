import mongoose, { Document, Schema } from "mongoose";

export type SourceProvider =
  | "crossref"
  | "arxiv"
  | "semanticscholar"
  | "upload"
  | "manual"
  | "demo";

export interface IResearchPaper extends Document {
  title: string;
  authors: string[];
  abstract: string;
  year?: number;
  venue?: string;
  doi?: string;
  arxivId?: string;
  externalUrl?: string;
  sourceProvider: SourceProvider;
  pdfUrl?: string;
  localDocumentPath?: string;
  extractedText?: string;
  methodology?: string;
  datasets?: string[];
  metrics?: Record<string, any>;
  findings?: string;
  limitations?: string;
  tags: string[];
  projectIds: mongoose.Types.ObjectId[];
  ownerId?: mongoose.Types.ObjectId;
  isStarred: boolean;
  savedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const researchPaperSchema = new Schema<IResearchPaper>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    authors: {
      type: [String],
      default: [],
    },
    abstract: {
      type: String,
      default: "",
    },
    year: {
      type: Number,
      index: true,
    },
    venue: {
      type: String,
      trim: true,
      default: "",
    },
    doi: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    arxivId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    externalUrl: {
      type: String,
      trim: true,
    },
    sourceProvider: {
      type: String,
      enum: ["crossref", "arxiv", "semanticscholar", "upload", "manual", "demo"],
      default: "crossref",
      required: true,
    },
    pdfUrl: {
      type: String,
      trim: true,
    },
    localDocumentPath: {
      type: String,
      trim: true,
    },
    extractedText: {
      type: String,
      default: "",
    },
    methodology: {
      type: String,
      default: "",
    },
    datasets: {
      type: [String],
      default: [],
    },
    metrics: {
      type: Schema.Types.Mixed,
      default: {},
    },
    findings: {
      type: String,
      default: "",
    },
    limitations: {
      type: String,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },
    projectIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "ResearchProject",
      },
    ],
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "ResearcherProfile",
      index: true,
    },
    isStarred: {
      type: Boolean,
      default: false,
      index: true,
    },
    savedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Text index for search across paper title, abstract, methodology, and venue
researchPaperSchema.index({
  title: "text",
  abstract: "text",
  venue: "text",
  methodology: "text",
  tags: "text",
});

const ResearchPaper = mongoose.model<IResearchPaper>(
  "ResearchPaper",
  researchPaperSchema
);

export default ResearchPaper;
