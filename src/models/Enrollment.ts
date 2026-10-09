import mongoose, { Document, Schema } from "mongoose";

export type EnrollmentStatus = "active" | "completed";
export type PaymentStatus = "free" | "paid" | "waived" | "pending";

export interface IEnrollment extends Document {
  learner: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  status: EnrollmentStatus;
  paymentStatus: PaymentStatus;
  enrolledAt: Date;
  completedLessons: string[];
  lastAccessedLesson?: string;
  progressPercentage: number;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const enrollmentSchema = new Schema<IEnrollment>(
  {
    learner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["free", "paid", "waived", "pending"],
      default: "free",
      required: true,
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    completedLessons: {
      type: [String],
      default: [],
    },
    lastAccessedLesson: {
      type: String,
    },
    progressPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to guarantee no duplicate enrollment
enrollmentSchema.index({ learner: 1, course: 1 }, { unique: true });

const Enrollment = mongoose.model<IEnrollment>("Enrollment", enrollmentSchema);

export default Enrollment;
