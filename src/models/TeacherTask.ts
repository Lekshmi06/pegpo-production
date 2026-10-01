import mongoose, { Document, Schema } from "mongoose";

export type TeacherTaskType =
  | "Operational"
  | "Technical"
  | "Strategic"
  | "Hiring"
  | "Financial"
  | "Lecture"
  | "Deadline"
  | "Meeting"
  | "General";

export type TeacherTaskPriority = "Low" | "Normal" | "High" | "Urgent";

export type TeacherTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "New task"
  | "Scheduled"
  | "In Progress"
  | "Completed";

export interface ITeacherTask extends Document {
  teacherId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // e.g. "10:00 AM" or "10:00"
  endTime?: string; // e.g. "11:00 AM" or "11:00"
  taskType: TeacherTaskType;
  priority: TeacherTaskPriority;
  status: TeacherTaskStatus;
  teachingContextId?: mongoose.Types.ObjectId;
  classSectionId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const teacherTaskSchema = new Schema<ITeacherTask>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherProfile",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    startTime: {
      type: String,
      trim: true,
    },
    endTime: {
      type: String,
      trim: true,
    },
    taskType: {
      type: String,
      enum: [
        "Operational",
        "Technical",
        "Strategic",
        "Hiring",
        "Financial",
        "Lecture",
        "Deadline",
        "Meeting",
        "General",
      ],
      default: "General",
    },
    priority: {
      type: String,
      enum: ["Low", "Normal", "High", "Urgent"],
      default: "Normal",
    },
    status: {
      type: String,
      enum: [
        "pending",
        "in_progress",
        "completed",
        "New task",
        "Scheduled",
        "In Progress",
        "Completed",
      ],
      default: "pending",
    },
    teachingContextId: {
      type: Schema.Types.ObjectId,
      ref: "TeachingContext",
      index: true,
    },
    classSectionId: {
      type: Schema.Types.ObjectId,
      ref: "ClassSection",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

teacherTaskSchema.index({ teacherId: 1, date: 1 });
teacherTaskSchema.index({ teacherId: 1, status: 1 });

const TeacherTask = mongoose.model<ITeacherTask>("TeacherTask", teacherTaskSchema);
export default TeacherTask;
