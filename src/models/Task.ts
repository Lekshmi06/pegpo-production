import mongoose, { Document, Schema } from "mongoose";

export interface ITask extends Document {
  id?: number;
  taskNumber: number;
  title: string;
  description?: string | null;
  status: "OPEN" | "RESOLVED" | "WONT_FIX" | "INVALID" | "SPITE";
  priority: "UNBREAK_NOW" | "NEEDS_TRIAGE" | "HIGH" | "NORMAL" | "LOW" | "WISHLIST";
  visibility: "ALL_USERS" | "CUSTOM";
  createdById: number;
  assignedToId?: number | null;
  parentTaskId?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    id: { type: Number, unique: true, index: true },
    taskNumber: { type: Number, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    status: {
      type: String,
      enum: ["OPEN", "RESOLVED", "WONT_FIX", "INVALID", "SPITE"],
      default: "OPEN",
      index: true,
    },
    priority: {
      type: String,
      enum: ["UNBREAK_NOW", "NEEDS_TRIAGE", "HIGH", "NORMAL", "LOW", "WISHLIST"],
      default: "NORMAL",
      index: true,
    },
    visibility: {
      type: String,
      enum: ["ALL_USERS", "CUSTOM"],
      default: "ALL_USERS",
    },
    createdById: { type: Number, required: true, default: 1 },
    assignedToId: { type: Number, default: null },
    parentTaskId: { type: Number, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        ret.id = ret.id || ret.taskNumber;
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

export const Task =
  mongoose.models.Task ||
  mongoose.model<ITask>("Task", TaskSchema, "taskmite_tasks");
export default Task;
