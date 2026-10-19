import { Router } from "express";
import {
  createStudentController,
  getStudentController,
  getStudentByEmailController,
  updateStudentController,
  searchStudentController,
  getStudentAnalyticsController,
  recordStudySessionController,
} from "../controllers/student_controller";
import { authenticateStudent } from "../middlewares/auth_middleware";

const router = Router();

// Student Analytics Dashboard & Study Session Endpoints (Authenticated)
router.get("/dashboard/analytics", authenticateStudent, getStudentAnalyticsController);
router.post("/dashboard/study-session", authenticateStudent, recordStudySessionController);

// Profile and Lookup Endpoints
router.post("/", createStudentController);
router.get("/search", searchStudentController);
router.get("/by-email/:email", getStudentByEmailController);
router.get("/:id", getStudentController);
router.put("/:id", updateStudentController);

export default router;
