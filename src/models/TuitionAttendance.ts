import mongoose, { Document, Schema } from "mongoose";

export type TuitionAttendanceStatus = "present" | "absent" | "late";

export interface IAttendanceRecord {
  studentId: mongoose.Types.ObjectId;
  status: TuitionAttendanceStatus;
  remarks?: string;
  markedAt: Date;
}

export interface ITuitionAttendance extends Document {
  sessionId: mongoose.Types.ObjectId;
  providerId: mongoose.Types.ObjectId;
  records: IAttendanceRecord[];
  createdAt: Date;
  updatedAt: Date;
}

const tuitionAttendanceSchema = new Schema<ITuitionAttendance>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionSession",
      required: true,
      unique: true,
      index: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    records: [
      {
        studentId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        status: {
          type: String,
          enum: ["present", "absent", "late"],
          default: "present",
        },
        remarks: {
          type: String,
          trim: true,
        },
        markedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const TuitionAttendance = mongoose.model<ITuitionAttendance>(
  "TuitionAttendance",
  tuitionAttendanceSchema
);

export default TuitionAttendance;

