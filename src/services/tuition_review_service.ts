import mongoose from "mongoose";
import TuitionReview, { ITuitionReview } from "../models/TuitionReview";
import TuitionEnrollment from "../models/TuitionEnrollment";
import TuitionProviderProfile from "../models/TuitionProviderProfile";
import { recalculateAndSaveProviderTier } from "./tuition_tier_service";

export interface CreateTuitionReviewInput {
  providerId: string;
  enrollmentId: string;
  rating: number;
  reviewText: string;
}

export const createTuitionReview = async (
  studentId: string,
  input: CreateTuitionReviewInput
): Promise<ITuitionReview> => {
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new Error("Invalid student ID");
  }
  if (!mongoose.Types.ObjectId.isValid(input.providerId)) {
    throw new Error("Invalid provider ID");
  }
  if (!mongoose.Types.ObjectId.isValid(input.enrollmentId)) {
    throw new Error("Invalid enrollment ID");
  }

  const rating = Number(input.rating);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    throw new Error("Rating must be an integer between 1 and 5");
  }

  if (!input.reviewText || input.reviewText.trim().length < 5) {
    throw new Error("Review text must be at least 5 characters long");
  }

  const studentObjId = new mongoose.Types.ObjectId(studentId);
  const providerObjId = new mongoose.Types.ObjectId(input.providerId);
  const enrollmentObjId = new mongoose.Types.ObjectId(input.enrollmentId);

  // Strict verification: Student must have an eligible verified enrolment with this provider
  const enrollment = await TuitionEnrollment.findOne({
    _id: enrollmentObjId,
    studentId: studentObjId,
    providerId: providerObjId,
  });

  if (!enrollment) {
    throw new Error(
      "Forbidden: You can only review tuition providers with whom you hold an eligible enrolment"
    );
  }

  // Prevent review submission before the tuition service is completed
  if (enrollment.status !== "completed") {
    throw new Error(
      "Forbidden: Reviews can only be submitted after the tuition enrolment has been completed"
    );
  }

  // Ensure the enrolment was legitimately paid and verified
  if (!enrollment.paymentTransactionId) {
    throw new Error(
      "Forbidden: Only paid and verified enrolments are eligible for reviews"
    );
  }

  // Prevent duplicate reviews for the same enrolment
  const existingReview = await TuitionReview.findOne({
    studentId: studentObjId,
    providerId: providerObjId,
    enrollmentId: enrollmentObjId,
  });

  if (existingReview) {
    throw new Error("You have already submitted a review for this tuition class");
  }

  const review = await TuitionReview.create({
    studentId: studentObjId,
    providerId: providerObjId,
    enrollmentId: enrollmentObjId,
    subject: enrollment.subject,
    rating,
    reviewText: input.reviewText.trim(),
    status: "published",
  });

  // Automatically recalculate provider profile rating, score, and tier
  const providerProfile = await TuitionProviderProfile.findOne({ userId: providerObjId });
  if (providerProfile) {
    await recalculateAndSaveProviderTier(providerProfile._id.toString());
  }

  return review;
};

export const getProviderReviews = async (providerId: string) => {
  return await TuitionReview.find({
    providerId: new mongoose.Types.ObjectId(providerId),
    status: "published",
  })
    .populate("studentId", "name")
    .sort({ createdAt: -1 })
    .lean();
};

