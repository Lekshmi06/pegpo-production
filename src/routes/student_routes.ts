import { Router } from "express";
import {
  createStudentController,
  getStudentController,
  getStudentByEmailController,
  updateStudentController,
} from "../controllers/student_controller";

const router = Router();

router.post("/", createStudentController);
router.get("/by-email/:email", getStudentByEmailController);
router.get("/:id", getStudentController);
router.put("/:id", updateStudentController);

export default router;
