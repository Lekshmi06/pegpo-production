import { Request, Response } from "express";
import mongoose from "mongoose";
import TuitionHomework from "../models/TuitionHomework";
import TuitionProgram from "../models/TuitionProgram";
import User from "../models/User";

export const homeworkController = {
  /**
   * GET /api/tuition/programs/:programId/homework
   * Retrieve all homework assigned to a specific tuition program batch
   */
  async getProgramHomework(req: Request, res: Response): Promise<void> {
    try {
      const programId = req.params.programId as string;
      const user = req.user as any;
      const userId = user?._id?.toString();

      if (!programId || !mongoose.Types.ObjectId.isValid(programId)) {
        res.status(400).json({ success: false, message: "Valid Program ID is required." });
        return;
      }

      const homeworkList = await TuitionHomework.find({ programId })
        .sort({ dueDate: 1, createdAt: -1 })
        .populate("assignedBy", "name displayName email teacherCode");

      const userRole = (user?.activeRole || user?.role || user?.userType || "").toLowerCase();
      const isTeacherOrAdmin =
        userRole === "teacher" ||
        userRole === "tuition_provider" ||
        userRole === "admin" ||
        userRole === "super_admin" ||
        Boolean(user?.teacherCode);

      // Sanitize responses based on viewer role
      const sanitized = homeworkList.map((hw: any) => {
        const obj = hw.toObject();
        if (!isTeacherOrAdmin) {
          // Student view: find their own submission
          const mySub = obj.submissions?.find(
            (s: any) => s.studentId?.toString() === userId
          );
          return {
            ...obj,
            submissionsCount: obj.submissions?.length || 0,
            mySubmission: mySub || null,
            submissions: undefined, // Hide other students' submissions
          };
        } else {
          // Teacher view: full submissions with count
          return {
            ...obj,
            submissionsCount: obj.submissions?.length || 0,
          };
        }
      });

      res.status(200).json({
        success: true,
        count: sanitized.length,
        homework: sanitized,
      });
    } catch (err: any) {
      console.error("[getProgramHomework error]:", err);
      res.status(500).json({ success: false, message: err.message || "Failed to load homework." });
    }
  },

  /**
   * POST /api/tuition/programs/:programId/homework
   * Teacher creates new homework assignment for the program batch
   */
  async createProgramHomework(req: Request, res: Response): Promise<void> {
    try {
      const programId = req.params.programId as string;
      const user = req.user as any;
      const { title, description, subject, dueDate, totalPoints, attachments } = req.body;

      if (!programId || !mongoose.Types.ObjectId.isValid(programId)) {
        res.status(400).json({ success: false, message: "Valid Program ID is required." });
        return;
      }

      if (!title || !description || !dueDate) {
        res.status(400).json({
          success: false,
          message: "Title, description, and due date are required.",
        });
        return;
      }

      const program = await TuitionProgram.findById(programId);
      if (!program) {
        res.status(404).json({ success: false, message: "Tuition Program not found." });
        return;
      }

      const homework = await TuitionHomework.create({
        programId: new mongoose.Types.ObjectId(programId),
        assignedBy: user._id,
        teacherName: user.displayName || user.name || "Educator",
        title: title.trim(),
        description: description.trim(),
        subject: subject?.trim() || program.subject,
        dueDate: new Date(dueDate),
        totalPoints: Number(totalPoints) || 100,
        attachments: Array.isArray(attachments) ? attachments : [],
        submissions: [],
      });

      res.status(201).json({
        success: true,
        message: "Homework assignment created successfully.",
        homework,
      });
    } catch (err: any) {
      console.error("[createProgramHomework error]:", err);
      res.status(500).json({ success: false, message: err.message || "Failed to create homework." });
    }
  },

  /**
   * POST /api/tuition/homework/:homeworkId/submit
   * Student submits homework task
   */
  async submitHomework(req: Request, res: Response): Promise<void> {
    try {
      const homeworkId = req.params.homeworkId as string;
      const user = req.user as any;
      const { content, attachmentUrl, attachmentName } = req.body;

      if (!homeworkId || !mongoose.Types.ObjectId.isValid(homeworkId)) {
        res.status(400).json({ success: false, message: "Valid Homework ID is required." });
        return;
      }

      if (!content && !attachmentUrl) {
        res.status(400).json({
          success: false,
          message: "Submission must include written response content or an attachment file.",
        });
        return;
      }

      const homework = await TuitionHomework.findById(homeworkId);
      if (!homework) {
        res.status(404).json({ success: false, message: "Homework assignment not found." });
        return;
      }

      const studentIdStr = user._id.toString();
      const existingIdx = homework.submissions.findIndex(
        (s: any) => s.studentId?.toString() === studentIdStr
      );

      const submissionData = {
        studentId: user._id,
        studentName: user.displayName || user.name || "Student",
        studentCode: user.studentCode || "STU",
        submittedAt: new Date(),
        content: content?.trim() || "",
        attachmentUrl: attachmentUrl?.trim() || "",
        attachmentName: attachmentName?.trim() || "Assignment-Submission",
        status: "submitted" as const,
      };

      if (existingIdx >= 0) {
        // Update existing submission
        homework.submissions[existingIdx] = {
          ...homework.submissions[existingIdx],
          ...submissionData,
        };
      } else {
        // Add new submission
        homework.submissions.push(submissionData);
      }

      await homework.save();

      res.status(200).json({
        success: true,
        message: "Homework submitted successfully.",
        submission: submissionData,
      });
    } catch (err: any) {
      console.error("[submitHomework error]:", err);
      res.status(500).json({ success: false, message: err.message || "Failed to submit homework." });
    }
  },

  /**
   * PATCH /api/tuition/homework/:homeworkId/submissions/:studentId/grade
   * Teacher grades a student's submission
   */
  async gradeHomeworkSubmission(req: Request, res: Response): Promise<void> {
    try {
      const homeworkId = req.params.homeworkId as string;
      const studentId = req.params.studentId as string;
      const user = req.user as any;
      const { grade, feedback, status } = req.body;

      const homework = await TuitionHomework.findById(homeworkId);
      if (!homework) {
        res.status(404).json({ success: false, message: "Homework not found." });
        return;
      }

      const sub = homework.submissions.find(
        (s: any) => s.studentId?.toString() === studentId
      );

      if (!sub) {
        res.status(404).json({ success: false, message: "Student submission not found." });
        return;
      }

      if (grade !== undefined) sub.grade = Number(grade);
      if (feedback !== undefined) sub.feedback = feedback.trim();
      sub.status = status || "graded";
      sub.gradedAt = new Date();
      sub.gradedBy = user._id;

      await homework.save();

      res.status(200).json({
        success: true,
        message: "Submission graded successfully.",
        submission: sub,
      });
    } catch (err: any) {
      console.error("[gradeHomeworkSubmission error]:", err);
      res.status(500).json({ success: false, message: err.message || "Failed to grade submission." });
    }
  },
};

export default homeworkController;

