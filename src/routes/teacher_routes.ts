import { Router } from "express";
import {
  createTeacherController,
  getTeacherController,
  getTeacherByEmailController,
  updateTeacherController,
  getTeacherMeController,
  updateTeacherPasswordController,
} from "../controllers/teacher_controller";
import { handleTeacherAIChatController } from "../controllers/teacher_ai_controller";
import { authenticateTeacher } from "../middlewares/auth_middleware";

const router = Router();

// AI Teaching Copilot chat endpoint
router.post("/ai-assistant/chat", authenticateTeacher, handleTeacherAIChatController);

router.post("/", createTeacherController);
router.get("/me", getTeacherMeController);
router.get("/by-email/:email", getTeacherByEmailController);
router.get("/:id", getTeacherController);
router.put("/:id", updateTeacherController);
router.put("/:id/password", updateTeacherPasswordController);

export default router;
