import { Router } from "express";
import teacherMaterialUpload from "../config/teacher_material_upload";
import {
  authenticateTeacher,
  optionalAuthenticateStudent,
} from "../middlewares/auth_middleware";
import {
  createTeacherMaterialController,
  getTeacherMaterialsController,
  getTeacherMaterialByIdController,
  updateTeacherMaterialController,
  publishTeacherMaterialController,
  deleteTeacherMaterialController,
  getStudentPublishedMaterialsController,
  recordMaterialDownloadController,
  importToStudentSourceController,
} from "../controllers/teacher_material_controller";

const router = Router();

// Public / Student access to published materials
router.get("/published", optionalAuthenticateStudent, getStudentPublishedMaterialsController);
router.post("/:id/download", recordMaterialDownloadController);
router.post("/:id/import-to-sources", optionalAuthenticateStudent, importToStudentSourceController);

// Teacher-managed materials
router.post(
  "/",
  authenticateTeacher,
  teacherMaterialUpload.single("file"),
  createTeacherMaterialController
);

router.get("/", authenticateTeacher, getTeacherMaterialsController);
router.get("/:id", authenticateTeacher, getTeacherMaterialByIdController);
router.put("/:id", authenticateTeacher, updateTeacherMaterialController);
router.patch("/:id/publish", authenticateTeacher, publishTeacherMaterialController);
router.delete("/:id", authenticateTeacher, deleteTeacherMaterialController);

export default router;
