import mongoose, { Document, Schema } from "mongoose";

export type ResearchCalendarEventType = "milestone" | "meeting" | "deadline" | "other";

export interface IResearchCalendarEvent extends Document {
  projectId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  type: ResearchCalendarEventType;
  startDate: Date;
  endDate?: Date;
  allDay: boolean;
  location?: string;
  assigneeId?: mongoose.Types.ObjectId;
  relatedTaskId?: mongoose.Types.ObjectId;
  relatedPaperIds: mongoose.Types.ObjectId[];
  relatedNoteIds: mongoose.Types.ObjectId[];
  relatedManuscriptId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const researchCalendarEventSchema = new Schema<IResearchCalendarEvent>(
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
      maxlength: 300,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      enum: ["milestone", "meeting", "deadline", "other"],
      required: true,
      default: "milestone",
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
    },
    allDay: {
      type: Boolean,
      default: false,
    },
    location: {
      type: String,
      trim: true,
    },
    assigneeId: {
      type: Schema.Types.ObjectId,
      ref: "ResearcherProfile",
      index: true,
    },
    relatedTaskId: {
      type: Schema.Types.ObjectId,
      ref: "ResearchTask",
      index: true,
    },
    relatedPaperIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "ResearchPaper",
      },
    ],
    relatedNoteIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "ResearchNote",
      },
    ],
    relatedManuscriptId: {
      type: Schema.Types.ObjectId,
      ref: "Manuscript",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying project events in date ranges
researchCalendarEventSchema.index({ projectId: 1, startDate: 1, type: 1 });

const ResearchCalendarEvent =
  mongoose.models.ResearchCalendarEvent ||
  mongoose.model<IResearchCalendarEvent>(
    "ResearchCalendarEvent",
    researchCalendarEventSchema
  );

export default ResearchCalendarEvent;
