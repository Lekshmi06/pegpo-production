import mongoose from "mongoose";
import Test, { ITest } from "../models/Test";
import Question, { IQuestion } from "../models/Question";
import TestAttempt, { ITestAttempt, QuestionAttemptStatus } from "../models/TestAttempt";

export interface TestFilterOptions {
  board?: string;
  classLevel?: string;
  subject?: string;
  isLocked?: boolean;
  search?: string;
}

export interface SubmitTestInput {
  attemptId?: string;
  answers: Record<string, string>; // questionId or questionIndex -> selectedOption ('A', 'B', etc.)
  statusByQuestion?: Record<string, QuestionAttemptStatus>;
  timeSpentSeconds: number;
}

/**
 * List all available tests with syllabus and lock status filters.
 */
export const listTests = async (filters: TestFilterOptions = {}) => {
  const query: Record<string, any> = { status: "published" };

  if (filters.board) {
    query.board = new RegExp(`^${filters.board.trim()}$`, "i");
  }

  if (filters.classLevel) {
    query.classLevel = new RegExp(`^${filters.classLevel.trim()}$`, "i");
  }

  if (filters.subject) {
    query.subject = new RegExp(`^${filters.subject.trim()}$`, "i");
  }

  if (typeof filters.isLocked === "boolean") {
    query.isLocked = filters.isLocked;
  }

  if (filters.search) {
    query.$or = [
      { title: new RegExp(filters.search.trim(), "i") },
      { description: new RegExp(filters.search.trim(), "i") },
      { subject: new RegExp(filters.search.trim(), "i") },
    ];
  }

  const tests = await Test.find(query)
    .populate({
      path: "questions",
      select: "order marks subject",
    })
    .sort({ isLocked: 1, createdAt: -1 })
    .lean();

  return tests.map((t) => ({
    _id: t._id,
    id: t._id.toString(),
    title: t.title,
    description: t.description,
    subject: t.subject,
    board: t.board,
    classLevel: t.classLevel,
    durationMinutes: t.durationMinutes,
    totalQuestions: t.questions ? t.questions.length : 0,
    totalMarks: t.totalMarks,
    isLocked: t.isLocked,
    category: t.category,
    status: t.status,
    createdAt: t.createdAt,
  }));
};

/**
 * Get a specific test and its questions.
 * @param testId Test document ID
 * @param maskAnswers If true, removes correctAnswer and explanation to prevent student inspection before submit
 */
export const getTestById = async (testId: string, maskAnswers = false) => {
  if (!mongoose.Types.ObjectId.isValid(testId)) {
    throw new Error("Invalid test ID");
  }

  const test = await Test.findById(testId).populate<{ questions: IQuestion[] }>({
    path: "questions",
    options: { sort: { order: 1 } },
  });

  if (!test) {
    throw new Error("Test not found");
  }

  const questions = (test.questions || []).map((q, idx) => {
    const qObj = q.toObject ? q.toObject() : q;
    return {
      _id: qObj._id,
      id: idx + 1,
      questionId: qObj._id.toString(),
      question: qObj.question,
      sidebarTitle: qObj.sidebarTitle || qObj.question.slice(0, 50),
      options: qObj.options,
      marks: qObj.marks || 1,
      order: qObj.order || idx + 1,
      // Hide answers if in active test taking mode
      correctAnswer: maskAnswers ? undefined : qObj.correctAnswer,
      explanation: maskAnswers ? undefined : qObj.explanation,
    };
  });

  return {
    _id: test._id,
    id: test._id.toString(),
    title: test.title,
    description: test.description,
    subject: test.subject,
    board: test.board,
    classLevel: test.classLevel,
    durationMinutes: test.durationMinutes,
    totalQuestions: questions.length,
    totalMarks: test.totalMarks || questions.reduce((sum, q) => sum + (q.marks || 1), 0),
    isLocked: test.isLocked,
    category: test.category,
    questions,
  };
};

/**
 * Start or resume an in-progress test attempt.
 */
export const startTestAttempt = async (
  testId: string,
  studentProfileId: string,
  userId: string
) => {
  if (!mongoose.Types.ObjectId.isValid(testId)) {
    throw new Error("Invalid test ID");
  }

  const test = await Test.findById(testId).populate<{ questions: IQuestion[] }>("questions");
  if (!test) {
    throw new Error("Test not found");
  }

  if (test.isLocked) {
    throw new Error("This test is locked. Please subscribe to unlock premium test series.");
  }

  // Check for an existing in-progress attempt for this student
  let attempt = await TestAttempt.findOne({
    testId: test._id,
    studentProfileId: new mongoose.Types.ObjectId(studentProfileId),
    status: "in_progress",
  });

  const totalPossibleScore = (test.questions || []).reduce(
    (sum, q) => sum + (q.marks || 1),
    0
  );

  if (!attempt) {
    attempt = await TestAttempt.create({
      testId: test._id,
      studentProfileId: new mongoose.Types.ObjectId(studentProfileId),
      userId: new mongoose.Types.ObjectId(userId),
      status: "in_progress",
      startedAt: new Date(),
      timeSpentSeconds: 0,
      answers: [],
      maxScore: totalPossibleScore,
    });
  }

  return {
    attemptId: attempt._id.toString(),
    testId: test._id.toString(),
    testTitle: test.title,
    status: attempt.status,
    startedAt: attempt.startedAt,
    timeSpentSeconds: attempt.timeSpentSeconds,
    durationMinutes: test.durationMinutes,
    savedAnswers: (attempt.answers || []).reduce<Record<string, string>>((acc, a) => {
      if (a.selectedOption) acc[a.questionId.toString()] = a.selectedOption;
      return acc;
    }, {}),
    savedStatus: (attempt.answers || []).reduce<Record<string, string>>((acc, a) => {
      if (a.status) acc[a.questionId.toString()] = a.status;
      return acc;
    }, {}),
  };
};

/**
 * Submit answers, evaluate against question keys, and return full performance analysis.
 */
export const submitTestAttempt = async (
  testId: string,
  studentProfileId: string,
  userId: string,
  submission: SubmitTestInput
) => {
  if (!mongoose.Types.ObjectId.isValid(testId)) {
    throw new Error("Invalid test ID");
  }

  const test = await Test.findById(testId).populate<{ questions: IQuestion[] }>({
    path: "questions",
    options: { sort: { order: 1 } },
  });

  if (!test) {
    throw new Error("Test not found");
  }

  const questions = test.questions || [];
  if (questions.length === 0) {
    throw new Error("Test contains no questions to evaluate");
  }

  // Find existing in-progress attempt or create a new one
  let attempt: ITestAttempt | null = null;
  if (submission.attemptId && mongoose.Types.ObjectId.isValid(submission.attemptId)) {
    attempt = await TestAttempt.findOne({
      _id: submission.attemptId,
      studentProfileId: new mongoose.Types.ObjectId(studentProfileId),
    });
  }

  // If the attempt was already completed (e.g. duplicate/double submission), return existing analysis directly
  if (attempt && attempt.status === "completed") {
    return getAttemptAnalysis(attempt._id.toString(), studentProfileId);
  }

  if (!attempt) {
    attempt = await TestAttempt.findOne({
      testId: test._id,
      studentProfileId: new mongoose.Types.ObjectId(studentProfileId),
      status: "in_progress",
    });
  }

  if (!attempt) {
    attempt = new TestAttempt({
      testId: test._id,
      studentProfileId: new mongoose.Types.ObjectId(studentProfileId),
      userId: new mongoose.Types.ObjectId(userId),
      startedAt: new Date(Date.now() - Math.max(0, (submission.timeSpentSeconds || 0) * 1000)),
    });
  }

  // Evaluation logic
  let totalScore = 0;
  let maxPossibleScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let attemptedCount = 0;
  let reviseCount = 0;
  let skippedCount = 0;

  const processedAnswers = questions.map((q, idx) => {
    const qIdStr = q._id.toString();
    // Resolve answer by questionId or question index (0, 1, 2...)
    const selectedOption =
      submission.answers[qIdStr] ||
      submission.answers[idx.toString()] ||
      submission.answers[idx as any];

    const statusFromInput =
      submission.statusByQuestion?.[qIdStr] ||
      submission.statusByQuestion?.[idx.toString()] ||
      submission.statusByQuestion?.[idx as any];

    const questionMarks = q.marks || 1;
    maxPossibleScore += questionMarks;

    const isAnswerProvided = Boolean(selectedOption && selectedOption.trim());
    const isCorrect = isAnswerProvided && selectedOption.trim().toUpperCase() === q.correctAnswer.trim().toUpperCase();

    let questionStatus: QuestionAttemptStatus = "skipped";
    if (statusFromInput === "revise") {
      questionStatus = "revise";
      reviseCount += 1;
      if (isAnswerProvided) {
        attemptedCount += 1;
        if (isCorrect) {
          correctCount += 1;
          totalScore += questionMarks;
        } else {
          incorrectCount += 1;
        }
      }
    } else if (isAnswerProvided) {
      questionStatus = "attempted";
      attemptedCount += 1;
      if (isCorrect) {
        correctCount += 1;
        totalScore += questionMarks;
      } else {
        incorrectCount += 1;
      }
    } else {
      skippedCount += 1;
    }

    return {
      questionId: q._id,
      selectedOption: selectedOption ? selectedOption.trim().toUpperCase() : undefined,
      status: questionStatus,
      isCorrect,
      marksAwarded: isCorrect ? questionMarks : 0,
      questionData: q,
    };
  });

  const percentage = maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0;
  const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;

  attempt.status = "completed";
  attempt.completedAt = new Date();
  attempt.timeSpentSeconds = submission.timeSpentSeconds || 0;
  attempt.answers = processedAnswers.map((item) => ({
    questionId: item.questionId,
    selectedOption: item.selectedOption,
    status: item.status,
    isCorrect: item.isCorrect,
    marksAwarded: item.marksAwarded,
  }));
  attempt.attemptedCount = attemptedCount;
  attempt.reviseCount = reviseCount;
  attempt.skippedCount = skippedCount;
  attempt.correctCount = correctCount;
  attempt.incorrectCount = incorrectCount;
  attempt.score = totalScore;
  attempt.maxScore = maxPossibleScore;
  attempt.percentage = percentage;
  attempt.accuracy = accuracy;

  await attempt.save();

  // Return full analysis report
  return {
    attemptId: attempt._id.toString(),
    testId: test._id.toString(),
    testTitle: test.title,
    score: totalScore,
    maxScore: maxPossibleScore,
    percentage,
    accuracy,
    attempted: attemptedCount,
    correct: correctCount,
    incorrect: incorrectCount,
    reviseLater: reviseCount,
    skipped: skippedCount,
    timeSpentSeconds: attempt.timeSpentSeconds,
    completedAt: attempt.completedAt,
    questions: processedAnswers.map((item, idx) => ({
      id: idx + 1,
      questionId: item.questionData._id.toString(),
      question: item.questionData.question,
      sidebarTitle: item.questionData.sidebarTitle || item.questionData.question.slice(0, 50),
      options: item.questionData.options,
      userAnswer: item.selectedOption,
      correctAnswer: item.questionData.correctAnswer,
      isCorrect: item.isCorrect,
      marksAwarded: item.marksAwarded,
      marks: item.questionData.marks || 1,
      explanation: item.questionData.explanation,
      status: item.status,
    })),
  };
};

/**
 * Retrieve comprehensive attempt analysis by attempt ID.
 */
export const getAttemptAnalysis = async (
  attemptId: string,
  studentProfileId: string
) => {
  if (!mongoose.Types.ObjectId.isValid(attemptId)) {
    throw new Error("Invalid attempt ID");
  }

  const attempt = await TestAttempt.findById(attemptId)
    .populate<{ testId: ITest }>("testId")
    .populate<{ "answers.questionId": IQuestion }>("answers.questionId");

  if (!attempt) {
    throw new Error("Test attempt not found");
  }

  if (attempt.studentProfileId.toString() !== studentProfileId) {
    throw new Error("Unauthorized to access this test attempt");
  }

  const test = attempt.testId;

  return {
    attemptId: attempt._id.toString(),
    testId: test ? test._id.toString() : "",
    testTitle: test ? test.title : "Test",
    score: attempt.score,
    maxScore: attempt.maxScore,
    percentage: attempt.percentage,
    accuracy: attempt.accuracy,
    attempted: attempt.attemptedCount,
    correct: attempt.correctCount,
    incorrect: attempt.incorrectCount,
    reviseLater: attempt.reviseCount,
    skipped: attempt.skippedCount,
    timeSpentSeconds: attempt.timeSpentSeconds,
    completedAt: attempt.completedAt,
    questions: attempt.answers.map((ans, idx) => {
      const q = ans.questionId as unknown as IQuestion;
      return {
        id: idx + 1,
        questionId: q ? q._id.toString() : "",
        question: q ? q.question : "",
        sidebarTitle: q ? q.sidebarTitle || q.question.slice(0, 50) : "",
        options: q ? q.options : [],
        userAnswer: ans.selectedOption,
        correctAnswer: q ? q.correctAnswer : "",
        isCorrect: ans.isCorrect,
        marksAwarded: ans.marksAwarded,
        explanation: q ? q.explanation : "",
        status: ans.status,
      };
    }),
  };
};

/**
 * Retrieve a student's past attempts history.
 */
export const getStudentAttemptHistory = async (
  studentProfileId: string,
  testId?: string
) => {
  const filter: Record<string, any> = {
    studentProfileId: new mongoose.Types.ObjectId(studentProfileId),
    status: "completed",
  };

  if (testId && mongoose.Types.ObjectId.isValid(testId)) {
    filter.testId = new mongoose.Types.ObjectId(testId);
  }

  const attempts = await TestAttempt.find(filter)
    .populate<{ testId: ITest }>("testId", "title subject board classLevel durationMinutes isLocked")
    .sort({ completedAt: -1 })
    .lean();

  return attempts.map((att) => ({
    attemptId: att._id.toString(),
    testId: att.testId ? (att.testId as any)._id.toString() : "",
    testTitle: att.testId ? (att.testId as any).title : "Test",
    subject: att.testId ? (att.testId as any).subject : "",
    score: att.score,
    maxScore: att.maxScore,
    percentage: att.percentage,
    accuracy: att.accuracy,
    timeSpentSeconds: att.timeSpentSeconds,
    completedAt: att.completedAt,
  }));
};
