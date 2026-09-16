import mongoose, { Document, Schema } from "mongoose";

export interface INote extends Document {
  userId: mongoose.Types.ObjectId;
  studentProfileId?: mongoose.Types.ObjectId;
  folderId?: mongoose.Types.ObjectId;
  title: string;
  content: string;
  preview: string;
  tags: string[];
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const noteSchema = new Schema<INote>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentProfileId: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
      index: true,
    },
    folderId: {
      type: Schema.Types.ObjectId,
      ref: "Folder",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: "Untitled Note",
    },
    content: {
      type: String,
      default: "",
    },
    preview: {
      type: String,
      default: "",
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

noteSchema.index({ userId: 1, updatedAt: -1 });

const Note = mongoose.model<INote>("Note", noteSchema);
export default Note;
