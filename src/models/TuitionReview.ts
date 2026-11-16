import mongoose, { Document, Schema } from "mongoose";

export type TuitionReviewStatus = "published" | "flagged" | "hidden";

export interface ITuitionReview extends Document {
  studentId: mongoose.Types.ObjectId;
  providerId: mongoose.Types.ObjectId;
  enrollmentId: mongoose.Types.ObjectId;
  subject: string;
  rating: number; // 1 to 5
  reviewText: string;
  status: TuitionReviewStatus;
  moderationNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tuitionReviewSchema = new Schema<ITuitionReview>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionEnrollment",
      required: true,
      unique: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    reviewText: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["published", "flagged", "hidden"],
      default: "published",
      index: true,
    },
    moderationNotes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Enforce one review per verified enrolment to prevent duplicate reviews
tuitionReviewSchema.index(
  { studentId: 1, providerId: 1, enrollmentId: 1 },
  { unique: true }
);

const TuitionReview = mongoose.model<ITuitionReview>(
  "TuitionReview",
  tuitionReviewSchema
);

export default TuitionReview;

