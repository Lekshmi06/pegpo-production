import mongoose, { Document, Schema } from "mongoose";

export type ProjectStatus = "planning" | "in_progress" | "review" | "completed";

export interface IStudentProject extends Document {
  userId: mongoose.Types.ObjectId;
  studentProfileId?: mongoose.Types.ObjectId;
  name: string;
  title: string;
  content: string;
  status: ProjectStatus;
  dueDate?: Date;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const studentProjectSchema = new Schema<IStudentProject>(
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
      default: "Untitled Project",
    },
    title: {
      type: String,
      default: "",
      trim: true,
    },
    content: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["planning", "in_progress", "review", "completed"],
      default: "planning",
    },
    dueDate: {
      type: Date,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

studentProjectSchema.index({ userId: 1, updatedAt: -1 });

const StudentProject = mongoose.model<IStudentProject>(
  "StudentProject",
  studentProjectSchema
);
export default StudentProject;
