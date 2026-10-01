import mongoose, { Document, Schema } from "mongoose";

export interface ICommentReply {
  authorId: mongoose.Types.ObjectId;
  content: string;
  createdAt: Date;
}

export interface IManuscriptComment extends Document {
  manuscriptId: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  content: string;
  highlightedText?: string;
  status: "open" | "resolved";
  replies: ICommentReply[];
  createdAt: Date;
  updatedAt: Date;
}

const commentReplySchema = new Schema<ICommentReply>(
  {
    authorId: {
      type: Schema.Types.ObjectId,
      ref: "ResearcherProfile",
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const manuscriptCommentSchema = new Schema<IManuscriptComment>(
  {
    manuscriptId: {
      type: Schema.Types.ObjectId,
      ref: "Manuscript",
      required: true,
      index: true,
    },
    sectionId: {
      type: Schema.Types.ObjectId,
      ref: "ManuscriptSection",
      index: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: "ResearcherProfile",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    highlightedText: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["open", "resolved"],
      default: "open",
      index: true,
    },
    replies: [commentReplySchema],
  },
  {
    timestamps: true,
  }
);

const ManuscriptComment = mongoose.model<IManuscriptComment>(
  "ManuscriptComment",
  manuscriptCommentSchema
);

export default ManuscriptComment;
