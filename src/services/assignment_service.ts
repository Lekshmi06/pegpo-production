import mongoose from "mongoose";
import Assignment, {
  IAssignment,
  IAssignmentAttachment,
  AssignmentType,
  AssignmentStatus,
  AssignmentTargetType,
} from "../models/Assignment";
import AssignmentSubmission, {
  IAssignmentSubmission,
  ISubmissionAttachment,
  SubmissionStatus,
  ISubmissionEvaluation,
} from "../models/AssignmentSubmission";
import { ITeacherProfile } from "../models/TeacherProfile";
import StudentProfile, { IStudentProfile } from "../models/StudentProfile";
import TeachingContext from "../models/TeachingContext";
import ClassSection from "../models/ClassSection";
import StudentMembership from "../models/StudentMembership";
import {
  buildTeacherAttachmentRecord,
  buildSubmissionAttachmentRecord,
} from "../config/assignment_upload";
import storageService from "./storage_service";

// ============================================================================
// DTO & Input Interfaces
// ============================================================================

export interface CreateAssignmentInput {
  title: string;
  subject: string;
  description: string;
  instructions?: string;
  type?: AssignmentType;
  classSectionId: string;
  teachingContextId?: string;
  targetType?: AssignmentTargetType;
  targetStudentProfileIds?: string[];
  assignedDate?: Date | string;
  dueDate: Date | string;
  dueTime?: string;
  totalMarks?: number;
  passingMarks?: number;
  allowLateSubmission?: boolean;
  lateSubmissionDeadline?: Date | string;
  status?: AssignmentStatus;
}

export interface UpdateAssignmentInput {
  title?: string;
  subject?: string;
  description?: string;
  instructions?: string;
  type?: AssignmentType;
  classSectionId?: string;
  targetType?: AssignmentTargetType;
  targetStudentProfileIds?: string[];
  dueDate?: Date | string;
  dueTime?: string;
  totalMarks?: number;
  passingMarks?: number;
  allowLateSubmission?: boolean;
  lateSubmissionDeadline?: Date | string;
  removedAttachmentKeys?: string[];
}

export interface TeacherAssignmentFilter {
  classSectionId?: string;
  status?: AssignmentStatus;
  type?: AssignmentType;
  subject?: string;
  search?: string;
}

export interface StudentAssignmentFilter {
  status?: "pending" | "submitted" | "late" | "evaluated" | "overdue";
  type?: AssignmentType;
  subject?: string;
  search?: string;
}

export interface EvaluateSubmissionInput {
  marksAwarded: number;
  grade?: string;
  feedback?: string;
}

export interface SubmitAssignmentInput {
  content?: string;
  isDraft?: boolean;
  comment?: string;
}

export interface AssignmentSummary {
  assignment: IAssignment;
  stats: {
    totalTargeted: number;
    submittedCount: number;
    evaluatedCount: number;
    lateCount: number;
    pendingCount: number;
  };
}

export interface StudentSubmissionItem {
  studentProfileId: string;
  studentName: string;
  studentEmail: string;
  rollNumber?: string;
  status: SubmissionStatus | "pending";
  submissionId?: string;
  submittedAt?: Date | null;
  isLate?: boolean;
  marksAwarded?: number;
  grade?: string;
  feedback?: string;
  attachmentCount: number;
}

export interface AssignmentSubmissionsResult {
  assignment: IAssignment;
  summary: {
    totalStudents: number;
    submittedCount: number;
    evaluatedCount: number;
    lateCount: number;
    pendingCount: number;
  };
  submissions: StudentSubmissionItem[];
}

export interface StudentAssignmentSummaryItem {
  assignment: IAssignment;
  submissionStatus: "pending" | "submitted" | "late" | "evaluated" | "overdue";
  submissionId?: string;
  submittedAt?: Date | null;
  marksAwarded?: number;
  grade?: string;
  feedback?: string;
}

// ============================================================================
// Authorization & Validation Helpers
// ============================================================================

/**
 * Combines a Date object and optional time string ("HH:MM") into an exact deadline timestamp.
 * Standardizes timezone interpretation and guarantees consistent boundary comparisons.
 */
export function computeAssignmentDeadline(dueDate: Date, dueTime?: string): Date {
  const deadline = new Date(dueDate);

  if (dueTime && /^([01]\d|2[0-3]):([0-5]\d)$/.test(dueTime.trim())) {
    const [hours, minutes] = dueTime.trim().split(":").map(Number);
    deadline.setHours(hours, minutes, 59, 999);
  } else {
    // Default to end of day (23:59:59.999) if explicit HH:MM is omitted
    deadline.setHours(23, 59, 59, 999);
  }

  return deadline;
}

/**
 * Validates teacher ownership of the specified ClassSection through active TeachingContexts.
 */
export async function verifyTeacherClassSectionAccess(
  teacherProfileId: mongoose.Types.ObjectId,
  classSectionId: mongoose.Types.ObjectId
): Promise<{ authorized: boolean; teachingContextId?: mongoose.Types.ObjectId }> {
  // 1. Direct check: active TeachingContext with explicit classSectionId link
  const directContext = await TeachingContext.findOne({
    teacherId: teacherProfileId,
    classSectionId,
    isArchived: false,
  });

  if (directContext) {
    return {
      authorized: true,
      teachingContextId: directContext._id as mongoose.Types.ObjectId,
    };
  }

  // 2. Fallback check: check if teacher has a TeachingContext matching classLevel & section
  const section = await ClassSection.findById(classSectionId);
  if (!section) {
    return { authorized: false };
  }

  const matchingContext = await TeachingContext.findOne({
    teacherId: teacherProfileId,
    classLevel: new RegExp(`^${section.classLevel.trim()}$`, "i"),
    section: new RegExp(`^${section.section.trim()}$`, "i"),
    isArchived: false,
  });

  if (matchingContext) {
    // Auto-link classSectionId for future fast lookups
    await TeachingContext.findByIdAndUpdate(matchingContext._id, {
      classSectionId: section._id,
    });
    return {
      authorized: true,
      teachingContextId: matchingContext._id as mongoose.Types.ObjectId,
    };
  }

  return { authorized: false };
}

/**
 * Validates that a student is actively enrolled in the specified ClassSection.
 */
export async function verifyStudentClassSectionEnrollment(
  studentProfileId: mongoose.Types.ObjectId,
  classSectionId: mongoose.Types.ObjectId
): Promise<boolean> {
  const membership = await StudentMembership.findOne({
    studentProfileId,
    classSectionId,
    isActive: true,
  });

  if (membership) {
    return true;
  }

  // Fallback: check legacy classSectionId on StudentProfile
  const profile = await StudentProfile.findOne({
    _id: studentProfileId,
    classSectionId,
  });

  return Boolean(profile);
}

/**
 * Retrieves all active student profile IDs enrolled in a ClassSection.
 */
export async function getActiveEnrolledStudentsInClass(
  classSectionId: mongoose.Types.ObjectId
): Promise<
  Array<{
    studentProfileId: mongoose.Types.ObjectId;
    name: string;
    email: string;
    rollNumber?: string;
  }>
> {
  const memberships = await StudentMembership.find({
    classSectionId,
    isActive: true,
  }).populate<{ studentProfileId: IStudentProfile & { userId?: { email?: string }; email?: string } }>({
    path: "studentProfileId",
    populate: { path: "userId", select: "email" },
  });

  const results: Array<{
    studentProfileId: mongoose.Types.ObjectId;
    name: string;
    email: string;
    rollNumber?: string;
  }> = [];

  for (const m of memberships) {
    if (m.studentProfileId && m.studentProfileId._id) {
      const p = m.studentProfileId;
      const email = p.userId?.email || p.email || "";
      results.push({
        studentProfileId: p._id as mongoose.Types.ObjectId,
        name: p.name || "Student",
        email,
        rollNumber: m.rollNumber,
      });
    }
  }

  return results;
}

// ============================================================================
// Assignment Service Implementation
// ============================================================================

export class AssignmentService {
  // --------------------------------------------------------------------------
  // TEACHER METHODS
  // --------------------------------------------------------------------------

  /**
   * Creates a new assignment as draft or published.
   * Derives teacher identity strictly from authenticated profile.
   * Validates teacher ownership of ClassSection and targets.
   * Includes file rollback if MongoDB creation fails.
   */
  static async createAssignment(
    teacherProfile: ITeacherProfile,
    data: CreateAssignmentInput,
    files?: Express.Multer.File[]
  ): Promise<IAssignment> {
    const teacherId = teacherProfile._id as mongoose.Types.ObjectId;
    const teacherName = teacherProfile.name || "Teacher";

    if (!data.title || !data.title.trim()) {
      throw new Error("Assignment title is required.");
    }
    if (!data.subject || !data.subject.trim()) {
      throw new Error("Subject is required.");
    }
    if (!data.description || !data.description.trim()) {
      throw new Error("Description / problem statement is required.");
    }
    if (!data.classSectionId || !mongoose.Types.ObjectId.isValid(data.classSectionId)) {
      throw new Error("A valid ClassSection ID is required.");
    }

    const classSectionObjectId = new mongoose.Types.ObjectId(data.classSectionId);

    // Validate teacher ownership of the class section
    const access = await verifyTeacherClassSectionAccess(
      teacherId,
      classSectionObjectId
    );
    if (!access.authorized) {
      throw new Error(
        "Unauthorized: You do not have an active teaching assignment for the selected class section."
      );
    }

    const resolvedTeachingContextId =
      data.teachingContextId && mongoose.Types.ObjectId.isValid(data.teachingContextId)
        ? new mongoose.Types.ObjectId(data.teachingContextId)
        : access.teachingContextId;

    // Validate individual student targets if targeted
    const targetType: AssignmentTargetType = data.targetType || "all";
    const targetStudentProfileObjectIds: mongoose.Types.ObjectId[] = [];

    if (targetType === "selected") {
      if (!data.targetStudentProfileIds || data.targetStudentProfileIds.length === 0) {
        throw new Error(
          "Target type is 'selected', but no target student profile IDs were provided."
        );
      }

      for (const rawId of data.targetStudentProfileIds) {
        if (!mongoose.Types.ObjectId.isValid(rawId)) {
          throw new Error(`Invalid student profile ID format: '${rawId}'`);
        }
        const studentObjId = new mongoose.Types.ObjectId(rawId);
        const isEnrolled = await verifyStudentClassSectionEnrollment(
          studentObjId,
          classSectionObjectId
        );
        if (!isEnrolled) {
          throw new Error(
            `Student profile ID '${rawId}' is not an actively enrolled member of the selected class section.`
          );
        }
        targetStudentProfileObjectIds.push(studentObjId);
      }
    }

    // Validate due date
    const parsedDueDate = new Date(data.dueDate);
    if (isNaN(parsedDueDate.getTime())) {
      throw new Error("A valid due date is required.");
    }

    // Process uploaded attachments
    const attachments: IAssignmentAttachment[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        attachments.push(buildTeacherAttachmentRecord(file, teacherId.toString()));
      }
    }

    const status: AssignmentStatus = data.status === "published" ? "published" : "draft";
    const publishedAt = status === "published" ? new Date() : null;

    try {
      const assignment = await Assignment.create({
        teacherId,
        teacherName,
        classSectionId: classSectionObjectId,
        teachingContextId: resolvedTeachingContextId,
        title: data.title.trim(),
        subject: data.subject.trim(),
        description: data.description.trim(),
        instructions: data.instructions?.trim() || "",
        type: data.type || "homework",
        targetType,
        targetStudentProfileIds: targetStudentProfileObjectIds,
        assignedDate: data.assignedDate ? new Date(data.assignedDate) : new Date(),
        dueDate: parsedDueDate,
        dueTime: data.dueTime?.trim() || "23:59",
        totalMarks: data.totalMarks !== undefined ? Number(data.totalMarks) : 100,
        passingMarks: data.passingMarks !== undefined ? Number(data.passingMarks) : 40,
        attachments,
        allowLateSubmission: data.allowLateSubmission !== undefined ? Boolean(data.allowLateSubmission) : true,
        lateSubmissionDeadline: data.lateSubmissionDeadline ? new Date(data.lateSubmissionDeadline) : undefined,
        status,
        publishedAt,
      });

      return assignment;
    } catch (err) {
      // Rollback uploaded files if DB persistence fails
      for (const att of attachments) {
        await storageService.deleteFile(att.storageKey).catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Retrieves all assignments created by the authenticated teacher with aggregate statistics.
   * Accurately calculates target population strictly from active enrolled members.
   */
  static async getTeacherAssignments(
    teacherProfile: ITeacherProfile,
    filters?: TeacherAssignmentFilter
  ): Promise<AssignmentSummary[]> {
    const teacherId = teacherProfile._id as mongoose.Types.ObjectId;

    const query: any = { teacherId };

    if (filters?.classSectionId && mongoose.Types.ObjectId.isValid(filters.classSectionId)) {
      query.classSectionId = new mongoose.Types.ObjectId(filters.classSectionId);
    }
    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.type) {
      query.type = filters.type;
    }
    if (filters?.subject) {
      query.subject = new RegExp(filters.subject.trim(), "i");
    }
    if (filters?.search) {
      query.$or = [
        { title: new RegExp(filters.search.trim(), "i") },
        { description: new RegExp(filters.search.trim(), "i") },
        { subject: new RegExp(filters.search.trim(), "i") },
      ];
    }

    const assignments = await Assignment.find(query).sort({ createdAt: -1 });

    const results: AssignmentSummary[] = [];

    for (const assignment of assignments) {
      const activeEnrolled = await getActiveEnrolledStudentsInClass(assignment.classSectionId);

      const targetStudentIds =
        assignment.targetType === "selected"
          ? activeEnrolled
              .filter((s) =>
                assignment.targetStudentProfileIds.some((id) =>
                  id?.toString() === s.studentProfileId?.toString()
                )
              )
              .map((s) => s.studentProfileId)
          : activeEnrolled.map((s) => s.studentProfileId);

      const totalTargeted = targetStudentIds.length;

      // Count submissions strictly from eligible target students
      const submittedCount = await AssignmentSubmission.countDocuments({
        assignmentId: assignment._id,
        studentProfileId: { $in: targetStudentIds },
        status: { $in: ["submitted", "late", "evaluated"] },
      });

      const evaluatedCount = await AssignmentSubmission.countDocuments({
        assignmentId: assignment._id,
        studentProfileId: { $in: targetStudentIds },
        status: "evaluated",
      });

      const lateCount = await AssignmentSubmission.countDocuments({
        assignmentId: assignment._id,
        studentProfileId: { $in: targetStudentIds },
        isLate: true,
      });

      const pendingCount = Math.max(0, totalTargeted - submittedCount);

      results.push({
        assignment,
        stats: {
          totalTargeted,
          submittedCount,
          evaluatedCount,
          lateCount,
          pendingCount,
        },
      });
    }

    return results;
  }

  /**
   * Retrieves details of a specific assignment for the owning teacher.
   */
  static async getTeacherAssignmentById(
    teacherProfile: ITeacherProfile,
    assignmentId: string
  ): Promise<IAssignment> {
    if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
      throw new Error("Invalid assignment ID format.");
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found.");
    }

    if (assignment.teacherId.toString() !== (teacherProfile._id as mongoose.Types.ObjectId).toString()) {
      throw new Error("Unauthorized: You do not have permission to view this assignment.");
    }

    return assignment;
  }

  /**
   * Updates an existing assignment with publication and submission restriction enforcement.
   * Safely deletes removed attachments only after DB update succeeds.
   */
  static async updateAssignment(
    teacherProfile: ITeacherProfile,
    assignmentId: string,
    updateData: UpdateAssignmentInput,
    newFiles?: Express.Multer.File[]
  ): Promise<IAssignment> {
    const assignment = await this.getTeacherAssignmentById(teacherProfile, assignmentId);

    // If published, enforce immutability of classSectionId and type
    if (assignment.status === "published" || assignment.status === "archived") {
      if (
        updateData.classSectionId &&
        updateData.classSectionId !== assignment.classSectionId.toString()
      ) {
        throw new Error(
          "Cannot change the class section of an assignment once it has been published."
        );
      }
      if (updateData.type && updateData.type !== assignment.type) {
        throw new Error(
          "Cannot change the assignment type once it has been published."
        );
      }
    }

    // Check if submissions exist before altering marks
    const submissionCount = await AssignmentSubmission.countDocuments({
      assignmentId: assignment._id,
      status: { $in: ["submitted", "late", "evaluated"] },
    });

    if (submissionCount > 0 && updateData.totalMarks !== undefined) {
      const highestAwarded = await AssignmentSubmission.findOne({
        assignmentId: assignment._id,
        "evaluation.marksAwarded": { $exists: true },
      })
        .sort({ "evaluation.marksAwarded": -1 })
        .select("evaluation.marksAwarded");

      if (
        highestAwarded?.evaluation?.marksAwarded &&
        Number(updateData.totalMarks) < highestAwarded.evaluation.marksAwarded
      ) {
        throw new Error(
          `Cannot reduce total marks below ${highestAwarded.evaluation.marksAwarded}, which has already been awarded to a submitted student.`
        );
      }
    }

    // Update basic editable fields
    if (updateData.title !== undefined) assignment.title = updateData.title.trim();
    if (updateData.subject !== undefined) assignment.subject = updateData.subject.trim();
    if (updateData.description !== undefined) assignment.description = updateData.description.trim();
    if (updateData.instructions !== undefined) assignment.instructions = updateData.instructions.trim();
    if (updateData.dueTime !== undefined) assignment.dueTime = updateData.dueTime.trim();
    if (updateData.totalMarks !== undefined) assignment.totalMarks = Number(updateData.totalMarks);
    if (updateData.passingMarks !== undefined) assignment.passingMarks = Number(updateData.passingMarks);
    if (updateData.allowLateSubmission !== undefined) assignment.allowLateSubmission = Boolean(updateData.allowLateSubmission);

    if (updateData.dueDate) {
      const parsed = new Date(updateData.dueDate);
      if (isNaN(parsed.getTime())) throw new Error("Invalid due date format.");
      assignment.dueDate = parsed;
    }

    if (updateData.lateSubmissionDeadline) {
      assignment.lateSubmissionDeadline = new Date(updateData.lateSubmissionDeadline);
    }

    // Class Section and Targeting update (allowed only for drafts)
    if (assignment.status === "draft") {
      if (updateData.classSectionId && mongoose.Types.ObjectId.isValid(updateData.classSectionId)) {
        const newClassId = new mongoose.Types.ObjectId(updateData.classSectionId);
        const access = await verifyTeacherClassSectionAccess(
          teacherProfile._id as mongoose.Types.ObjectId,
          newClassId
        );
        if (!access.authorized) {
          throw new Error("Unauthorized for the specified class section.");
        }
        assignment.classSectionId = newClassId;
        if (access.teachingContextId) {
          assignment.teachingContextId = access.teachingContextId;
        }
      }

      if (updateData.targetType) {
        assignment.targetType = updateData.targetType;
        if (updateData.targetType === "selected" && updateData.targetStudentProfileIds) {
          assignment.targetStudentProfileIds = updateData.targetStudentProfileIds.map(
            (id) => new mongoose.Types.ObjectId(id)
          );
        } else if (updateData.targetType === "all") {
          assignment.targetStudentProfileIds = [];
        }
      }
    }

    // Process attachment removal tracking
    const keysToDelete: string[] = [];
    if (updateData.removedAttachmentKeys && updateData.removedAttachmentKeys.length > 0) {
      const keysToRemove = new Set(updateData.removedAttachmentKeys);
      const remaining: IAssignmentAttachment[] = [];

      for (const att of assignment.attachments) {
        if (keysToRemove.has(att.storageKey)) {
          keysToDelete.push(att.storageKey);
        } else {
          remaining.push(att);
        }
      }
      assignment.attachments = remaining;
    }

    // Append newly uploaded attachments
    const newlyAddedAttachments: IAssignmentAttachment[] = [];
    if (newFiles && newFiles.length > 0) {
      for (const file of newFiles) {
        const rec = buildTeacherAttachmentRecord(file, teacherProfile._id.toString());
        newlyAddedAttachments.push(rec);
        assignment.attachments.push(rec);
      }
    }

    try {
      await assignment.save();

      // Delete removed files from storage after DB update succeeds
      for (const key of keysToDelete) {
        await storageService.deleteFile(key).catch(() => {});
      }

      return assignment;
    } catch (err) {
      // Rollback newly uploaded files if DB update failed
      for (const att of newlyAddedAttachments) {
        await storageService.deleteFile(att.storageKey).catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Publishes a draft assignment.
   */
  static async publishAssignment(
    teacherProfile: ITeacherProfile,
    assignmentId: string
  ): Promise<IAssignment> {
    const assignment = await this.getTeacherAssignmentById(teacherProfile, assignmentId);

    if (assignment.status === "published") {
      return assignment;
    }

    assignment.status = "published";
    assignment.publishedAt = new Date();
    await assignment.save();

    return assignment;
  }

  /**
   * Archives an assignment.
   */
  static async archiveAssignment(
    teacherProfile: ITeacherProfile,
    assignmentId: string
  ): Promise<IAssignment> {
    const assignment = await this.getTeacherAssignmentById(teacherProfile, assignmentId);
    assignment.status = "archived";
    await assignment.save();
    return assignment;
  }

  /**
   * Deletes an assignment.
   * If students have submitted work, deletion is blocked to prevent data loss.
   */
  static async deleteAssignment(
    teacherProfile: ITeacherProfile,
    assignmentId: string
  ): Promise<void> {
    const assignment = await this.getTeacherAssignmentById(teacherProfile, assignmentId);

    const submissionCount = await AssignmentSubmission.countDocuments({
      assignmentId: assignment._id,
      status: { $in: ["submitted", "late", "evaluated"] },
    });

    if (submissionCount > 0) {
      throw new Error(
        `Cannot delete this assignment: ${submissionCount} student submission(s) have already been received. Please archive the assignment instead.`
      );
    }

    // Delete attachment files from storage
    for (const att of assignment.attachments) {
      await storageService.deleteFile(att.storageKey).catch(() => {});
    }

    // Delete any draft submissions
    await AssignmentSubmission.deleteMany({ assignmentId: assignment._id });

    // Delete assignment document
    await Assignment.findByIdAndDelete(assignment._id);
  }

  /**
   * Retrieves submissions for an assignment, including pending students who have not yet submitted.
   * Accurately scopes the target population strictly to eligible students.
   */
  static async getAssignmentSubmissions(
    teacherProfile: ITeacherProfile,
    assignmentId: string
  ): Promise<AssignmentSubmissionsResult> {
    const assignment = await this.getTeacherAssignmentById(teacherProfile, assignmentId);

    // 1. Get all active enrolled students in the class
    const enrolledStudents = await getActiveEnrolledStudentsInClass(
      assignment.classSectionId
    );

    // 2. Filter strictly by assignment targeting
    const targetedStudents =
      assignment.targetType === "selected"
        ? enrolledStudents.filter((s) =>
            assignment.targetStudentProfileIds.some((id) =>
              id?.toString() === s.studentProfileId?.toString()
            )
          )
        : enrolledStudents;

    // 3. Query existing submissions for this assignment
    const existingSubmissions = await AssignmentSubmission.find({
      assignmentId: assignment._id,
    });

    const submissionMap = new Map<string, IAssignmentSubmission>();
    for (const sub of existingSubmissions) {
      submissionMap.set(sub.studentProfileId.toString(), sub);
    }

    // 4. Merge into unified list strictly scoped to the target population
    const items: StudentSubmissionItem[] = [];
    let submittedCount = 0;
    let evaluatedCount = 0;
    let lateCount = 0;
    let pendingCount = 0;

    for (const student of targetedStudents) {
      const sub = submissionMap.get(student.studentProfileId.toString());

      if (sub && sub.status !== "draft") {
        submittedCount++;
        if (sub.status === "evaluated") evaluatedCount++;
        if (sub.isLate) lateCount++;

        items.push({
          studentProfileId: student.studentProfileId.toString(),
          studentName: sub.studentName || student.name,
          studentEmail: sub.studentEmail || student.email,
          rollNumber: student.rollNumber,
          status: sub.status,
          submissionId: sub._id.toString(),
          submittedAt: sub.submittedAt,
          isLate: sub.isLate,
          marksAwarded: sub.evaluation?.marksAwarded,
          grade: sub.evaluation?.grade,
          feedback: sub.evaluation?.feedback,
          attachmentCount: sub.attachments?.length || 0,
        });
      } else {
        pendingCount++;
        items.push({
          studentProfileId: student.studentProfileId.toString(),
          studentName: student.name,
          studentEmail: student.email,
          rollNumber: student.rollNumber,
          status: "pending",
          attachmentCount: 0,
        });
      }
    }

    return {
      assignment,
      summary: {
        totalStudents: targetedStudents.length,
        submittedCount,
        evaluatedCount,
        lateCount,
        pendingCount,
      },
      submissions: items,
    };
  }

  /**
   * Evaluates a student submission, recording marks, grade, feedback, and history.
   */
  static async evaluateSubmission(
    teacherProfile: ITeacherProfile,
    assignmentId: string,
    submissionId: string,
    data: EvaluateSubmissionInput
  ): Promise<IAssignmentSubmission> {
    const assignment = await this.getTeacherAssignmentById(teacherProfile, assignmentId);

    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      throw new Error("Invalid submission ID format.");
    }

    const submission = await AssignmentSubmission.findOne({
      _id: submissionId,
      assignmentId: assignment._id,
    });

    if (!submission) {
      throw new Error("Submission not found for this assignment.");
    }

    if (data.marksAwarded < 0 || data.marksAwarded > assignment.totalMarks) {
      throw new Error(
        `Marks awarded (${data.marksAwarded}) must be between 0 and the assignment total marks (${assignment.totalMarks}).`
      );
    }

    const teacherId = teacherProfile._id as mongoose.Types.ObjectId;
    const teacherName = teacherProfile.name || "Teacher";
    const now = new Date();

    // Preserve previous evaluation in history if already evaluated
    if (submission.evaluation && submission.evaluation.marksAwarded !== undefined) {
      submission.evaluationHistory.push({
        evaluatedAt: submission.evaluation.evaluatedAt || now,
        evaluatedBy: submission.evaluation.evaluatedBy || teacherId,
        evaluatorName: submission.evaluation.evaluatorName || teacherName,
        marksAwarded: submission.evaluation.marksAwarded,
        maxMarks: submission.evaluation.maxMarks || assignment.totalMarks,
        grade: submission.evaluation.grade,
        feedback: submission.evaluation.feedback,
      });
    }

    // Set active evaluation
    submission.evaluation = {
      marksAwarded: Number(data.marksAwarded),
      maxMarks: assignment.totalMarks,
      grade: data.grade?.trim() || undefined,
      feedback: data.feedback?.trim() || "",
      evaluatedAt: now,
      evaluatedBy: teacherId,
      evaluatorName: teacherName,
    };

    submission.status = "evaluated";
    await submission.save();

    return submission;
  }

  // --------------------------------------------------------------------------
  // STUDENT METHODS
  // --------------------------------------------------------------------------

  /**
   * Retrieves all published assignments available to the authenticated student.
   * Cross-references the student's active ClassSection enrollments and individual targeting.
   */
  static async getStudentAssignments(
    studentProfile: IStudentProfile,
    filters?: StudentAssignmentFilter
  ): Promise<StudentAssignmentSummaryItem[]> {
    const studentId = studentProfile._id as mongoose.Types.ObjectId;

    // 1. Get all active class sections the student is enrolled in
    const memberships = await StudentMembership.find({
      studentProfileId: studentId,
      isActive: true,
    }).select("classSectionId");

    const enrolledClassSectionIds: mongoose.Types.ObjectId[] = memberships.map(
      (m) => m.classSectionId
    );

    // Check legacy classSectionId on StudentProfile
    if (
      studentProfile.classSectionId &&
      !enrolledClassSectionIds.some((id) => id.equals(studentProfile.classSectionId!))
    ) {
      enrolledClassSectionIds.push(studentProfile.classSectionId);
    }

    if (enrolledClassSectionIds.length === 0) {
      return [];
    }

    // 2. Query published assignments for these classes
    const assignmentQuery: any = {
      status: "published",
      classSectionId: { $in: enrolledClassSectionIds },
      $or: [
        { targetType: "all" },
        { targetType: "selected", targetStudentProfileIds: studentId },
      ],
    };

    if (filters?.type) {
      assignmentQuery.type = filters.type;
    }
    if (filters?.subject) {
      assignmentQuery.subject = new RegExp(filters.subject.trim(), "i");
    }
    if (filters?.search) {
      assignmentQuery.$and = [
        {
          $or: [
            { title: new RegExp(filters.search.trim(), "i") },
            { description: new RegExp(filters.search.trim(), "i") },
          ],
        },
      ];
    }

    const assignments = await Assignment.find(assignmentQuery).sort({
      dueDate: 1,
    });

    // 3. Query existing submissions by this student
    const assignmentIds = assignments.map((a) => a._id);
    const submissions = await AssignmentSubmission.find({
      studentProfileId: studentId,
      assignmentId: { $in: assignmentIds },
    });

    const submissionMap = new Map<string, IAssignmentSubmission>();
    for (const sub of submissions) {
      submissionMap.set(sub.assignmentId.toString(), sub);
    }

    // 4. Map to summary items with dynamic status
    const now = new Date();
    const results: StudentAssignmentSummaryItem[] = [];

    for (const assignment of assignments) {
      const sub = submissionMap.get(assignment._id.toString());
      const deadline = computeAssignmentDeadline(assignment.dueDate, assignment.dueTime);
      let derivedStatus: "pending" | "submitted" | "late" | "evaluated" | "overdue" = "pending";

      if (sub && sub.status !== "draft") {
        derivedStatus = sub.status;
      } else {
        if (now > deadline) {
          derivedStatus = "overdue";
        } else {
          derivedStatus = "pending";
        }
      }

      if (filters?.status && filters.status !== derivedStatus) {
        continue;
      }

      results.push({
        assignment,
        submissionStatus: derivedStatus,
        submissionId: sub?._id?.toString(),
        submittedAt: sub?.submittedAt,
        marksAwarded: sub?.evaluation?.marksAwarded,
        grade: sub?.evaluation?.grade,
        feedback: sub?.evaluation?.feedback,
      });
    }

    return results;
  }

  /**
   * Retrieves assignment details and the student's own submission.
   */
  static async getStudentAssignmentDetails(
    studentProfile: IStudentProfile,
    assignmentId: string
  ): Promise<{ assignment: IAssignment; submission: IAssignmentSubmission | null }> {
    if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
      throw new Error("Invalid assignment ID format.");
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment || assignment.status !== "published") {
      throw new Error("Assignment not found or not currently available.");
    }

    const studentId = studentProfile._id as mongoose.Types.ObjectId;

    // Verify enrollment
    const isEnrolled = await verifyStudentClassSectionEnrollment(
      studentId,
      assignment.classSectionId
    );
    if (!isEnrolled) {
      throw new Error("Access denied: You are not enrolled in the class for this assignment.");
    }

    // Verify targeting
    if (
      assignment.targetType === "selected" &&
      !assignment.targetStudentProfileIds.some((id) => id.equals(studentId))
    ) {
      throw new Error("Access denied: This assignment was not assigned to you.");
    }

    const submission = await AssignmentSubmission.findOne({
      assignmentId: assignment._id,
      studentProfileId: studentId,
    });

    return { assignment, submission };
  }

  /**
   * Submits or drafts homework/assignment response with file attachments.
   * Enforces due dates, late-submission rules, and single-submission guarantees.
   * Uses computeAssignmentDeadline() to combine dueDate and dueTime consistently.
   */
  static async submitAssignment(
    studentProfile: IStudentProfile,
    assignmentId: string,
    data: SubmitAssignmentInput,
    files?: Express.Multer.File[]
  ): Promise<IAssignmentSubmission> {
    const studentId = studentProfile._id as mongoose.Types.ObjectId;
    const { assignment } = await this.getStudentAssignmentDetails(studentProfile, assignmentId);

    const now = new Date();
    const exactDeadline = computeAssignmentDeadline(assignment.dueDate, assignment.dueTime);
    const isPastDue = now > exactDeadline;

    // Validate late submission policy
    if (isPastDue && !data.isDraft) {
      if (!assignment.allowLateSubmission) {
        throw new Error(
          "Submission rejected: The due date has passed and late submissions are not allowed for this assignment."
        );
      }
      if (assignment.lateSubmissionDeadline) {
        const lateDeadline = new Date(assignment.lateSubmissionDeadline);
        // If late submission deadline was specified as date-only (midnight), default to end of that day
        if (
          (lateDeadline.getHours() === 0 && lateDeadline.getMinutes() === 0 && lateDeadline.getSeconds() === 0) ||
          (lateDeadline.getUTCHours() === 0 && lateDeadline.getUTCMinutes() === 0 && lateDeadline.getUTCSeconds() === 0)
        ) {
          lateDeadline.setHours(23, 59, 59, 999);
        }
        if (now > lateDeadline) {
          throw new Error(
            "Submission rejected: The late submission deadline for this assignment has passed."
          );
        }
      }
    }

    // Process uploaded attachments
    const newAttachments: ISubmissionAttachment[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        newAttachments.push(
          buildSubmissionAttachmentRecord(
            file,
            studentId.toString(),
            assignment._id.toString()
          )
        );
      }
    }

    // Check for existing submission record
    let submission = await AssignmentSubmission.findOne({
      assignmentId: assignment._id,
      studentProfileId: studentId,
    });

    const studentName = studentProfile.name || "Student";
    const studentEmail =
      (studentProfile as any).userId?.email ||
      (studentProfile as any).email ||
      "student@edupye.com";

    const targetStatus: SubmissionStatus = data.isDraft
      ? "draft"
      : isPastDue
      ? "late"
      : "submitted";

    try {
      if (submission) {
        // If already evaluated, reject resubmission
        if (submission.status === "evaluated") {
          throw new Error(
            "This submission has already been evaluated and graded. Resubmissions are not permitted."
          );
        }

        // If resubmitting a previously submitted version, record in submissionHistory
        if (submission.status === "submitted" || submission.status === "late") {
          submission.submissionHistory.push({
            version: submission.submissionHistory.length + 1,
            submittedAt: submission.submittedAt || now,
            content: submission.content || "",
            attachments: [...submission.attachments],
            comment: data.comment || "Resubmission",
          });
        }

        if (data.content !== undefined) {
          submission.content = data.content.trim();
        }

        if (newAttachments.length > 0) {
          submission.attachments.push(...newAttachments);
        }

        submission.status = targetStatus;
        if (!data.isDraft) {
          submission.submittedAt = now;
          submission.isLate = isPastDue;
        }

        await submission.save();
        return submission;
      }

      // First time submission / draft creation
      submission = await AssignmentSubmission.create({
        assignmentId: assignment._id,
        studentProfileId: studentId,
        studentName,
        studentEmail,
        classSectionId: assignment.classSectionId,
        content: data.content?.trim() || "",
        attachments: newAttachments,
        status: targetStatus,
        submittedAt: data.isDraft ? null : now,
        isLate: data.isDraft ? false : isPastDue,
        submissionHistory: [],
        evaluationHistory: [],
      });

      return submission;
    } catch (err) {
      // Rollback newly uploaded attachments if DB persistence failed
      for (const att of newAttachments) {
        await storageService.deleteFile(att.storageKey).catch(() => {});
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // ATTACHMENT STREAMING & AUTHORIZATION
  // --------------------------------------------------------------------------

  /**
   * Resolves a readable stream for a teacher assignment attachment with strict authorization.
   */
  static async getAssignmentAttachmentStream(
    actor: { teacherProfile?: ITeacherProfile; studentProfile?: IStudentProfile },
    assignmentId: string,
    storageKey: string
  ): Promise<{ stream: NodeJS.ReadableStream; attachment: IAssignmentAttachment }> {
    if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
      throw new Error("Invalid assignment ID format.");
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found.");
    }

    const attachment = assignment.attachments.find((a) => a.storageKey === storageKey);
    if (!attachment) {
      throw new Error("Attachment not found on this assignment.");
    }

    let isAuthorized = false;

    // Check teacher access
    if (actor.teacherProfile) {
      if (assignment.teacherId.toString() === (actor.teacherProfile._id as mongoose.Types.ObjectId).toString()) {
        isAuthorized = true;
      }
    }

    // Check student access
    if (!isAuthorized && actor.studentProfile) {
      const studentId = actor.studentProfile._id as mongoose.Types.ObjectId;
      const isEnrolled = await verifyStudentClassSectionEnrollment(
        studentId,
        assignment.classSectionId
      );
      const isTargeted =
        assignment.targetType === "all" ||
        assignment.targetStudentProfileIds.some((id) => id.toString() === studentId.toString());

      if (assignment.status === "published" && isEnrolled && isTargeted) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new Error("Unauthorized: You do not have permission to download this attachment.");
    }

    const stream = await storageService.getFileStream(attachment.storageKey);
    return { stream, attachment };
  }

  /**
   * Resolves a readable stream for a student submission attachment with strict authorization.
   * Guarantees student isolation (student A cannot access student B's files).
   */
  static async getSubmissionAttachmentStream(
    actor: { teacherProfile?: ITeacherProfile; studentProfile?: IStudentProfile },
    assignmentId: string,
    submissionId: string,
    storageKey: string
  ): Promise<{ stream: NodeJS.ReadableStream; attachment: ISubmissionAttachment }> {
    if (!mongoose.Types.ObjectId.isValid(assignmentId) || !mongoose.Types.ObjectId.isValid(submissionId)) {
      throw new Error("Invalid ID format.");
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found.");
    }

    const submission = await AssignmentSubmission.findOne({
      _id: submissionId,
      assignmentId: assignment._id,
    });

    if (!submission) {
      throw new Error("Submission not found.");
    }

    const attachment = submission.attachments.find((a) => a.storageKey === storageKey);
    if (!attachment) {
      throw new Error("Attachment not found on this submission.");
    }

    let isAuthorized = false;

    // Check student access: must be the submitting student
    if (actor.studentProfile) {
      if (submission.studentProfileId.toString() === (actor.studentProfile._id as mongoose.Types.ObjectId).toString()) {
        isAuthorized = true;
      }
    }

    // Check teacher access: must be the teacher owning this assignment
    if (!isAuthorized && actor.teacherProfile) {
      if (assignment.teacherId.toString() === (actor.teacherProfile._id as mongoose.Types.ObjectId).toString()) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new Error("Unauthorized: You do not have permission to download this submission attachment.");
    }

    const stream = await storageService.getFileStream(attachment.storageKey);
    return { stream, attachment };
  }
}

export default AssignmentService;
