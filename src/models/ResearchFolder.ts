import mongoose, { Document, Schema } from "mongoose";

export interface IResearchFolder extends Document {
  ownerId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  color?: string;
  category: "literature" | "datasets" | "manuscripts" | "notes" | "general";
  isFavorite?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const researchFolderSchema = new Schema<IResearchFolder>(
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    color: {
      type: String,
      default: "#1c75bc",
    },
    category: {
      type: String,
      enum: ["literature", "datasets", "manuscripts", "notes", "general"],
      default: "general",
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

researchFolderSchema.index({ ownerId: 1, createdAt: -1 });
researchFolderSchema.index({ ownerId: 1, projectId: 1 });

export const ResearchFolder = mongoose.model<IResearchFolder>(
  "ResearchFolder",
  researchFolderSchema
);

export default ResearchFolder;
