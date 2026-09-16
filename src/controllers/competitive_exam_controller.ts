import { Request, Response } from "express";
import {
  listAvailableExams,
  getExamDetails,
  listPYQs,
  createMockTestFromQuestions,
} from "../services/competitive_exam_service";

/**
 * GET /api/competitive/exams
 * List available competitive exams with optional category filter.
 */
export const listExamsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const exams = await listAvailableExams(category);

    res.status(200).json({
      success: true,
      message: "Exams retrieved successfully",
      data: exams,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve exams";
    res.status(500).json({
      success: false,
      message,
    });
  }
};

/**
 * GET /api/competitive/exams/:examCode
 * Retrieve full pattern, section breakdown, and marking scheme for an exam.
 */
export const getExamDetailsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    let examCode = Array.isArray(req.params.examCode)
      ? req.params.examCode[0]
      : req.params.examCode;

    // Requirement 9: Derive target exam from student profile if not specified in request
    if (!examCode && req.studentProfile?.competitiveExamDetails?.targetExam) {
      examCode = req.studentProfile.competitiveExamDetails.targetExam;
    }

    if (!examCode) {
      res.status(400).json({
        success: false,
        message: "Exam code is required",
      });
      return;
    }

    const exam = await getExamDetails(examCode);

    res.status(200).json({
      success: true,
      message: `Pattern and details retrieved for ${exam.name}`,
      data: exam,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve exam details";
    const statusCode = message.includes("not found") ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

/**
 * GET /api/competitive/pyqs
 * Retrieve authentic Previous-Year Questions with filters.
 * STRICT ISOLATION: Never returns AI-generated questions as authentic PYQs.
 */
export const listPYQsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    let examCode = typeof req.query.examCode === "string" ? req.query.examCode : undefined;

    // Derive target exam from authenticated profile if student is on competitive exam path
    if (!examCode && req.studentProfile?.competitiveExamDetails?.targetExam) {
      examCode = req.studentProfile.competitiveExamDetails.targetExam;
    }

    const year = req.query.year ? Number(req.query.year) : undefined;
    const subject = typeof req.query.subject === "string" ? req.query.subject : undefined;
    const topic = typeof req.query.topic === "string" ? req.query.topic : undefined;
    const chapter = typeof req.query.chapter === "string" ? req.query.chapter : undefined;
    const questionType = typeof req.query.questionType === "string" ? req.query.questionType : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 15;

    const result = await listPYQs({
      examCode,
      year,
      subject,
      topic,
      chapter,
      questionType,
      search,
      page,
      limit,
    });

    res.status(200).json({
      success: true,
      message: "Authentic previous-year questions retrieved successfully",
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve PYQs";
    res.status(500).json({
      success: false,
      message,
    });
  }
};

/**
 * POST /api/competitive/mocks/generate
 * Generate a full pattern mock exam tied to the authenticated student profile.
 */
export const createMockExamController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.studentProfile || !req.user) {
      res.status(401).json({
        success: false,
        message: "Authenticated student profile required to generate mock exam",
      });
      return;
    }

    const studentProfileId = req.studentProfile._id.toString();
    const userId = req.user._id.toString();

    let { examCode, year, title } = req.body || {};

    // Derive target exam from student profile if not provided in payload
    if (!examCode && req.studentProfile.competitiveExamDetails?.targetExam) {
      examCode = req.studentProfile.competitiveExamDetails.targetExam;
    }

    if (!examCode || typeof examCode !== "string") {
      res.status(400).json({
        success: false,
        message: "examCode is required to generate mock exam",
      });
      return;
    }

    const mockTest = await createMockTestFromQuestions({
      studentProfileId,
      userId,
      examCode,
      year: typeof year === "number" ? year : undefined,
      title: typeof title === "string" ? title.trim() : undefined,
    });

    res.status(201).json({
      success: true,
      message: `Mock test for ${mockTest.examName} generated successfully`,
      data: mockTest,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create mock exam";
    const statusCode = message.includes("not exist") ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};
