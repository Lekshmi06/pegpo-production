import { Router } from "express";
import { authenticateTeacher } from "../middlewares/auth_middleware";
import teacherTemplateUpload from "../config/teacher_template_upload";
import {
  getLessonPlanTemplatesController,
  analyzeTemplateController,
  createCustomTemplateController,
  getLessonPlanTemplateByIdController,
} from "../controllers/lesson_plan_template_controller";

const router = Router();

// Secure all template routes with teacher authentication
router.use(authenticateTeacher);

router.get("/", getLessonPlanTemplatesController);
router.post("/analyze", teacherTemplateUpload.single("file"), analyzeTemplateController);
router.post("/custom", createCustomTemplateController);
router.get("/:id", getLessonPlanTemplateByIdController);

export default router;
