import { Request, Response } from "express";
import mongoose from "mongoose";
import AssignmentService, {
  CreateAssignmentInput,
  UpdateAssignmentInput,
  TeacherAssignmentFilter,
  StudentAssignmentFilter,
  EvaluateSubmissionInput,
  SubmitAssignmentInput,
} from "../services/assignment_service";
import Assignment from "../models/Assignment";
import AssignmentSubmission from "../models/AssignmentSubmission";

// ============================================================================
// Helper Utilities
// ============================================================================

/**
 * Validates a string as a valid 24-character hexadecimal MongoDB ObjectId.
 */
function isValidObjectId(id?: any): boolean {
  if (!id || typeof id !== "string") return false;
  return mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Safely extracts a single string from route params.
 */
function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return typeof param === "string" ? param : "";
}

function getTeacherProfile(req: Request) {
  if (req.user && req.user.userType !== "teacher") {
    return undefined;
  }
  return req.teacherProfile;
}

function getStudentProfile(req: Request) {
  if (req.user && req.user.userType !== "student") {
    return undefined;
  }
  return req.studentProfile;
}

/**
 * Extracts uploaded Multer files from request whether stored in array or dictionary.
 */
function getUploadedFiles(req: Request): Express.Multer.File[] {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === "object") {
    const list: Express.Multer.File[] = [];
    for (const key of Object.keys(req.files)) {
      list.push(...(req.files as Record<string, Express.Multer.File[]>)[key]);
    }
    return list;
  }
  return [];
}

/**
 * Safely parses string or array input for string lists (such as target IDs or removed keys).
 */
function parseStringArray(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((item) => String(item).trim()).filter(Boolean);
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // Fallback: comma-delimited string
      return input
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/**
 * Standardized controller error handler mapping domain errors to HTTP status codes.
 * Prevents leaking internal stack traces or database internals.
 */
export function handleControllerError(
  res: Response,
  error: unknown,
  defaultMessage = "An unexpected error occurred."
): void {
  const message = error instanceof Error ? error.message : defaultMessage;

  // 404 Not Found
  if (message.includes("not found") || message.includes("Not found")) {
    res.status(404).json({ success: false, message });
    return;
  }

  // 403 Forbidden
  if (
    message.startsWith("Unauthorized") ||
    message.startsWith("Access denied") ||
    message.includes("permission")
  ) {
    res.status(403).json({ success: false, message });
    return;
  }

  // 409 Conflict (e.g. resubmission of an already evaluated & graded submission)
  if (
    message.includes("Resubmissions are not permitted") ||
    message.includes("already been evaluated and graded")
  ) {
    res.status(409).json({ success: false, message });
    return;
  }

  // 400 Bad Request
  if (
    message.includes("required") ||
    message.includes("Invalid") ||
    message.includes("rejected") ||
    message.includes("Cannot") ||
    message.includes("between 0 and") ||
    message.includes("mismatch")
  ) {
    res.status(400).json({ success: false, message });
    return;
  }

  // 500 Internal Server Error
  res.status(500).json({
    success: false,
    message: "A server error occurred while processing your request.",
  });
}

// ============================================================================
// Teacher Controllers
// ============================================================================

/**
 * POST /api/assignments
 * Creates a new draft or published assignment with attachments.
 */
export const createAssignmentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = getTeacherProfile(req);
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a teacher.",
      });
      return;
    }

    const {
      title,
      subject,
      description,
      instructions,
      type,
      classSectionId,
      teachingContextId,
      targetType,
      targetStudentProfileIds,
      assignedDate,
      dueDate,
      dueTime,
      totalMarks,
      passingMarks,
      allowLateSubmission,
      lateSubmissionDeadline,
      status,
    } = req.body;

    if (!title || !title.trim()) {
      res.status(400).json({ success: false, message: "Assignment title is required." });
      return;
    }
    if (!subject || !subject.trim()) {
      res.status(400).json({ success: false, message: "Subject is required." });
      return;
    }
    if (!description || !description.trim()) {
      res.status(400).json({ success: false, message: "Description is required." });
      return;
    }
    if (!classSectionId || !isValidObjectId(classSectionId)) {
      res.status(400).json({
        success: false,
        message: "A valid 24-character hex ClassSection ID is required.",
      });
      return;
    }
    if (!dueDate) {
      res.status(400).json({ success: false, message: "Due date is required." });
      return;
    }

    const parsedTargetIds = parseStringArray(targetStudentProfileIds);
    for (const rawId of parsedTargetIds) {
      if (!isValidObjectId(rawId)) {
        res.status(400).json({
          success: false,
          message: `Invalid student profile ID format: '${rawId}'`,
        });
        return;
      }
    }

    const inputData: CreateAssignmentInput = {
      title: title.trim(),
      subject: subject.trim(),
      description: description.trim(),
      instructions: instructions ? instructions.trim() : undefined,
      type: type || "homework",
      classSectionId,
      teachingContextId: isValidObjectId(teachingContextId) ? teachingContextId : undefined,
      targetType: targetType === "selected" ? "selected" : "all",
      targetStudentProfileIds: parsedTargetIds,
      assignedDate,
      dueDate,
      dueTime: dueTime ? dueTime.trim() : undefined,
      totalMarks: totalMarks !== undefined ? Number(totalMarks) : undefined,
      passingMarks: passingMarks !== undefined ? Number(passingMarks) : undefined,
      allowLateSubmission:
        allowLateSubmission !== undefined
          ? allowLateSubmission === "true" || allowLateSubmission === true
          : true,
      lateSubmissionDeadline: lateSubmissionDeadline || undefined,
      status: status === "published" ? "published" : "draft",
    };

    const files = getUploadedFiles(req);
    const assignment = await AssignmentService.createAssignment(
      teacherProfile,
      inputData,
      files
    );

    res.status(201).json({
      success: true,
      message:
        assignment.status === "published"
          ? "Assignment created and published to students successfully."
          : "Assignment saved as draft successfully.",
      data: assignment,
    });
  } catch (error) {
    handleControllerError(res, error, "Failed to create assignment.");
  }
};

/**
 * GET /api/assignments
 * Lists all assignments created by the authenticated teacher with aggregate statistics.
 */
export const getTeacherAssignmentsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = getTeacherProfile(req);
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a teacher.",
      });
      return;
    }

    const { classSectionId, status, type, subject, search } = req.query;

    if (classSectionId && !isValidObjectId(classSectionId as string)) {
      res.status(400).json({ success: false, message: "Invalid classSectionId format." });
      return;
    }

    const filters: TeacherAssignmentFilter = {
      classSectionId: classSectionId ? (classSectionId as string) : undefined,
      status: status ? (status as any) : undefined,
      type: type ? (type as any) : undefined,
      subject: subject ? (subject as string) : undefined,
      search: search ? (search as string) : undefined,
    };

    const assignments = await AssignmentService.getTeacherAssignments(
      teacherProfile,
      filters
    );

    res.status(200).json({
      success: true,
      data: assignments,
    });
  } catch (error) {
    handleControllerError(res, error, "Failed to retrieve assignments.");
  }
};

/**
 * GET /api/assignments/:id
 * Retrieves full details of an assignment for the owning teacher.
 */
export const getTeacherAssignmentByIdController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = getTeacherProfile(req);
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a teacher.",
      });
      return;
    }

    const id = getParam(req.params.id);
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid assignment ID format." });
      return;
    }

    const assignment = await AssignmentService.getTeacherAssignmentById(
      teacherProfile,
      id
    );

    res.status(200).json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    handleControllerError(res, error, "Failed to retrieve assignment.");
  }
};

/**
 * PUT /api/assignments/:id
 * Updates an assignment document, allowing attachment additions and removals.
 */
export const updateAssignmentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = getTeacherProfile(req);
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a teacher.",
      });
      return;
    }

    const id = getParam(req.params.id);
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid assignment ID format." });
      return;
    }

    const {
      title,
      subject,
      description,
      instructions,
      type,
      classSectionId,
      targetType,
      targetStudentProfileIds,
      dueDate,
      dueTime,
      totalMarks,
      passingMarks,
      allowLateSubmission,
      lateSubmissionDeadline,
      removedAttachmentKeys,
    } = req.body;

    const parsedTargetIds = targetStudentProfileIds
      ? parseStringArray(targetStudentProfileIds)
      : undefined;

    if (parsedTargetIds) {
      for (const rawId of parsedTargetIds) {
        if (!isValidObjectId(rawId)) {
          res.status(400).json({
            success: false,
            message: `Invalid student profile ID format: '${rawId}'`,
          });
          return;
        }
      }
    }

    const updateData: UpdateAssignmentInput = {
      title: title !== undefined ? title.trim() : undefined,
      subject: subject !== undefined ? subject.trim() : undefined,
      description: description !== undefined ? description.trim() : undefined,
      instructions: instructions !== undefined ? instructions.trim() : undefined,
      type: type || undefined,
      classSectionId: isValidObjectId(classSectionId) ? classSectionId : undefined,
      targetType: targetType || undefined,
      targetStudentProfileIds: parsedTargetIds,
      dueDate: dueDate || undefined,
      dueTime: dueTime ? dueTime.trim() : undefined,
      totalMarks: totalMarks !== undefined ? Number(totalMarks) : undefined,
      passingMarks: passingMarks !== undefined ? Number(passingMarks) : undefined,
      allowLateSubmission:
        allowLateSubmission !== undefined
          ? allowLateSubmission === "true" || allowLateSubmission === true
          : undefined,
      lateSubmissionDeadline: lateSubmissionDeadline || undefined,
      removedAttachmentKeys: parseStringArray(removedAttachmentKeys),
    };

    const files = getUploadedFiles(req);
    const updated = await AssignmentService.updateAssignment(
      teacherProfile,
      id,
      updateData,
      files
    );

    res.status(200).json({
      success: true,
      message: "Assignment updated successfully.",
      data: updated,
    });
  } catch (error) {
    handleControllerError(res, error, "Failed to update assignment.");
  }
};

/**
 * PATCH /api/assignments/:id/publish
 * Publishes a draft assignment to enrolled students.
 */
export const publishAssignmentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = getTeacherProfile(req);
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a teacher.",
      });
      return;
    }

    const id = getParam(req.params.id);
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid assignment ID format." });
      return;
    }

    const assignment = await AssignmentService.publishAssignment(teacherProfile, id);

    res.status(200).json({
      success: true,
      message: "Assignment published successfully.",
      data: assignment,
    });
  } catch (error) {
    handleControllerError(res, error, "Failed to publish assignment.");
  }
};

/**
 * PATCH /api/assignments/:id/archive
 * Archives an assignment.
 */
export const archiveAssignmentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = getTeacherProfile(req);
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a teacher.",
      });
      return;
    }

    const id = getParam(req.params.id);
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid assignment ID format." });
      return;
    }

    const assignment = await AssignmentService.archiveAssignment(teacherProfile, id);

    res.status(200).json({
      success: true,
      message: "Assignment archived successfully.",
      data: assignment,
    });
  } catch (error) {
    handleControllerError(res, error, "Failed to archive assignment.");
  }
};

/**
 * DELETE /api/assignments/:id
 * Deletes an assignment if no student submissions exist.
 */
export const deleteAssignmentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = getTeacherProfile(req);
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a teacher.",
      });
      return;
    }

    const id = getParam(req.params.id);
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid assignment ID format." });
      return;
    }

    await AssignmentService.deleteAssignment(teacherProfile, id);

    res.status(200).json({
      success: true,
      message: "Assignment deleted successfully.",
    });
  } catch (error) {
    handleControllerError(res, error, "Failed to delete assignment.");
  }
};

/**
 * GET /api/assignments/:id/submissions
 * Retrieves submissions and pending student tracking for an assignment.
 */
export const getAssignmentSubmissionsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = getTeacherProfile(req);
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a teacher.",
      });
      return;
    }

    const id = getParam(req.params.id);
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid assignment ID format." });
      return;
    }

    const result = await AssignmentService.getAssignmentSubmissions(
      teacherProfile,
      id
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleControllerError(res, error, "Failed to retrieve assignment submissions.");
  }
};

/**
 * PATCH /api/assignments/:id/submissions/:submissionId/evaluate
 * Evaluates a student submission, recording marks, grade, feedback, and history.
 */
export const evaluateSubmissionController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = getTeacherProfile(req);
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a teacher.",
      });
      return;
    }

    const id = getParam(req.params.id);
    const submissionId = getParam(req.params.submissionId);
    if (!isValidObjectId(id) || !isValidObjectId(submissionId)) {
      res.status(400).json({ success: false, message: "Invalid ID format." });
      return;
    }

    const { marksAwarded, grade, feedback } = req.body;
    if (marksAwarded === undefined || marksAwarded === null || isNaN(Number(marksAwarded))) {
      res.status(400).json({
        success: false,
        message: "A numeric marksAwarded value is required.",
      });
      return;
    }

    const evalInput: EvaluateSubmissionInput = {
      marksAwarded: Number(marksAwarded),
      grade: grade ? String(grade).trim() : undefined,
      feedback: feedback ? String(feedback).trim() : undefined,
    };

    const submission = await AssignmentService.evaluateSubmission(
      teacherProfile,
      id,
      submissionId,
      evalInput
    );

    res.status(200).json({
      success: true,
      message: "Submission evaluated successfully.",
      data: submission,
    });
  } catch (error) {
    handleControllerError(res, error, "Failed to evaluate submission.");
  }
};

// ============================================================================
// Student Controllers
// ============================================================================

/**
 * GET /api/assignments/student
 * Lists all published assignments available to the authenticated student.
 */
export const getStudentAssignmentsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const studentProfile = getStudentProfile(req);
    if (!studentProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a student.",
      });
      return;
    }

    const { status, type, subject, search } = req.query;

    const filters: StudentAssignmentFilter = {
      status: status ? (status as any) : undefined,
      type: type ? (type as any) : undefined,
      subject: subject ? (subject as string) : undefined,
      search: search ? (search as string) : undefined,
    };

    const assignments = await AssignmentService.getStudentAssignments(
      studentProfile,
      filters
    );

    res.status(200).json({
      success: true,
      data: assignments,
    });
  } catch (error) {
    handleControllerError(res, error, "Failed to retrieve student assignments.");
  }
};

/**
 * GET /api/assignments/student/:id
 * Retrieves assignment details and the student's own submission.
 */
export const getStudentAssignmentDetailsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const studentProfile = getStudentProfile(req);
    if (!studentProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a student.",
      });
      return;
    }

    const id = getParam(req.params.id);
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid assignment ID format." });
      return;
    }

    const result = await AssignmentService.getStudentAssignmentDetails(
      studentProfile,
      id
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleControllerError(res, error, "Failed to retrieve assignment details.");
  }
};

/**
 * POST /api/assignments/student/:id/submit
 * Submits homework or project response (text and/or attachments) or saves as draft.
 */
export const submitAssignmentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const studentProfile = getStudentProfile(req);
    if (!studentProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a student.",
      });
      return;
    }

    const id = getParam(req.params.id);
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid assignment ID format." });
      return;
    }

    const { content, isDraft, comment } = req.body;
    const files = getUploadedFiles(req);

    const submitData: SubmitAssignmentInput = {
      content: content !== undefined ? String(content).trim() : undefined,
      isDraft: isDraft === "true" || isDraft === true,
      comment: comment ? String(comment).trim() : undefined,
    };

    const submission = await AssignmentService.submitAssignment(
      studentProfile,
      id,
      submitData,
      files
    );

    res.status(submission.status === "draft" ? 200 : 201).json({
      success: true,
      message:
        submission.status === "draft"
          ? "Draft saved successfully."
          : submission.isLate
          ? "Assignment submitted successfully (marked late)."
          : "Assignment submitted successfully.",
      data: submission,
    });
  } catch (error) {
    handleControllerError(res, error, "Failed to submit assignment.");
  }
};

/**
 * GET /api/assignments/student/:id/my-submission
 * Retrieves own submission record for an assignment.
 */
export const getMySubmissionController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const studentProfile = getStudentProfile(req);
    if (!studentProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a student.",
      });
      return;
    }

    const id = getParam(req.params.id);
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid assignment ID format." });
      return;
    }

    const { submission } = await AssignmentService.getStudentAssignmentDetails(
      studentProfile,
      id
    );

    res.status(200).json({
      success: true,
      data: submission,
    });
  } catch (error) {
    handleControllerError(res, error, "Failed to retrieve submission.");
  }
};

// ============================================================================
// Private File Download Controllers
// ============================================================================

/**
 * GET /api/assignments/:id/attachments/:attachmentId/download
 * OR GET /api/assignments/:id/attachments/download?key=...
 * Streams teacher assignment attachment to authorized callers (owning teacher or enrolled student).
 */
export const downloadAssignmentAttachmentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const actor = {
      teacherProfile: getTeacherProfile(req),
      studentProfile: getStudentProfile(req),
    };

    if (!actor.teacherProfile && !actor.studentProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required to download attachments.",
      });
      return;
    }

    const id = getParam(req.params.id);
    const attachmentId = getParam(req.params.attachmentId);
    const queryKey = req.query.key as string;

    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid assignment ID format." });
      return;
    }

    const assignment = await Assignment.findById(id);
    if (!assignment) {
      res.status(404).json({ success: false, message: "Assignment not found." });
      return;
    }

    // Resolve storage key via attachmentId or query param
    let storageKey = queryKey;
    if (!storageKey && attachmentId) {
      const match = assignment.attachments.find(
        (a) => a._id?.toString() === attachmentId || a.storageKey === attachmentId
      );
      if (match) {
        storageKey = match.storageKey;
      }
    }

    if (!storageKey) {
      res.status(400).json({
        success: false,
        message: "Attachment identifier or storage key is required.",
      });
      return;
    }

    const { stream, attachment } =
      await AssignmentService.getAssignmentAttachmentStream(actor, id, storageKey);

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(attachment.originalName)}"`
    );
    if (attachment.fileSize) {
      res.setHeader("Content-Length", attachment.fileSize);
    }

    stream.pipe(res);
  } catch (error) {
    handleControllerError(res, error, "Failed to download assignment attachment.");
  }
};

/**
 * GET /api/assignments/:id/submissions/:submissionId/attachments/:attachmentId/download
 * OR GET /api/assignments/:id/submissions/:submissionId/attachments/download?key=...
 * Streams student submission attachment to authorized callers (submitting student or owning teacher).
 */
export const downloadSubmissionAttachmentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const actor = {
      teacherProfile: getTeacherProfile(req),
      studentProfile: getStudentProfile(req),
    };

    if (!actor.teacherProfile && !actor.studentProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required to download submission attachments.",
      });
      return;
    }

    const id = getParam(req.params.id);
    const submissionId = getParam(req.params.submissionId);
    const attachmentId = getParam(req.params.attachmentId);
    const queryKey = req.query.key as string;

    if (!isValidObjectId(id) || !isValidObjectId(submissionId)) {
      res.status(400).json({ success: false, message: "Invalid ID format." });
      return;
    }

    const submission = await AssignmentSubmission.findOne({
      _id: submissionId,
      assignmentId: id,
    });

    if (!submission) {
      res.status(404).json({ success: false, message: "Submission not found." });
      return;
    }

    // Resolve storage key via attachmentId or query param
    let storageKey = queryKey;
    if (!storageKey && attachmentId) {
      const match = submission.attachments.find(
        (a) => a._id?.toString() === attachmentId || a.storageKey === attachmentId
      );
      if (match) {
        storageKey = match.storageKey;
      }
    }

    if (!storageKey) {
      res.status(400).json({
        success: false,
        message: "Submission attachment identifier or storage key is required.",
      });
      return;
    }

    const { stream, attachment } =
      await AssignmentService.getSubmissionAttachmentStream(
        actor,
        id,
        submissionId,
        storageKey
      );

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(attachment.originalName)}"`
    );
    if (attachment.fileSize) {
      res.setHeader("Content-Length", attachment.fileSize);
    }

    stream.pipe(res);
  } catch (error) {
    handleControllerError(res, error, "Failed to download submission attachment.");
  }
};
