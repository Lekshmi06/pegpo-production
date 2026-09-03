import { Router } from "express";
import {
  createStudentController,
  getStudentController,
  updateStudentController,
} from "../controllers/student_controller";

const router = Router();

router.post("/", createStudentController);
router.get("/:id", getStudentController);
router.put("/:id", updateStudentController);

export default router;
