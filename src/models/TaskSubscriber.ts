import mongoose, { Document, Schema } from "mongoose";

export interface ITaskSubscriber extends Document {
  taskId: number;
  userId: number;
  createdAt: Date;
}

const TaskSubscriberSchema = new Schema<ITaskSubscriber>(
  {
    taskId: { type: Number, required: true, index: true },
    userId: { type: Number, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
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

TaskSubscriberSchema.index({ taskId: 1, userId: 1 }, { unique: true });

export const TaskSubscriber =
  mongoose.models.TaskSubscriber ||
  mongoose.model<ITaskSubscriber>("TaskSubscriber", TaskSubscriberSchema);
export default TaskSubscriber;
