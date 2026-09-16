import mongoose, { Document, Schema } from "mongoose";

export type CalendarEventType =
  | "class"
  | "exam"
  | "assignment"
  | "reminder"
  | "task"
  | "general";

export interface ICalendarEvent extends Document {
  userId: mongoose.Types.ObjectId;
  studentProfileId?: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  eventType: CalendarEventType;
  date: string; // YYYY-MM-DD or date label
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  location?: string;
  color?: string;
  isCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const calendarEventSchema = new Schema<ICalendarEvent>(
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
    eventType: {
      type: String,
      enum: ["class", "exam", "assignment", "reminder", "task", "general"],
      default: "task",
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    startTime: {
      type: String,
    },
    endTime: {
      type: String,
    },
    location: {
      type: String,
      default: "",
    },
    color: {
      type: String,
      default: "#3b82f6",
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

calendarEventSchema.index({ userId: 1, date: 1 });

const CalendarEvent = mongoose.model<ICalendarEvent>(
  "CalendarEvent",
  calendarEventSchema
);
export default CalendarEvent;
