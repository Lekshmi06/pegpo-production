import { Router } from "express";
import { authenticateLearner } from "../middlewares/auth_middleware";
import {
  getLearnerEnrolledCoursesController,
  getLearnerCourseLearningStateController,
  updateLessonProgressController,
} from "../controllers/enrollment_controller";

const router = Router();

// Learner enrolled courses list
router.get("/courses", authenticateLearner, getLearnerEnrolledCoursesController);

// Learner course learning player view
router.get("/courses/:id", authenticateLearner, getLearnerCourseLearningStateController);

// Learner lesson completion & progress update
router.put("/courses/:id/progress", authenticateLearner, updateLessonProgressController);

export default router;
