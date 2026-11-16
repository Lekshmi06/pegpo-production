import { Request, Response } from "express";
import mongoose from "mongoose";
import User, { IUser } from "../models/User";
import TuitionProgram, { ITuitionProgram } from "../models/TuitionProgram";
import CombinedStudyMessage, { ICombinedStudyMessage, CombinedStudyMessageType } from "../models/CombinedStudyMessage";
import { generateSessionToken } from "../utils/token";

/**
 * Helper to extract user ID from authenticated request
 */
function getAuthUserId(req: Request): string | undefined {
  return (req.user as any)?._id?.toString() || (req.user as any)?.userId?.toString();
}

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

/**
 * 1. POST /api/tuition/auth/code-login
 * Public/Tuition authentication using permanent studentCode or teacherCode
 */
export async function codeLogin(req: Request, res: Response): Promise<void> {
  try {
    const { code, name, programId } = req.body;

    if (!code || typeof code !== "string" || !code.trim()) {
      res.status(400).json({ success: false, message: "Valid student or teacher code is required." });
      return;
    }

    const cleanCode = code.trim().toUpperCase();

    // Find user by either studentCode or teacherCode
    const user = await User.findOne({
      $or: [{ studentCode: cleanCode }, { teacherCode: cleanCode }],
    });

    if (!user) {
      res.status(401).json({ success: false, message: "Invalid student or teacher code." });
      return;
    }

    // Optional Name Verification
    if (name && typeof name === "string" && name.trim()) {
      const providedName = name.trim().toLowerCase();
      const actualName = (user.name || "").trim().toLowerCase();
      // Verify name roughly matches (contains or starts with)
      if (actualName && !actualName.includes(providedName) && !providedName.includes(actualName)) {
        res.status(401).json({
          success: false,
          message: "Provided name does not match the registered code identity.",
        });
        return;
      }
    }

    // Optional Program Enrollment Check
    let programContext: any = undefined;
    if (programId) {
      if (!mongoose.Types.ObjectId.isValid(programId)) {
        res.status(400).json({ success: false, message: "Invalid program ID format." });
        return;
      }

      const program = await TuitionProgram.findById(programId);
      if (!program) {
        res.status(404).json({ success: false, message: "Tuition program not found." });
        return;
      }

      const userIdStr = user._id.toString();
      const isEnrolledStudent = program.enrolledStudentIds.some((id) => id.toString() === userIdStr);
      const isAssignedTeacher = program.teacherIds.some((id) => id.toString() === userIdStr);

      if (!isEnrolledStudent && !isAssignedTeacher && user.userType !== "institution") {
        res.status(403).json({
          success: false,
          message: "User is not enrolled or assigned to this tuition program.",
        });
        return;
      }

      programContext = {
        _id: program._id,
        title: program.title,
        code: program.code,
        subject: program.subject,
        grade: program.grade,
        roleInProgram: isAssignedTeacher ? "teacher" : "student",
      };
    }

    // Generate authenticated JWT session token with Tuition Mode claims
    const token = generateSessionToken({
      _id: user._id,
      email: user.email,
      userType: user.userType,
      activeRole: user.activeRole,
      roles: user.roles,
    });

    res.status(200).json({
      success: true,
      token,
      tuitionMode: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        userType: user.userType,
        roles: user.roles,
        activeRole: user.activeRole,
        studentCode: user.studentCode,
        teacherCode: user.teacherCode,
      },
      programContext,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to authenticate via code." });
  }
}

/**
 * 2. GET /api/tuition/programs
 * Lists programs relevant to the logged-in student or teacher, plus active catalog programs
 */
export async function getTuitionPrograms(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const userRole = (req.user as any)?.role || (req.user as any)?.userType || "student";

    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const userObjId = new mongoose.Types.ObjectId(userId);

    // If Admin/Institution: return all programs
    if (userRole === "institution") {
      const allPrograms = await TuitionProgram.find().sort({ createdAt: -1 });
      res.status(200).json({ success: true, count: allPrograms.length, programs: allPrograms });
      return;
    }

    // Query enrolled or assigned programs
    const myPrograms = await TuitionProgram.find({
      $or: [{ enrolledStudentIds: userObjId }, { teacherIds: userObjId }],
    }).sort({ createdAt: -1 });

    // Also get active catalog programs not yet joined
    const catalogPrograms = await TuitionProgram.find({
      status: "active",
      enrolledStudentIds: { $ne: userObjId },
      teacherIds: { $ne: userObjId },
    }).limit(20);

    res.status(200).json({
      success: true,
      myPrograms,
      catalogPrograms,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch tuition programs." });
  }
}

/**
 * 3. GET /api/tuition/programs/:programId/roster
 * For students: returns assigned teachers & co-students in that program
 * For teachers: returns enrolled students & co-teachers
 */
export async function getProgramRoster(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const programId = getParam(req.params.programId);

    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(programId)) {
      res.status(400).json({ success: false, message: "Invalid program ID format." });
      return;
    }

    const program = await TuitionProgram.findById(programId)
      .populate("teacherIds", "name email teacherCode userType")
      .populate("enrolledStudentIds", "name email studentCode userType");

    if (!program) {
      res.status(404).json({ success: false, message: "Tuition program not found." });
      return;
    }

    const userIdStr = userId.toString();
    const isEnrolled = program.enrolledStudentIds.some((s: any) => s._id.toString() === userIdStr);
    const isTeacher = program.teacherIds.some((t: any) => t._id.toString() === userIdStr);
    const isAdmin = (req.user as any)?.role === "institution" || (req.user as any)?.userType === "institution";

    if (!isEnrolled && !isTeacher && !isAdmin) {
      res.status(403).json({
        success: false,
        message: "Unauthorized: You are not a participant in this tuition program.",
      });
      return;
    }

    if (isTeacher || isAdmin) {
      // Teacher/Admin view: full details of enrolled students
      res.status(200).json({
        success: true,
        programId: program._id,
        programTitle: program.title,
        programCode: program.code,
        subject: program.subject,
        role: "teacher",
        teachers: program.teacherIds,
        enrolledStudents: program.enrolledStudentIds,
      });
    } else {
      // Student view: assigned teachers + co-students (studentCode, name)
      const coStudents = (program.enrolledStudentIds as any[]).map((s) => ({
        _id: s._id,
        name: s.name,
        studentCode: s.studentCode,
      }));

      res.status(200).json({
        success: true,
        programId: program._id,
        programTitle: program.title,
        programCode: program.code,
        subject: program.subject,
        role: "student",
        assignedTeachers: program.teacherIds,
        coStudents,
      });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch program roster." });
  }
}

/**
 * 4. GET /api/tuition/teacher/enrolled-students
 * For teachers: returns enrolled students organized program-wise across all their programs
 */
export async function getTeacherEnrolledStudents(req: Request, res: Response): Promise<void> {
  try {
    const teacherId = getAuthUserId(req);
    if (!teacherId) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const programs = await TuitionProgram.find({
      teacherIds: new mongoose.Types.ObjectId(teacherId),
    }).populate("enrolledStudentIds", "name email studentCode userType status");

    const programWiseRoster = programs.map((p) => ({
      programId: p._id,
      title: p.title,
      code: p.code,
      subject: p.subject,
      grade: p.grade,
      schedule: p.schedule,
      status: p.status,
      totalEnrolled: p.enrolledStudentIds.length,
      students: p.enrolledStudentIds,
    }));

    res.status(200).json({
      success: true,
      totalPrograms: programs.length,
      programRosters: programWiseRoster,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch teacher enrolled students." });
  }
}

/**
 * 5. GET /api/tuition/programs/:programId/combined-study
 * Fetches 1-year retained Combined Study messages and shared media for a program
 */
export async function getCombinedStudyMessages(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const programId = getParam(req.params.programId);

    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(programId)) {
      res.status(400).json({ success: false, message: "Invalid program ID format." });
      return;
    }

    const program = await TuitionProgram.findById(programId);
    if (!program) {
      res.status(404).json({ success: false, message: "Tuition program not found." });
      return;
    }

    const userIdStr = userId.toString();
    const isMember =
      program.enrolledStudentIds.some((s) => s.toString() === userIdStr) ||
      program.teacherIds.some((t) => t.toString() === userIdStr) ||
      (req.user as any)?.role === "institution";

    if (!isMember) {
      res.status(403).json({ success: false, message: "Access denied to this Combined Study room." });
      return;
    }

    // Only return non-expired messages
    const messages = await CombinedStudyMessage.find({
      programId: new mongoose.Types.ObjectId(programId),
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: 1 })
      .limit(100);

    res.status(200).json({
      success: true,
      programId,
      count: messages.length,
      messages,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch Combined Study messages." });
  }
}

/**
 * 6. POST /api/tuition/programs/:programId/combined-study
 * Posts text message or shared PDF/Image/Video with guaranteed 1-year retention expiresAt
 */
export async function postCombinedStudyMessage(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const programId = getParam(req.params.programId);

    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(programId)) {
      res.status(400).json({ success: false, message: "Invalid program ID format." });
      return;
    }

    const program = await TuitionProgram.findById(programId);
    if (!program) {
      res.status(404).json({ success: false, message: "Tuition program not found." });
      return;
    }

    const userIdStr = userId.toString();
    const isEnrolled = program.enrolledStudentIds.some((s) => s.toString() === userIdStr);
    const isTeacher = program.teacherIds.some((t) => t.toString() === userIdStr);
    const isAdmin = (req.user as any)?.role === "institution";

    if (!isEnrolled && !isTeacher && !isAdmin) {
      res.status(403).json({ success: false, message: "Unauthorized to post in this Combined Study room." });
      return;
    }

    const user = await User.findById(userId);
    const senderName = user?.name || (isTeacher ? "Teacher" : "Student");
    const senderRole = isTeacher ? "teacher" : isAdmin ? "admin" : "student";

    let messageType: CombinedStudyMessageType = "text";
    let content: string | undefined = req.body.content?.trim();
    let fileUrl: string | undefined = undefined;
    let fileKey: string | undefined = undefined;
    let fileName: string | undefined = undefined;
    let fileSize: number | undefined = undefined;
    let mimeType: string | undefined = undefined;

    // File upload handling (via multer disk storage)
    if (req.file) {
      const mime = req.file.mimetype;
      if (mime.includes("pdf")) {
        messageType = "pdf";
      } else if (mime.startsWith("image/")) {
        messageType = "image";
      } else if (mime.startsWith("video/")) {
        messageType = "video";
      }

      fileUrl = `/uploads/combined_study/${programId}/${req.file.filename}`;
      fileKey = req.file.path;
      fileName = req.file.originalname;
      fileSize = req.file.size;
      mimeType = req.file.mimetype;
    } else if (req.body.messageType && ["pdf", "image", "video"].includes(req.body.messageType)) {
      // Direct file metadata payload (e.g. cloud URL)
      messageType = req.body.messageType;
      fileUrl = req.body.fileUrl;
      fileKey = req.body.fileKey || req.body.fileUrl;
      fileName = req.body.fileName;
      fileSize = req.body.fileSize;
      mimeType = req.body.mimeType;
    }

    if (messageType === "text" && !content) {
      res.status(400).json({ success: false, message: "Text message content cannot be empty." });
      return;
    }

    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ONE_YEAR_MS);

    const message = await CombinedStudyMessage.create({
      programId: new mongoose.Types.ObjectId(programId),
      senderId: new mongoose.Types.ObjectId(userId),
      senderRole,
      senderName,
      messageType,
      content,
      fileUrl,
      fileKey,
      fileName,
      fileSize,
      mimeType,
      expiresAt,
    });

    res.status(201).json({
      success: true,
      message,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to post Combined Study message." });
  }
}

/**
 * 7. POST /api/tuition/programs
 * Creates a new tuition program (available to teachers & admins)
 */
export async function createTuitionProgram(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const { title, subject, grade, description, schedule, teacherIds, enrolledStudentIds, maxCapacity, startDate, endDate } = req.body;

    if (!title || !subject) {
      res.status(400).json({ success: false, message: "Title and subject are required." });
      return;
    }

    const assignedTeachers = Array.isArray(teacherIds) && teacherIds.length > 0
      ? teacherIds.map((id: string) => new mongoose.Types.ObjectId(id))
      : userId
      ? [new mongoose.Types.ObjectId(userId)]
      : [];

    const program = await TuitionProgram.create({
      title: title.trim(),
      subject: subject.trim(),
      grade: grade?.trim(),
      description: description?.trim(),
      schedule: schedule || [],
      teacherIds: assignedTeachers,
      enrolledStudentIds: Array.isArray(enrolledStudentIds)
        ? enrolledStudentIds.map((id: string) => new mongoose.Types.ObjectId(id))
        : [],
      maxCapacity: maxCapacity || 30,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status: "active",
    });

    res.status(201).json({
      success: true,
      program,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to create tuition program." });
  }
}
