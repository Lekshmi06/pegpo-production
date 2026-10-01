import { Router } from "express";
import { authenticateTeacher } from "../middlewares/auth_middleware";
import {
  createLessonPlanController,
  getLessonPlansController,
  getLessonPlanByIdController,
  updateLessonPlanController,
  updateSessionStatusController,
  generateAILessonPlanController,
  addSessionResourceController,
  updateSessionResourceController,
  deleteSessionResourceController,
  toggleSessionResourceApprovalController,
  generateSessionFlashcardsController,
} from "../controllers/lesson_plan_controller";

const router = Router();

// Secure all lesson-plan routes with authenticateTeacher middleware
router.use(authenticateTeacher);

router.post("/ai-generate", generateAILessonPlanController);
router.post("/", createLessonPlanController);
router.get("/", getLessonPlansController);
router.get("/:id", getLessonPlanByIdController);
router.put("/:id", updateLessonPlanController);
router.patch("/:id", updateLessonPlanController);
router.patch("/:id/sessions/:sessionNum", updateSessionStatusController);

// Supporting teaching resource routes
router.post("/:id/sessions/:sessionNum/resources", addSessionResourceController);
router.put("/:id/sessions/:sessionNum/resources/:resourceId", updateSessionResourceController);
router.delete("/:id/sessions/:sessionNum/resources/:resourceId", deleteSessionResourceController);
router.patch("/:id/sessions/:sessionNum/resources/:resourceId/approve", toggleSessionResourceApprovalController);
router.post("/:id/sessions/:sessionNum/generate-flashcards", generateSessionFlashcardsController);

export default router;
