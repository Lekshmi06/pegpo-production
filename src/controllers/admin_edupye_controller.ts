import { Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";
import TuitionProgram, { generateProgramCode } from "../models/TuitionProgram";
import TuitionRequest from "../models/TuitionRequest";
import TuitionProviderProfile from "../models/TuitionProviderProfile";
import CombinedStudyMessage from "../models/CombinedStudyMessage";
import TuitionTransaction from "../models/TuitionTransaction";
import TeacherPayout from "../models/TeacherPayout";
import TuitionEnrollment from "../models/TuitionEnrollment";
import Enrollment from "../models/Enrollment";
import TuitionComplaint from "../models/TuitionComplaint";
import * as payoutService from "../services/tuition_payout_service";
import * as complianceService from "../services/tuition_compliance_service";

export const adminEdupyeController = {
  /**
   * GET /api/admin/edupye-analytics
   * Aggregated live metrics for EduPye Platform Overview (Dashboard / Module 1)
   */
  async getEdupyeAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const [totalStudents, totalTeachers, activeTuitionPrograms, pendingUsers, pendingRequests] =
        await Promise.all([
          User.countDocuments({
            $or: [
              { role: { $in: ["student", "learner", "personal"] } },
              { activeRole: { $in: ["student", "learner", "personal"] } },
              { userType: { $in: ["student", "learner", "personal"] } },
              { roles: { $in: ["student", "learner", "personal"] } },
            ],
          } as any),
          User.countDocuments({
            $or: [
              { role: { $in: ["teacher", "tuition_provider", "educator"] } },
              { activeRole: { $in: ["teacher", "tuition_provider", "educator"] } },
              { userType: { $in: ["teacher", "tuition_provider", "educator"] } },
              { roles: { $in: ["teacher", "tuition_provider", "educator"] } },
            ],
          } as any),
          TuitionProgram.countDocuments({ status: "active" } as any),
          User.countDocuments({ tuitionApprovalStatus: "pending" } as any),
          TuitionRequest.countDocuments({ status: { $in: ["pending", "under_review", "submitted"] } } as any),
        ]);

      const pendingAccessRequests = pendingUsers + pendingRequests;
      const activeLiveSessions = activeTuitionPrograms;

      // Recent Activity
      const recentUsers = await User.find({
        tuitionApprovalStatus: { $in: ["pending", "approved"] },
      } as any)
        .sort({ updatedAt: -1 })
        .limit(8)
        .select("name displayName username email role activeRole studentCode teacherCode tuitionApprovalStatus updatedAt");

      res.status(200).json({
        success: true,
        data: {
          totalStudents,
          totalTeachers,
          activeTuitionPrograms,
          pendingAccessRequests,
          activeLiveSessions,
          recentActivity: recentUsers.map((u: any) => ({
            id: u._id,
            name: u.displayName || u.name || u.username || u.email,
            email: u.email,
            role: u.activeRole || u.role || "student",
            code: u.studentCode || u.teacherCode || "N/A",
            status: u.tuitionApprovalStatus || "pending",
            updatedAt: u.updatedAt,
          })),
        },
      });
    } catch (err: any) {
      console.error("Error in getEdupyeAnalytics:", err);
      res.status(500).json({ success: false, message: err.message || "Failed to load EduPye analytics." });
    }
  },

  /**
   * GET /api/admin/tuition/teachers
   * List all teachers with their verification status, permanent code, subjects, grades, and assigned programs
   */
  async getTuitionTeachers(req: Request, res: Response): Promise<void> {
    try {
      const teachers: any[] = await User.find({
        $or: [
          { role: { $in: ["teacher", "tuition_provider", "educator"] } },
          { activeRole: { $in: ["teacher", "tuition_provider", "educator"] } },
          { userType: { $in: ["teacher", "tuition_provider", "educator"] } },
          { roles: { $in: ["teacher", "tuition_provider", "educator"] } },
        ],
      } as any)
        .sort({ createdAt: -1 })
        .select("name displayName username email role activeRole teacherCode tuitionApprovalStatus teacherDetails createdAt updatedAt");

      const providerProfiles: any[] = await TuitionProviderProfile.find({}).lean();
      const profileMap = new Map(providerProfiles.map((p) => [p.userId?.toString(), p]));

      const programs = await TuitionProgram.find({ status: "active" }).select("title code teacherIds grade subject");

      const enriched = teachers.map((t: any) => {
        const teacherIdStr = t._id.toString();
        const prof = profileMap.get(teacherIdStr);

        const assignedPrograms = programs
          .filter((p) => p.teacherIds && p.teacherIds.some((id: any) => id.toString() === teacherIdStr))
          .map((p) => ({ id: p._id, title: p.title, code: p.code, subject: p.subject, grade: p.grade }));

        const isRevoked = t.tuitionApprovalStatus === "revoked" || t.tuitionApprovalStatus === "suspended";
        const approvalStatus = isRevoked
          ? "revoked"
          : (t.teacherCode || t.tuitionApprovalStatus === "approved"
            ? "approved"
            : (t.tuitionApprovalStatus === "pending" || prof?.verificationStatus === "pending"
              ? "pending"
              : (t.tuitionApprovalStatus || "pending")));

        const subjects =
          (Array.isArray(prof?.subjects) && prof.subjects.length > 0 ? prof.subjects : null) ||
          (Array.isArray(prof?.teachingSubjects) && prof.teachingSubjects.length > 0 ? prof.teachingSubjects : null) ||
          (t.teacherDetails && Array.isArray(t.teacherDetails.subjects) && t.teacherDetails.subjects.length > 0 ? t.teacherDetails.subjects : null) ||
          (assignedPrograms.length > 0 ? Array.from(new Set(assignedPrograms.map((p) => p.subject).filter(Boolean))) : null) ||
          ["General Tuition"];

        const grades =
          (Array.isArray(prof?.classesTaught) && prof.classesTaught.length > 0 ? prof.classesTaught : null) ||
          (Array.isArray(prof?.grades) && prof.grades.length > 0 ? prof.grades : null) ||
          (assignedPrograms.length > 0 ? Array.from(new Set(assignedPrograms.map((p) => p.grade).filter(Boolean))) : null) ||
          ["Class 11-12"];

        return {
          id: t._id,
          name: t.displayName || t.name || t.username,
          username: t.username,
          email: t.email,
          role: t.activeRole || t.role,
          teacherCode: t.teacherCode || null,
          tuitionApprovalStatus: approvalStatus,
          tier: prof?.platformTier || "standard",
          subjects,
          grades,
          assignedPrograms,
          phone: t.phone || prof?.contactPhone || null,
          qualifications: prof?.qualifications || [],
          bio: prof?.bio || "",
          demoLink: prof?.demoLink || "",
          interviewStatus: prof?.interviewStatus || (approvalStatus === "approved" ? "approved" : "pending_interview"),
          interviewDate: prof?.interviewDate || null,
          interviewNotes: prof?.interviewNotes || "",
          createdAt: t.createdAt,
        };
      });

      res.status(200).json({ success: true, count: enriched.length, teachers: enriched });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * PATCH /api/admin/tuition/teachers/:id/interview
   * Schedule interview for an applicant tutor
   */
  async scheduleTeacherInterview(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.params.id;
      const { interviewDate, interviewNotes } = req.body;

      const user = await User.findById(teacherId);
      if (!user) {
        res.status(404).json({ success: false, message: "Teacher account not found." });
        return;
      }

      const profile = await TuitionProviderProfile.findOneAndUpdate(
        { userId: user._id },
        {
          interviewStatus: "interview_scheduled",
          interviewDate: interviewDate ? new Date(interviewDate) : undefined,
          interviewNotes: interviewNotes || "",
        },
        { new: true, upsert: true }
      );

      res.status(200).json({
        success: true,
        message: "Interview scheduled successfully.",
        profile,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * PATCH /api/admin/tuition/teachers/:id/accept
   * Approve tutor, issue permanent TCH-XXXXXX code, and mark interview as approved
   */
  async acceptTeacher(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.params.id;
      const { notes } = req.body;

      const user = await User.findById(teacherId);
      if (!user) {
        res.status(404).json({ success: false, message: "Teacher account not found." });
        return;
      }

      const code = user.issuePermanentTuitionCode();
      user.tuitionApprovalStatus = "approved";
      await user.save();

      await TuitionProviderProfile.findOneAndUpdate(
        { userId: user._id },
        {
          interviewStatus: "approved",
          verificationStatus: "verified",
          verificationNotes: notes || "Tutor approved and issued code",
          verifiedAt: new Date(),
        },
        { new: true, upsert: true }
      );

      res.status(200).json({
        success: true,
        message: `Teacher approved and issued permanent code ${code}`,
        teacherCode: code,
        tuitionApprovalStatus: "approved",
        interviewStatus: "approved",
        user,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * PATCH /api/admin/tuition/teachers/:id/reject
   * Reject tutor application
   */
  async rejectTeacher(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.params.id;
      const { reason } = req.body;

      const user = await User.findById(teacherId);
      if (!user) {
        res.status(404).json({ success: false, message: "Teacher account not found." });
        return;
      }

      user.tuitionApprovalStatus = "rejected";
      await user.save();

      await TuitionProviderProfile.findOneAndUpdate(
        { userId: user._id },
        {
          interviewStatus: "rejected",
          verificationStatus: "rejected",
          verificationNotes: reason || "Application rejected",
        },
        { new: true, upsert: true }
      );

      res.status(200).json({
        success: true,
        message: "Teacher application rejected.",
        tuitionApprovalStatus: "rejected",
        interviewStatus: "rejected",
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * PATCH /api/admin/tuition/teachers/:id/verify
   * Verify teacher and auto-issue permanent TCH-XXXXXX code
   */
  async verifyTeacher(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.params.id;
      const { status = "approved", notes } = req.body;

      const user = await User.findById(teacherId);
      if (!user) {
        res.status(404).json({ success: false, message: "Teacher account not found." });
        return;
      }

      let code = user.teacherCode;
      if (status === "approved") {
        code = user.issuePermanentTuitionCode();
        user.tuitionApprovalStatus = "approved";
      } else {
        user.tuitionApprovalStatus = status;
      }
      await user.save();

      // If provider profile exists, update its verificationStatus
      await TuitionProviderProfile.findOneAndUpdate(
        { userId: user._id },
        { verificationStatus: status, adminNotes: notes },
        { new: true }
      );

      res.status(200).json({
        success: true,
        message: `Teacher ${status === "approved" ? "verified and issued permanent code " + code : "status updated to " + status}`,
        teacherCode: user.teacherCode,
        tuitionApprovalStatus: user.tuitionApprovalStatus,
        user,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /api/admin/tuition/students
   * List all students with their tuition status, permanent code, grade, subjects, and enrolled programs
   */
  async getTuitionStudents(req: Request, res: Response): Promise<void> {
    try {
      const students = await User.find({
        $or: [
          { role: { $in: ["student", "learner", "personal"] } },
          { activeRole: { $in: ["student", "learner", "personal"] } },
          { userType: { $in: ["student", "learner", "personal"] } },
          { roles: { $in: ["student", "learner", "personal"] } },
        ],
      })
        .sort({ createdAt: -1 })
        .select("name displayName username email role activeRole studentCode tuitionApprovalStatus createdAt updatedAt");

      const programs = await TuitionProgram.find({ status: "active" }).select("title code enrolledStudentIds grade subject");
      const tuitionRequests = await TuitionRequest.find({}).lean();
      const reqMap = new Map(tuitionRequests.map((r: any) => [r.studentId?.toString() || r.userId?.toString(), r]));

      const enriched = students.map((s) => {
        const studentIdStr = s._id.toString();
        const enrolledPrograms = programs
          .filter((p) => p.enrolledStudentIds && p.enrolledStudentIds.some((id: any) => id.toString() === studentIdStr))
          .map((p) => ({ id: p._id, title: p.title, code: p.code, grade: p.grade, subject: p.subject }));

        const req = reqMap.get(studentIdStr);
        const hasPendingRequest = !!req;

        const isRevoked = s.tuitionApprovalStatus === "revoked" || s.tuitionApprovalStatus === "suspended";
        const approvalStatus = isRevoked
          ? "revoked"
          : (s.studentCode || s.tuitionApprovalStatus === "approved"
            ? "approved"
            : (s.tuitionApprovalStatus === "pending" || hasPendingRequest
              ? "pending"
              : (s.tuitionApprovalStatus || "none")));

        const grade = req?.grade || req?.classLevel || (enrolledPrograms.length > 0 ? enrolledPrograms[0].grade : "Class 12");
        const subjects =
          (req && Array.isArray(req.subjects) && req.subjects.length > 0 ? req.subjects : null) ||
          (enrolledPrograms.length > 0 ? Array.from(new Set(enrolledPrograms.map((p) => p.subject).filter(Boolean))) : null) ||
          ["General Tuition"];

        const notesStr = req?.adminNotes || req?.learningGoals || '';
        const parentMatch = notesStr.match(/Parent\/Guardian:\s*([^|]+)/);
        const phoneMatch = notesStr.match(/Phone:\s*([^|]+)/);
        const parentName = req?.parentDetails?.name || req?.parentName || (parentMatch ? parentMatch[1].trim() : "Guardian / N/A");
        const parentPhone = req?.parentDetails?.phone || req?.parentPhone || (phoneMatch ? phoneMatch[1].trim() : (s as any).phone || "N/A");

        return {
          id: s._id,
          name: s.displayName || s.name || s.username,
          username: s.username,
          email: s.email,
          phone: (s as any).phone || "",
          role: s.activeRole || s.role,
          studentCode: s.studentCode || null,
          tuitionApprovalStatus: approvalStatus,
          grade,
          subjects,
          parentName,
          parentPhone,
          gender: (s as any).gender || "Not Specified",
          dob: (s as any).dateOfBirth || null,
          address: (s as any).address || "",
          enrolledPrograms,
          createdAt: s.createdAt,
        };
      });

      res.status(200).json({ success: true, count: enriched.length, students: enriched });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * PATCH /api/admin/tuition/students/:id/approve
   * Approve student tuition access, auto-issue STU-XXXXXX code, and optionally assign to TuitionProgram
   */
  async approveStudent(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.params.id;
      const { status = "approved", programId } = req.body;

      const user = await User.findById(studentId);
      if (!user) {
        res.status(404).json({ success: false, message: "Student account not found." });
        return;
      }

      let code = user.studentCode;
      if (status === "approved") {
        code = user.issuePermanentTuitionCode();
        user.tuitionApprovalStatus = "approved";
      } else {
        user.tuitionApprovalStatus = status;
      }
      await user.save();

      let assignedProgram = null;
      if (programId && mongoose.Types.ObjectId.isValid(programId)) {
        assignedProgram = await TuitionProgram.findById(programId);
        if (assignedProgram) {
          const userObjId = user._id as any;
          if (!assignedProgram.enrolledStudentIds.some((id: any) => id.toString() === userObjId.toString())) {
            assignedProgram.enrolledStudentIds.push(userObjId);
            await assignedProgram.save();
          }
        }
      }

      res.status(200).json({
        success: true,
        message: `Student access ${status} and issued permanent code ${code || user.studentCode}`,
        studentCode: user.studentCode,
        tuitionApprovalStatus: user.tuitionApprovalStatus,
        assignedProgram,
        user,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /api/admin/tuition/students
   * Create a new tuition student admission, issue permanent STU-XXXXXX code, and enroll in program
   */
  async createTuitionStudent(req: Request, res: Response): Promise<void> {
    try {
      const {
        name,
        displayName,
        email,
        phone,
        password,
        grade = "Class 12",
        parentName,
        parentPhone,
        parentEmail,
        parentRelation = "Parent",
        gender = "Not Specified",
        dob,
        address,
        programId,
        feePlan = "Monthly Standard (₹2,500)",
      } = req.body;

      if (!name || (!email && !phone)) {
        res.status(400).json({ success: false, message: "Student name and email or phone are required." });
        return;
      }

      const studentEmail = email ? email.trim().toLowerCase() : `student_${Date.now()}@edupye.academy`;
      const baseUsername = (name || "student").toLowerCase().replace(/[^a-z0-9]/g, "") + "_" + Math.floor(1000 + Math.random() * 9000);

      const existingUser = await User.findOne({ email: studentEmail });
      if (existingUser) {
        res.status(409).json({ success: false, message: "A user with this email address already exists." });
        return;
      }

      const user = new User({
        name,
        displayName: displayName || name,
        username: baseUsername,
        email: studentEmail,
        password: password || "Edupye@2026",
        role: "student",
        activeRole: "student",
        userType: "student",
        roles: ["student"],
        phone: phone || "",
        gender,
        dateOfBirth: dob ? new Date(dob) : undefined,
        address: address || "",
        tuitionApprovalStatus: "approved",
      });

      const studentCode = user.issuePermanentTuitionCode();
      await user.save();

      let assignedProgram: any = null;
      if (programId && mongoose.Types.ObjectId.isValid(programId)) {
        assignedProgram = await TuitionProgram.findById(programId);
        if (assignedProgram) {
          const userObjId = user._id as any;
          if (!assignedProgram.enrolledStudentIds.some((id: any) => id.toString() === userObjId.toString())) {
            assignedProgram.enrolledStudentIds.push(userObjId);
            await assignedProgram.save();
          }
        }
      }

      try {
        await TuitionRequest.create({
          studentId: user._id,
          classFormat: "group",
          teachingMode: "online",
          subject: assignedProgram ? assignedProgram.subject : "General Tuition",
          classLevel: grade,
          curriculum: "CBSE",
          status: assignedProgram ? "enrolled" : "accepted",
          adminNotes: `Parent/Guardian: ${parentName || 'N/A'} (${parentRelation || 'Parent'}) | Phone: ${parentPhone || 'N/A'} | Fee Plan: ${feePlan}`,
          learningGoals: `Tuition Enrollment in ${grade} (${feePlan})`,
        });
      } catch (errReq) {
        // Continue even if tuition request creation encountered non-critical error
      }

      res.status(201).json({
        success: true,
        message: `Student admitted successfully with permanent ID ${studentCode}`,
        student: {
          id: user._id,
          name: user.displayName || user.name,
          username: user.username,
          email: user.email,
          phone: user.phone,
          studentCode,
          grade,
          parentName: parentName || "Guardian / N/A",
          parentPhone: parentPhone || "N/A",
          gender,
          tuitionApprovalStatus: "approved",
          enrolledPrograms: assignedProgram ? [{ id: assignedProgram._id, title: assignedProgram.title, code: assignedProgram.code, subject: assignedProgram.subject, grade: assignedProgram.grade }] : [],
          createdAt: user.createdAt,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /api/admin/tuition/programs
   * List all Tuition Programs with paired teachers and enrolled students
   */
  async getPrograms(req: Request, res: Response): Promise<void> {
    try {
      const programs = await TuitionProgram.find({})
        .populate("teacherIds", "name displayName email teacherCode activeRole")
        .populate("enrolledStudentIds", "name displayName email studentCode activeRole")
        .sort({ createdAt: -1 });

      res.status(200).json({ success: true, count: programs.length, programs });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /api/admin/tuition/programs
   * Create new Tuition Program with multiple teachers and students
   */
  async createProgram(req: Request, res: Response): Promise<void> {
    try {
      const {
        title,
        subject,
        grade,
        description,
        schedule,
        teacherId,
        teacherIds,
        studentIds,
        enrolledStudentIds,
        teacherSubjects,
        maxCapacity,
      } = req.body;

      if (!title || !subject) {
        res.status(400).json({ success: false, message: "Title and subject are required." });
        return;
      }

      const rawTeacherIds = Array.isArray(teacherIds)
        ? teacherIds
        : teacherId
        ? [teacherId]
        : [];
      const cleanTeacherIds = Array.from(
        new Set(
          rawTeacherIds
            .filter((id: string) => mongoose.Types.ObjectId.isValid(id))
            .map((id: string) => id.toString())
        )
      ).map((id) => new mongoose.Types.ObjectId(id));

      const rawStudentIds = Array.isArray(enrolledStudentIds)
        ? enrolledStudentIds
        : Array.isArray(studentIds)
        ? studentIds
        : [];
      const cleanStudentIds = Array.from(
        new Set(
          rawStudentIds
            .filter((id: string) => mongoose.Types.ObjectId.isValid(id))
            .map((id: string) => id.toString())
        )
      ).map((id) => new mongoose.Types.ObjectId(id));

      const cleanTeacherSubjects = Array.isArray(teacherSubjects)
        ? teacherSubjects
            .filter((ts: any) => ts && ts.teacherId && mongoose.Types.ObjectId.isValid(ts.teacherId))
            .map((ts: any) => ({
              teacherId: new mongoose.Types.ObjectId(ts.teacherId),
              subject: String(ts.subject || "").trim(),
            }))
        : [];

      const program = await TuitionProgram.create({
        title: title.trim(),
        code: generateProgramCode("PRG"),
        subject: subject.trim(),
        grade: grade?.trim() || "Class 12",
        description: description?.trim() || "",
        schedule: schedule || [
          { day: "Monday", startTime: "17:00", endTime: "18:30" },
          { day: "Wednesday", startTime: "17:00", endTime: "18:30" },
          { day: "Friday", startTime: "17:00", endTime: "18:30" },
        ],
        teacherIds: cleanTeacherIds,
        teacherSubjects: cleanTeacherSubjects,
        enrolledStudentIds: cleanStudentIds,
        maxCapacity: maxCapacity || 30,
        status: "active",
      });

      const populated = await TuitionProgram.findById(program._id)
        .populate("teacherIds", "name displayName email teacherCode activeRole")
        .populate("enrolledStudentIds", "name displayName email studentCode activeRole");

      res.status(201).json({ success: true, message: "Tuition Program created successfully", program: populated });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * PUT /api/admin/tuition/programs/:id
   * Update Tuition Program details, schedules, and paired students/teachers
   */
  async updateProgram(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        title,
        subject,
        grade,
        description,
        schedule,
        teacherId,
        teacherIds,
        studentIds,
        enrolledStudentIds,
        teacherSubjects,
        maxCapacity,
        status,
      } = req.body;

      const program = await TuitionProgram.findById(id);
      if (!program) {
        res.status(404).json({ success: false, message: "Tuition Program not found." });
        return;
      }

      if (title) program.title = title.trim();
      if (subject) program.subject = subject.trim();
      if (grade) program.grade = grade.trim();
      if (description !== undefined) program.description = description.trim();
      if (schedule && Array.isArray(schedule)) program.schedule = schedule;

      if (teacherIds !== undefined || teacherId !== undefined) {
        const rawTeacherIds = Array.isArray(teacherIds)
          ? teacherIds
          : teacherId
          ? [teacherId]
          : [];
        program.teacherIds = Array.from(
          new Set(
            rawTeacherIds
              .filter((tid: string) => mongoose.Types.ObjectId.isValid(tid))
              .map((tid: string) => tid.toString())
          )
        ).map((tid) => new mongoose.Types.ObjectId(tid));
      }

      if (enrolledStudentIds !== undefined || studentIds !== undefined) {
        const rawStudentIds = Array.isArray(enrolledStudentIds)
          ? enrolledStudentIds
          : Array.isArray(studentIds)
          ? studentIds
          : [];
        program.enrolledStudentIds = Array.from(
          new Set(
            rawStudentIds
              .filter((sid: string) => mongoose.Types.ObjectId.isValid(sid))
              .map((sid: string) => sid.toString())
          )
        ).map((sid) => new mongoose.Types.ObjectId(sid));
      }

      if (teacherSubjects !== undefined && Array.isArray(teacherSubjects)) {
        program.teacherSubjects = teacherSubjects
          .filter((ts: any) => ts && ts.teacherId && mongoose.Types.ObjectId.isValid(ts.teacherId))
          .map((ts: any) => ({
            teacherId: new mongoose.Types.ObjectId(ts.teacherId),
            subject: String(ts.subject || "").trim(),
          }));
      }

      if (maxCapacity) program.maxCapacity = Number(maxCapacity);
      if (status) program.status = status;

      await program.save();

      const populated = await TuitionProgram.findById(program._id)
        .populate("teacherIds", "name displayName email teacherCode activeRole")
        .populate("enrolledStudentIds", "name displayName email studentCode activeRole");

      res.status(200).json({ success: true, message: "Program updated successfully", program: populated });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /api/admin/tuition/programs/:id/teachers
   * Add teachers to an existing program without affecting memberships in other programs
   */
  async assignTeachersToProgram(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { teacherIds, teacherSubjects } = req.body;

      if (!Array.isArray(teacherIds) || teacherIds.length === 0) {
        res.status(400).json({ success: false, message: "teacherIds array is required." });
        return;
      }

      const validTeacherIds = teacherIds
        .filter((tid: string) => mongoose.Types.ObjectId.isValid(tid))
        .map((tid: string) => new mongoose.Types.ObjectId(tid));

      const program = await TuitionProgram.findById(id);
      if (!program) {
        res.status(404).json({ success: false, message: "Tuition Program not found." });
        return;
      }

      // Add to teacherIds using unique sets
      const existingSet = new Set(program.teacherIds.map((tid) => tid.toString()));
      validTeacherIds.forEach((vid) => existingSet.add(vid.toString()));
      program.teacherIds = Array.from(existingSet).map((tid) => new mongoose.Types.ObjectId(tid));

      // Merge teacherSubjects
      if (Array.isArray(teacherSubjects)) {
        const currentSubjects = program.teacherSubjects || [];
        const subjectMap = new Map(currentSubjects.map((ts) => [ts.teacherId.toString(), ts.subject]));
        teacherSubjects.forEach((ts: any) => {
          if (ts && ts.teacherId && mongoose.Types.ObjectId.isValid(ts.teacherId)) {
            subjectMap.set(ts.teacherId.toString(), String(ts.subject || "").trim());
          }
        });
        program.teacherSubjects = Array.from(subjectMap.entries()).map(([tId, subj]) => ({
          teacherId: new mongoose.Types.ObjectId(tId),
          subject: subj,
        }));
      }

      await program.save();

      const populated = await TuitionProgram.findById(program._id)
        .populate("teacherIds", "name displayName email teacherCode activeRole")
        .populate("enrolledStudentIds", "name displayName email studentCode activeRole");

      res.status(200).json({
        success: true,
        message: "Teachers assigned to program successfully.",
        program: populated,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * DELETE /api/admin/tuition/programs/:id/teachers/:teacherId
   * Remove a teacher from a program
   */
  async removeTeacherFromProgram(req: Request, res: Response): Promise<void> {
    try {
      const { id, teacherId } = req.params;

      const program = await TuitionProgram.findById(id);
      if (!program) {
        res.status(404).json({ success: false, message: "Tuition Program not found." });
        return;
      }

      program.teacherIds = program.teacherIds.filter((tid) => tid.toString() !== teacherId);
      if (program.teacherSubjects) {
        program.teacherSubjects = program.teacherSubjects.filter((ts) => ts.teacherId.toString() !== teacherId);
      }

      await program.save();

      const populated = await TuitionProgram.findById(program._id)
        .populate("teacherIds", "name displayName email teacherCode activeRole")
        .populate("enrolledStudentIds", "name displayName email studentCode activeRole");

      res.status(200).json({
        success: true,
        message: "Teacher removed from program successfully.",
        program: populated,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /api/admin/tuition/programs/:id/students
   * Enroll students into an existing program without overwriting other program memberships
   */
  async enrollStudentsInProgram(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { studentIds, enrolledStudentIds } = req.body;

      const rawIds = Array.isArray(studentIds) ? studentIds : enrolledStudentIds;
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        res.status(400).json({ success: false, message: "studentIds array is required." });
        return;
      }

      const validStudentIds = rawIds
        .filter((sid: string) => mongoose.Types.ObjectId.isValid(sid))
        .map((sid: string) => new mongoose.Types.ObjectId(sid));

      const program = await TuitionProgram.findById(id);
      if (!program) {
        res.status(404).json({ success: false, message: "Tuition Program not found." });
        return;
      }

      const existingSet = new Set(program.enrolledStudentIds.map((sid) => sid.toString()));
      validStudentIds.forEach((vid) => existingSet.add(vid.toString()));
      program.enrolledStudentIds = Array.from(existingSet).map((sid) => new mongoose.Types.ObjectId(sid));

      await program.save();

      const populated = await TuitionProgram.findById(program._id)
        .populate("teacherIds", "name displayName email teacherCode activeRole")
        .populate("enrolledStudentIds", "name displayName email studentCode activeRole");

      res.status(200).json({
        success: true,
        message: "Students enrolled in program successfully.",
        program: populated,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * DELETE /api/admin/tuition/programs/:id/students/:studentId
   * Remove a student from a program
   */
  async removeStudentFromProgram(req: Request, res: Response): Promise<void> {
    try {
      const { id, studentId } = req.params;

      const program = await TuitionProgram.findById(id);
      if (!program) {
        res.status(404).json({ success: false, message: "Tuition Program not found." });
        return;
      }

      program.enrolledStudentIds = program.enrolledStudentIds.filter((sid) => sid.toString() !== studentId);
      await program.save();

      const populated = await TuitionProgram.findById(program._id)
        .populate("teacherIds", "name displayName email teacherCode activeRole")
        .populate("enrolledStudentIds", "name displayName email studentCode activeRole");

      res.status(200).json({
        success: true,
        message: "Student removed from program successfully.",
        program: populated,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * PUT /api/admin/tuition/programs/:id/roster
   * Update full program roster of teachers and students at once
   */
  async updateProgramRoster(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { teacherIds, studentIds, enrolledStudentIds, teacherSubjects } = req.body;

      const program = await TuitionProgram.findById(id);
      if (!program) {
        res.status(404).json({ success: false, message: "Tuition Program not found." });
        return;
      }

      if (Array.isArray(teacherIds)) {
        program.teacherIds = Array.from(
          new Set(
            teacherIds
              .filter((tid: string) => mongoose.Types.ObjectId.isValid(tid))
              .map((tid: string) => tid.toString())
          )
        ).map((tid) => new mongoose.Types.ObjectId(tid));
      }

      const rawStudentIds = Array.isArray(studentIds) ? studentIds : enrolledStudentIds;
      if (Array.isArray(rawStudentIds)) {
        program.enrolledStudentIds = Array.from(
          new Set(
            rawStudentIds
              .filter((sid: string) => mongoose.Types.ObjectId.isValid(sid))
              .map((sid: string) => sid.toString())
          )
        ).map((sid) => new mongoose.Types.ObjectId(sid));
      }

      if (Array.isArray(teacherSubjects)) {
        program.teacherSubjects = teacherSubjects
          .filter((ts: any) => ts && ts.teacherId && mongoose.Types.ObjectId.isValid(ts.teacherId))
          .map((ts: any) => ({
            teacherId: new mongoose.Types.ObjectId(ts.teacherId),
            subject: String(ts.subject || "").trim(),
          }));
      }

      await program.save();

      const populated = await TuitionProgram.findById(program._id)
        .populate("teacherIds", "name displayName email teacherCode activeRole")
        .populate("enrolledStudentIds", "name displayName email studentCode activeRole");

      res.status(200).json({
        success: true,
        message: "Program roster updated successfully.",
        program: populated,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * DELETE /api/admin/tuition/programs/:id
   */
  async deleteProgram(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await TuitionProgram.findByIdAndDelete(id);
      res.status(200).json({ success: true, message: "Tuition program deleted successfully." });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /api/admin/tuition/payouts
   * List payouts for review
   */
  async getPayouts(req: Request, res: Response): Promise<void> {
    try {
      const payouts = await payoutService.listTeacherPayouts({});
      res.status(200).json({ success: true, count: payouts.length, payouts });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /api/admin/tuition/payouts/:id/approve
   */
  async approvePayout(req: Request, res: Response): Promise<void> {
    try {
      const adminUserId = (req.user as any)?._id?.toString() || "admin";
      const { id } = req.params;
      const { adminNotes } = req.body;
      const payout = await payoutService.adminApprovePayout(adminUserId, String(id), adminNotes);
      res.status(200).json({ success: true, message: "Payout approved successfully", payout });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /api/admin/tuition/recordings
   * 365-day compliance recordings and chat vault
   */
  async getComplianceVault(req: Request, res: Response): Promise<void> {
    try {
      const recordings = await complianceService.getAdminRecordings({});
      const messages = await CombinedStudyMessage.find({})
        .sort({ createdAt: -1 })
        .limit(50)
        .populate("senderId", "name email");

      res.status(200).json({
        success: true,
        recordings,
        recentChatAudit: messages.map((m) => ({
          id: m._id,
          programId: m.programId,
          senderName: m.senderName,
          senderRole: m.senderRole,
          messageType: m.messageType,
          content: m.content || m.fileName || "[Media]",
          fileUrl: m.fileUrl,
          createdAt: m.createdAt,
          expiresAt: m.expiresAt,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /api/admin/edupye-accounts
   * Aggregated financial, sales and revenue metrics for EduPye
   */
  async getEdupyeAccounts(req: Request, res: Response): Promise<void> {
    try {
      const [
        paidTransactions,
        pendingPayouts,
        approvedPayouts,
        disbursedPayouts,
        totalTuitionEnrollments,
        totalCourseEnrollments,
        recentTxList,
      ] = await Promise.all([
        TuitionTransaction.find({ status: "paid" }),
        TeacherPayout.find({ status: "pending_review" }),
        TeacherPayout.find({ status: "approved" }),
        TeacherPayout.find({ status: "disbursed" }),
        TuitionEnrollment.countDocuments({}),
        Enrollment.countDocuments({}),
        TuitionTransaction.find({})
          .sort({ createdAt: -1 })
          .limit(20)
          .populate("studentId", "name email studentCode")
          .populate("providerId", "name email teacherCode")
          .populate("offeringId", "subject title gradeLevel"),
      ]);

      const tuitionGross = paidTransactions.reduce((acc, tx) => acc + (tx.grossAmount || 0), 0);
      const pendingPayoutsAmount = pendingPayouts.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
      const approvedPayoutsAmount = approvedPayouts.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
      const disbursedPayoutsAmount = disbursedPayouts.reduce((acc, p) => acc + (p.totalAmount || 0), 0);

      // In platform economics: net margin retained = tuitionGross - disbursedPayoutsAmount
      const platformNetRevenue = Math.max(0, tuitionGross - disbursedPayoutsAmount);

      res.status(200).json({
        success: true,
        summary: {
          totalGrossRevenue: tuitionGross,
          platformNetRevenue,
          totalPaidTransactions: paidTransactions.length,
          totalEnrollments: totalTuitionEnrollments + totalCourseEnrollments,
          tuitionEnrollments: totalTuitionEnrollments,
          courseEnrollments: totalCourseEnrollments,
          pendingPayoutsAmount,
          pendingPayoutsCount: pendingPayouts.length,
          approvedPayoutsAmount,
          approvedPayoutsCount: approvedPayouts.length,
          disbursedPayoutsAmount,
          disbursedPayoutsCount: disbursedPayouts.length,
          currency: "INR",
        },
        recentTransactions: recentTxList.map((tx: any) => ({
          id: tx._id,
          receiptNumber: tx.gatewayTransactionId || `TX-${tx._id.toString().slice(-6).toUpperCase()}`,
          studentName: tx.studentId?.name || "Student",
          studentEmail: tx.studentId?.email,
          studentCode: tx.studentId?.studentCode,
          teacherName: tx.providerId?.name || "Tuition Provider",
          teacherEmail: tx.providerId?.email,
          teacherCode: tx.providerId?.teacherCode,
          subject: tx.offeringId?.subject || tx.offeringId?.title || "Tuition Session",
          amount: tx.grossAmount || 0,
          currency: tx.currency || "INR",
          status: tx.status,
          paymentMethod: tx.paymentMethod || "UPI / Card",
          createdAt: tx.createdAt,
        })),
        payoutsBreakdown: {
          pendingReview: { count: pendingPayouts.length, amount: pendingPayoutsAmount },
          approved: { count: approvedPayouts.length, amount: approvedPayoutsAmount },
          disbursed: { count: disbursedPayouts.length, amount: disbursedPayoutsAmount },
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * PATCH /api/admin/tuition/users/:id/revoke
   * Revoke tuition mode access and immediately pull from active program rosters
   */
  async revokeTuitionUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = await User.findById(id);
      if (!user) {
        res.status(404).json({ success: false, message: "User not found." });
        return;
      }

      user.tuitionApprovalStatus = "revoked";
      await user.save();

      await TuitionProviderProfile.findOneAndUpdate(
        { userId: user._id },
        { verificationStatus: "rejected", adminNotes: "Access revoked by admin" }
      );

      // Immediately pull user from active program rosters
      await TuitionProgram.updateMany(
        { teacherIds: user._id },
        { $pull: { teacherIds: user._id } }
      );
      await TuitionProgram.updateMany(
        { enrolledStudentIds: user._id },
        { $pull: { enrolledStudentIds: user._id } }
      );

      res.status(200).json({
        success: true,
        message: "User tuition access revoked and removed from active program rosters.",
        tuitionApprovalStatus: user.tuitionApprovalStatus,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * PATCH /api/admin/tuition/users/:id/restore
   * Restore tuition mode access
   */
  async restoreTuitionUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = await User.findById(id);
      if (!user) {
        res.status(404).json({ success: false, message: "User not found." });
        return;
      }

      user.tuitionApprovalStatus = "approved";
      if (!user.teacherCode && (user.role === "teacher" || user.activeRole === "teacher" || user.userType === "teacher")) {
        user.issuePermanentTuitionCode();
      } else if (!user.studentCode && (user.role === "student" || user.activeRole === "student" || user.userType === "student")) {
        user.issuePermanentTuitionCode();
      }
      await user.save();

      await TuitionProviderProfile.findOneAndUpdate(
        { userId: user._id },
        { verificationStatus: "verified", adminNotes: "Access restored by admin" }
      );

      res.status(200).json({
        success: true,
        message: "User tuition access restored successfully.",
        tuitionApprovalStatus: user.tuitionApprovalStatus,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * DELETE /api/admin/tuition/users/:id
   * Delete student or teacher account and clean up tuition relationships
   */
  async deleteTuitionUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = await User.findById(id);
      if (!user) {
        res.status(404).json({ success: false, message: "User not found." });
        return;
      }

      await TuitionProviderProfile.deleteMany({ userId: user._id });
      await TuitionRequest.deleteMany({ $or: [{ studentId: user._id }, { userId: user._id }] });

      // Pull from all programs
      await TuitionProgram.updateMany(
        { teacherIds: user._id },
        { $pull: { teacherIds: user._id } }
      );
      await TuitionProgram.updateMany(
        { enrolledStudentIds: user._id },
        { $pull: { enrolledStudentIds: user._id } }
      );

      await User.findByIdAndDelete(id);

      res.status(200).json({
        success: true,
        message: "User and associated tuition records deleted successfully.",
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /api/admin/tuition/complaints
   * List all complaints with strict anonymous masking if isAnonymous is true
   */
  async getComplaints(req: Request, res: Response): Promise<void> {
    try {
      const complaints = await TuitionComplaint.find({})
        .sort({ createdAt: -1 })
        .populate("reporterId", "name displayName username email studentCode teacherCode role activeRole")
        .populate("programId", "title code subject");

      const sanitized = complaints.map((c: any) => {
        const obj = c.toObject();
        if (obj.isAnonymous) {
          obj.reporter = {
            name: "Anonymous User",
            email: "masked@edupye.internal",
            role: obj.reporterRole,
            code: "ANON",
            isAnonymous: true,
          };
          delete obj.reporterId;
        } else {
          const u = obj.reporterId;
          obj.reporter = {
            id: u?._id,
            name: u?.displayName || u?.name || u?.username || "Identified User",
            email: u?.email || "N/A",
            role: obj.reporterRole || u?.activeRole || u?.role || "user",
            code: u?.studentCode || u?.teacherCode || "N/A",
            isAnonymous: false,
          };
        }
        return obj;
      });

      res.status(200).json({ success: true, count: sanitized.length, complaints: sanitized });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * PATCH /api/admin/tuition/complaints/:id
   * Update complaint status and append admin progress notes
   */
  async updateComplaint(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status, adminProgressNotes, adminNote } = req.body;

      const complaint = await TuitionComplaint.findById(id);
      if (!complaint) {
        res.status(404).json({ success: false, message: "Complaint not found." });
        return;
      }

      if (status) {
        complaint.status = status;
      }

      const noteText = typeof adminProgressNotes === "string" ? adminProgressNotes : (adminNote || adminProgressNotes?.message);
      if (noteText && typeof noteText === "string" && noteText.trim()) {
        const adminUser = req.user as any;
        complaint.adminProgressNotes.push({
          message: noteText.trim(),
          updatedBy: adminUser?.name || adminUser?.displayName || adminUser?.email || "EduPye Admin",
          updatedAt: new Date(),
        });
      }

      await complaint.save();

      res.status(200).json({
        success: true,
        message: "Complaint updated successfully.",
        complaint,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

export default adminEdupyeController;
