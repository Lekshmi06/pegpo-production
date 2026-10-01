import { Request, Response } from "express";
import {
  parseUploadedQuestionPaper,
  suggestAnswersForQuestions,
  generateTeacherAiAssessment,
  saveAssessment,
  listTeacherAssessments,
  getAssessmentById,
  deleteAssessment,
  getAssessmentScheduledAttempts,
  publishAssessmentResults,
} from "../services/assessment_service";

/**
 * Handle document upload (PDF, DOCX, DOC, TXT) and structured question extraction
 */
export const uploadAndExtractAssessmentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: "No question paper file uploaded" });
      return;
    }

    const { subject, board, classLevel, teachingContextId } = req.body;
    const teacherProfileId = req.teacherProfile?._id?.toString();

    const parsedResult = await parseUploadedQuestionPaper(req.file, {
      teacherProfileId,
      teachingContextId,
      subject,
      board,
      classLevel,
    });

    res.status(200).json({
      success: true,
      message: "Document parsed and questions extracted successfully",
      data: parsedResult,
    });
  } catch (error) {
    console.error("Assessment upload error:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to extract questions from document",
    });
  }
};

/**
 * Handle AI assessment generation grounded in teaching context, subject, chapter, and question types
 */
export const generateAiAssessmentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      subject,
      board,
      classLevel,
      chapter,
      topic,
      questionsCount,
      questionCount,
      difficulty,
      questionTypes,
      teachingContextId,
    } = req.body;

    if (!subject) {
      res.status(400).json({ success: false, message: "Subject is required" });
      return;
    }

    const teacherProfileId = req.teacherProfile?._id?.toString();

    const resolvedDifficulty = (["Easy", "Medium", "Hard", "Mixed"].includes(difficulty)
      ? difficulty
      : "Medium") as "Easy" | "Medium" | "Hard" | "Mixed";

    const result = await generateTeacherAiAssessment({
      subject,
      board: board || "CBSE",
      classLevel: classLevel || "Class 10",
      chapter,
      topic,
      questionCount: Number(questionCount || questionsCount) || 10,
      difficulty: resolvedDifficulty,
      questionTypes: questionTypes || ["mcq"],
    });

    res.status(200).json({
      success: true,
      message: "Assessment generated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Assessment AI generation error:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to generate assessment with AI",
    });
  }
};

/**
 * Suggest answers, numerical solutions, and explanations for unkeyed questions
 */
export const suggestAnswersController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { questions, subject, classLevel, board } = req.body;

    if (!Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ success: false, message: "Questions array is required" });
      return;
    }

    const result = await suggestAnswersForQuestions(questions, {
      subject: subject || "General Science",
      classLevel: classLevel || "Class 10",
      board: board || "CBSE",
    });

    res.status(200).json({
      success: true,
      message: "Answer suggestions generated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Suggest answers error:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to generate answer suggestions",
    });
  }
};

/**
 * Save / publish assessment with multi-purpose usages and questions
 */
export const saveAssessmentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfileId = req.teacherProfile?._id?.toString();
    const payload = {
      ...req.body,
      teacherProfileId: payloadTeacherId(req.body.teacherProfileId, teacherProfileId),
    };

    const saved = await saveAssessment(payload);

    res.status(201).json({
      success: true,
      message: "Assessment saved successfully",
      data: saved,
    });
  } catch (error) {
    console.error("Save assessment error:", error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to save assessment",
    });
  }
};

function payloadTeacherId(bodyId?: string, middlewareId?: string): string | undefined {
  return middlewareId || bodyId;
}

/**
 * List teacher assessments with optional filters
 */
export const listTeacherAssessmentsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfileId =
      (req.query.teacherProfileId as string) || req.teacherProfile?._id?.toString();
    const teachingContextId = req.query.teachingContextId as string;
    const subject = req.query.subject as string;
    const classLevel = req.query.classLevel as string;
    const sourceFormat = req.query.sourceFormat as string;
    const usage = req.query.usage as "studyMaterial" | "practice" | "scheduledTest" | undefined;
    const search = req.query.search as string;

    const assessments = await listTeacherAssessments({
      teacherProfileId,
      teachingContextId,
      subject,
      classLevel,
      sourceFormat,
      usage,
      search,
    });

    res.status(200).json({
      success: true,
      data: assessments,
    });
  } catch (error) {
    console.error("List assessments error:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to list assessments",
    });
  }
};

/**
 * Get assessment details by ID
 */
export const getAssessmentByIdController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const assessment = await getAssessmentById(id);
    res.status(200).json({
      success: true,
      data: assessment,
    });
  } catch (error) {
    console.error("Get assessment error:", error);
    res.status(404).json({
      success: false,
      message: error instanceof Error ? error.message : "Assessment not found",
    });
  }
};

/**
 * Delete assessment by ID
 */
export const deleteAssessmentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await deleteAssessment(id);
    res.status(200).json({
      success: true,
      message: "Assessment deleted successfully",
    });
  } catch (error) {
    console.error("Delete assessment error:", error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to delete assessment",
    });
  }
};

/**
 * Get scheduled test attempts for this assessment (excluding practice attempts)
 */
export const getAssessmentAttemptsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = await getAssessmentScheduledAttempts(id);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Get attempts error:", error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to fetch assessment attempts",
    });
  }
};

/**
 * Publish or unpublish results for a scheduled assessment
 */
export const publishAssessmentResultsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { publish } = req.body;
    const result = await publishAssessmentResults(id, publish !== false);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Publish results error:", error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to publish assessment results",
    });
  }
};

