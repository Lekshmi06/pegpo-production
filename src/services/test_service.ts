import mongoose from "mongoose";
import Test, { ITest, IAssessmentSchedule } from "../models/Test";
import Question, { IQuestion } from "../models/Question";
import TestAttempt, { ITestAttempt, QuestionAttemptStatus } from "../models/TestAttempt";
import StudentProfile from "../models/StudentProfile";
import { getStudentClassSectionIds } from "./class_section_service";

export interface TestFilterOptions {
  board?: string;
  classLevel?: string;
  subject?: string;
  isLocked?: boolean;
  search?: string;
  studentProfileId?: string;
  usage?: "studyMaterial" | "practice" | "scheduledTest";
  clientTimezoneOffset?: number;
}

export interface SubmitTestInput {
  attemptId?: string;
  answers: Record<string, string | number>; // questionId or questionIndex -> selectedOption or numerical answer
  statusByQuestion?: Record<string, QuestionAttemptStatus>;
  timeSpentSeconds: number;
  attemptMode?: "practice" | "scheduled_test";
}

/**
 * Parses time string (e.g. "10:00", "10:00 AM", "02:30 PM") into 24-hour hours and minutes
 */
export function parseTimeString(timeStr?: string): { hours: number; minutes: number } {
  if (!timeStr) return { hours: 0, minutes: 0 };
  const trimmed = timeStr.trim();
  const isPM = /pm/i.test(trimmed);
  const isAM = /am/i.test(trimmed);
  const clean = trimmed.replace(/[^\d:]/g, "");
  const [hStr, mStr] = clean.split(":");
  let h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return { hours: h, minutes: m };
}

/**
 * Calculates current status and windows for a scheduled test
 */
export function computeExamTimeWindow(
  schedule?: IAssessmentSchedule,
  clientTimezoneOffset?: number
): {
  startTime: Date | null;
  endTime: Date | null;
  status: "upcoming" | "active" | "closed" | "open";
} {
  if (!schedule || (!schedule.scheduledDate && !schedule.startDate)) {
    return { startTime: null, endTime: null, status: "open" };
  }

  const now = new Date();

  // 1. Explicit ISO startDate/endDate
  if (schedule.startDate) {
    const startWindow = new Date(schedule.startDate);
    const endWindow = schedule.endDate
      ? new Date(schedule.endDate)
      : new Date(startWindow.getTime() + 2 * 60 * 60 * 1000);

    if (now < startWindow) {
      return { startTime: startWindow, endTime: endWindow, status: "upcoming" };
    } else if (now > endWindow) {
      return { startTime: startWindow, endTime: endWindow, status: "closed" };
    } else {
      return { startTime: startWindow, endTime: endWindow, status: "active" };
    }
  }

  // 2. Parse scheduled date
  let year: number;
  let month: number;
  let date: number;

  if (typeof schedule.scheduledDate === "string") {
    const parts = (schedule.scheduledDate as string).split("T")[0].split("-").map(Number);
    year = parts[0];
    month = parts[1] - 1;
    date = parts[2];
  } else if (schedule.scheduledDate instanceof Date) {
    const d = schedule.scheduledDate;
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
      year = d.getUTCFullYear();
      month = d.getUTCMonth();
      date = d.getUTCDate();
    } else {
      year = d.getFullYear();
      month = d.getMonth();
      date = d.getDate();
    }
  } else {
    return { startTime: null, endTime: null, status: "open" };
  }

  const startParsed = parseTimeString(schedule.startTime || "00:00");
  const endParsed = parseTimeString(schedule.endTime || "23:59");

  const tzOffset =
    clientTimezoneOffset !== undefined
      ? clientTimezoneOffset
      : schedule.timezoneOffset !== undefined
      ? schedule.timezoneOffset
      : undefined;

  let startWindow: Date;
  let endWindow: Date;

  if (tzOffset !== undefined) {
    const startUtcMs =
      Date.UTC(year, month, date, startParsed.hours, startParsed.minutes, 0, 0) +
      tzOffset * 60 * 1000;
    const endUtcMs =
      Date.UTC(year, month, date, endParsed.hours, endParsed.minutes, 59, 999) +
      tzOffset * 60 * 1000;
    startWindow = new Date(startUtcMs);
    endWindow = new Date(endUtcMs);
  } else {
    startWindow = new Date(year, month, date, startParsed.hours, startParsed.minutes, 0, 0);
    endWindow = new Date(year, month, date, endParsed.hours, endParsed.minutes, 59, 999);
  }

  if (now < startWindow) {
    return { startTime: startWindow, endTime: endWindow, status: "upcoming" };
  } else if (now > endWindow) {
    return { startTime: startWindow, endTime: endWindow, status: "closed" };
  } else {
    return { startTime: startWindow, endTime: endWindow, status: "active" };
  }
}

/**
 * List all available tests with syllabus, lock status, and group eligibility filters.
 */
export const listTests = async (filters: TestFilterOptions = {}) => {
  const query: Record<string, any> = { status: "published" };

  if (filters.usage) {
    query[`usages.${filters.usage}`] = true;
  }

  if (filters.subject) {
    query.subject = new RegExp(`^${filters.subject.trim()}$`, "i");
  }

  if (typeof filters.isLocked === "boolean") {
    query.isLocked = filters.isLocked;
  }

  if (filters.search) {
    const s = filters.search.trim();
    query.$or = [
      { title: new RegExp(s, "i") },
      { description: new RegExp(s, "i") },
      { subject: new RegExp(s, "i") },
    ];
  }

  let studentClassSectionIds: mongoose.Types.ObjectId[] = [];
  let studentProfile: any = null;

  if (filters.studentProfileId && mongoose.Types.ObjectId.isValid(filters.studentProfileId)) {
    studentProfile = await StudentProfile.findById(filters.studentProfileId).lean();
    studentClassSectionIds = await getStudentClassSectionIds(filters.studentProfileId);
  }

  const resolvedBoard =
    filters.board ||
    studentProfile?.education?.board ||
    studentProfile?.schoolDetails?.board;
  const resolvedClass =
    filters.classLevel ||
    studentProfile?.education?.classLevel ||
    studentProfile?.schoolDetails?.classLevel;

  const rawTests = await Test.find(query)
    .populate({
      path: "questions",
      select: "order marks subject questionType",
    })
    .populate("targetClassSectionIds", "name classLevel section board")
    .populate("schedule.targetGroups", "name classLevel section board")
    .sort({ isLocked: 1, createdAt: -1 })
    .lean();

  const studentSectionIdStrs = new Set(studentClassSectionIds.map((id) => id.toString()));

  const filteredTests = rawTests.filter((t) => {
    // 1. If created by this student, always include
    if (
      studentProfile &&
      t.studentProfileId &&
      t.studentProfileId.toString() === studentProfile._id.toString()
    ) {
      return true;
    }

    // 2. If it's a teacher assessment
    if (t.sourceType === "teacher") {
      const hasUsage = t.usages?.studyMaterial || t.usages?.practice || t.usages?.scheduledTest;
      if (!hasUsage) return false;

      // Check group targeting
      const targetGroupIds = [
        ...(t.targetClassSectionIds || []),
        ...(t.schedule?.targetGroups || []),
      ].map((g: any) => (g?._id ? g._id.toString() : g.toString()));

      if (targetGroupIds.length > 0) {
        // Must belong to one of targeted groups
        const isMember = targetGroupIds.some((gId) => studentSectionIdStrs.has(gId));
        if (!isMember) {
          return false;
        }
      } else {
        // Untargeted teacher assessment: fallback to classLevel & board if provided
        if (resolvedClass && t.classLevel && !new RegExp(`^${resolvedClass.trim()}$`, "i").test(t.classLevel)) {
          return false;
        }
        if (resolvedBoard && t.board && !new RegExp(`^${resolvedBoard.trim()}$`, "i").test(t.board)) {
          return false;
        }
      }

      return true;
    }

    // 3. For curriculum / competitive / system tests:
    if (resolvedClass && t.classLevel && !t.isCompetitiveExam) {
      if (!new RegExp(`^${resolvedClass.trim()}$`, "i").test(t.classLevel)) {
        return false;
      }
    }
    if (resolvedBoard && t.board && !t.isCompetitiveExam) {
      if (!new RegExp(`^${resolvedBoard.trim()}$`, "i").test(t.board)) {
        return false;
      }
    }

    return true;
  });

  let attemptMap = new Map<string, any>();
  if (studentProfile && filteredTests.length > 0) {
    const studentAttempts = await TestAttempt.find({
      studentProfileId: studentProfile._id,
      testId: { $in: filteredTests.map((t) => t._id) },
    })
      .sort({ createdAt: -1 })
      .lean();

    for (const att of studentAttempts) {
      const tid = att.testId.toString();
      const existing = attemptMap.get(tid);
      if (!existing) {
        attemptMap.set(tid, att);
      } else if (att.attemptMode === "scheduled_test" && existing.attemptMode !== "scheduled_test") {
        attemptMap.set(tid, att);
      } else if (att.status === "completed" && existing.status !== "completed") {
        attemptMap.set(tid, att);
      }
    }
  }

  return filteredTests.map((t) => {
    const timeWindow = computeExamTimeWindow(t.schedule, filters.clientTimezoneOffset);
    const userAttempt = attemptMap.get(t._id.toString());
    const isScheduled = Boolean(t.usages?.scheduledTest);
    const hasAttempted = Boolean(
      userAttempt &&
      userAttempt.status === "completed" &&
      (!isScheduled || userAttempt.attemptMode === "scheduled_test")
    );
    const isResultPublished = Boolean(userAttempt?.isResultPublished || t.resultsPublished);

    return {
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
      usages: t.usages,
      schedule: t.schedule,
      windowStatus: timeWindow.status,
      scheduledStartTime: timeWindow.startTime,
      scheduledEndTime: timeWindow.endTime,
      targetClassSectionIds: t.targetClassSectionIds,
      originalDocument: t.originalDocument,
      sourceFormat: t.sourceFormat,
      teachingContextId: t.teachingContextId,
      teacherProfileId: t.teacherProfileId,
      resultsPublished: Boolean(t.resultsPublished),
      hasAttempted,
      attemptStatus: userAttempt?.status,
      studentAttemptId: userAttempt?._id?.toString(),
      isResultPublished,
      userScore: (isResultPublished && hasAttempted) ? userAttempt?.score : undefined,
      createdAt: t.createdAt,
    };
  });
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
  userId: string,
  attemptMode?: "practice" | "scheduled_test",
  clientTimezoneOffset?: number
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

  const resolvedAttemptMode: "practice" | "scheduled_test" =
    attemptMode ||
    (test.usages?.practice && !test.usages?.scheduledTest ? "practice" : "scheduled_test");

  // Server-side scheduled test validation
  if (resolvedAttemptMode === "scheduled_test") {
    if (!test.usages?.scheduledTest) {
      throw new Error("This assessment is not enabled as a scheduled test.");
    }

    // Check if student has already completed this scheduled exam
    const existingCompleted = await TestAttempt.findOne({
      testId: test._id,
      studentProfileId: new mongoose.Types.ObjectId(studentProfileId),
      status: "completed",
      attemptMode: "scheduled_test",
    });
    if (existingCompleted) {
      throw new Error("You have already completed and submitted this scheduled exam. Multiple attempts are not permitted.");
    }

    // 1. Group membership eligibility
    const studentSectionIds = await getStudentClassSectionIds(studentProfileId);
    const targetGroups = [
      ...(test.targetClassSectionIds || []),
      ...(test.schedule?.targetGroups || []),
    ].map((id) => id.toString());

    if (targetGroups.length > 0) {
      const isEligible = studentSectionIds.some((sId) => targetGroups.includes(sId.toString()));
      if (!isEligible) {
        throw new Error("You are not eligible to take this exam as you are not enrolled in the targeted class or section.");
      }
    }

    // 2. Scheduled exam window check
    const timeWindow = computeExamTimeWindow(test.schedule, clientTimezoneOffset);
    if (timeWindow.status === "upcoming") {
      throw new Error("This scheduled exam has not started yet. Please wait for the scheduled start time.");
    }
    if (timeWindow.status === "closed") {
      throw new Error("This scheduled exam is now closed. Submissions are no longer accepted.");
    }
  }

  const studentSectionIds = await getStudentClassSectionIds(studentProfileId);
  const primarySectionId = studentSectionIds.length > 0 ? studentSectionIds[0] : undefined;

  if (!attempt) {
    attempt = await TestAttempt.create({
      testId: test._id,
      studentProfileId: new mongoose.Types.ObjectId(studentProfileId),
      userId: new mongoose.Types.ObjectId(userId),
      classSectionId: primarySectionId,
      attemptMode: resolvedAttemptMode,
      status: "in_progress",
      startedAt: new Date(),
      timeSpentSeconds: 0,
      answers: [],
      maxScore: totalPossibleScore,
    });
  } else if (attemptMode && (!attempt.attemptMode || attempt.attemptMode !== attemptMode)) {
    attempt.attemptMode = attemptMode;
    if (!attempt.classSectionId && primarySectionId) {
      attempt.classSectionId = primarySectionId;
    }
    await attempt.save();
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

  const resolvedAttemptMode: "practice" | "scheduled_test" =
    submission.attemptMode ||
    (test.usages?.practice && !test.usages?.scheduledTest ? "practice" : "scheduled_test");

  if (!attempt) {
    attempt = new TestAttempt({
      testId: test._id,
      studentProfileId: new mongoose.Types.ObjectId(studentProfileId),
      userId: new mongoose.Types.ObjectId(userId),
      attemptMode: resolvedAttemptMode,
      startedAt: new Date(Date.now() - Math.max(0, (submission.timeSpentSeconds || 0) * 1000)),
    });
  } else if (submission.attemptMode) {
    attempt.attemptMode = submission.attemptMode;
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

  const isScheduledTest = resolvedAttemptMode === "scheduled_test";
  const isResultPublished = isScheduledTest ? Boolean(test.resultsPublished) : true;
  attempt.isResultPublished = isResultPublished;

  await attempt.save();

  // If results are withheld for teacher review, return withholding confirmation
  if (isScheduledTest && !isResultPublished) {
    return {
      attemptId: attempt._id.toString(),
      testId: test._id.toString(),
      testTitle: test.title,
      isResultPublished: false,
      status: "completed",
      timeSpentSeconds: attempt.timeSpentSeconds,
      completedAt: attempt.completedAt,
      message:
        "Test submitted successfully. Your teacher is reviewing submissions. Results and answer explanations will be available once published by your teacher.",
    };
  }

  // Return full analysis report
  return {
    attemptId: attempt._id.toString(),
    testId: test._id.toString(),
    testTitle: test.title,
    isResultPublished: true,
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
  const isScheduledTest = attempt.attemptMode === "scheduled_test";
  const isResultPublished = isScheduledTest
    ? Boolean(attempt.isResultPublished || test?.resultsPublished)
    : true;

  if (isScheduledTest && !isResultPublished) {
    return {
      attemptId: attempt._id.toString(),
      testId: test ? test._id.toString() : "",
      testTitle: test ? test.title : "Test",
      isResultPublished: false,
      status: "completed",
      timeSpentSeconds: attempt.timeSpentSeconds,
      completedAt: attempt.completedAt,
      message:
        "Your submission has been recorded. Results and answer explanations are pending teacher review.",
    };
  }

  return {
    attemptId: attempt._id.toString(),
    testId: test ? test._id.toString() : "",
    testTitle: test ? test.title : "Test",
    isResultPublished: true,
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

  return attempts.map((att) => {
    const isScheduledTest = att.attemptMode === "scheduled_test";
    const isResultPublished = isScheduledTest
      ? Boolean(att.isResultPublished || (att.testId as any)?.resultsPublished)
      : true;

    return {
      attemptId: att._id.toString(),
      testId: att.testId ? (att.testId as any)._id.toString() : "",
      testTitle: att.testId ? (att.testId as any).title : "Test",
      subject: att.testId ? (att.testId as any).subject : "",
      isResultPublished,
      score: isResultPublished ? att.score : undefined,
      maxScore: att.maxScore,
      percentage: isResultPublished ? att.percentage : undefined,
      accuracy: isResultPublished ? att.accuracy : undefined,
      timeSpentSeconds: att.timeSpentSeconds,
      completedAt: att.completedAt,
    };
  });
};
