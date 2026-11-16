import mongoose, { Document, Schema } from "mongoose";

export interface ITaskActivity extends Document {
  id?: number;
  taskId: number;
  userId: number;
  type:
    | "CREATED"
    | "UPDATED"
    | "ASSIGNED"
    | "STATUS_CHANGED"
    | "PRIORITY_CHANGED"
    | "TAG_ADDED"
    | "TAG_REMOVED"
    | "SUBSCRIBER_ADDED"
    | "SUBSCRIBER_REMOVED"
    | "COMMENT_ADDED";
  oldValue?: string | null;
  newValue?: string | null;
  comment?: string | null;
  createdAt: Date;
}

const TaskActivitySchema = new Schema<ITaskActivity>(
  {
    id: { type: Number, index: true },
    taskId: { type: Number, required: true, index: true },
    userId: { type: Number, required: true },
    type: {
      type: String,
      enum: [
        "CREATED",
        "UPDATED",
        "ASSIGNED",
        "STATUS_CHANGED",
        "PRIORITY_CHANGED",
        "TAG_ADDED",
        "TAG_REMOVED",
        "SUBSCRIBER_ADDED",
        "SUBSCRIBER_REMOVED",
        "COMMENT_ADDED",
      ],
      required: true,
    },
    oldValue: { type: String, default: null },
    newValue: { type: String, default: null },
    comment: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    toJSON: {
      transform(_doc: any, ret: any) {
        ret.id = ret.id || ret._id;
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

export const TaskActivity =
  mongoose.models.TaskActivity ||
  mongoose.model<ITaskActivity>("TaskActivity", TaskActivitySchema);
export default TaskActivity;
