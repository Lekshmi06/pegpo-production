import mongoose, { Document, Schema } from "mongoose";

export type CollaborationRole = "co_author" | "reviewer" | "contributor" | "viewer";

export interface IProjectCollaborator {
  researcherId: mongoose.Types.ObjectId;
  role: CollaborationRole;
  joinedAt: Date;
  invitedBy?: mongoose.Types.ObjectId;
}

export interface IResearchProject extends Document {
  ownerId?: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  domain?: string;
  researchQuestion?: string;
  objectives: string[];
  currentStage: string;
  status: string;
  paperIds: mongoose.Types.ObjectId[];
  noteIds: mongoose.Types.ObjectId[];
  collaborators: IProjectCollaborator[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const researchProjectSchema = new Schema<IResearchProject>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "ResearcherProfile",
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
    domain: {
      type: String,
      trim: true,
      default: "Computer Science",
    },
    researchQuestion: {
      type: String,
      trim: true,
      default: "",
    },
    objectives: {
      type: [String],
      default: [],
    },
    currentStage: {
      type: String,
      default: "Literature review",
    },
    status: {
      type: String,
      enum: ["Active", "Exploring", "Literature review", "Proposal", "Completed", "Archived"],
      default: "Active",
    },
    paperIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "ResearchPaper",
      },
    ],
    noteIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "ResearchNote",
      },
    ],
    collaborators: [
      {
        researcherId: {
          type: Schema.Types.ObjectId,
          ref: "ResearcherProfile",
          required: true,
        },
        role: {
          type: String,
          enum: ["co_author", "reviewer", "contributor", "viewer"],
          default: "viewer",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        invitedBy: {
          type: Schema.Types.ObjectId,
          ref: "ResearcherProfile",
        },
      },
    ],
    tags: {
      type: [String],
      default: [],
    },
  },

  {
    timestamps: true,
  }
);

const ResearchProject = mongoose.model<IResearchProject>(
  "ResearchProject",
  researchProjectSchema
);

export default ResearchProject;
