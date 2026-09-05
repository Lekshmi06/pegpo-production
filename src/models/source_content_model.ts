import mongoose, { Document, Schema } from "mongoose";

export interface ISourceContent extends Document {
  sourceId: mongoose.Types.ObjectId;
  text: string;
  aiSummary?: string;
  aiChapters?: any[];
  aiMindMap?: any;
  aiQuiz?: any[];
  aiFlashcards?: any[];
  aiNotes?: string;
  aiAnalysis?: any;
  aiTimeline?: any[];
  aiAudioScript?: any[];
  aiVideoOutline?: any[];
  createdAt: Date;
  updatedAt: Date;
}

const sourceContentSchema = new Schema<ISourceContent>(
  {
    sourceId: {
      type: Schema.Types.ObjectId,
      ref: "Source",
      required: true,
      unique: true,
      index: true,
    },

    text: {
      type: String,
      required: true,
    },

    aiSummary: {
      type: String,
    },

    aiChapters: {
      type: [Schema.Types.Mixed],
      default: [],
    },

    aiMindMap: {
      type: Schema.Types.Mixed,
    },

    aiQuiz: {
      type: [Schema.Types.Mixed],
      default: [],
    },

    aiFlashcards: {
      type: [Schema.Types.Mixed],
      default: [],
    },

    aiNotes: {
      type: String,
    },

    aiAnalysis: {
      type: Schema.Types.Mixed,
    },

    aiTimeline: {
      type: [Schema.Types.Mixed],
      default: [],
    },

    aiAudioScript: {
      type: [Schema.Types.Mixed],
      default: [],
    },

    aiVideoOutline: {
      type: [Schema.Types.Mixed],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const SourceContent = mongoose.model<ISourceContent>(
  "SourceContent",
  sourceContentSchema
);

export default SourceContent;