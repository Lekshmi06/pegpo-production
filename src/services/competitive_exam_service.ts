import mongoose from "mongoose";
import Exam, { IExam } from "../models/Exam";
import Question, { IQuestion, QuestionType } from "../models/Question";
import Test, { ITest } from "../models/Test";

export interface PYQFilterParams {
  examCode?: string;
  year?: number;
  subject?: string;
  topic?: string;
  chapter?: string;
  questionType?: QuestionType | string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateMockTestParams {
  studentProfileId: string;
  userId: string;
  examCode: string;
  year?: number;
  title?: string;
}

/**
 * List all active competitive exams from catalog.
 */
export const listAvailableExams = async (category?: string) => {
  const query: Record<string, any> = { isActive: true };
  if (category && category.trim().length > 0) {
    query.category = new RegExp(`^${category.trim()}$`, "i");
  }

  const exams = await Exam.find(query).sort({ category: 1, name: 1 }).lean();

  return exams.map((ex) => ({
    _id: ex._id,
    id: ex.code,
    name: ex.name,
    code: ex.code,
    category: ex.category,
    conductingBody: ex.conductingBody,
    description: ex.description,
    supportedSubjects: ex.supportedSubjects,
    tier: ex.tier,
    durationMinutes: ex.durationMinutes,
    totalQuestions: ex.sections.reduce((sum, s) => sum + s.totalQuestions, 0),
    maxScore: ex.markingScheme?.maxScore || 100,
    sections: ex.sections,
    markingScheme: ex.markingScheme,
    questionTypes: ex.questionTypes,
    isActive: ex.isActive,
    totalCandidatesEstimate: ex.totalCandidatesEstimate,
  }));
};

/**
 * Retrieve specific exam pattern and syllabus breakdown by exam code.
 */
export const getExamDetails = async (examCode: string) => {
  if (!examCode || typeof examCode !== "string") {
    throw new Error("Exam code is required");
  }

  const normalizedCode = examCode.trim().toUpperCase();
  const exam = await Exam.findOne({ code: normalizedCode }).lean();

  if (!exam) {
    throw new Error(`Exam with code '${examCode}' not found`);
  }

  return {
    _id: exam._id,
    id: exam.code,
    name: exam.name,
    code: exam.code,
    category: exam.category,
    conductingBody: exam.conductingBody,
    description: exam.description,
    supportedSubjects: exam.supportedSubjects,
    tier: exam.tier,
    durationMinutes: exam.durationMinutes,
    totalQuestions: exam.sections.reduce((sum, s) => sum + s.totalQuestions, 0),
    maxScore: exam.markingScheme?.maxScore || 100,
    sections: exam.sections,
    markingScheme: exam.markingScheme,
    questionTypes: exam.questionTypes,
    isActive: exam.isActive,
    totalCandidatesEstimate: exam.totalCandidatesEstimate,
    syllabusOverview: exam.syllabusOverview,
    eligibility: exam.eligibility,
  };
};

/**
 * Retrieve authentic Previous-Year Questions (PYQs).
 * STRICT INTEGRITY: Enforces sourceType === 'previous_year' at all times.
 * AI-generated or synthetic questions are NEVER returned as authentic PYQs.
 */
export const listPYQs = async (filters: PYQFilterParams = {}) => {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(filters.limit) || 15));
  const skip = (page - 1) * limit;

  // Strict constraint: only authentic previous_year questions
  const query: Record<string, any> = {
    sourceType: "previous_year",
  };

  if (filters.examCode) {
    query.sourceExam = filters.examCode.trim().toUpperCase();
  }

  if (filters.year) {
    query.sourceYear = Number(filters.year);
  }

  if (filters.subject) {
    query.subject = new RegExp(`^${filters.subject.trim()}$`, "i");
  }

  if (filters.topic) {
    query.topic = new RegExp(filters.topic.trim(), "i");
  }

  if (filters.chapter) {
    query.chapter = new RegExp(filters.chapter.trim(), "i");
  }

  if (filters.questionType) {
    query.questionType = filters.questionType.toLowerCase();
  }

  if (filters.search) {
    query.$or = [
      { question: new RegExp(filters.search.trim(), "i") },
      { topic: new RegExp(filters.search.trim(), "i") },
      { chapter: new RegExp(filters.search.trim(), "i") },
      { sourceReference: new RegExp(filters.search.trim(), "i") },
    ];
  }

  const [totalCount, pyqDocs] = await Promise.all([
    Question.countDocuments(query),
    Question.find(query)
      .sort({ sourceYear: -1, order: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const questions = pyqDocs.map((q, idx) => ({
    _id: q._id,
    id: skip + idx + 1,
    questionId: q._id.toString(),
    question: q.question,
    sidebarTitle: q.sidebarTitle || q.question.slice(0, 50),
    questionType: q.questionType || "mcq",
    options: q.options || [],
    correctAnswer: q.correctAnswer,
    numericalAnswer: q.numericalAnswer,
    numericalTolerance: q.numericalTolerance,
    explanation: q.explanation,
    marks: q.marks || 1,
    negativeMarks: q.negativeMarks || 0,
    subject: q.subject,
    topic: q.topic,
    chapter: q.chapter,
    difficulty: q.difficulty,
    sourceType: q.sourceType, // 'previous_year'
    sourceYear: q.sourceYear,
    sourceExam: q.sourceExam,
    sourceShift: q.sourceShift,
    sourceReference: q.sourceReference,
    isVerifiedSource: q.isVerifiedSource || false,
  }));

  // Aggregate available years and subjects for quick filter pills
  const availableFacets = await Question.aggregate([
    { $match: { sourceType: "previous_year", ...(filters.examCode ? { sourceExam: filters.examCode.trim().toUpperCase() } : {}) } },
    {
      $group: {
        _id: null,
        years: { $addToSet: "$sourceYear" },
        subjects: { $addToSet: "$subject" },
      },
    },
  ]);

  const facets = availableFacets[0] || { years: [], subjects: [] };

  return {
    totalCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit) || 1,
    questions,
    facets: {
      years: (facets.years || []).filter(Boolean).sort((a: number, b: number) => b - a),
      subjects: (facets.subjects || []).filter(Boolean).sort(),
    },
  };
};

/**
 * Creates a mock test from available questions matching an official Exam pattern.
 * Seamlessly integrates into the existing Test/Question/TestAttempt infrastructure.
 */
export const createMockTestFromQuestions = async (params: CreateMockTestParams) => {
  const { studentProfileId, userId, examCode, year, title } = params;

  if (!studentProfileId || !userId) {
    throw new Error("Student authentication required to generate a mock exam");
  }

  const normalizedCode = examCode.trim().toUpperCase();
  const exam = await Exam.findOne({ code: normalizedCode });
  if (!exam) {
    throw new Error(`Exam with code '${examCode}' does not exist in catalog`);
  }

  // Find candidate questions matching exam subjects & pattern
  const selectedQuestionIds: mongoose.Types.ObjectId[] = [];
  const sectionQuestionIdsMap: Record<string, mongoose.Types.ObjectId[]> = {};

  for (const section of exam.sections) {
    sectionQuestionIdsMap[section.id] = [];

    // Look for questions matching the section subject and exam code
    const sectionSubjectQuery: Record<string, any> = {
      subject: new RegExp(`^${section.subject.trim()}$`, "i"),
    };

    if (year) {
      sectionSubjectQuery.sourceExam = normalizedCode;
      sectionSubjectQuery.sourceYear = year;
    }

    // Prefer authentic PYQ questions if available
    let questions = await Question.find({
      ...sectionSubjectQuery,
      sourceType: "previous_year",
      ...(section.questionTypes?.length ? { questionType: { $in: section.questionTypes } } : {}),
      _id: { $nin: selectedQuestionIds },
    })
      .limit(section.totalQuestions)
      .lean();

    // If not enough PYQs, fill with curriculum questions
    if (questions.length < section.totalQuestions) {
      const remainingCount = section.totalQuestions - questions.length;
      const fallbackQuestions = await Question.find({
        subject: new RegExp(`^${section.subject.trim()}$`, "i"),
        _id: { $nin: [...selectedQuestionIds, ...questions.map((q) => q._id)] },
        ...(section.questionTypes?.length ? { questionType: { $in: section.questionTypes } } : {}),
      })
        .limit(remainingCount)
        .lean();

      questions = [...questions, ...fallbackQuestions];
    }

    // Attach section information
    for (const q of questions) {
      const qId = q._id as mongoose.Types.ObjectId;
      selectedQuestionIds.push(qId);
      sectionQuestionIdsMap[section.id].push(qId);
    }
  }

  // If no questions found at all in DB, return helpful error
  if (selectedQuestionIds.length === 0) {
    throw new Error(
      `No questions available for ${exam.name}. Please ensure questions are seeded for subjects: ${exam.supportedSubjects.join(", ")}`
    );
  }

  const resolvedTitle =
    title ||
    `${exam.name} ${year ? `${year} Official PYQ Paper` : "Full Mock Test"}`;

  const totalMarks = exam.markingScheme.maxScore || exam.sections.reduce((s, sec) => s + (sec.totalQuestions * sec.marksPerQuestion), 0);
  const passingMarks = exam.markingScheme.cutOffScore || Math.ceil(totalMarks * 0.4);

  const testDoc = new Test({
    title: resolvedTitle,
    description: `Complete examination assessment for ${exam.name} matching official ${exam.conductingBody || "national"} testing criteria.`,
    subject: exam.supportedSubjects.join(" & "),
    board: exam.conductingBody || "National Board",
    classLevel: exam.category,
    durationMinutes: exam.durationMinutes,
    totalMarks,
    passingMarks,
    isLocked: false,
    category: exam.category,
    status: "published",
    sourceType: year ? "previous_year" : "curriculum",
    isCompetitiveExam: true,
    examCategory: exam.category,
    examCode: exam.code,
    examTier: exam.tier,
    sections: exam.sections.map((s) => ({
      id: s.id,
      name: s.name,
      subject: s.subject,
      totalQuestions: s.totalQuestions,
      marksPerQuestion: s.marksPerQuestion,
      negativeMarks: s.negativeMarks,
      durationMinutes: s.durationMinutes,
      questionIds: sectionQuestionIdsMap[s.id] || [],
    })),
    negativeMarkingRate: exam.markingScheme.negativeMarks,
    isPYQ: Boolean(year),
    pyqYear: year,
    totalCandidatesEstimate: exam.totalCandidatesEstimate,
    cutOffScore: exam.markingScheme.cutOffScore,
    studentProfileId: new mongoose.Types.ObjectId(studentProfileId),
    createdBy: new mongoose.Types.ObjectId(userId),
    questions: selectedQuestionIds,
  });

  await testDoc.save();

  return {
    testId: testDoc._id.toString(),
    title: testDoc.title,
    examCode: exam.code,
    examName: exam.name,
    category: exam.category,
    durationMinutes: testDoc.durationMinutes,
    totalQuestions: selectedQuestionIds.length,
    totalMarks: testDoc.totalMarks,
    sections: testDoc.sections,
    isPYQ: testDoc.isPYQ,
    pyqYear: testDoc.pyqYear,
  };
};

/**
 * Clean data/source ingestion architecture for authentic PYQ batches.
 * Guarantees sourceType === 'previous_year' and isVerifiedSource === true.
 */
export const importVerifiedPYQs = async (
  questions: Array<{
    question: string;
    sidebarTitle?: string;
    questionType?: QuestionType;
    options?: Array<{ id: string; text: string }>;
    correctAnswer: string;
    numericalAnswer?: number;
    numericalTolerance?: number;
    explanation: string;
    marks?: number;
    negativeMarks?: number;
    subject: string;
    topic?: string;
    chapter?: string;
    sourceExam: string;
    sourceYear: number;
    sourceShift?: string;
    sourceReference?: string;
    difficulty?: "Easy" | "Medium" | "Hard";
    stepByStepSolution?: string[];
    sectionId?: string;
    sectionName?: string;
  }>
) => {
  const docsToInsert = questions.map((q, idx) => ({
    question: q.question,
    sidebarTitle: q.sidebarTitle || q.question.slice(0, 50),
    questionType: q.questionType || "mcq",
    options: q.options || [],
    correctAnswer: q.correctAnswer || (q.numericalAnswer !== undefined ? String(q.numericalAnswer) : ""),
    numericalAnswer: q.numericalAnswer,
    numericalTolerance: q.numericalTolerance || 0,
    explanation: q.explanation,
    marks: q.marks || 1,
    negativeMarks: q.negativeMarks || 0,
    order: idx + 1,
    subject: q.subject,
    topic: q.topic,
    chapter: q.chapter,
    difficulty: q.difficulty || "Medium",
    stepByStepSolution: q.stepByStepSolution || [],
    // Verified PYQ guarantees
    sourceType: "previous_year" as const,
    sourceExam: q.sourceExam.trim().toUpperCase(),
    sourceYear: q.sourceYear,
    sourceShift: q.sourceShift,
    sourceReference: q.sourceReference,
    isVerifiedSource: true,
    sectionId: q.sectionId,
    sectionName: q.sectionName,
  }));

  const inserted = await Question.insertMany(docsToInsert);
  return {
    insertedCount: inserted.length,
    ids: inserted.map((d) => d._id),
  };
};
