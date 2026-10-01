import { Router } from "express";
import { authenticateTeacher } from "../middlewares/auth_middleware";
import {
  getTeacherTasksHandler,
  getUpcomingTeacherTasksHandler,
  getTeacherTaskByIdHandler,
  createTeacherTaskHandler,
  updateTeacherTaskHandler,
  deleteTeacherTaskHandler,
} from "../controllers/teacher_task_controller";

const router = Router();

// Apply teacher authentication middleware to all teacher task routes
router.use(authenticateTeacher);

router.get("/", getTeacherTasksHandler);
router.get("/upcoming", getUpcomingTeacherTasksHandler);
router.get("/:id", getTeacherTaskByIdHandler);
router.post("/", createTeacherTaskHandler);
router.put("/:id", updateTeacherTaskHandler);
router.delete("/:id", deleteTeacherTaskHandler);

export default router;
