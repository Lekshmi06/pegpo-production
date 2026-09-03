import mongoose, { Document, Schema } from "mongoose";

export type SourceType = "file";

export type SourceStatus =
  | "uploaded"
  | "processing"
  | "ready"
  | "failed";

export interface ISource extends Document {
  studentId: mongoose.Types.ObjectId;

  originalName: string;
  storedName: string;

  type: SourceType;
  mimeType: string;
  size: number;

  storagePath: string;

  status: SourceStatus;

  createdAt: Date;
  updatedAt: Date;
}

const sourceSchema = new Schema<ISource>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
      index: true,
    },

    originalName: {
      type: String,
      required: true,
      trim: true,
    },

    storedName: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: ["file"],
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
    },

    size: {
      type: Number,
      required: true,
    },

    storagePath: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["uploaded", "processing", "ready", "failed"],
      default: "uploaded",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Source = mongoose.model<ISource>("Source", sourceSchema);

export default Source;