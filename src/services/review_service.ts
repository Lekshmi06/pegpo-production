import mongoose from "mongoose";
import CourseReview, { ICourseReview } from "../models/CourseReview";
import Certificate from "../models/Certificate";
import Enrollment from "../models/Enrollment";
import Course from "../models/Course";
import User from "../models/User";

export interface SubmitReviewInput {
  learnerId: string;
  courseId: string;
  rating: number;
  comment: string;
  title?: string;
}

export interface ReviewEligibilityResult {
  eligible: boolean;
  reason?: string;
  certificateNumber?: string;
  completedAt?: Date;
}

/**
 * Validates whether the learner is eligible to review the course:
 * Strictly enforces that the student is enrolled, completed 100%, and holds an official certificate.
 */
export const checkReviewEligibility = async (
  learnerId: string,
  courseId: string
): Promise<ReviewEligibilityResult> => {
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return { eligible: false, reason: "Invalid course ID" };
  }

  const learnerObjectId = new mongoose.Types.ObjectId(learnerId);
  const courseObjectId = new mongoose.Types.ObjectId(courseId);

  // 1. Check if already reviewed
  const existingReview = await CourseReview.findOne({
    learner: learnerObjectId,
    course: courseObjectId,
  });

  if (existingReview) {
    return {
      eligible: false,
      reason: "You have already submitted a review for this course.",
    };
  }

  // 2. Check enrollment
  const enrollment = await Enrollment.findOne({
    learner: learnerObjectId,
    course: courseObjectId,
  });

  if (!enrollment) {
    return {
      eligible: false,
      reason: "Enrollment required: You must be enrolled in this course to leave a review.",
    };
  }

  if (enrollment.progressPercentage < 100 || enrollment.status !== "completed") {
    return {
      eligible: false,
      reason: `Course completion required: You have completed ${enrollment.progressPercentage}% of this course. Only graduates who complete 100% of lessons can leave a review.`,
    };
  }

  // 3. Strict Certificate Check
  const certificate = await Certificate.findOne({
    learner: learnerObjectId,
    course: courseObjectId,
  });

  if (!certificate) {
    return {
      eligible: false,
      reason: "Certificate required: An official certificate of completion must be issued before submitting a review.",
    };
  }

  return {
    eligible: true,
    certificateNumber: certificate.certificateNumber,
    completedAt: certificate.issueDate,
  };
};

/**
 * Submits a verified course review.
 * Enforces verified enrollment + certificate requirement on the backend.
 * Recomputes and updates course averageRating and reviewCount.
 */
export const submitCourseReview = async (
  input: SubmitReviewInput
): Promise<ICourseReview> => {
  const { learnerId, courseId, rating, comment, title } = input;

  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5 stars");
  }

  if (!comment || comment.trim().length < 10) {
    throw new Error("Review comment must be at least 10 characters long");
  }

  const eligibility = await checkReviewEligibility(learnerId, courseId);
  if (!eligibility.eligible) {
    throw new Error(`Review submission rejected: ${eligibility.reason}`);
  }

  const learnerObjectId = new mongoose.Types.ObjectId(learnerId);
  const courseObjectId = new mongoose.Types.ObjectId(courseId);

  const learner = await User.findById(learnerObjectId);
  const enrollment = await Enrollment.findOne({
    learner: learnerObjectId,
    course: courseObjectId,
  });
  const certificate = await Certificate.findOne({
    learner: learnerObjectId,
    course: courseObjectId,
  });

  const reviewerName =
    learner?.name ||
    learner?.email?.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
    "Verified Graduate";

  const review = await CourseReview.create({
    course: courseObjectId,
    learner: learnerObjectId,
    enrollment: enrollment!._id,
    certificate: certificate!._id,
    learnerName: reviewerName,
    rating,
    title: title?.trim(),
    comment: comment.trim(),
  });

  // Recompute course average rating & count
  const allReviews = await CourseReview.find({ course: courseObjectId });
  const reviewCount = allReviews.length;
  const avg = Number(
    (allReviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount).toFixed(1)
  );

  await Course.findByIdAndUpdate(courseObjectId, {
    averageRating: avg,
    reviewCount,
  });

  return review;
};

export const getCourseReviews = async (courseId: string) => {
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error("Invalid course ID");
  }

  const reviews = await CourseReview.find({
    course: new mongoose.Types.ObjectId(courseId),
  })
    .sort({ createdAt: -1 })
    .limit(100);

  return reviews;
};

