import mongoose, { Document, Schema } from "mongoose";

export interface ISourceContent extends Document {
  sourceId: mongoose.Types.ObjectId;
  text: string;
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