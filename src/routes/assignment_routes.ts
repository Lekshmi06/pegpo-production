import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import {
  authenticateTeacher,
  authenticateStudent,
  authenticateStudentOrTeacher,
} from "../middlewares/auth_middleware";
import {
  assignmentTeacherUpload,
  assignmentSubmissionUpload,
  validateUploadedFilesContent,
} from "../config/assignment_upload";
import {
  createAssignmentController,
  getTeacherAssignmentsController,
  getTeacherAssignmentByIdController,
  updateAssignmentController,
  publishAssignmentController,
  archiveAssignmentController,
  deleteAssignmentController,
  getAssignmentSubmissionsController,
  evaluateSubmissionController,
  getStudentAssignmentsController,
  getStudentAssignmentDetailsController,
  submitAssignmentController,
  getMySubmissionController,
  downloadAssignmentAttachmentController,
  downloadSubmissionAttachmentController,
} from "../controllers/assignment_controller";

const router = Router();

// ============================================================================
// Multer Upload Error Handling Wrappers
// ============================================================================

/**
 * Wraps Multer middleware to return consistent JSON 400 responses on file errors
 * (e.g. file size exceeded, disallowed extensions, upload limits) instead of unhandled 500s.
 */
const handleUpload = (uploadMiddleware: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    uploadMiddleware(req, res, (err: any) => {
      if (!err) {
        return next();
      }

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({
            success: false,
            message: "File upload rejected: File exceeds the maximum 25MB limit.",
            code: "LIMIT_FILE_SIZE",
          });
          return;
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          res.status(400).json({
            success: false,
            message: "File upload rejected: Maximum of 10 files allowed per request.",
            code: "LIMIT_FILE_COUNT",
          });
          return;
        }
        res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`,
          code: err.code,
        });
        return;
      }

      // Rejections from fileFilter or destination
      res.status(400).json({
        success: false,
        message: err.message || "File upload failed.",
      });
    });
  };
};

const teacherUploadMiddleware = handleUpload(
  assignmentTeacherUpload.fields([
    { name: "attachments", maxCount: 10 },
    { name: "files", maxCount: 10 },
  ])
);

const studentUploadMiddleware = handleUpload(
  assignmentSubmissionUpload.fields([
    { name: "attachments", maxCount: 10 },
    { name: "files", maxCount: 10 },
  ])
);

// ============================================================================
// 1. Student Endpoints (Must be registered before /:id parameterized routes)
// ============================================================================

/**
 * GET /api/assignments/student
 * Lists all published assignments for the student's enrolled classes & targeting.
 */
router.get("/student", authenticateStudent, getStudentAssignmentsController);

/**
 * GET /api/assignments/student/:id/my-submission
 * Retrieves the student's own submission for an assignment.
 */
router.get("/student/:id/my-submission", authenticateStudent, getMySubmissionController);

/**
 * GET /api/assignments/student/:id
 * Retrieves assignment details and the student's submission.
 */
router.get("/student/:id", authenticateStudent, getStudentAssignmentDetailsController);

/**
 * POST /api/assignments/student/:id/submit
 * Submits homework/assignment response (text and/or attachments) or saves as draft.
 * Middleware order: authenticateStudent -> student upload -> validateUploadedFilesContent -> controller.
 */
router.post(
  "/student/:id/submit",
  authenticateStudent,
  studentUploadMiddleware,
  validateUploadedFilesContent,
  submitAssignmentController
);

// ============================================================================
// 2. Private Attachment Download Endpoints
// ============================================================================

/**
 * GET /api/assignments/:id/attachments/:attachmentId/download
 * GET /api/assignments/:id/attachments/download?key=...
 * Streams private teacher attachment to authorized caller (owning teacher or enrolled student).
 */
router.get(
  "/:id/attachments/:attachmentId/download",
  authenticateStudentOrTeacher,
  downloadAssignmentAttachmentController
);

router.get(
  "/:id/attachments/download",
  authenticateStudentOrTeacher,
  downloadAssignmentAttachmentController
);

/**
 * GET /api/assignments/:id/submissions/:submissionId/attachments/:attachmentId/download
 * GET /api/assignments/:id/submissions/:submissionId/attachments/download?key=...
 * Streams private submission attachment to authorized caller (submitting student or owning teacher).
 */
router.get(
  "/:id/submissions/:submissionId/attachments/:attachmentId/download",
  authenticateStudentOrTeacher,
  downloadSubmissionAttachmentController
);

router.get(
  "/:id/submissions/:submissionId/attachments/download",
  authenticateStudentOrTeacher,
  downloadSubmissionAttachmentController
);

// ============================================================================
// 3. Teacher Endpoints
// ============================================================================

/**
 * POST /api/assignments
 * Creates a new assignment (draft or published) with optional attachments.
 * Middleware order: authenticateTeacher -> teacher upload -> validateUploadedFilesContent -> controller.
 */
router.post(
  "/",
  authenticateTeacher,
  teacherUploadMiddleware,
  validateUploadedFilesContent,
  createAssignmentController
);

/**
 * GET /api/assignments
 * Lists all assignments created by the teacher with aggregate submission statistics.
 */
router.get("/", authenticateTeacher, getTeacherAssignmentsController);

/**
 * GET /api/assignments/:id
 * Retrieves full assignment details for the owning teacher.
 */
router.get("/:id", authenticateTeacher, getTeacherAssignmentByIdController);

/**
 * PUT /api/assignments/:id
 * Updates an assignment document, allowing attachment additions and removals.
 * Middleware order: authenticateTeacher -> teacher upload -> validateUploadedFilesContent -> controller.
 */
router.put(
  "/:id",
  authenticateTeacher,
  teacherUploadMiddleware,
  validateUploadedFilesContent,
  updateAssignmentController
);

/**
 * PATCH /api/assignments/:id/publish
 * Publishes a draft assignment to students.
 */
router.patch("/:id/publish", authenticateTeacher, publishAssignmentController);

/**
 * PATCH /api/assignments/:id/archive
 * Archives an assignment.
 */
router.patch("/:id/archive", authenticateTeacher, archiveAssignmentController);

/**
 * DELETE /api/assignments/:id
 * Deletes an assignment if no student work has been submitted.
 */
router.delete("/:id", authenticateTeacher, deleteAssignmentController);

/**
 * GET /api/assignments/:id/submissions
 * Retrieves submissions and pending student tracking for an assignment.
 */
router.get("/:id/submissions", authenticateTeacher, getAssignmentSubmissionsController);

/**
 * PATCH /api/assignments/:id/submissions/:submissionId/evaluate
 * Evaluates student work with marks, grade, and feedback.
 */
router.patch(
  "/:id/submissions/:submissionId/evaluate",
  authenticateTeacher,
  evaluateSubmissionController
);

export default router;

