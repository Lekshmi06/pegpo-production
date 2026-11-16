import mongoose, { Document, Schema } from "mongoose";

export interface ITaskComment extends Document {
  id?: number;
  taskId: number;
  userId: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const TaskCommentSchema = new Schema<ITaskComment>(
  {
    id: { type: Number, index: true },
    taskId: { type: Number, required: true, index: true },
    userId: { type: Number, required: true },
    content: { type: String, required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        ret.id = ret.id || ret._id;
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

export const TaskComment =
  mongoose.models.TaskComment ||
  mongoose.model<ITaskComment>("TaskComment", TaskCommentSchema);
export default TaskComment;
