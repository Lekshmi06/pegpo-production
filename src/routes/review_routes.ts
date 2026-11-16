import { Router } from "express";
import {
  authenticateLearner,
  optionalAuthenticateUser,
} from "../middlewares/auth_middleware";
import {
  checkReviewEligibilityController,
  submitCourseReviewController,
  getCourseReviewsController,
  getCourseCertificateController,
  verifyCertificateController,
} from "../controllers/review_controller";

const router = Router();

// Public course reviews list
router.get("/courses/:courseId/reviews", optionalAuthenticateUser, getCourseReviewsController);

// Check if logged-in student is eligible to review (must have certificate & completed course)
router.get(
  "/courses/:courseId/review-eligibility",
  authenticateLearner,
  checkReviewEligibilityController
);

// Submit verified course review
router.post(
  "/courses/:courseId/reviews",
  authenticateLearner,
  submitCourseReviewController
);

// Get student's course certificate
router.get(
  "/courses/:courseId/certificate",
  authenticateLearner,
  getCourseCertificateController
);

// Public certificate verification
router.get("/certificates/:certificateNumber/verify", verifyCertificateController);

export default router;

