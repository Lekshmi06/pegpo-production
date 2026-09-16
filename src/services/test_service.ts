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
  studentProfileId?: string;
}

export interface SubmitTestInput {
  attemptId?: string;
  answers: Record<string, string | number>; // questionId or questionIndex -> selectedOption or numerical answer
  statusByQuestion?: Record<string, QuestionAttemptStatus>;
  timeSpentSeconds: number;
}

/**
 * List all available tests with syllabus and lock status filters.
 */
export const listTests = async (filters: TestFilterOptions = {}) => {
  const query: Record<string, any> = { status: "published" };

  if (filters.studentProfileId && mongoose.Types.ObjectId.isValid(filters.studentProfileId)) {
    const profileObjId = new mongoose.Types.ObjectId(filters.studentProfileId);
    if (filters.board && filters.classLevel) {
      query.$or = [
        { studentProfileId: profileObjId },
        {
          board: new RegExp(`^${filters.board.trim()}$`, "i"),
          classLevel: new RegExp(`^${filters.classLevel.trim()}$`, "i"),
        },
      ];
    } else {
      query.studentProfileId = profileObjId;
    }
  } else {
    if (filters.board) {
      query.board = new RegExp(`^${filters.board.trim()}$`, "i");
    }

    if (filters.classLevel) {
      query.classLevel = new RegExp(`^${filters.classLevel.trim()}$`, "i");
    }
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
      select: "order marks subject questionType",
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
    isCompetitiveExam: t.isCompetitiveExam || false,
    examCategory: t.examCategory,
    examCode: t.examCode,
    isPYQ: t.isPYQ || false,
    pyqYear: t.pyqYear,
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

  // Build lookup from test.sections for questionId -> section info
  const questionSectionLookup = new Map<string, { sectionId: string; sectionName: string; subject?: string }>();
  if (Array.isArray(test.sections)) {
    for (const sec of test.sections) {
      if (Array.isArray(sec.questionIds)) {
        for (const qid of sec.questionIds) {
          questionSectionLookup.set(qid.toString(), {
            sectionId: sec.id,
            sectionName: sec.name,
            subject: sec.subject,
          });
        }
      }
    }
  }

  const hasDefinedSections = Array.isArray(test.sections) && test.sections.length > 0;

  const questions = (test.questions || []).map((q, idx) => {
    const qObj = q.toObject ? q.toObject() : q;
    const qIdStr = qObj._id ? qObj._id.toString() : "";
    const secInfo = questionSectionLookup.get(qIdStr);

    let resolvedSectionId = qObj.sectionId || secInfo?.sectionId;
    let resolvedSectionName = qObj.sectionName || secInfo?.sectionName;

    if (hasDefinedSections && !resolvedSectionId) {
      const match = test.sections!.find((s) => {
        const matchesSubject = s.subject.toLowerCase() === (qObj.subject || "").toLowerCase();
        const isNat = qObj.questionType === "nat";
        const secIsNat = s.id.toLowerCase().includes("nat") || s.name.toLowerCase().includes("nat");
        return matchesSubject && (isNat ? secIsNat : !secIsNat);
      }) || test.sections!.find((s) =>
        s.subject.toLowerCase() === (qObj.subject || "").toLowerCase()
      ) || test.sections![0];

      resolvedSectionId = match.id;
      resolvedSectionName = match.name;
    }

    return {
      _id: qObj._id,
      id: idx + 1,
      questionId: qObj._id ? qObj._id.toString() : "",
      question: qObj.question,
      sidebarTitle: qObj.sidebarTitle || qObj.question.slice(0, 50),
      questionType: qObj.questionType || "mcq",
      options: qObj.options || [],
      marks: qObj.marks || 1,
      negativeMarks: qObj.negativeMarks || 0,
      numericalTolerance: qObj.numericalTolerance,
      order: qObj.order || idx + 1,
      sectionId: resolvedSectionId,
      sectionName: resolvedSectionName,
      subject: qObj.subject || secInfo?.subject,
      sourceType: qObj.sourceType,
      sourceYear: qObj.sourceYear,
      sourceExam: qObj.sourceExam,
      sourceShift: qObj.sourceShift,
      sourceReference: qObj.sourceReference,
      // Hide answers if in active test taking mode
      correctAnswer: maskAnswers ? undefined : qObj.correctAnswer,
      numericalAnswer: maskAnswers ? undefined : qObj.numericalAnswer,
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
    isCompetitiveExam: test.isCompetitiveExam || false,
    examCategory: test.examCategory,
    examCode: test.examCode,
    examTier: test.examTier,
    sections: test.sections || [],
    negativeMarkingRate: test.negativeMarkingRate || 0,
    cutOffScore: test.cutOffScore,
    totalCandidatesEstimate: test.totalCandidatesEstimate,
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
    const rawAnswer =
      submission.answers[qIdStr] ??
      submission.answers[idx.toString()] ??
      submission.answers[idx as any];

    const selectedOption =
      rawAnswer !== undefined && rawAnswer !== null ? String(rawAnswer).trim() : undefined;

    const statusFromInput =
      submission.statusByQuestion?.[qIdStr] ||
      submission.statusByQuestion?.[idx.toString()] ||
      submission.statusByQuestion?.[idx as any];

    const questionMarks = q.marks || 1;
    maxPossibleScore += questionMarks;

    const isAnswerProvided = Boolean(selectedOption && selectedOption.length > 0);
    let isCorrect = false;

    if (isAnswerProvided && selectedOption) {
      if (q.questionType === "nat") {
        const studentNum = Number(selectedOption);
        const targetNum =
          typeof q.numericalAnswer === "number"
            ? q.numericalAnswer
            : Number(q.correctAnswer);
        const tolerance = q.numericalTolerance || 0;
        isCorrect =
          !isNaN(studentNum) &&
          !isNaN(targetNum) &&
          Math.abs(studentNum - targetNum) <= tolerance;
      } else {
        isCorrect =
          selectedOption.toUpperCase() === q.correctAnswer.trim().toUpperCase();
      }
    }

    let marksAwarded = 0;
    if (isAnswerProvided) {
      if (isCorrect) {
        marksAwarded = questionMarks;
      } else {
        // Apply negative marking penalty if configured on question or test
        const penalty =
          typeof q.negativeMarks === "number" && q.negativeMarks > 0
            ? q.negativeMarks
            : test.negativeMarkingRate || 0;
        marksAwarded = -Math.abs(penalty);
      }
    }

    let questionStatus: QuestionAttemptStatus = "skipped";
    if (statusFromInput === "revise") {
      questionStatus = "revise";
      reviseCount += 1;
      if (isAnswerProvided) {
        attemptedCount += 1;
        if (isCorrect) {
          correctCount += 1;
        } else {
          incorrectCount += 1;
        }
        totalScore += marksAwarded;
      }
    } else if (isAnswerProvided) {
      questionStatus = "attempted";
      attemptedCount += 1;
      if (isCorrect) {
        correctCount += 1;
      } else {
        incorrectCount += 1;
      }
      totalScore += marksAwarded;
    } else {
      skippedCount += 1;
    }

    return {
      questionId: q._id,
      selectedOption: selectedOption ? selectedOption.toUpperCase() : undefined,
      numericalAnswer:
        q.questionType === "nat" && selectedOption && !isNaN(Number(selectedOption))
          ? Number(selectedOption)
          : undefined,
      sectionId: q.sectionId,
      status: questionStatus,
      isCorrect,
      marksAwarded,
      questionData: q,
    };
  });

  const percentage = maxPossibleScore > 0 ? Math.max(0, Math.round((totalScore / maxPossibleScore) * 100)) : 0;
  const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;

  // Section-wise breakdown
  const questionSectionLookup = new Map<string, { sectionId: string; sectionName: string; subject?: string }>();
  if (Array.isArray(test.sections)) {
    for (const sec of test.sections) {
      if (Array.isArray(sec.questionIds)) {
        for (const qid of sec.questionIds) {
          questionSectionLookup.set(qid.toString(), {
            sectionId: sec.id,
            sectionName: sec.name,
            subject: sec.subject,
          });
        }
      }
    }
  }

  const sectionMap: Record<string, {
    sectionId: string;
    sectionName: string;
    subject: string;
    attemptedCount: number;
    correctCount: number;
    incorrectCount: number;
    skippedCount: number;
    score: number;
    maxScore: number;
    accuracy: number;
  }> = {};

  const hasDefinedSections = Boolean(test.sections && test.sections.length > 0);

  if (test.sections && test.sections.length > 0) {
    for (const sec of test.sections) {
      sectionMap[sec.id] = {
        sectionId: sec.id,
        sectionName: sec.name,
        subject: sec.subject,
        attemptedCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        skippedCount: 0,
        score: 0,
        maxScore: 0,
        accuracy: 0,
      };
    }
  }

  for (const item of processedAnswers) {
    const qIdStr = item.questionData._id ? item.questionData._id.toString() : "";
    const secInfo = questionSectionLookup.get(qIdStr);

    let secId = item.questionData.sectionId || secInfo?.sectionId;

    if (hasDefinedSections) {
      // If the question's secId doesn't match one of test.sections, map it to the correct official section
      if (!secId || !sectionMap[secId]) {
        const match = test.sections!.find((s) => {
          const matchesSubject = s.subject.toLowerCase() === (item.questionData.subject || "").toLowerCase();
          const isNat = item.questionData.questionType === "nat";
          const secIsNat = s.id.toLowerCase().includes("nat") || s.name.toLowerCase().includes("nat");
          return matchesSubject && (isNat ? secIsNat : !secIsNat);
        }) || test.sections!.find((s) =>
          s.subject.toLowerCase() === (item.questionData.subject || "").toLowerCase()
        ) || test.sections![0];

        secId = match.id;
      }
    } else {
      if (!secId) {
        secId = item.questionData.subject || "general";
      }
      if (!sectionMap[secId]) {
        sectionMap[secId] = {
          sectionId: secId,
          sectionName: item.questionData.sectionName || item.questionData.subject || "General",
          subject: item.questionData.subject || "General",
          attemptedCount: 0,
          correctCount: 0,
          incorrectCount: 0,
          skippedCount: 0,
          score: 0,
          maxScore: 0,
          accuracy: 0,
        };
      }
    }

    const sec = sectionMap[secId];
    if (sec) {
      sec.maxScore += item.questionData.marks || 1;
      if (item.status === "attempted" || item.status === "revise") {
        if (item.selectedOption !== undefined) {
          sec.attemptedCount += 1;
          if (item.isCorrect) {
            sec.correctCount += 1;
          } else {
            sec.incorrectCount += 1;
          }
          sec.score += item.marksAwarded;
        } else {
          sec.skippedCount += 1;
        }
      } else {
        sec.skippedCount += 1;
      }
    }
  }

  const sectionScores = hasDefinedSections
    ? test.sections!.map((sec) => {
        const s = sectionMap[sec.id] || {
          sectionId: sec.id,
          sectionName: sec.name,
          subject: sec.subject,
          attemptedCount: 0,
          correctCount: 0,
          incorrectCount: 0,
          skippedCount: 0,
          score: 0,
          maxScore: 0,
          accuracy: 0,
        };
        return {
          ...s,
          accuracy: s.attemptedCount > 0 ? Math.round((s.correctCount / s.attemptedCount) * 100) : 0,
        };
      })
    : Object.values(sectionMap).map((s) => ({
        ...s,
        accuracy: s.attemptedCount > 0 ? Math.round((s.correctCount / s.attemptedCount) * 100) : 0,
      }));

  // Percentile and All India Rank calculation for competitive exams
  let percentile: number | undefined;
  let allIndiaRank: number | undefined;
  const totalCandidates = test.totalCandidatesEstimate || 100000;

  if (test.isCompetitiveExam) {
    const cutOff = test.cutOffScore || Math.round(maxPossibleScore * 0.4);
    if (maxPossibleScore > 0) {
      if (totalScore <= 0) {
        percentile = 2.5;
      } else if (totalScore >= maxPossibleScore) {
        percentile = 99.99;
      } else {
        const norm = (totalScore - cutOff) / (maxPossibleScore - cutOff || 1);
        const sigmoid = 1 / (1 + Math.exp(-3.2 * norm));
        percentile = Math.min(99.95, Math.max(10.0, Math.round((45 + sigmoid * 54.9) * 100) / 100));
      }
    } else {
      percentile = 50.0;
    }
    allIndiaRank = Math.max(1, Math.round(totalCandidates * (1 - percentile / 100)));
  }

  attempt.status = "completed";
  attempt.completedAt = new Date();
  attempt.timeSpentSeconds = submission.timeSpentSeconds || 0;
  attempt.answers = processedAnswers.map((item) => ({
    questionId: item.questionId,
    selectedOption: item.selectedOption,
    numericalAnswer: item.numericalAnswer,
    sectionId: item.sectionId,
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
  attempt.sectionScores = sectionScores;
  attempt.percentile = percentile;
  attempt.allIndiaRank = allIndiaRank;
  attempt.totalCandidates = totalCandidates;

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
    sectionScores,
    percentile,
    allIndiaRank,
    totalCandidates,
    isCompetitiveExam: test.isCompetitiveExam || false,
    examCategory: test.examCategory,
    examTier: test.examTier,
    cutOffScore: test.cutOffScore,
    questions: processedAnswers.map((item, idx) => ({
      id: idx + 1,
      questionId: item.questionData._id.toString(),
      question: item.questionData.question,
      sidebarTitle: item.questionData.sidebarTitle || item.questionData.question.slice(0, 50),
      questionType: item.questionData.questionType || "mcq",
      options: item.questionData.options,
      userAnswer: item.selectedOption,
      correctAnswer: item.questionData.correctAnswer,
      numericalAnswer: item.questionData.numericalAnswer,
      isCorrect: item.isCorrect,
      marksAwarded: item.marksAwarded,
      marks: item.questionData.marks || 1,
      explanation: item.questionData.explanation,
      status: item.status,
      sectionId: item.questionData.sectionId,
      sectionName: item.questionData.sectionName,
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
    sectionScores: attempt.sectionScores || [],
    percentile: attempt.percentile,
    allIndiaRank: attempt.allIndiaRank,
    totalCandidates: attempt.totalCandidates,
    isCompetitiveExam: test?.isCompetitiveExam || false,
    examCategory: test?.examCategory,
    examTier: test?.examTier,
    cutOffScore: test?.cutOffScore,
    questions: attempt.answers.map((ans, idx) => {
      const q = ans.questionId as unknown as IQuestion;
      return {
        id: idx + 1,
        questionId: q ? q._id.toString() : "",
        question: q ? q.question : "",
        sidebarTitle: q ? q.sidebarTitle || q.question.slice(0, 50) : "",
        questionType: q ? q.questionType || "mcq" : "mcq",
        options: q ? q.options : [],
        userAnswer: ans.selectedOption,
        correctAnswer: q ? q.correctAnswer : "",
        numericalAnswer: q ? q.numericalAnswer : undefined,
        isCorrect: ans.isCorrect,
        marksAwarded: ans.marksAwarded,
        explanation: q ? q.explanation : "",
        status: ans.status,
        sectionId: ans.sectionId,
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
