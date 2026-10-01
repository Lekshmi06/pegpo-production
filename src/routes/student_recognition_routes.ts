import { Router } from "express";
import {
  awardRecognitionController,
  getStudentRecognitionsController,
  getClassRecognitionsController,
  deleteRecognitionController,
  getStickersCatalogController,
} from "../controllers/student_recognition_controller";
import {
  authenticateTeacher,
  authenticateStudentOrTeacher,
} from "../middlewares/auth_middleware";

const router = Router();

// Catalog of available stickers
router.get("/stickers", getStickersCatalogController);

// Award a sticker (Teacher only)
router.post("/", authenticateTeacher, awardRecognitionController);

// Get student recognitions (Student for self, or Teacher for their students)
router.get(
  "/student/:studentId",
  authenticateStudentOrTeacher,
  getStudentRecognitionsController
);

// Get class recognitions (Teacher only)
router.get(
  "/class/:classSectionId",
  authenticateTeacher,
  getClassRecognitionsController
);

// Delete/revoke an awarded sticker (Teacher only)
router.delete("/:id", authenticateTeacher, deleteRecognitionController);

export default router;
