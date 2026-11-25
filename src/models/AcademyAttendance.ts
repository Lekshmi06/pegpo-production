import mongoose, { Document, Schema } from "mongoose";

export type AcademySessionType = "1-on-1" | "1-to-N";
export type AcademySessionOutcome = "Completed" | "Rescheduled" | "Cancelled";
export type AcademyAttendanceStatus = "Present" | "Absent" | "Late" | "Excused";
export type AcademyAttendanceSource = "Manual" | "LiveClassroom";

export interface IStudentAttendanceRecord {
  studentId: mongoose.Types.ObjectId;
  studentCode: string;
  studentName: string;
  status: AcademyAttendanceStatus;
  countTowardsQuota: boolean;
  remarks?: string;
}

export interface IAcademyAttendance extends Document {
  programId: mongoose.Types.ObjectId;
  programTitle: string;
  sessionType: AcademySessionType;
  teacherId: mongoose.Types.ObjectId;
  teacherCode: string;
  teacherName: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "17:00 - 18:00"
  sessionOutcome: AcademySessionOutcome;
  source: AcademyAttendanceSource;
  session: string; // e.g. "2026-27"
  records: IStudentAttendanceRecord[];
  createdAt: Date;
  updatedAt: Date;
}

const studentAttendanceRecordSchema = new Schema<IStudentAttendanceRecord>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    studentCode: {
      type: String,
      required: true,
      trim: true,
    },
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Present", "Absent", "Late", "Excused"],
      required: true,
      default: "Present",
    },
    countTowardsQuota: {
      type: Boolean,
      default: true,
    },
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const academyAttendanceSchema = new Schema<IAcademyAttendance>(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionProgram",
      required: true,
      index: true,
    },
    programTitle: {
      type: String,
      required: true,
      trim: true,
    },
    sessionType: {
      type: String,
      enum: ["1-on-1", "1-to-N"],
      required: true,
      default: "1-to-N",
    },
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    teacherCode: {
      type: String,
      required: true,
      trim: true,
    },
    teacherName: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
      trim: true,
      index: true,
    },
    timeSlot: {
      type: String,
      required: true,
      trim: true,
    },
    sessionOutcome: {
      type: String,
      enum: ["Completed", "Rescheduled", "Cancelled"],
      required: true,
      default: "Completed",
    },
    source: {
      type: String,
      enum: ["Manual", "LiveClassroom"],
      required: true,
      default: "Manual",
    },
    session: {
      type: String,
      required: true,
      default: "2026-27",
      trim: true,
    },
    records: {
      type: [studentAttendanceRecordSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound uniqueness on (programId, teacherId, date, timeSlot) so a teacher can take multiple 1-on-1 or batch sessions on the same day
academyAttendanceSchema.index(
  { programId: 1, teacherId: 1, date: 1, timeSlot: 1 },
  { unique: true }
);

academyAttendanceSchema.index({ date: 1, sessionOutcome: 1 });
academyAttendanceSchema.index({ "records.studentId": 1, date: 1 });

export default mongoose.models.AcademyAttendance ||
  mongoose.model<IAcademyAttendance>("AcademyAttendance", academyAttendanceSchema);
