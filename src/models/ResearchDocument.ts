import mongoose, { Document, Schema } from "mongoose";

export type ResearchDocType =
  | "paper"
  | "dataset"
  | "manuscript"
  | "proposal"
  | "slides"
  | "notes"
  | "other";

export interface IResearchDocument extends Document {
  ownerId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  folderId?: mongoose.Types.ObjectId;
  title: string;
  originalFileName: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileExtension: string;
  fileUrl: string;
  storagePath: string;
  docType: ResearchDocType;
  description?: string;
  tags: string[];
  isStarred?: boolean;
  paperId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const researchDocumentSchema = new Schema<IResearchDocument>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "ResearchProject",
      index: true,
    },
    folderId: {
      type: Schema.Types.ObjectId,
      ref: "ResearchFolder",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    originalFileName: {
      type: String,
      required: true,
      trim: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    fileType: {
      type: String,
      default: "application/octet-stream",
    },
    fileExtension: {
      type: String,
      default: "",
    },
    fileUrl: {
      type: String,
      required: true,
    },
    storagePath: {
      type: String,
      required: true,
    },
    docType: {
      type: String,
      enum: ["paper", "dataset", "manuscript", "proposal", "slides", "notes", "other"],
      default: "other",
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },
    isStarred: {
      type: Boolean,
      default: false,
    },
    paperId: {
      type: Schema.Types.ObjectId,
      ref: "ResearchPaper",
    },
  },
  {
    timestamps: true,
  }
);

researchDocumentSchema.index({ ownerId: 1, createdAt: -1 });
researchDocumentSchema.index({ ownerId: 1, folderId: 1 });
researchDocumentSchema.index({ ownerId: 1, projectId: 1 });
researchDocumentSchema.index({ ownerId: 1, docType: 1 });

export const ResearchDocument = mongoose.model<IResearchDocument>(
  "ResearchDocument",
  researchDocumentSchema
);

export default ResearchDocument;
