import mongoose, { Document, Schema } from "mongoose";

export type AcademyExamTestType = "Weekly Test" | "Chapter Assessment" | "Mock Exam" | "1-on-1 Evaluation";

export interface IExamStudentResult {
  studentId: mongoose.Types.ObjectId;
  studentCode: string;
  studentName: string;
  marksObtained: number;
  isAbsent: boolean;
  remarks?: string;
}

export interface IAcademyExam extends Document {
  programId: mongoose.Types.ObjectId;
  programTitle: string;
  subject: string;
  title: string;
  testType: AcademyExamTestType;
  date: string; // YYYY-MM-DD
  maxMarks: number;
  passingMarks: number;
  session: string; // e.g. "2026-27"
  results: IExamStudentResult[];
  createdAt: Date;
  updatedAt: Date;
}

const examStudentResultSchema = new Schema<IExamStudentResult>(
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
    marksObtained: {
      type: Number,
      default: 0,
    },
    isAbsent: {
      type: Boolean,
      default: false,
    },
    remarks: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const academyExamSchema = new Schema<IAcademyExam>(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionProgram",
      required: true,
    },
    programTitle: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    testType: {
      type: String,
      enum: ["Weekly Test", "Chapter Assessment", "Mock Exam", "1-on-1 Evaluation"],
      default: "Weekly Test",
      required: true,
    },
    date: {
      type: String,
      required: true,
      trim: true,
    },
    maxMarks: {
      type: Number,
      required: true,
      default: 50,
    },
    passingMarks: {
      type: Number,
      required: true,
      default: 20,
    },
    session: {
      type: String,
      required: true,
      default: "2026-27",
      trim: true,
    },
    results: [examStudentResultSchema],
  },
  {
    timestamps: true,
  }
);

academyExamSchema.index({ programId: 1, session: 1, date: -1 });

export default mongoose.models.AcademyExam || mongoose.model<IAcademyExam>("AcademyExam", academyExamSchema);
