import { Router } from "express";
import { authenticateTeacher } from "../middlewares/auth_middleware";
import {
  createTeachingContextController,
  getTeachingContextsController,
  getTeachingContextByIdController,
  updateTeachingContextController,
} from "../controllers/teaching_context_controller";

const router = Router();

// Secure all teaching-context routes with authenticateTeacher middleware
router.use(authenticateTeacher);

router.post("/", createTeachingContextController);
router.get("/", getTeachingContextsController);
router.get("/:id", getTeachingContextByIdController);
router.put("/:id", updateTeachingContextController);
router.patch("/:id", updateTeachingContextController);

export default router;
