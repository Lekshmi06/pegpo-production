import { Router } from "express";
import {
  getTestsController,
  getTestByIdController,
  startTestAttemptController,
  submitTestAttemptController,
  getAttemptAnalysisController,
  getStudentHistoryController,
  generateTestController,
  getPracticeQuestionsController,
  getQuizzesController,
  generateQuizController,
} from "../controllers/test_controller";
import {
  authenticateStudent,
  optionalAuthenticateStudent,
} from "../middlewares/auth_middleware";

const router = Router();

// 1. History and Attempt routes (must precede /:testId parameterized route)
router.get("/attempts/my-history", authenticateStudent, getStudentHistoryController);
router.get("/attempts/:attemptId", authenticateStudent, getAttemptAnalysisController);

// 2. Practice and Quiz routes (must precede /:testId parameterized route)
router.get("/practice", authenticateStudent, getPracticeQuestionsController);
router.get("/quizzes", authenticateStudent, getQuizzesController);
router.post("/quiz/generate", authenticateStudent, generateQuizController);

// 3. AI Test Generation route (must precede /:testId parameterized route)
router.post("/generate", authenticateStudent, generateTestController);

// 4. Test Catalog routes
router.get("/", optionalAuthenticateStudent, getTestsController);
router.get("/:testId", optionalAuthenticateStudent, getTestByIdController);

// 5. Test Session & Submission routes
router.post("/:testId/start", authenticateStudent, startTestAttemptController);
router.post("/:testId/submit", authenticateStudent, submitTestAttemptController);

export default router;
