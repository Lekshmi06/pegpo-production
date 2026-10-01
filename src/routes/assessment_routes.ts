import { Router } from "express";
import { authenticateTeacher } from "../middlewares/auth_middleware";
import { assessmentUpload } from "../config/assessment_upload";
import {
  uploadAndExtractAssessmentController,
  generateAiAssessmentController,
  suggestAnswersController,
  saveAssessmentController,
  listTeacherAssessmentsController,
  getAssessmentByIdController,
  deleteAssessmentController,
  getAssessmentAttemptsController,
  publishAssessmentResultsController,
} from "../controllers/assessment_controller";

const router = Router();

// Secure all assessment routes with authenticateTeacher
router.use(authenticateTeacher);

// Document upload & parsing
router.post(
  "/upload",
  assessmentUpload.single("file"),
  uploadAndExtractAssessmentController
);

// AI generation
router.post("/generate", generateAiAssessmentController);

// AI answer suggestions for unkeyed questions
router.post("/suggest-answers", suggestAnswersController);

// Save / update assessment
router.post("/save", saveAssessmentController);

// List assessments
router.get("/", listTeacherAssessmentsController);

// Get single assessment
router.get("/:id", getAssessmentByIdController);

// Delete assessment
router.delete("/:id", deleteAssessmentController);

// Get assessment attempts (formal scheduled tests)
router.get("/:id/attempts", getAssessmentAttemptsController);

// Publish or unpublish assessment results for students
router.post("/:id/publish-results", publishAssessmentResultsController);

export default router;
