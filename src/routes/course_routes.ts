import { Router } from "express";
import {
  authenticateProvider,
  authenticateLearner,
  optionalAuthenticateUser,
} from "../middlewares/auth_middleware";
import courseUpload from "../config/course_upload";
import {
  createCourseController,
  getProviderCoursesController,
  getMarketplaceCoursesController,
  getCourseByIdController,
  updateCourseController,
  deleteCourseController,
  togglePublishCourseController,
  addCourseSectionController,
  updateCourseSectionController,
  deleteCourseSectionController,
  addCourseLessonController,
  updateCourseLessonController,
  deleteCourseLessonController,
  uploadCourseAssetController,
} from "../controllers/course_controller";
import {
  enrollInCourseController,
  verifyLessonAccessController,
} from "../controllers/enrollment_controller";

const router = Router();

// Public marketplace course browsing
router.get("/", optionalAuthenticateUser, getMarketplaceCoursesController);

// Provider dashboard course listings & metrics
router.get("/provider/my-courses", authenticateProvider, getProviderCoursesController);

// Provider course asset upload
router.post(
  "/upload-asset",
  authenticateProvider,
  courseUpload.single("file"),
  uploadCourseAssetController
);

// Provider course creation
router.post("/", authenticateProvider, createCourseController);

// Course details (public preview if published, full view for owner)
router.get("/:id", optionalAuthenticateUser, getCourseByIdController);

// Provider course updates
router.put("/:id", authenticateProvider, updateCourseController);
router.delete("/:id", authenticateProvider, deleteCourseController);
router.post("/:id/publish", authenticateProvider, togglePublishCourseController);

// Provider curriculum section management
router.post("/:id/sections", authenticateProvider, addCourseSectionController);
router.put("/:id/sections/:sectionId", authenticateProvider, updateCourseSectionController);
router.delete("/:id/sections/:sectionId", authenticateProvider, deleteCourseSectionController);

// Provider lesson management
router.post("/:id/sections/:sectionId/lessons", authenticateProvider, addCourseLessonController);
router.put(
  "/:id/sections/:sectionId/lessons/:lessonId",
  authenticateProvider,
  updateCourseLessonController
);
router.delete(
  "/:id/sections/:sectionId/lessons/:lessonId",
  authenticateProvider,
  deleteCourseLessonController
);

// Learner enrollment
router.post("/:id/enroll", authenticateLearner, enrollInCourseController);

// Protected lesson content check
router.get("/:id/lessons/:lessonId/access", optionalAuthenticateUser, verifyLessonAccessController);

export default router;
