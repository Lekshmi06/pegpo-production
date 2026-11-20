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
          phone: prof?.contactPhone || null,
          createdAt: t.createdAt,
        };
      });

      res.status(200).json({ success: true, count: enriched.length, teachers: enriched });
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

        return {
          id: s._id,
          name: s.displayName || s.name || s.username,
          username: s.username,
          email: s.email,
          role: s.activeRole || s.role,
          studentCode: s.studentCode || null,
          tuitionApprovalStatus: approvalStatus,
          grade,
          subjects,
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
   * Create new Tuition Program
   */
  async createProgram(req: Request, res: Response): Promise<void> {
    try {
      const { title, subject, grade, description, schedule, teacherIds, enrolledStudentIds, maxCapacity } = req.body;
      if (!title || !subject) {
        res.status(400).json({ success: false, message: "Title and subject are required." });
        return;
      }

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
        teacherIds: Array.isArray(teacherIds)
          ? teacherIds.filter((id: string) => mongoose.Types.ObjectId.isValid(id)).map((id: string) => new mongoose.Types.ObjectId(id))
          : [],
        enrolledStudentIds: Array.isArray(enrolledStudentIds)
          ? enrolledStudentIds.filter((id: string) => mongoose.Types.ObjectId.isValid(id)).map((id: string) => new mongoose.Types.ObjectId(id))
          : [],
        maxCapacity: maxCapacity || 30,
        status: "active",
      });

      const populated = await TuitionProgram.findById(program._id)
        .populate("teacherIds", "name displayName email teacherCode")
        .populate("enrolledStudentIds", "name displayName email studentCode");

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
      const { title, subject, grade, description, schedule, teacherIds, enrolledStudentIds, maxCapacity, status } = req.body;

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
      if (teacherIds && Array.isArray(teacherIds)) {
        program.teacherIds = teacherIds
          .filter((tid: string) => mongoose.Types.ObjectId.isValid(tid))
          .map((tid: string) => new mongoose.Types.ObjectId(tid));
      }
      if (enrolledStudentIds && Array.isArray(enrolledStudentIds)) {
        program.enrolledStudentIds = enrolledStudentIds
          .filter((sid: string) => mongoose.Types.ObjectId.isValid(sid))
          .map((sid: string) => new mongoose.Types.ObjectId(sid));
      }
      if (maxCapacity) program.maxCapacity = Number(maxCapacity);
      if (status) program.status = status;

      await program.save();

      const populated = await TuitionProgram.findById(program._id)
        .populate("teacherIds", "name displayName email teacherCode")
        .populate("enrolledStudentIds", "name displayName email studentCode");

      res.status(200).json({ success: true, message: "Program updated successfully", program: populated });
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
