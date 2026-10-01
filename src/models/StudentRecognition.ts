import mongoose, { Document, Schema } from "mongoose";

export interface IStudentRecognition extends Document {
  teacherId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  classSectionId: mongoose.Types.ObjectId;
  stickerId: string;
  title: string;
  icon: string;
  description?: string;
  awardedAt: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const studentRecognitionSchema = new Schema<IStudentRecognition>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherProfile",
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
      index: true,
    },
    classSectionId: {
      type: Schema.Types.ObjectId,
      ref: "ClassSection",
      required: true,
      index: true,
    },
    stickerId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    icon: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    awardedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for optimal retrieval
studentRecognitionSchema.index({ studentId: 1, awardedAt: -1 });
studentRecognitionSchema.index({ classSectionId: 1, awardedAt: -1 });
studentRecognitionSchema.index({ teacherId: 1, awardedAt: -1 });
studentRecognitionSchema.index({ studentId: 1, classSectionId: 1 });

const StudentRecognition = mongoose.model<IStudentRecognition>(
  "StudentRecognition",
  studentRecognitionSchema
);

export default StudentRecognition;
