import { Router } from "express";
import {
  createClassSectionController,
  listClassSectionsController,
  getClassSectionByIdController,
  getClassSectionStudentsController,
  enrollStudentController,
  removeStudentController,
  getTeacherClassesController,
  inviteStudentController,
} from "../controllers/class_section_controller";
import { authenticateTeacher } from "../middlewares/auth_middleware";

const router = Router();

// Teacher's specific groups endpoint
router.get("/teacher/my-classes", authenticateTeacher, getTeacherClassesController);

// General ClassSection CRUD & Membership
router.post("/", createClassSectionController);
router.get("/", listClassSectionsController);
router.get("/:id", getClassSectionByIdController);
router.get("/:id/students", getClassSectionStudentsController);
router.post("/enroll", enrollStudentController);
router.post("/:id/invite", inviteStudentController);
router.post("/invite", inviteStudentController);
router.post("/remove-student", removeStudentController);

export default router;
