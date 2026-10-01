import mongoose, { Document, Schema } from "mongoose";

export type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done";

export type ResearchStage =
  | "literature_review"
  | "methodology"
  | "data_collection"
  | "experiment"
  | "analysis"
  | "writing"
  | "review"
  | "submission"
  | "other";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface IResearchTask extends Document {
  projectId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  status: TaskStatus;
  researchStage: ResearchStage;
  priority: TaskPriority;
  assigneeId?: mongoose.Types.ObjectId;
  dueDate?: Date;
  paperIds: mongoose.Types.ObjectId[];
  noteIds: mongoose.Types.ObjectId[];
  manuscriptId?: mongoose.Types.ObjectId;
  manuscriptSectionId?: mongoose.Types.ObjectId;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const researchTaskSchema = new Schema<IResearchTask>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "ResearchProject",
      required: true,
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "ResearcherProfile",
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "ResearcherProfile",
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
      enum: ["backlog", "todo", "in_progress", "review", "done"],
      default: "backlog",
      index: true,
    },
    researchStage: {
      type: String,
      enum: [
        "literature_review",
        "methodology",
        "data_collection",
        "experiment",
        "analysis",
        "writing",
        "review",
        "submission",
        "other",
      ],
      default: "literature_review",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
      index: true,
    },
    assigneeId: {
      type: Schema.Types.ObjectId,
      ref: "ResearcherProfile",
      index: true,
    },
    dueDate: {
      type: Date,
      index: true,
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
    manuscriptId: {
      type: Schema.Types.ObjectId,
      ref: "Manuscript",
    },
    manuscriptSectionId: {
      type: Schema.Types.ObjectId,
      ref: "ManuscriptSection",
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast query performance
researchTaskSchema.index({ projectId: 1, status: 1 });
researchTaskSchema.index({ projectId: 1, researchStage: 1 });
researchTaskSchema.index({ projectId: 1, assigneeId: 1 });
researchTaskSchema.index({ projectId: 1, dueDate: 1 });

const ResearchTask = mongoose.model<IResearchTask>("ResearchTask", researchTaskSchema);

export default ResearchTask;
