import { Router } from "express";
import {
  listExamsController,
  getExamDetailsController,
  listPYQsController,
  createMockExamController,
} from "../controllers/competitive_exam_controller";
import {
  authenticateStudent,
  optionalAuthenticateStudent,
} from "../middlewares/auth_middleware";

const router = Router();

// 1. Exam Catalog and Patterns
router.get("/exams", optionalAuthenticateStudent, listExamsController);
router.get("/exams/:examCode", optionalAuthenticateStudent, getExamDetailsController);

// 2. Authentic Previous-Year Questions (Strictly sourceType === 'previous_year')
router.get("/pyqs", optionalAuthenticateStudent, listPYQsController);

// 3. Mock Exam Generation (Secured with student isolation)
router.post("/mocks/generate", authenticateStudent, createMockExamController);

export default router;
