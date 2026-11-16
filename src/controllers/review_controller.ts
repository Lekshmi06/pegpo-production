import { Request, Response } from "express";
import {
  submitCourseReview,
  getCourseReviews,
  checkReviewEligibility,
} from "../services/review_service";
import {
  getLearnerCourseCertificate,
  verifyCertificateByNumber,
  issueCourseCertificate,
} from "../services/certificate_service";

const getParam = (p: unknown): string => {
  if (typeof p === "string") return p;
  if (Array.isArray(p) && typeof p[0] === "string") return p[0];
  return "";
};

export const checkReviewEligibilityController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const learnerId = req.user?._id?.toString();
    const courseId = getParam(req.params.courseId);

    if (!learnerId) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const eligibility = await checkReviewEligibility(learnerId, courseId);
    res.status(200).json({
      success: true,
      data: eligibility,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to check review eligibility",
    });
  }
};

export const submitCourseReviewController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const learnerId = req.user?._id?.toString();
    const courseId = getParam(req.params.courseId);
    const { rating, comment, title } = req.body;

    if (!learnerId) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const review = await submitCourseReview({
      learnerId,
      courseId,
      rating: Number(rating),
      comment,
      title,
    });

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      data: review,
    });
  } catch (err: any) {
    res.status(403).json({
      success: false,
      message: err.message || "Review submission rejected",
    });
  }
};

export const getCourseReviewsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const courseId = getParam(req.params.courseId);
    const reviews = await getCourseReviews(courseId);
    res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to load course reviews",
    });
  }
};

export const getCourseCertificateController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const learnerId = req.user?._id?.toString();
    const courseId = getParam(req.params.courseId);

    if (!learnerId) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    let certificate = await getLearnerCourseCertificate(learnerId, courseId);

    // If not generated yet, attempt issuance if course is 100% completed
    if (!certificate) {
      try {
        certificate = await issueCourseCertificate(learnerId, courseId);
      } catch {
        // Not eligible yet
      }
    }

    if (!certificate) {
      res.status(404).json({
        success: false,
        message: "No certificate found for this course yet. Complete 100% of lessons to unlock.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: certificate,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve certificate",
    });
  }
};

export const verifyCertificateController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const certificateNumber = getParam(req.params.certificateNumber);
    const cert = await verifyCertificateByNumber(certificateNumber);

    if (!cert) {
      res.status(404).json({
        success: false,
        message: "Certificate not found or invalid",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: cert,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Verification failed",
    });
  }
};
