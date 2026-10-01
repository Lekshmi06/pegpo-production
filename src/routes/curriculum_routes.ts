import { Router } from "express";
import { authenticateTeacher } from "../middlewares/auth_middleware";
import teacherCurriculumUpload from "../config/teacher_upload";
import {
  createCurriculumController,
  getCurriculumsController,
  getCurriculumByIdController,
  updateCurriculumController,
  processCurriculumController,
} from "../controllers/curriculum_controller";

const router = Router();

// Secure all curriculum routes with authenticateTeacher
router.use(authenticateTeacher);

router.post("/", teacherCurriculumUpload.single("file"), createCurriculumController);
router.get("/", getCurriculumsController);
router.get("/:id", getCurriculumByIdController);
router.post("/:id/process", processCurriculumController);
router.put("/:id", updateCurriculumController);
router.patch("/:id", updateCurriculumController);

export default router;
