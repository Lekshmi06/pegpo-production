import { Request, Response } from "express";
import mongoose from "mongoose";
import User, { IUser } from "../models/User";
import TuitionProgram, { ITuitionProgram } from "../models/TuitionProgram";
import TuitionRequest from "../models/TuitionRequest";
import TuitionProviderProfile from "../models/TuitionProviderProfile";
import TeacherProfile from "../models/TeacherProfile";
import StudentProfile from "../models/StudentProfile";
import CombinedStudyMessage, { ICombinedStudyMessage, CombinedStudyMessageType } from "../models/CombinedStudyMessage";
import LiveClassSession from "../models/LiveClassSession";
import SessionRecording from "../models/SessionRecording";
import { generateSessionToken } from "../utils/token";

/**
 * Enriches raw teacher user documents with instructor bio, avatar, qualifications and credentials
 */
async function enrichTeachers(teacherDocs: any[]): Promise<any[]> {
  if (!teacherDocs || teacherDocs.length === 0) return [];
  const teacherUserIds = teacherDocs.map((t) => (t._id || t));
  const [providerProfiles, teacherProfiles] = await Promise.all([
    TuitionProviderProfile.find({ userId: { $in: teacherUserIds } }).lean(),
    TeacherProfile.find({ userId: { $in: teacherUserIds } }).lean(),
  ]);

  const providerMap = new Map(providerProfiles.map((p) => [p.userId.toString(), p]));
  const teacherProfileMap = new Map(teacherProfiles.map((tp) => [tp.userId.toString(), tp]));

  return teacherDocs.map((t) => {
    const uid = (t._id || t).toString();
    const pProfile = providerMap.get(uid);
    const tProfile = teacherProfileMap.get(uid);

    const name = t.displayName || t.fullName || t.name || pProfile?.fullName || tProfile?.name || "Instructor";
    const avatar = t.avatarUrl || pProfile?.photoUrl || tProfile?.avatar || "";
    const teacherCode = t.teacherCode || "";
    const bio = pProfile?.bio || tProfile?.bio || pProfile?.headline || "Experienced Subject Specialist";
    const qualifications =
      pProfile?.qualifications && pProfile.qualifications.length > 0
        ? pProfile.qualifications
        : pProfile?.education && pProfile.education.length > 0
        ? pProfile.education.map((e: any) => e.degree)
        : tProfile?.department
        ? [tProfile.department]
        : ["Certified Educator"];
    const experienceYears = pProfile?.experienceYears ?? tProfile?.experienceYears ?? 5;
    const subjects =
      pProfile?.subjects && pProfile.subjects.length > 0
        ? pProfile.subjects
        : tProfile?.subjects && tProfile.subjects.length > 0
        ? tProfile.subjects
        : [];

    return {
      _id: uid,
      name,
      email: t.email || "",
      avatar,
      profilePicture: avatar,
      teacherCode,
      bio,
      qualifications,
      experienceYears,
      subjects,
      platformTier: pProfile?.platformTier || "standard",
      userType: "teacher",
    };
  });
}

/**
 * Enriches student user documents with academic details and avatars
 */
async function enrichStudents(studentDocs: any[], programGrade?: string): Promise<any[]> {
  if (!studentDocs || studentDocs.length === 0) return [];
  const studentUserIds = studentDocs.map((s) => (s._id || s));
  const studentProfiles = await StudentProfile.find({ userId: { $in: studentUserIds } }).lean();
  const profileMap = new Map(studentProfiles.map((sp) => [sp.userId.toString(), sp]));

  return studentDocs.map((s) => {
    const uid = (s._id || s).toString();
    const sp = profileMap.get(uid);
    const name = s.displayName || s.fullName || s.name || "Student";
    const avatar = s.avatarUrl || (sp as any)?.avatar || "";
    const studentCode = s.studentCode || "";
    const grade = programGrade || sp?.schoolDetails?.classLevel || sp?.education?.level || sp?.education?.classLevel || "Standard";
    const bio = sp?.schoolDetails?.schoolName ? `Student at ${sp.schoolDetails.schoolName}` : "Enrolled Learner";

    return {
      _id: uid,
      name,
      email: s.email || "",
      avatar,
      profilePicture: avatar,
      studentCode,
      grade,
      bio,
      userType: "student",
    };
  });
}

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

    // Helper to format programs with populated instructor cards
    const formatProgramsWithTeachers = async (programsList: any[]) => {
      return Promise.all(
        programsList.map(async (p) => {
          const pObj = p.toObject ? p.toObject() : p;
          const teachers = await enrichTeachers(p.teacherIds || []);
          return {
            ...pObj,
            teachers,
          };
        })
      );
    };

    // If Admin/Institution: return all programs
    if (userRole === "institution") {
      const allProgramsRaw = await TuitionProgram.find()
        .populate("teacherIds", "name email teacherCode userType avatarUrl displayName fullName")
        .sort({ createdAt: -1 });
      const programs = await formatProgramsWithTeachers(allProgramsRaw);
      res.status(200).json({ success: true, count: programs.length, programs });
      return;
    }

    // Query enrolled or assigned programs
    const myProgramsRaw = await TuitionProgram.find({
      $or: [{ enrolledStudentIds: userObjId }, { teacherIds: userObjId }],
    })
      .populate("teacherIds", "name email teacherCode userType avatarUrl displayName fullName")
      .sort({ createdAt: -1 });

    // Also get active catalog programs not yet joined
    const catalogProgramsRaw = await TuitionProgram.find({
      status: "active",
      enrolledStudentIds: { $ne: userObjId },
      teacherIds: { $ne: userObjId },
    })
      .populate("teacherIds", "name email teacherCode userType avatarUrl displayName fullName")
      .limit(20);

    const [myPrograms, catalogPrograms] = await Promise.all([
      formatProgramsWithTeachers(myProgramsRaw),
      formatProgramsWithTeachers(catalogProgramsRaw),
    ]);

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
 * Returns normalized program details, enriched teachers with bio/credentials,
 * and enriched students with grade/avatar for both teacher and student views.
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
      .populate("teacherIds", "name email teacherCode userType avatarUrl displayName fullName")
      .populate("enrolledStudentIds", "name email studentCode userType avatarUrl displayName fullName");

    if (!program) {
      res.status(404).json({ success: false, message: "Tuition program not found." });
      return;
    }

    const userIdStr = userId.toString();
    const isEnrolled = program.enrolledStudentIds.some((s: any) => (s._id || s).toString() === userIdStr);
    const isTeacher = program.teacherIds.some((t: any) => (t._id || t).toString() === userIdStr);
    const isAdmin = (req.user as any)?.role === "institution" || (req.user as any)?.userType === "institution";

    if (!isEnrolled && !isTeacher && !isAdmin) {
      res.status(403).json({
        success: false,
        message: "Unauthorized: You are not a participant in this tuition program.",
      });
      return;
    }

    const [enrichedTeachers, enrichedStudents] = await Promise.all([
      enrichTeachers(program.teacherIds),
      enrichStudents(program.enrolledStudentIds, program.grade),
    ]);

    const userRoleStr = isTeacher || isAdmin ? "teacher" : "student";

    res.status(200).json({
      success: true,
      program: {
        ...program.toObject(),
        teachers: enrichedTeachers,
      },
      programId: program._id,
      programTitle: program.title,
      programCode: program.code,
      subject: program.subject,
      grade: program.grade,
      syllabusTopics: program.syllabusTopics || [],
      requiredMaterials: program.requiredMaterials || [],
      nextSessionTopic: program.nextSessionTopic || "",
      userRole: userRoleStr,
      role: userRoleStr,
      teachers: enrichedTeachers,
      assignedTeachers: enrichedTeachers,
      students: enrichedStudents,
      enrolledStudents: enrichedStudents,
      coStudents: enrichedStudents,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch program roster." });
  }
}

/**
 * 3b. PATCH /api/tuition/programs/:programId/overview
 * Updates syllabusTopics, requiredMaterials, and nextSessionTopic.
 * Accessible by assigned teachers or institution administrators.
 */
export async function updateProgramOverview(req: Request, res: Response): Promise<void> {
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
    const isTeacher = program.teacherIds.some((t: any) => t.toString() === userIdStr);
    const isAdmin = (req.user as any)?.role === "institution" || (req.user as any)?.userType === "institution";

    if (!isTeacher && !isAdmin) {
      res.status(403).json({
        success: false,
        message: "Unauthorized: Only assigned instructors or administrators can update the program overview.",
      });
      return;
    }

    const { syllabusTopics, requiredMaterials, nextSessionTopic } = req.body;

    if (Array.isArray(syllabusTopics)) {
      program.syllabusTopics = syllabusTopics
        .filter((t: any) => typeof t === "string" && t.trim())
        .map((t: string) => t.trim());
    }

    if (Array.isArray(requiredMaterials)) {
      program.requiredMaterials = requiredMaterials
        .filter((m: any) => typeof m === "string" && m.trim())
        .map((m: string) => m.trim());
    }

    if (typeof nextSessionTopic === "string") {
      program.nextSessionTopic = nextSessionTopic.trim();
    }

    await program.save();

    res.status(200).json({
      success: true,
      message: "Program overview updated successfully.",
      program,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to update program overview." });
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

/**
 * 8. POST /api/tuition/requests/program-access
 * Authenticated student or teacher requests tuition access (sets tuitionApprovalStatus to 'pending')
 */
export async function requestProgramAccess(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found." });
      return;
    }

    const isTeacher =
      user.activeRole === "teacher" ||
      user.activeRole === "tuition_provider" ||
      user.userType === "teacher" ||
      user.userType === "tuition_provider" ||
      (Array.isArray(user.roles) && user.roles.some((r) => ["teacher", "tuition_provider"].includes(r)));

    const isStudent =
      user.activeRole === "student" ||
      user.activeRole === "learner" ||
      user.activeRole === "personal" ||
      user.userType === "student" ||
      user.userType === "learner" ||
      user.userType === "personal" ||
      (Array.isArray(user.roles) && user.roles.some((r) => ["student", "learner", "personal"].includes(r)));

    const hasAppropriateCode = isTeacher ? Boolean(user.teacherCode) : Boolean(user.studentCode);

    if (user.tuitionApprovalStatus === "approved" && hasAppropriateCode) {
      res.status(200).json({
        success: true,
        message: "Tuition access is already approved and permanent code is active.",
        tuitionApprovalStatus: "approved",
        code: isTeacher ? user.teacherCode : user.studentCode,
        user,
      });
      return;
    }

    if (process.env.AUTO_APPROVE_TUITION_DEV === "true") {
      const code = user.issuePermanentTuitionCode();
      user.tuitionApprovalStatus = "approved";
      await user.save();

      try {
        let demoProgram = await TuitionProgram.findOne({ code: "PRG-PHY12-DEMO" });
        if (!demoProgram) {
          demoProgram = await TuitionProgram.create({
            title: "Class 12 Physics - Mechanics & Electromagnetism",
            code: "PRG-PHY12-DEMO",
            subject: "Physics",
            grade: "Class 12",
            description: "Comprehensive Class 12 CBSE & competitive Physics tuition program covering mechanics, electrostatics, optics, and modern physics.",
            schedule: [
              { day: "Monday", startTime: "17:00", endTime: "18:30" },
              { day: "Wednesday", startTime: "17:00", endTime: "18:30" },
              { day: "Friday", startTime: "17:00", endTime: "18:30" },
            ],
            teacherIds: [],
            enrolledStudentIds: [],
            status: "active",
            maxCapacity: 50,
          });
        }

        if (isTeacher) {
          if (!demoProgram.teacherIds.some((id: any) => id.toString() === (user._id as any).toString())) {
            demoProgram.teacherIds.push(user._id as any);
            await demoProgram.save();
          }
        }
        if (isStudent || !isTeacher) {
          if (!demoProgram.enrolledStudentIds.some((id: any) => id.toString() === (user._id as any).toString())) {
            demoProgram.enrolledStudentIds.push(user._id as any);
            await demoProgram.save();
          }
        }
      } catch (progErr) {
        console.warn("Auto-enroll demo program warning:", progErr);
      }

      res.status(200).json({
        success: true,
        message: "Tuition access auto-approved in dev mode.",
        tuitionApprovalStatus: "approved",
        code: isTeacher ? user.teacherCode : user.studentCode,
        user,
      });
      return;
    }

    // STRICT ADMIN-GATED APPROVAL (process.env.AUTO_APPROVE_TUITION_DEV !== 'true')
    user.tuitionApprovalStatus = "pending";
    await user.save();

    if (isTeacher) {
      await TuitionProviderProfile.findOneAndUpdate(
        { userId: user._id },
        {
          $setOnInsert: {
            userId: user._id,
            fullName: user.displayName || user.name || user.username || "Teacher",
            subjects: ["General Tuition"],
            classesTaught: ["All Levels"],
            teachingMode: ["online"],
            pricing: { minHourlyRate: 500, maxHourlyRate: 2000, currency: "INR" },
            platformTier: "standard",
            isProvisionalTier: true,
          },
          $set: { verificationStatus: "pending" },
        },
        { upsert: true, new: true }
      );
    } else {
      const existingReq = await TuitionRequest.findOne({ studentId: user._id });
      if (!existingReq) {
        await TuitionRequest.create({
          studentId: user._id,
          subject: "General Tuition",
          classLevel: "Class 12",
          classFormat: "1:1",
          teachingMode: "online",
          scheduleModel: "flexible_slot",
          requestType: "regular",
          feeAmount: 0,
          currency: "INR",
          status: "pending",
          statusHistory: [
            {
              status: "pending",
              changedAt: new Date(),
              note: "Student requested Tuition Mode access. Awaiting Admin verification and permanent code issuance.",
            },
          ],
        });
      } else if (!["enrolled", "paid", "teacher_assigned"].includes(existingReq.status)) {
        existingReq.status = "pending";
        await existingReq.save();
      }
    }

    res.status(200).json({
      success: true,
      message: "Tuition access request submitted successfully. Pending Admin approval.",
      tuitionApprovalStatus: "pending",
      user,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to request tuition access." });
  }
}

/**
 * 8b. POST /api/tuition/programs/:programId/request-enrollment
 * An approved student or teacher requests enrollment into a specific catalog program.
 */
export async function requestProgramEnrollment(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const programId = String(req.params.programId || "");
    if (!programId) {
      res.status(400).json({ success: false, message: "Program ID is required." });
      return;
    }

    const program = await TuitionProgram.findOne({
      $or: [
        ...(mongoose.Types.ObjectId.isValid(programId) ? [{ _id: programId }] : []),
        { code: programId },
      ],
    });

    if (!program) {
      res.status(404).json({ success: false, message: "Tuition Program not found." });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User account not found." });
      return;
    }

    const userObjIdStr = user._id.toString();
    const isEnrolled = program.enrolledStudentIds.some((id: any) => id.toString() === userObjIdStr);
    const isTeacher = program.teacherIds.some((id: any) => id.toString() === userObjIdStr);

    if (isEnrolled || isTeacher) {
      res.status(200).json({
        success: true,
        message: "You are already enrolled or assigned in this program.",
        alreadyEnrolled: true,
        program,
      });
      return;
    }

    // Check if an existing pending request is already queued for this program
    const existingReq = await TuitionRequest.findOne({
      studentId: user._id,
      status: { $in: ["pending", "under_review"] },
      $or: [
        { batchId: program._id },
        { learningGoals: `Enrolling into ${program.title} (${program.code})` },
      ],
    });

    if (existingReq) {
      res.status(200).json({
        success: true,
        message: `Your enrollment request for "${program.title}" is already pending Admin review.`,
        alreadyRequested: true,
        request: existingReq,
      });
      return;
    }

    const newRequest = await TuitionRequest.create({
      studentId: user._id,
      batchId: program._id,
      subject: program.subject || "Tuition",
      classLevel: program.grade || "Class 12",
      classFormat: "group",
      teachingMode: "online",
      scheduleModel: "fixed_batch",
      requestType: "regular",
      learningGoals: `Enrolling into ${program.title} (${program.code})`,
      feeAmount: 0,
      currency: "INR",
      timezone: "Asia/Kolkata",
      status: "pending",
      statusHistory: [
        {
          status: "pending",
          changedAt: new Date(),
          note: `User ${user.displayName || user.name || user.email} requested enrollment into ${program.title} (${program.code})`,
        },
      ],
    });

    res.status(201).json({
      success: true,
      message: `Enrollment request submitted for "${program.title}"! An administrator will review and admit you into the batch.`,
      request: newRequest,
      program,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to submit program enrollment request.",
    });
  }
}

/**
 * 9. POST /api/tuition/admin/requests/:requestId/approve-program-access
 * Platform admin approves tuition access request, issues permanent code, and optionally enrolls in a TuitionProgram
 */
export async function approveProgramAccess(req: Request, res: Response): Promise<void> {
  try {
    const requestId = getParam(req.params.requestId);
    const { userId: bodyUserId, programId } = req.body;

    // Target user can be provided directly or found via requestId
    const targetUserId = bodyUserId || (mongoose.Types.ObjectId.isValid(requestId) ? requestId : undefined);
    if (!targetUserId) {
      res.status(400).json({ success: false, message: "Target userId is required for approval." });
      return;
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      res.status(404).json({ success: false, message: "Target user not found." });
      return;
    }

    // Issue permanent tuition code and mark approved
    const code = user.issuePermanentTuitionCode();
    await user.save();

    // Optionally assign/enroll in TuitionProgram
    let program: any = null;
    if (programId && mongoose.Types.ObjectId.isValid(programId)) {
      program = await TuitionProgram.findById(programId);
      if (program) {
        const isTeacher =
          user.userType === "teacher" ||
          user.userType === "tuition_provider" ||
          user.activeRole === "teacher" ||
          user.activeRole === "tuition_provider";

        if (isTeacher) {
          if (!program.teacherIds.some((id: any) => id.toString() === user._id.toString())) {
            program.teacherIds.push(user._id);
          }
        } else {
          if (!program.enrolledStudentIds.some((id: any) => id.toString() === user._id.toString())) {
            program.enrolledStudentIds.push(user._id);
          }
        }
        await program.save();
      }
    }

    res.status(200).json({
      success: true,
      message: "Permanent tuition code issued and tuition access approved.",
      code,
      tuitionApprovalStatus: "approved",
      user,
      program,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to approve tuition access." });
  }
}

/**
 * 10. GET /api/tuition/my-schedule
 * Returns expanded upcoming schedule occurrences for all active programs enrolled/assigned to the authenticated user.
 */
export async function getMySchedule(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const userObjId = new mongoose.Types.ObjectId(userId);

    // Find active programs the user belongs to
    let myPrograms = await TuitionProgram.find({
      status: "active",
      $or: [{ enrolledStudentIds: userObjId }, { teacherIds: userObjId }],
    });

    // In dev mode, if not yet enrolled in demo program, automatically auto-enroll / include it
    if (myPrograms.length === 0 && process.env.AUTO_APPROVE_TUITION_DEV === "true") {
      const demoProg = await TuitionProgram.findOne({ code: "PRG-PHY12-DEMO", status: "active" });
      if (demoProg) {
        const user = await User.findById(userId);
        if (user) {
          const isTeacher =
            user.activeRole === "teacher" ||
            user.activeRole === "tuition_provider" ||
            user.userType === "teacher" ||
            user.userType === "tuition_provider" ||
            (Array.isArray(user.roles) && user.roles.some((r) => ["teacher", "tuition_provider"].includes(r)));

          if (isTeacher) {
            if (!demoProg.teacherIds.some((id) => id.toString() === userId)) {
              demoProg.teacherIds.push(userObjId);
              await demoProg.save();
            }
          } else {
            if (!demoProg.enrolledStudentIds.some((id) => id.toString() === userId)) {
              demoProg.enrolledStudentIds.push(userObjId);
              await demoProg.save();
            }
          }
        }
        myPrograms = [demoProg];
      }
    }

    const DAY_MAP: Record<string, number> = {
      sunday: 0,
      sun: 0,
      monday: 1,
      mon: 1,
      tuesday: 2,
      tue: 2,
      wednesday: 3,
      wed: 3,
      thursday: 4,
      thu: 4,
      friday: 5,
      fri: 5,
      saturday: 6,
      sat: 6,
    };

    const parseTimeString = (timeStr: string) => {
      const clean = (timeStr || "").trim();
      const isPM = /pm$/i.test(clean);
      const isAM = /am$/i.test(clean);
      const parts = clean.replace(/am|pm/i, "").trim().split(":");
      let hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;
      return { hours, minutes };
    };

    const now = new Date();
    const sessions: any[] = [];

    // Expand next 30 days starting from today (offset 0 to 30)
    for (let offset = 0; offset <= 30; offset++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const targetDayOfWeek = targetDate.getDay();
      const yearStr = targetDate.getFullYear();
      const monthStr = String(targetDate.getMonth() + 1).padStart(2, "0");
      const dateStrNum = String(targetDate.getDate()).padStart(2, "0");
      const dateIsoString = `${yearStr}-${monthStr}-${dateStrNum}`; // "YYYY-MM-DD"

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayName = dayNames[targetDayOfWeek];

      for (const program of myPrograms) {
        if (!program.schedule || !Array.isArray(program.schedule)) continue;

        for (const slot of program.schedule) {
          const slotDayKey = (slot.day || "").toLowerCase().trim();
          const mappedDay = DAY_MAP[slotDayKey];
          if (mappedDay === undefined || mappedDay !== targetDayOfWeek) continue;

          const startParsed = parseTimeString(slot.startTime);
          const endParsed = parseTimeString(slot.endTime);

          const startDateTime = new Date(
            targetDate.getFullYear(),
            targetDate.getMonth(),
            targetDate.getDate(),
            startParsed.hours,
            startParsed.minutes,
            0
          );

          const endDateTime = new Date(
            targetDate.getFullYear(),
            targetDate.getMonth(),
            targetDate.getDate(),
            endParsed.hours,
            endParsed.minutes,
            0
          );

          // 15-minute buffer before scheduled start and after scheduled end
          const joinWindowStart = new Date(startDateTime.getTime() - 15 * 60 * 1000);
          const joinWindowEnd = new Date(endDateTime.getTime() + 15 * 60 * 1000);

          const canJoinNow = now >= joinWindowStart && now <= joinWindowEnd;
          const isPast = now > joinWindowEnd;

          sessions.push({
            id: `${program._id}_${dateIsoString}_${slot.startTime.replace(/[^a-zA-Z0-9]/g, "")}`,
            programId: program._id.toString(),
            programCode: program.code,
            programTitle: program.title,
            subject: program.subject,
            grade: program.grade,
            date: dateIsoString,
            dayOfWeek: dayName,
            startTime: slot.startTime,
            endTime: slot.endTime,
            startDateTime: startDateTime.toISOString(),
            endDateTime: endDateTime.toISOString(),
            liveRoomUrl: `/live/${encodeURIComponent(program.code)}`,
            canJoinNow,
            status: canJoinNow ? "live" : isPast ? "completed" : "scheduled",
          });
        }
      }
    }

    // Sort chronologically
    sessions.sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());

    res.status(200).json({
      success: true,
      count: sessions.length,
      sessions,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch tuition schedule." });
  }
}

/**
 * 14. GET /api/tuition/programs/:programId/recordings
 * Returns past class recordings, attendance logs, and 365-day retention status
 */
export async function getProgramRecordings(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const programId = getParam(req.params.programId);
    if (!programId) {
      res.status(400).json({ success: false, message: "Program ID is required." });
      return;
    }

    const program = await TuitionProgram.findOne({
      $or: [
        ...(mongoose.Types.ObjectId.isValid(programId) ? [{ _id: programId }] : []),
        { code: programId },
      ],
    });

    if (!program) {
      res.status(404).json({ success: false, message: "Tuition Program not found." });
      return;
    }

    const user = await User.findById(userId);
    const userRole = (user?.role || (user as any)?.activeRole || "").toLowerCase();
    const isAdmin = userRole === "admin" || userRole === "super_admin";
    const userObjIdStr = user?._id.toString();

    const isEnrolled = program.enrolledStudentIds.some((id: any) => id.toString() === userObjIdStr);
    const isTeacher = program.teacherIds.some((id: any) => id.toString() === userObjIdStr);

    if (!isAdmin && !isEnrolled && !isTeacher) {
      res.status(403).json({
        success: false,
        message: "You must be enrolled or assigned as an instructor to access program recordings.",
      });
      return;
    }

    // 1. Fetch ended live sessions for this program
    const endedSessions = await LiveClassSession.find({
      $or: [
        { tuitionSessionId: program._id },
        { batchId: program._id },
        { title: { $regex: program.code, $options: "i" } },
        { title: { $regex: program.title, $options: "i" } },
      ],
      status: "ended",
    })
      .sort({ endedAt: -1, createdAt: -1 })
      .lean();

    const sessionIds = endedSessions.map((s) => s._id);

    // 2. Fetch SessionRecording entries within 365-day retention
    const recordings = await SessionRecording.find({
      $or: [
        { sessionId: { $in: sessionIds } },
        { "metadata.programId": program._id },
        { "metadata.programId": program._id.toString() },
      ],
      isPurged: false,
    })
      .populate("teacherId", "name email teacherCode")
      .populate("studentId", "name email studentCode")
      .sort({ createdAt: -1 })
      .lean();

    // Map sessions & recordings into unified past-class records
    const now = Date.now();
    const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

    const unifiedList = endedSessions.map((s: any) => {
      const rec = recordings.find(
        (r: any) => r.sessionId?.toString() === s._id.toString()
      );

      const sessionDate = s.endedAt || s.startedAt || s.createdAt;
      const createdAtMs = new Date(s.createdAt).getTime();
      const expiresAt = rec?.expiresAt
        ? new Date(rec.expiresAt)
        : new Date(createdAtMs + RETENTION_MS);
      const daysRemaining = Math.max(
        0,
        Math.ceil((expiresAt.getTime() - now) / (1000 * 60 * 60 * 24))
      );

      const attendanceLogs = s.attendanceLogs || [];
      const totalAttendees = attendanceLogs.length;

      return {
        sessionId: s._id,
        recordingId: rec?._id || `rec-${s._id}`,
        title: s.title || `${program.title} Live Class`,
        subject: program.subject,
        sessionDate,
        durationMinutes: s.totalDurationMinutes || Math.round((rec?.durationSeconds || 3600) / 60),
        recordingUrl: rec?.recordingUrl || `/api/recordings/stream/${s._id}.webm`,
        status: rec?.status || "ready",
        retentionDays: 365,
        daysRemaining,
        retentionBadge: `${daysRemaining} days remaining (1-year policy)`,
        expiresAt,
        totalAttendees,
        attendanceLogs: attendanceLogs.map((log: any) => ({
          userId: log.userId,
          name: log.name,
          role: log.role,
          durationMinutes: log.durationMinutes,
        })),
        teacher: rec?.teacherId || { name: "Instructor" },
      };
    });

    // If there are recordings without live sessions or demo past sessions for demo programs
    if (unifiedList.length === 0) {
      const demoDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const demoExpires = new Date(demoDate.getTime() + RETENTION_MS);
      const demoDaysRemaining = Math.max(0, Math.ceil((demoExpires.getTime() - now) / (1000 * 60 * 60 * 24)));

      unifiedList.push({
        sessionId: `demo-session-${program._id}`,
        recordingId: `demo-rec-${program._id}`,
        title: `${program.title} - Chapter 1: Core Mechanics & Foundations`,
        subject: program.subject,
        sessionDate: demoDate,
        durationMinutes: 45,
        recordingUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        status: "ready",
        retentionDays: 365,
        daysRemaining: demoDaysRemaining,
        retentionBadge: `${demoDaysRemaining} days remaining (1-year policy)`,
        expiresAt: demoExpires,
        totalAttendees: program.enrolledStudentIds.length + 1,
        attendanceLogs: [
          { name: "Instructor", role: "host", durationMinutes: 45 },
          ...(program.enrolledStudentIds.length > 0
            ? [{ name: "Learner", role: "student", durationMinutes: 45 }]
            : []),
        ],
        teacher: { name: "Instructor" },
      });
    }

    res.json({
      success: true,
      programId: program._id,
      programCode: program.code,
      programTitle: program.title,
      recordings: unifiedList,
      totalRecordings: unifiedList.length,
      retentionPolicyDays: 365,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch program recordings.",
    });
  }
}
