import { Request, Response } from "express";
import mongoose from "mongoose";
import TuitionProgramAssessment, {
  IMCQQuestion,
  IMCQStudentAnswer,
  IAssessmentSubmission,
} from "../models/TuitionProgramAssessment";
import TuitionProgram from "../models/TuitionProgram";
import User from "../models/User";

function getAuthUserId(req: Request): string | undefined {
  return (req.user as any)?._id?.toString() || (req.user as any)?.userId?.toString();
}

function isTeacherOrAdminUser(user: any): boolean {
  if (!user) return false;
  const role = (user.activeRole || user.role || user.userType || "").toLowerCase();
  return (
    role === "teacher" ||
    role === "tutor" ||
    role === "tuition_provider" ||
    role === "provider" ||
    role === "institution" ||
    role === "company" ||
    role === "admin" ||
    role === "super_admin" ||
    Boolean(user.teacherCode)
  );
}

export const tuitionAssessmentController = {
  /**
   * POST /api/tuition/programs/:programId/assessments
   * Teacher creates either an MCQ test or an Assignment/Homework
   */
  async createProgramAssessment(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      const programId = req.params.programId as string;
      const user = req.user as any;

      if (!userId || !user) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
      }

      if (!programId || !mongoose.Types.ObjectId.isValid(programId)) {
        res.status(400).json({ success: false, message: "Valid Program ID is required." });
        return;
      }

      const program = await TuitionProgram.findById(programId);
      if (!program) {
        res.status(404).json({ success: false, message: "Tuition Program not found." });
        return;
      }

      const {
        type = "mcq_test",
        title,
        subject,
        topic,
        instructions,
        durationMinutes = 30,
        dueDate,
        referenceFileUrl,
        referenceFileName,
        questions = [],
        totalMarks = 100,
      } = req.body;

      if (!title || !title.trim()) {
        res.status(400).json({ success: false, message: "Assessment title is required." });
        return;
      }

      if (type !== "mcq_test" && type !== "assignment") {
        res.status(400).json({ success: false, message: "Type must be 'mcq_test' or 'assignment'." });
        return;
      }

      let parsedQuestions: IMCQQuestion[] = [];
      let calculatedTotalMarks = totalMarks;

      if (type === "mcq_test") {
        if (!Array.isArray(questions) || questions.length === 0) {
          res.status(400).json({
            success: false,
            message: "MCQ Test requires at least one question.",
          });
          return;
        }

        let sumMarks = 0;
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (!q.questionText || !q.questionText.trim()) {
            res.status(400).json({
              success: false,
              message: `Question #${i + 1} is missing question text.`,
            });
            return;
          }
          if (!Array.isArray(q.options) || q.options.length < 2) {
            res.status(400).json({
              success: false,
              message: `Question #${i + 1} must have at least 2 options.`,
            });
            return;
          }
          const correctIdx = typeof q.correctOptionIndex === "number" ? q.correctOptionIndex : 0;
          if (correctIdx < 0 || correctIdx >= q.options.length) {
            res.status(400).json({
              success: false,
              message: `Question #${i + 1} correct option index (${correctIdx}) is out of bounds.`,
            });
            return;
          }
          const qMarks = Number(q.marks) > 0 ? Number(q.marks) : 1;
          sumMarks += qMarks;

          parsedQuestions.push({
            questionText: q.questionText.trim(),
            options: q.options.map((opt: any) => String(opt || "").trim()),
            correctOptionIndex: correctIdx,
            marks: qMarks,
            explanation: q.explanation?.trim(),
          });
        }
        calculatedTotalMarks = sumMarks > 0 ? sumMarks : 100;
      }

      const assessment = await TuitionProgramAssessment.create({
        programId: new mongoose.Types.ObjectId(programId),
        assignedBy: new mongoose.Types.ObjectId(userId),
        assignedByName: user.name || user.displayName || "Teacher",
        type,
        title: title.trim(),
        subject: subject?.trim() || program.subject || "General",
        topic: topic?.trim() || "",
        instructions: instructions?.trim() || "",
        durationMinutes: Number(durationMinutes) || 30,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        referenceFileUrl: referenceFileUrl?.trim(),
        referenceFileName: referenceFileName?.trim(),
        totalMarks: calculatedTotalMarks,
        questions: parsedQuestions,
        submissions: [],
        status: "active",
      });

      res.status(201).json({
        success: true,
        message: type === "mcq_test" ? "MCQ Test created successfully." : "Assignment posted successfully.",
        assessment,
      });
    } catch (err: any) {
      console.error("[TuitionAssessmentController] createProgramAssessment error:", err);
      res.status(500).json({ success: false, message: err?.message || "Failed to create assessment." });
    }
  },

  /**
   * GET /api/tuition/programs/:programId/assessments
   * Lists all MCQ tests and assignments for the program
   * Masking correctOptionIndex for students who haven't submitted
   */
  async getProgramAssessments(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      const programId = req.params.programId as string;
      const user = req.user as any;

      if (!programId || !mongoose.Types.ObjectId.isValid(programId)) {
        res.status(400).json({ success: false, message: "Valid Program ID is required." });
        return;
      }

      const isTeacher = isTeacherOrAdminUser(user);

      const assessments = await TuitionProgramAssessment.find({ programId })
        .sort({ createdAt: -1 })
        .populate("assignedBy", "name email teacherCode avatarUrl");

      const sanitized = assessments.map((doc) => {
        const obj = doc.toObject();
        const mySub = obj.submissions?.find(
          (s: any) => s.studentId?.toString() === userId
        );

        if (isTeacher) {
          // Teacher sees everything including all student submissions
          return {
            ...obj,
            submissionsCount: obj.submissions?.length || 0,
            hasSubmitted: false,
            mySubmission: null,
          };
        }

        // Student View:
        const hasSubmitted = Boolean(mySub);

        // If it's an MCQ test and the student HAS NOT submitted yet:
        // Mask correctOptionIndex and explanation
        let safeQuestions = obj.questions;
        if (obj.type === "mcq_test" && !hasSubmitted && Array.isArray(obj.questions)) {
          safeQuestions = obj.questions.map((q: any) => ({
            questionText: q.questionText,
            options: q.options,
            marks: q.marks,
            // Omit correctOptionIndex and explanation
          }));
        }

        return {
          ...obj,
          questions: safeQuestions,
          submissionsCount: obj.submissions?.length || 0,
          hasSubmitted,
          mySubmission: mySub || null,
          submissions: undefined, // Hide other students' submissions
        };
      });

      res.status(200).json({
        success: true,
        count: sanitized.length,
        assessments: sanitized,
      });
    } catch (err: any) {
      console.error("[TuitionAssessmentController] getProgramAssessments error:", err);
      res.status(500).json({ success: false, message: err?.message || "Failed to load assessments." });
    }
  },

  /**
   * POST /api/tuition/assessments/:assessmentId/submit-mcq
   * Student submits MCQ answers, auto-grades against correctOptionIndex
   */
  async submitMcqTest(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      const user = req.user as any;
      const assessmentId = req.params.assessmentId as string;

      if (!userId || !user) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
      }

      if (!assessmentId || !mongoose.Types.ObjectId.isValid(assessmentId)) {
        res.status(400).json({ success: false, message: "Valid Assessment ID is required." });
        return;
      }

      const assessment = await TuitionProgramAssessment.findById(assessmentId);
      if (!assessment) {
        res.status(404).json({ success: false, message: "Assessment not found." });
        return;
      }

      if (assessment.type !== "mcq_test") {
        res.status(400).json({ success: false, message: "This assessment is not an MCQ test." });
        return;
      }

      const { answers = [] } = req.body;
      if (!Array.isArray(answers)) {
        res.status(400).json({ success: false, message: "Answers must be an array." });
        return;
      }

      // Check if student already submitted
      const existingIdx = assessment.submissions.findIndex(
        (s: any) => s.studentId?.toString() === userId
      );

      // Auto-grade against correctOptionIndex
      let totalEarnedScore = 0;
      let totalPossibleMarks = 0;
      const evaluatedAnswers: IMCQStudentAnswer[] = [];

      assessment.questions.forEach((q: any, idx: number) => {
        const qMarks = q.marks || 1;
        totalPossibleMarks += qMarks;

        const givenAnswer = answers.find(
          (a: any) => Number(a.questionIndex) === idx
        );
        const selectedOptionIndex =
          givenAnswer && typeof givenAnswer.selectedOptionIndex === "number"
            ? givenAnswer.selectedOptionIndex
            : -1;

        const isCorrect = selectedOptionIndex === q.correctOptionIndex;
        const marksAwarded = isCorrect ? qMarks : 0;
        totalEarnedScore += marksAwarded;

        evaluatedAnswers.push({
          questionIndex: idx,
          questionText: q.questionText,
          selectedOptionIndex,
          isCorrect,
          marksAwarded,
        });
      });

      const percentage =
        totalPossibleMarks > 0
          ? Math.round((totalEarnedScore / totalPossibleMarks) * 100)
          : 0;

      const submission: IAssessmentSubmission = {
        studentId: new mongoose.Types.ObjectId(userId),
        studentName: user.name || user.displayName || "Student",
        studentCode: user.studentCode || "",
        studentEmail: user.email || "",
        submittedAt: new Date(),
        answers: evaluatedAnswers,
        score: totalEarnedScore,
        totalMarks: totalPossibleMarks,
        percentage,
      };

      if (existingIdx >= 0) {
        assessment.submissions[existingIdx] = submission;
      } else {
        assessment.submissions.push(submission);
      }

      await assessment.save();

      res.status(200).json({
        success: true,
        message: `MCQ Test submitted! Your score: ${totalEarnedScore}/${totalPossibleMarks} (${percentage}%).`,
        score: totalEarnedScore,
        totalMarks: totalPossibleMarks,
        percentage,
        answers: evaluatedAnswers,
        submission,
      });
    } catch (err: any) {
      console.error("[TuitionAssessmentController] submitMcqTest error:", err);
      res.status(500).json({ success: false, message: err?.message || "Failed to submit MCQ test." });
    }
  },

  /**
   * POST /api/tuition/assessments/:assessmentId/submit-pdf
   * Student uploads a PDF file for homework / assignment submission
   */
  async submitAssignmentPdf(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      const user = req.user as any;
      const assessmentId = req.params.assessmentId as string;

      if (!userId || !user) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
      }

      if (!assessmentId || !mongoose.Types.ObjectId.isValid(assessmentId)) {
        res.status(400).json({ success: false, message: "Valid Assessment ID is required." });
        return;
      }

      const assessment = await TuitionProgramAssessment.findById(assessmentId);
      if (!assessment) {
        res.status(404).json({ success: false, message: "Assessment not found." });
        return;
      }

      if (assessment.type !== "assignment") {
        res.status(400).json({ success: false, message: "This assessment is not a file/homework assignment." });
        return;
      }

      if (!req.file) {
        res.status(400).json({ success: false, message: "No PDF file was uploaded." });
        return;
      }

      const fileUrl = `/uploads/tuition_submissions/${assessmentId}/${req.file.filename}`;
      const fileName = req.file.originalname || "submission.pdf";
      const fileSize = req.file.size;
      const notes = req.body.notes?.trim() || "";

      const submission: IAssessmentSubmission = {
        studentId: new mongoose.Types.ObjectId(userId),
        studentName: user.name || user.displayName || "Student",
        studentCode: user.studentCode || "",
        studentEmail: user.email || "",
        submittedAt: new Date(),
        fileUrl,
        fileName,
        fileSize,
        notes,
      };

      const existingIdx = assessment.submissions.findIndex(
        (s: any) => s.studentId?.toString() === userId
      );

      if (existingIdx >= 0) {
        assessment.submissions[existingIdx] = submission;
      } else {
        assessment.submissions.push(submission);
      }

      await assessment.save();

      res.status(200).json({
        success: true,
        message: "Assignment PDF submitted successfully.",
        submission,
        fileUrl,
        fileName,
      });
    } catch (err: any) {
      console.error("[TuitionAssessmentController] submitAssignmentPdf error:", err);
      res.status(500).json({ success: false, message: err?.message || "Failed to submit assignment PDF." });
    }
  },

  /**
   * GET /api/tuition/assessments/:assessmentId/submissions
   * Teacher views all student MCQ scores and opens/downloads homework PDFs
   */
  async getAssessmentSubmissions(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as any;
      const assessmentId = req.params.assessmentId as string;

      if (!isTeacherOrAdminUser(user)) {
        res.status(403).json({ success: false, message: "Only teachers or administrators can view all submissions." });
        return;
      }

      if (!assessmentId || !mongoose.Types.ObjectId.isValid(assessmentId)) {
        res.status(400).json({ success: false, message: "Valid Assessment ID is required." });
        return;
      }

      const assessment = await TuitionProgramAssessment.findById(assessmentId)
        .populate("submissions.studentId", "name email studentCode avatarUrl");

      if (!assessment) {
        res.status(404).json({ success: false, message: "Assessment not found." });
        return;
      }

      res.status(200).json({
        success: true,
        assessmentTitle: assessment.title,
        type: assessment.type,
        totalMarks: assessment.totalMarks,
        submissionsCount: assessment.submissions.length,
        submissions: assessment.submissions,
      });
    } catch (err: any) {
      console.error("[TuitionAssessmentController] getAssessmentSubmissions error:", err);
      res.status(500).json({ success: false, message: err?.message || "Failed to fetch submissions." });
    }
  },

  /**
   * POST /api/tuition/upload-media
   * Dedicated file & voice note upload endpoint for Chat & Study Material
   * Accepts PDFs, documents, images, and audio recordings (.webm, .mp3, .wav, .ogg, .m4a)
   */
  async uploadTuitionMedia(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: "No media file uploaded." });
        return;
      }

      const fileUrl = `/uploads/tuition_media/${req.file.filename}`;
      const fileName = req.file.originalname || "attachment";
      const fileType = req.file.mimetype || "application/octet-stream";
      const size = req.file.size || 0;

      res.status(200).json({
        success: true,
        url: fileUrl,
        fileUrl,
        fileName,
        fileType,
        size,
      });
    } catch (err: any) {
      console.error("[TuitionAssessmentController] uploadTuitionMedia error:", err);
      res.status(500).json({ success: false, message: err?.message || "Failed to upload tuition media." });
    }
  },
};

export default tuitionAssessmentController;
