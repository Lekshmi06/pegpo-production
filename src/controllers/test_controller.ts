import { Request, Response } from "express";
import {
  listTests,
  getTestById,
  startTestAttempt,
  submitTestAttempt,
  getAttemptAnalysis,
  getStudentAttemptHistory,
} from "../services/test_service";

export const getTestsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { board, classLevel, subject, isLocked, search } = req.query;

    const filters = {
      board: typeof board === "string" ? board : undefined,
      classLevel: typeof classLevel === "string" ? classLevel : undefined,
      subject: typeof subject === "string" ? subject : undefined,
      isLocked:
        typeof isLocked === "string" ? isLocked.toLowerCase() === "true" : undefined,
      search: typeof search === "string" ? search : undefined,
    };

    const tests = await listTests(filters);

    res.status(200).json({
      success: true,
      count: tests.length,
      data: tests,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch tests";
    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const getTestByIdController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const testId = Array.isArray(req.params.testId)
      ? req.params.testId[0]
      : req.params.testId;

    const mode = req.query.mode as string;
    // When mode is 'take' or 'solve', mask answers from client
    const maskAnswers = mode === "take" || mode === "solve";

    const test = await getTestById(testId, maskAnswers);

    res.status(200).json({
      success: true,
      data: test,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch test";
    const statusCode = message === "Invalid test ID" ? 400 : message === "Test not found" ? 404 : 500;

    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const startTestAttemptController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const testId = Array.isArray(req.params.testId)
      ? req.params.testId[0]
      : req.params.testId;

    if (!req.studentProfile || !req.user) {
      res.status(401).json({
        success: false,
        message: "Authenticated student profile required to start test",
      });
      return;
    }

    const studentProfileId = req.studentProfile._id.toString();
    const userId = req.user._id.toString();

    const attempt = await startTestAttempt(testId, studentProfileId, userId);

    res.status(200).json({
      success: true,
      message: "Test session initialized",
      data: attempt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start test attempt";
    const statusCode =
      message.includes("locked") ? 403 : message === "Test not found" ? 404 : 400;

    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const submitTestAttemptController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const testId = Array.isArray(req.params.testId)
      ? req.params.testId[0]
      : req.params.testId;

    if (!req.studentProfile || !req.user) {
      res.status(401).json({
        success: false,
        message: "Authenticated student profile required to submit test",
      });
      return;
    }

    const studentProfileId = req.studentProfile._id.toString();
    const userId = req.user._id.toString();

    const { attemptId, answers, statusByQuestion, timeSpentSeconds } = req.body;

    if (!answers || typeof answers !== "object") {
      res.status(400).json({
        success: false,
        message: "Answers payload is required and must be an object",
      });
      return;
    }

    const result = await submitTestAttempt(testId, studentProfileId, userId, {
      attemptId,
      answers,
      statusByQuestion,
      timeSpentSeconds: Number(timeSpentSeconds) || 0,
    });

    res.status(200).json({
      success: true,
      message: "Test submitted and evaluated successfully",
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to submit test attempt";
    const statusCode = message === "Test not found" ? 404 : 400;

    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const getAttemptAnalysisController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const attemptId = Array.isArray(req.params.attemptId)
      ? req.params.attemptId[0]
      : req.params.attemptId;

    if (!req.studentProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const studentProfileId = req.studentProfile._id.toString();
    const analysis = await getAttemptAnalysis(attemptId, studentProfileId);

    res.status(200).json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch attempt analysis";
    const statusCode =
      message.includes("Unauthorized") ? 403 : message === "Test attempt not found" ? 404 : 400;

    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const getStudentHistoryController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.studentProfile) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const studentProfileId = req.studentProfile._id.toString();
    const testId = req.query.testId as string | undefined;

    const history = await getStudentAttemptHistory(studentProfileId, testId);

    res.status(200).json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch attempt history";
    res.status(500).json({
      success: false,
      message,
    });
  }
};
