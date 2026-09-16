import mongoose, { Document, Schema } from "mongoose";

export interface IFolder extends Document {
  userId: mongoose.Types.ObjectId;
  studentProfileId?: mongoose.Types.ObjectId;
  name: string;
  title?: string;
  desc?: string;
  color?: string;
  category: "notes" | "homework" | "projects" | "general";
  createdAt: Date;
  updatedAt: Date;
}

const folderSchema = new Schema<IFolder>(
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    desc: {
      type: String,
      trim: true,
      default: "",
    },
    color: {
      type: String,
      default: "#2b4d7a",
    },
    category: {
      type: String,
      enum: ["notes", "homework", "projects", "general"],
      default: "notes",
    },
  },
  {
    timestamps: true,
  }
);

folderSchema.index({ userId: 1, createdAt: -1 });

const Folder = mongoose.model<IFolder>("Folder", folderSchema);
export default Folder;
