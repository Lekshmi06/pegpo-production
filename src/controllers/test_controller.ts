import mongoose from "mongoose";
import Test from "../models/Test";
import { Request, Response } from "express";
import {
  listTests,
  getTestById,
  startTestAttempt,
  submitTestAttempt,
  getAttemptAnalysis,
  getStudentAttemptHistory,
} from "../services/test_service";
import { resolveAcademicContext } from "../services/academic_context_service";
import { getRelevantStudentMaterial } from "../services/student_material_service";
import { generateUniversalQuestions } from "../services/ai_question_generator";
import { createTestFromQuestions } from "../services/test_adapter";
import { resolveQuestionCount } from "../config/test_config";

export const getTestsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { board, classLevel, subject, isLocked, search, usage } = req.query;

    const studentProfileId = req.studentProfile?._id
      ? req.studentProfile._id.toString()
      : undefined;

    const tzHeader = req.headers["x-timezone-offset"];
    const clientTimezoneOffset = tzHeader !== undefined ? Number(tzHeader) : undefined;

    const filters = {
      board: typeof board === "string" ? board : undefined,
      classLevel: typeof classLevel === "string" ? classLevel : undefined,
      subject: typeof subject === "string" ? subject : undefined,
      isLocked:
        typeof isLocked === "string" ? isLocked.toLowerCase() === "true" : undefined,
      search: typeof search === "string" ? search : undefined,
      usage: typeof usage === "string" ? (usage as any) : undefined,
      studentProfileId,
      clientTimezoneOffset,
    };

    let tests = await listTests(filters);

    // If an authenticated student requests tests and no tests exist yet for their board/class/profile:
    // Auto-generate an initial curriculum-aligned test on-the-fly and persist it in MongoDB
    if (tests.length === 0 && req.studentProfile && req.user) {
      try {
        const context = resolveAcademicContext(req.studentProfile, req.user);
        const materialResult = await getRelevantStudentMaterial({
          studentProfileId: context.studentProfileId,
          subject: context.selectedSubject,
          textbookFileName: context.textbookFileName,
          syllabusFileName: context.syllabusFileName,
        });

        const questions = await generateUniversalQuestions({
          context,
          materialText: materialResult.hasMaterial ? materialResult.textSample : undefined,
          materialName: materialResult.originalName,
          questionCount: 5,
          difficulty: "mixed",
          topic: `${context.selectedSubject} Curriculum Assessment`,
          mode: "test",
        });

        if (questions && questions.length > 0) {
          await createTestFromQuestions({
            context,
            questions,
            materialInfo: materialResult.hasMaterial
              ? {
                  sourceId: materialResult.sourceId,
                  originalName: materialResult.originalName,
                }
              : undefined,
            topic: "Curriculum Assessment",
          });

          // Reload fresh tests matching the student's filters
          tests = await listTests(filters);
        }
      } catch (autoGenErr) {
        console.warn("[getTestsController] Auto-generation error:", autoGenErr);
      }
    }

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
    const attemptMode = (req.body?.attemptMode || req.query?.attemptMode) as "practice" | "scheduled_test" | undefined;
    const tzHeader = req.headers["x-timezone-offset"];
    const clientTimezoneOffset = tzHeader !== undefined ? Number(tzHeader) : undefined;

    const attempt = await startTestAttempt(testId, studentProfileId, userId, attemptMode, clientTimezoneOffset);

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

    const { attemptId, answers, statusByQuestion, timeSpentSeconds, attemptMode } = req.body;

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
      attemptMode,
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

export const generateTestController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.studentProfile || !req.user) {
      res.status(401).json({
        success: false,
        message: "Authenticated student profile required to generate test",
      });
      return;
    }

    const { subject, questionCount, difficulty, topic } = req.body || {};

    // 1. Resolve student's verified academic context (server-side, never trusting client for board/class)
    const context = resolveAcademicContext(req.studentProfile, req.user, subject);
    if (subject && typeof subject === "string" && subject.trim().length > 0) {
      context.selectedSubject = subject.trim();
    }

    // 2. Retrieve student's own uploaded learning material (enforces student isolation)
    const materialResult = await getRelevantStudentMaterial({
      studentProfileId: context.studentProfileId,
      subject: context.selectedSubject,
      textbookFileName: context.textbookFileName,
      syllabusFileName: context.syllabusFileName,
      topic: typeof topic === "string" ? topic.trim() : undefined,
    });

    // 3. Generate questions using AIQuestionGenerator grounded in student material
    const targetCount = resolveQuestionCount(
      typeof questionCount === "number" ? questionCount : undefined
    );

    const targetDifficulty =
      difficulty === "easy" || difficulty === "medium" || difficulty === "hard"
        ? difficulty
        : "mixed";

    const questions = await generateUniversalQuestions({
      context,
      materialText: materialResult.hasMaterial ? materialResult.textSample : undefined,
      materialName: materialResult.originalName,
      questionCount: targetCount,
      difficulty: targetDifficulty,
      topic: typeof topic === "string" ? topic.trim() : undefined,
      mode: "test",
    });

    if (!questions || questions.length === 0) {
      res.status(422).json({
        success: false,
        message: topic
          ? `Unable to generate verified practice questions specifically for topic "${topic}". Please try another topic or check your study material.`
          : "Failed to generate questions for the requested subject.",
      });
      return;
    }

    // 4. Adapt questions into persistent Test and Question documents in MongoDB
    const testDoc = await createTestFromQuestions({
      context,
      questions,
      materialInfo: materialResult.hasMaterial
        ? {
            sourceId: materialResult.sourceId,
            originalName: materialResult.originalName,
          }
        : undefined,
      topic: typeof topic === "string" ? topic.trim() : undefined,
    });

    res.status(201).json({
      success: true,
      message: "AI Test generated successfully from student learning material",
      data: {
        testId: testDoc._id,
        title: testDoc.title,
        subject: testDoc.subject,
        board: testDoc.board,
        classLevel: testDoc.classLevel,
        durationMinutes: testDoc.durationMinutes,
        totalMarks: testDoc.totalMarks,
        questionCount: testDoc.questions.length,
        sourceType: testDoc.sourceType,
        materialUsed: materialResult.hasMaterial
          ? materialResult.originalName
          : "Standard Curriculum Knowledge",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate test";
    res.status(500).json({
      success: false,
      message,
    });
  }
};

/**
 * Controller for Practice module (ExerciseView).
 * Returns curriculum-grounded exercise problems with instant solutions, hints, and stepByStepSolutions.
 */
export const getPracticeQuestionsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.studentProfile || !req.user) {
      res.status(401).json({
        success: false,
        message: "Authenticated student profile required",
      });
      return;
    }

    const { subject, topic, count, difficulty } = req.query;
    const requestedSubject =
      typeof subject === "string" && subject.toLowerCase() !== "all"
        ? subject.trim()
        : undefined;
    const requestedTopic =
      typeof topic === "string" && topic.trim().length > 0
        ? topic.trim()
        : undefined;

    const context = resolveAcademicContext(
      req.studentProfile,
      req.user,
      requestedSubject
    );

    const materialResult = await getRelevantStudentMaterial({
      studentProfileId: context.studentProfileId,
      subject: context.selectedSubject,
      textbookFileName: context.textbookFileName,
      syllabusFileName: context.syllabusFileName,
      topic: requestedTopic,
    });

    const targetCount = resolveQuestionCount(
      typeof count === "string" ? parseInt(count, 10) : 5
    );

    const questions = await generateUniversalQuestions({
      context,
      materialText: materialResult.hasMaterial ? materialResult.textSample : undefined,
      materialName: materialResult.originalName,
      questionCount: targetCount,
      difficulty: (difficulty as any) || "mixed",
      topic: requestedTopic || `${context.selectedSubject} Practice`,
      mode: "practice",
    });

    const problems = questions.map((q, idx) => ({
      id: `practice-${context.studentProfileId.slice(-4)}-${idx + 1}`,
      subject: context.selectedSubject,
      chapter: q.chapter || materialResult.originalName || `${context.selectedSubject} Curriculum`,
      topic: q.topic || requestedTopic || "Curriculum Practice",
      text: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      difficulty: q.difficulty,
      hint: q.hint,
      explanation: q.explanation,
      stepByStepSolution: q.stepByStepSolution || [
        `Step 1: Understand the core principles of ${q.topic || context.selectedSubject}.`,
        `Step 2: Identify why Option ${q.correctAnswer} correctly answers the problem.`,
        `Step 3: ${q.explanation}`,
      ],
    }));

    res.status(200).json({
      success: true,
      count: problems.length,
      data: problems,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load practice questions";
    res.status(500).json({
      success: false,
      message,
    });
  }
};

/**
 * Controller for Quiz module (QuizHub).
 * Returns curriculum-grounded quick quizzes with chapters from the student's syllabus.
 */
export const getQuizzesController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.studentProfile || !req.user) {
      res.status(401).json({
        success: false,
        message: "Authenticated student profile required",
      });
      return;
    }

    const { subject, topic } = req.query;
    const requestedSubject =
      typeof subject === "string" && subject.toLowerCase() !== "all"
        ? subject.trim()
        : undefined;
    const requestedTopic =
      typeof topic === "string" && topic.trim().length > 0
        ? topic.trim()
        : undefined;

    const context = resolveAcademicContext(
      req.studentProfile,
      req.user,
      requestedSubject
    );

    const materialResult = await getRelevantStudentMaterial({
      studentProfileId: context.studentProfileId,
      subject: context.selectedSubject,
      textbookFileName: context.textbookFileName,
      syllabusFileName: context.syllabusFileName,
      topic: requestedTopic,
    });

    // Provide 2-3 drills based on curriculum chapters
    const isClass7 = /Class\s*7\b/i.test(context.classLevel);
    const curriculumTopics = requestedTopic
      ? [requestedTopic]
      : isClass7
      ? [
          "Wonders of Visible Light",
          "Respiration in Organisms",
          "Heat and Temperature",
        ]
      : [
          `${context.selectedSubject} Core Drill 1`,
          `${context.selectedSubject} Core Drill 2`,
        ];

    const quizzes = [];

    for (let i = 0; i < curriculumTopics.length; i++) {
      const drillTopic = curriculumTopics[i];

      // 1. First look for existing persisted Quiz for this student and topic
      let testDoc: any = await Test.findOne({
        studentProfileId: new mongoose.Types.ObjectId(context.studentProfileId),
        category: "Quiz",
        topic: drillTopic,
      }).populate("questions");

      // 2. If not found by exact profile, check if there is an existing quiz for this board, class, subject, topic
      if (!testDoc) {
        testDoc = await Test.findOne({
          board: context.board,
          classLevel: context.classLevel,
          subject: context.selectedSubject,
          category: "Quiz",
          topic: drillTopic,
        }).populate("questions");
      }

      // 3. If still not found or questions array is empty, generate questions via AI and persist
      if (!testDoc || !testDoc.questions || testDoc.questions.length === 0) {
        const questions = await generateUniversalQuestions({
          context,
          materialText: materialResult.hasMaterial ? materialResult.textSample : undefined,
          materialName: materialResult.originalName,
          questionCount: 5,
          difficulty: "mixed",
          topic: drillTopic,
          mode: "quiz",
        });

        if (questions.length > 0) {
          const createdDoc = await createTestFromQuestions({
            context,
            questions,
            title: `${drillTopic} Drill`,
            topic: drillTopic,
            durationMinutes: 5,
            category: "Quiz",
            sourceType: "curriculum",
            materialInfo: materialResult.hasMaterial
              ? {
                  originalName: materialResult.originalName,
                  sourceId: materialResult.sourceId,
                }
              : undefined,
          });
          testDoc = await Test.findById(createdDoc._id).populate("questions");
        }
      }

      if (testDoc && testDoc.questions && testDoc.questions.length > 0) {
        quizzes.push({
          id: testDoc._id.toString(),
          title: testDoc.title,
          subject: testDoc.subject,
          chapter: testDoc.topic || drillTopic,
          durationMinutes: testDoc.durationMinutes || 5,
          isLocked: testDoc.isLocked || false,
          questions: (testDoc.questions as any[]).map((q: any, qIdx: number) => ({
            id: q._id ? q._id.toString() : `q-${i + 1}-${qIdx + 1}`,
            text: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
          })),
        });
      }
    }

    res.status(200).json({
      success: true,
      count: quizzes.length,
      data: quizzes,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load quizzes";
    res.status(500).json({
      success: false,
      message,
    });
  }
};

/**
 * Controller to generate an on-demand quick quiz on any requested curriculum topic.
 * Persists the generated quiz and questions to MongoDB so it has a persistent unique ID.
 */
export const generateQuizController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.studentProfile || !req.user) {
      res.status(401).json({
        success: false,
        message: "Authenticated student profile required",
      });
      return;
    }

    const { subject, topic, questionCount } = req.body || {};
    const context = resolveAcademicContext(
      req.studentProfile,
      req.user,
      subject
    );

    const materialResult = await getRelevantStudentMaterial({
      studentProfileId: context.studentProfileId,
      subject: context.selectedSubject,
      textbookFileName: context.textbookFileName,
      syllabusFileName: context.syllabusFileName,
      topic: topic?.trim(),
    });

    const targetCount = resolveQuestionCount(
      typeof questionCount === "number" ? questionCount : 5
    );

    const targetTopic = topic?.trim() || `${context.selectedSubject} Drill`;

    const questions = await generateUniversalQuestions({
      context,
      materialText: materialResult.hasMaterial ? materialResult.textSample : undefined,
      materialName: materialResult.originalName,
      questionCount: targetCount,
      difficulty: "mixed",
      topic: targetTopic,
      mode: "quiz",
    });

    const testDoc = await createTestFromQuestions({
      context,
      questions,
      title: `${targetTopic} Drill`,
      topic: targetTopic,
      durationMinutes: 5,
      category: "Quiz",
      sourceType: "ai_generated",
      materialInfo: materialResult.hasMaterial
        ? {
            originalName: materialResult.originalName,
            sourceId: materialResult.sourceId,
          }
        : undefined,
    });

    const populatedDoc = await Test.findById(testDoc._id).populate("questions");

    const quizItem = {
      id: populatedDoc ? populatedDoc._id.toString() : testDoc._id.toString(),
      title: populatedDoc?.title || `${targetTopic} Drill`,
      subject: populatedDoc?.subject || context.selectedSubject,
      chapter: populatedDoc?.topic || targetTopic,
      durationMinutes: populatedDoc?.durationMinutes || 5,
      isLocked: false,
      questions: ((populatedDoc?.questions as any[]) || []).map((q: any, qIdx: number) => ({
        id: q._id ? q._id.toString() : `q-gen-${qIdx + 1}`,
        text: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      })),
    };

    res.status(201).json({
      success: true,
      data: quizItem,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate quiz";
    res.status(500).json({
      success: false,
      message,
    });
  }
};

