import mongoose, { Document, Schema } from "mongoose";

export interface ITaskTag extends Document {
  taskId: number;
  tagId: number;
}

const TaskTagSchema = new Schema<ITaskTag>(
  {
    taskId: { type: Number, required: true, index: true },
    tagId: { type: Number, required: true, index: true },
  },
  {
    toJSON: {
      transform(_doc: any, ret: any) {
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

TaskTagSchema.index({ taskId: 1, tagId: 1 }, { unique: true });

export const TaskTag =
  mongoose.models.TaskTag ||
  mongoose.model<ITaskTag>("TaskTag", TaskTagSchema);
export default TaskTag;
