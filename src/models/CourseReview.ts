import mongoose, { Document, Schema } from "mongoose";

export interface ICourseReview extends Document {
  course: mongoose.Types.ObjectId;
  learner: mongoose.Types.ObjectId;
  enrollment: mongoose.Types.ObjectId;
  certificate: mongoose.Types.ObjectId;
  learnerName: string;
  rating: number; // 1 to 5
  title?: string;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

const courseReviewSchema = new Schema<ICourseReview>(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    learner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    enrollment: {
      type: Schema.Types.ObjectId,
      ref: "Enrollment",
      required: true,
      index: true,
    },
    certificate: {
      type: Schema.Types.ObjectId,
      ref: "Certificate",
      required: true,
      index: true,
    },
    learnerName: {
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
    title: {
      type: String,
      trim: true,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 2000,
    },
  },
  { timestamps: true }
);

// One review per student per course (strictly prevents duplicate reviews)
courseReviewSchema.index({ course: 1, learner: 1 }, { unique: true });

const CourseReview = mongoose.model<ICourseReview>("CourseReview", courseReviewSchema);

export default CourseReview;

