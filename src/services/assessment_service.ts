import mongoose from "mongoose";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import Test, { ITest, IAssessmentUsages, IAssessmentSchedule, IOriginalDocumentReference } from "../models/Test";
import Question, { IQuestion, QuestionType } from "../models/Question";
import TestAttempt from "../models/TestAttempt";
import TeachingContext from "../models/TeachingContext";
import { extractDocumentText } from "./document_extraction_service";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const DEFAULT_MODEL = "gemini-3.5-flash";

function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return cleaned.trim();
}

export interface ExtractedQuestionItem {
  questionNumber?: number;
  question: string;
  questionType: QuestionType;
  options: { id: "A" | "B" | "C" | "D" | string; text: string }[];
  correctAnswer?: string;
  numericalAnswer?: number;
  marks: number;
  negativeMarks?: number;
  explanation?: string;
  section?: string;
  topic?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
}

export interface ParsedDocumentResult {
  title: string;
  subject?: string;
  board?: string;
  classLevel?: string;
  totalMarks?: number;
  durationMinutes?: number;
  questions: ExtractedQuestionItem[];
  originalDocument: IOriginalDocumentReference;
}

/**
 * Parses an uploaded question paper document (PDF, DOCX, DOC, TXT)
 * Extracts text and uses Gemini to identify actual questions present in the document.
 */
export async function parseUploadedQuestionPaper(
  file: Express.Multer.File,
  metadata: {
    teacherProfileId?: string;
    teachingContextId?: string;
    subject?: string;
    board?: string;
    classLevel?: string;
  }
): Promise<ParsedDocumentResult> {
  const filePath = file.path;
  const mimeType = file.mimetype;
  const originalName = file.originalname;

  // 1. Extract raw text from file
  const extracted = await extractDocumentText(filePath, mimeType);
  const textContent = extracted.text.slice(0, 45000); // 45k chars max for prompt safety

  // 2. Build local/relative URL for persistent reference
  // Normalizing backslashes to forward slashes for cross-platform static URLs
  const relativeUploadPath = path
    .relative(path.resolve("uploads"), filePath)
    .replace(/\\/g, "/");
  const fileUrl = `/uploads/${relativeUploadPath}`;

  const originalDocument: IOriginalDocumentReference = {
    storageType: "local",
    fileName: originalName,
    fileKey: filePath,
    fileUrl,
    mimeType,
    fileSize: file.size,
    uploadedAt: new Date(),
    extractedText: textContent.slice(0, 5000), // Keep preview text
  };

  // 3. Fallback context if not specified by user
  const fallbackSubject = metadata.subject || "General Science";
  const fallbackBoard = metadata.board || "CBSE";
  const fallbackClass = metadata.classLevel || "Class 10";

  if (!ai) {
    throw new Error("Gemini AI API key is not configured");
  }

  // 4. Prompt Gemini to strictly extract only questions present in the document
  const prompt = `You are an expert curriculum examination parser.
Analyze the following text extracted from an uploaded academic question paper:

"""
${textContent}
"""

TASK:
Extract all questions, instructions, sections, options, and marks strictly based on the text.
RULES:
1. Do NOT hallucinate questions that are not in the document.
2. If an answer key is explicitly provided in the document, extract it into "correctAnswer" (e.g. "A", "B", "C", "D" or short text).
3. If NO answer key is present in the document, leave "correctAnswer" as an empty string (""). Do NOT invent an official answer.
4. For Multiple Choice Questions (MCQ):
   - Set "questionType": "mcq"
   - Provide "options": [{"id": "A", "text": "..."}, {"id": "B", "text": "..."}, {"id": "C", "text": "..."}, {"id": "D", "text": "..."}]
5. For Numerical value questions:
   - Set "questionType": "nat"
   - Set "options": []
6. For Descriptive / Short Answer / Long Answer:
   - Set "questionType": "descriptive"
   - Set "options": []
7. Identify total marks per question (default 1 if unspecified).

Return ONLY valid JSON matching this exact structure:
{
  "title": "Detected Exam Title or ${originalName.replace(/\.[^/.]+$/, "")}",
  "subject": "Detected Subject or ${fallbackSubject}",
  "board": "Detected Board or ${fallbackBoard}",
  "classLevel": "Detected Class or ${fallbackClass}",
  "durationMinutes": 45,
  "questions": [
    {
      "questionNumber": 1,
      "question": "Question text here",
      "questionType": "mcq",
      "options": [
        { "id": "A", "text": "Option A" },
        { "id": "B", "text": "Option B" },
        { "id": "C", "text": "Option C" },
        { "id": "D", "text": "Option D" }
      ],
      "correctAnswer": "A",
      "marks": 1,
      "section": "Section A",
      "explanation": ""
    }
  ]
}`;

  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: prompt,
  });

  const responseText = response.text || "";
  const cleaned = cleanJsonString(responseText);
  let parsedJson: any = null;

  try {
    parsedJson = JSON.parse(cleaned);
  } catch (err) {
    console.warn("Gemini JSON parse failed for uploaded question paper, trying fallback repair:", err);
    // Basic fallback structure if parsing raw json had syntax glitches
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsedJson = JSON.parse(match[0]);
      } catch {
        parsedJson = null;
      }
    }
  }

  const rawQuestions = Array.isArray(parsedJson?.questions) ? parsedJson.questions : [];
  const normalizedQuestions: ExtractedQuestionItem[] = [];

  for (let i = 0; i < rawQuestions.length; i++) {
    const q = rawQuestions[i];
    if (!q || !q.question || typeof q.question !== "string" || q.question.trim().length < 3) {
      continue;
    }

    let qType: QuestionType = "mcq";
    if (q.questionType === "nat" || q.questionType === "descriptive") {
      qType = q.questionType;
    } else if (Array.isArray(q.options) && q.options.length >= 2) {
      qType = "mcq";
    } else {
      qType = "descriptive";
    }

    let options: { id: string; text: string }[] = [];
    if (qType === "mcq" && Array.isArray(q.options)) {
      const ids = ["A", "B", "C", "D", "E", "F"];
      options = q.options.map((opt: any, idx: number) => {
        if (typeof opt === "string") {
          return { id: ids[idx] || `${idx + 1}`, text: opt.trim() };
        }
        return {
          id: opt.id || ids[idx] || `${idx + 1}`,
          text: (opt.text || "").toString().trim(),
        };
      });
    }

    normalizedQuestions.push({
      questionNumber: q.questionNumber || i + 1,
      question: q.question.trim(),
      questionType: qType,
      options,
      correctAnswer: (q.correctAnswer || "").toString().trim(),
      numericalAnswer: typeof q.numericalAnswer === "number" ? q.numericalAnswer : undefined,
      marks: Number(q.marks) || 1,
      negativeMarks: Number(q.negativeMarks) || 0,
      explanation: (q.explanation || "").toString().trim(),
      section: (q.section || "").toString().trim(),
      topic: (q.topic || "").toString().trim(),
      difficulty: ["Easy", "Medium", "Hard"].includes(q.difficulty) ? q.difficulty : "Medium",
    });
  }

  const totalMarks = normalizedQuestions.reduce((sum, q) => sum + (q.marks || 1), 0);

  return {
    title: parsedJson?.title || originalName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
    subject: parsedJson?.subject || fallbackSubject,
    board: parsedJson?.board || fallbackBoard,
    classLevel: parsedJson?.classLevel || fallbackClass,
    totalMarks: totalMarks || Number(parsedJson?.totalMarks) || 25,
    durationMinutes: Number(parsedJson?.durationMinutes) || Math.max(15, normalizedQuestions.length * 2),
    questions: normalizedQuestions,
    originalDocument,
  };
}

/**
 * AI Assistant: Suggests answers for unkeyed or draft questions.
 * Teacher must approve before answers become part of the official assessment.
 */
export async function suggestAnswersForQuestions(
  questions: ExtractedQuestionItem[],
  context?: { subject?: string; board?: string; classLevel?: string }
): Promise<Array<{ index: number; suggestedAnswer: string; explanation: string }>> {
  if (!ai || !Array.isArray(questions) || questions.length === 0) {
    return [];
  }

  const prompt = `You are an academic master teacher for ${context?.board || "CBSE"} ${context?.classLevel || "Class 10"} ${context?.subject || "Science"}.
Analyze the following questions and provide accurate, authoritative answers and brief pedagogical explanations.

Questions:
${JSON.stringify(
  questions.map((q, idx) => ({
    index: idx,
    question: q.question,
    questionType: q.questionType,
    options: q.options,
  })),
  null,
  2
)}

Return ONLY valid JSON matching this structure:
[
  {
    "index": 0,
    "suggestedAnswer": "A", // Or numerical value / concise answer
    "explanation": "Brief explanation of why this answer is correct"
  }
]`;

  try {
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });
    const cleaned = cleanJsonString(response.text || "");
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Gemini suggest answers failed:", err);
    return [];
  }
}

/**
 * Generates an Assessment using AI grounded in teacher parameters.
 */
export async function generateTeacherAiAssessment(params: {
  subject: string;
  board: string;
  classLevel: string;
  chapter?: string;
  topic?: string;
  questionCount?: number;
  difficulty?: "Easy" | "Medium" | "Hard" | "Mixed";
  questionTypes?: string[];
  durationMinutes?: number;
}): Promise<{
  title: string;
  subject: string;
  board: string;
  classLevel: string;
  durationMinutes: number;
  totalMarks: number;
  questions: ExtractedQuestionItem[];
}> {
  if (!ai) {
    throw new Error("Gemini AI API key is not configured");
  }

  const count = Math.min(50, Math.max(1, Number(params.questionCount) || 10));
  const subject = params.subject || "Physics";
  const board = params.board || "CBSE";
  const classLevel = params.classLevel || "Class 10";
  const topic = params.topic || params.chapter || "Full Syllabus Overview";
  const diff = params.difficulty || "Medium";
  const types = params.questionTypes?.length ? params.questionTypes.join(", ") : "MCQ, Short Answer, Numerical";

  const prompt = `You are an expert exam question creator for ${board} ${classLevel} ${subject}.
Create a high-quality academic assessment on the topic: "${topic}".

Parameters:
- Total Questions: ${count}
- Difficulty: ${diff}
- Permitted Question Types: ${types}
- Curriculum Standards: Strictly adhere to ${board} ${classLevel} ${subject} syllabus.

Return ONLY a valid JSON object matching this structure:
{
  "title": "${subject} ${topic} Unit Assessment",
  "subject": "${subject}",
  "board": "${board}",
  "classLevel": "${classLevel}",
  "durationMinutes": ${Math.max(15, count * 2)},
  "questions": [
    {
      "questionNumber": 1,
      "question": "Clear, concise question statement",
      "questionType": "mcq", // "mcq", "nat", or "descriptive"
      "options": [
        { "id": "A", "text": "First option" },
        { "id": "B", "text": "Second option" },
        { "id": "C", "text": "Third option" },
        { "id": "D", "text": "Fourth option" }
      ],
      "correctAnswer": "A", // Correct option ID for MCQ, or exact text for descriptive
      "marks": 1,
      "section": "Section A",
      "explanation": "Detailed explanation of correct answer and working steps",
      "topic": "${topic}"
    }
  ]
}`;

  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: prompt,
  });

  const cleaned = cleanJsonString(response.text || "");
  let parsed: any = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.warn("Gemini generate assessment JSON parse error:", err);
    throw new Error("Failed to parse AI generated questions. Please try again.");
  }

  const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const normalized: ExtractedQuestionItem[] = [];

  for (let i = 0; i < rawQuestions.length; i++) {
    const q = rawQuestions[i];
    if (!q || !q.question) continue;

    let qType: QuestionType = "mcq";
    if (q.questionType === "nat" || q.questionType === "descriptive") {
      qType = q.questionType;
    }

    normalized.push({
      questionNumber: i + 1,
      question: q.question.trim(),
      questionType: qType,
      options: Array.isArray(q.options) ? q.options : [],
      correctAnswer: (q.correctAnswer || "").toString().trim(),
      numericalAnswer: typeof q.numericalAnswer === "number" ? q.numericalAnswer : undefined,
      marks: Number(q.marks) || (qType === "descriptive" ? 3 : 1),
      negativeMarks: 0,
      explanation: (q.explanation || "").toString().trim(),
      section: q.section || "Section A",
      topic: q.topic || topic,
      difficulty: ["Easy", "Medium", "Hard"].includes(q.difficulty) ? q.difficulty : (diff === "Mixed" ? "Medium" : diff as any),
    });
  }

  const totalMarks = normalized.reduce((sum, q) => sum + (q.marks || 1), 0);

  return {
    title: parsed?.title || `${subject} - ${topic} Assessment`,
    subject,
    board,
    classLevel,
    durationMinutes: Number(parsed?.durationMinutes) || Math.max(15, count * 2),
    totalMarks,
    questions: normalized,
  };
}

/**
 * Persists an Assessment and its Questions into MongoDB.
 */
export async function saveAssessment(payload: {
  id?: string;
  _id?: string;
  title?: string;
  description?: string;
  subject?: string;
  board?: string;
  classLevel?: string;
  durationMinutes?: number;
  totalMarks?: number;
  passingMarks?: number;
  isUntimed?: boolean;
  topic?: string;
  chapter?: string;
  teacherProfileId?: string;
  teachingContextId?: string;
  targetClassSectionIds?: string[] | mongoose.Types.ObjectId[];
  targetGroups?: string[] | mongoose.Types.ObjectId[];
  status?: "draft" | "published" | "archived";
  usages?: Partial<IAssessmentUsages>;
  schedule?: IAssessmentSchedule & { targetGroups?: any[] };
  originalDocument?: IOriginalDocumentReference;
  sourceFormat?: "ai_generated" | "uploaded_document" | "pdf" | "docx" | "doc" | "txt" | "manual";
  resultsPublished?: boolean;
  questions?: ExtractedQuestionItem[];
}): Promise<ITest> {
  const targetId = payload._id || payload.id;
  let testDoc: ITest | null = null;

  if (targetId && mongoose.Types.ObjectId.isValid(targetId.toString())) {
    testDoc = await Test.findById(targetId);
  }

  const resolvedTitle = (payload.title ?? testDoc?.title ?? "").trim();
  if (!resolvedTitle) {
    throw new Error("Assessment title is required");
  }

  const hasNewQuestions = Array.isArray(payload.questions) && payload.questions.length > 0;

  // New tests must provide questions
  if (!testDoc && !hasNewQuestions) {
    throw new Error("Assessment must contain at least one question");
  }

  const calculatedTotalMarks = hasNewQuestions
    ? payload.questions!.reduce((acc, q) => acc + (Number(q.marks) || 1), 0)
    : payload.totalMarks ?? testDoc?.totalMarks ?? 0;

  const passingMarks =
    payload.passingMarks ?? testDoc?.passingMarks ?? Math.ceil(calculatedTotalMarks * 0.4);

  const rawTeacherProfileId = payload.teacherProfileId || testDoc?.teacherProfileId;
  const resolvedTeacherProfileId =
    rawTeacherProfileId && mongoose.Types.ObjectId.isValid(rawTeacherProfileId.toString())
      ? new mongoose.Types.ObjectId(rawTeacherProfileId.toString())
      : undefined;

  const rawContextId =
    payload.schedule?.teachingContextId ||
    payload.teachingContextId ||
    testDoc?.schedule?.teachingContextId ||
    testDoc?.teachingContextId;

  let resolvedTeachingContextId =
    rawContextId && mongoose.Types.ObjectId.isValid(rawContextId.toString())
      ? new mongoose.Types.ObjectId(rawContextId.toString())
      : undefined;

  const subject = payload.subject || testDoc?.subject || "General Science";
  const board = payload.board || testDoc?.board || "CBSE";
  const classLevel = payload.classLevel || testDoc?.classLevel || "Class 10";

  // Auto-resolve teaching context if not provided
  if (!resolvedTeachingContextId && resolvedTeacherProfileId) {
    const matchedContext = await TeachingContext.findOne({
      teacherId: resolvedTeacherProfileId,
      subject,
      classLevel,
      isArchived: false,
    });
    if (matchedContext) {
      resolvedTeachingContextId = matchedContext._id as mongoose.Types.ObjectId;
    }
  }

  let autoBatchOrSection = payload.schedule?.batchOrSection ?? testDoc?.schedule?.batchOrSection;
  if (resolvedTeachingContextId && !autoBatchOrSection) {
    const ctx = await TeachingContext.findById(resolvedTeachingContextId);
    if (ctx?.section) {
      autoBatchOrSection = ctx.section;
    }
  }

  // Resolve target groups (multiple class/section IDs)
  const rawTargetGroups =
    payload.schedule?.targetGroups ||
    payload.targetGroups ||
    payload.targetClassSectionIds ||
    testDoc?.schedule?.targetGroups ||
    testDoc?.targetClassSectionIds ||
    [];

  const resolvedTargetGroupIds: mongoose.Types.ObjectId[] = [];
  if (Array.isArray(rawTargetGroups)) {
    for (const item of rawTargetGroups) {
      if (item && mongoose.Types.ObjectId.isValid(item.toString())) {
        const idObj = new mongoose.Types.ObjectId(item.toString());
        if (!resolvedTargetGroupIds.some((existing) => existing.equals(idObj))) {
          resolvedTargetGroupIds.push(idObj);
        }
      }
    }
  }

  if (resolvedTargetGroupIds.length === 0 && resolvedTeachingContextId) {
    const ctx = await TeachingContext.findById(resolvedTeachingContextId);
    if (ctx?.classSectionId) {
      resolvedTargetGroupIds.push(ctx.classSectionId as mongoose.Types.ObjectId);
    }
  }

  const resolvedSchedule: IAssessmentSchedule = {
    teachingContextId: resolvedTeachingContextId,
    scheduledDate: payload.schedule?.scheduledDate
      ? new Date(payload.schedule.scheduledDate)
      : testDoc?.schedule?.scheduledDate,
    startTime: payload.schedule?.startTime ?? testDoc?.schedule?.startTime ?? "09:00",
    endTime: payload.schedule?.endTime ?? testDoc?.schedule?.endTime ?? "10:00",
    startDate: payload.schedule?.startDate
      ? new Date(payload.schedule.startDate)
      : testDoc?.schedule?.startDate,
    endDate: payload.schedule?.endDate
      ? new Date(payload.schedule.endDate)
      : testDoc?.schedule?.endDate,
    timezoneOffset: payload.schedule?.timezoneOffset ?? testDoc?.schedule?.timezoneOffset,
    batchOrSection: autoBatchOrSection,
    targetGroups: resolvedTargetGroupIds,
    instructions: payload.schedule?.instructions ?? testDoc?.schedule?.instructions,
  };

  const resolvedUsages: IAssessmentUsages = {
    studyMaterial: Boolean(payload.usages?.studyMaterial ?? testDoc?.usages?.studyMaterial ?? false),
    practice: Boolean(payload.usages?.practice ?? testDoc?.usages?.practice ?? false),
    scheduledTest: Boolean(payload.usages?.scheduledTest ?? testDoc?.usages?.scheduledTest ?? false),
  };

  const isAnyUsageActive =
    resolvedUsages.studyMaterial || resolvedUsages.practice || resolvedUsages.scheduledTest;
  const resolvedStatus =
    payload.status || (isAnyUsageActive ? "published" : (testDoc?.status || "draft"));

  const rawFormat = (payload.sourceFormat ?? testDoc?.sourceFormat ?? "")
    .toString()
    .toLowerCase()
    .replace(/^\./, "")
    .trim();
  const validFormats = new Set(["ai_generated", "uploaded_document", "pdf", "docx", "doc", "txt", "manual"]);
  const resolvedSourceFormat = validFormats.has(rawFormat)
    ? (rawFormat as "ai_generated" | "uploaded_document" | "pdf" | "docx" | "doc" | "txt" | "manual")
    : (rawFormat ? "uploaded_document" : "ai_generated");

  if (!testDoc) {
    testDoc = new Test({
      title: resolvedTitle,
      description:
        payload.description?.trim() ||
        `${subject} assessment for ${classLevel} (${board}). Configured for: ${[
          resolvedUsages.studyMaterial ? "Study Material" : "",
          resolvedUsages.practice ? "Practice Mock" : "",
          resolvedUsages.scheduledTest ? "Scheduled Test" : "",
        ]
          .filter(Boolean)
          .join(", ") || "Classroom Evaluation"}.`,
      subject,
      board,
      classLevel,
      durationMinutes: Number(payload.durationMinutes) || 30,
      isUntimed: Boolean(payload.isUntimed || resolvedUsages.practice),
      totalMarks: calculatedTotalMarks,
      passingMarks,
      category: `${subject} (${board} ${classLevel})`,
      status: resolvedStatus,
      sourceType: "teacher",
      teacherProfileId: resolvedTeacherProfileId,
      teachingContextId: resolvedTeachingContextId,
      targetClassSectionIds: resolvedTargetGroupIds,
      usages: resolvedUsages,
      schedule: resolvedSchedule,
      originalDocument: payload.originalDocument?.fileName ? payload.originalDocument : undefined,
      sourceFormat: resolvedSourceFormat,
      topic: payload.topic || payload.chapter,
      chapter: payload.chapter,
      questions: [],
    });
  } else {
    testDoc.title = resolvedTitle;
    if (payload.description !== undefined) testDoc.description = payload.description.trim();
    if (payload.subject) testDoc.subject = payload.subject;
    if (payload.board) testDoc.board = payload.board;
    if (payload.classLevel) testDoc.classLevel = payload.classLevel;
    if (payload.durationMinutes) testDoc.durationMinutes = Number(payload.durationMinutes);
    if (payload.isUntimed !== undefined) testDoc.isUntimed = Boolean(payload.isUntimed);
    testDoc.totalMarks = calculatedTotalMarks;
    testDoc.passingMarks = passingMarks;
    testDoc.status = resolvedStatus;
    if (resolvedTeacherProfileId) testDoc.teacherProfileId = resolvedTeacherProfileId;
    if (resolvedTeachingContextId) testDoc.teachingContextId = resolvedTeachingContextId;
    testDoc.targetClassSectionIds = resolvedTargetGroupIds;
    testDoc.usages = resolvedUsages;
    testDoc.schedule = resolvedSchedule;
    if (payload.originalDocument?.fileName) {
      testDoc.originalDocument = payload.originalDocument;
    } else if (!payload.originalDocument) {
      // If updating an AI generated test without original document, ensure any stale empty subdoc is cleared
      if (testDoc.originalDocument && !testDoc.originalDocument.fileName) {
        testDoc.originalDocument = undefined as any;
      }
    }
    testDoc.sourceFormat = resolvedSourceFormat;
    if (payload.resultsPublished !== undefined) {
      testDoc.resultsPublished = Boolean(payload.resultsPublished);
    }
    if (payload.topic) testDoc.topic = payload.topic;
    if (payload.chapter) testDoc.chapter = payload.chapter;
  }

  await testDoc.save();

  // Re-create or update Question documents only if new questions are provided
  if (hasNewQuestions) {
    if (testDoc.questions?.length) {
      await Question.deleteMany({ testId: testDoc._id });
    }

    const questionIds: mongoose.Types.ObjectId[] = [];

    for (let i = 0; i < payload.questions!.length; i++) {
      const q = payload.questions![i];
      const qDoc = await Question.create({
        testId: testDoc._id,
        question: q.question.trim(),
        sidebarTitle: q.question.slice(0, 45),
        questionType: q.questionType || "mcq",
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: (q.correctAnswer || "").toString().trim(),
        numericalAnswer: q.numericalAnswer,
        explanation: (q.explanation || "Detailed solution").toString().trim(),
        marks: Number(q.marks) || 1,
        negativeMarks: Number(q.negativeMarks) || 0,
        order: i + 1,
        subject,
        board,
        classLevel,
        topic: q.topic || payload.topic,
        difficulty: q.difficulty || "Medium",
        sourceType: "teacher",
        sectionName: q.section,
      });

      questionIds.push(qDoc._id as mongoose.Types.ObjectId);
    }

    testDoc.questions = questionIds;
    await testDoc.save();
  }

  return testDoc;
}

/**
 * Lists assessments created by or linked to the authenticated teacher.
 */
export async function listTeacherAssessments(filters: {
  teacherProfileId?: string;
  teachingContextId?: string;
  subject?: string;
  classLevel?: string;
  sourceFormat?: string;
  usage?: "studyMaterial" | "practice" | "scheduledTest";
  search?: string;
}) {
  const query: Record<string, any> = {
    status: { $ne: "archived" },
  };

  if (filters.teacherProfileId && mongoose.Types.ObjectId.isValid(filters.teacherProfileId)) {
    query.teacherProfileId = new mongoose.Types.ObjectId(filters.teacherProfileId);
  }

  if (filters.teachingContextId && mongoose.Types.ObjectId.isValid(filters.teachingContextId)) {
    query.teachingContextId = new mongoose.Types.ObjectId(filters.teachingContextId);
  }

  if (filters.subject) {
    query.subject = new RegExp(`^${filters.subject.trim()}$`, "i");
  }

  if (filters.classLevel) {
    query.classLevel = new RegExp(`^${filters.classLevel.trim()}$`, "i");
  }

  if (filters.sourceFormat) {
    query.sourceFormat = filters.sourceFormat;
  }

  if (filters.usage) {
    query[`usages.${filters.usage}`] = true;
  }

  if (filters.search) {
    const s = filters.search.trim();
    query.$or = [
      { title: new RegExp(s, "i") },
      { description: new RegExp(s, "i") },
      { topic: new RegExp(s, "i") },
    ];
  }

  const tests = await Test.find(query)
    .populate("teachingContextId", "classLevel section subject curriculumBoard")
    .populate("targetClassSectionIds", "name classLevel section board academicYear type")
    .populate("schedule.targetGroups", "name classLevel section board academicYear type")
    .populate({
      path: "questions",
      select: "question order marks questionType options correctAnswer difficulty",
    })
    .sort({ createdAt: -1 })
    .lean();

  return tests.map((t) => ({
    ...t,
    id: (t._id as any).toString(),
    questionsCount: t.questions?.length || 0,
    originalDocument: t.originalDocument?.fileName ? t.originalDocument : undefined,
  }));
}

/**
 * Retrieves a single assessment with full questions populated.
 */
export async function getAssessmentById(testId: string) {
  if (!mongoose.Types.ObjectId.isValid(testId)) {
    throw new Error("Invalid assessment ID");
  }

  const testDoc = await Test.findById(testId)
    .populate("teachingContextId", "classLevel section subject curriculumBoard")
    .populate("targetClassSectionIds", "name classLevel section board academicYear type")
    .populate("schedule.targetGroups", "name classLevel section board academicYear type")
    .populate("questions")
    .lean();

  if (!testDoc) {
    throw new Error("Assessment not found");
  }

  return {
    ...testDoc,
    id: (testDoc._id as any).toString(),
    originalDocument: testDoc.originalDocument?.fileName ? testDoc.originalDocument : undefined,
  };
}

/**
 * Deletes an assessment and its questions.
 */
export async function deleteAssessment(testId: string) {
  if (!mongoose.Types.ObjectId.isValid(testId)) {
    throw new Error("Invalid assessment ID");
  }

  await Question.deleteMany({ testId });
  const deleted = await Test.findByIdAndDelete(testId);
  if (!deleted) {
    throw new Error("Assessment not found");
  }
  return true;
}

/**
 * Returns formal scheduled test attempts for this assessment.
 * Practice attempts are filtered out so class performance metrics are not contaminated.
 */
export async function getAssessmentScheduledAttempts(testId: string) {
  if (!mongoose.Types.ObjectId.isValid(testId)) {
    throw new Error("Invalid assessment ID");
  }

  const testDoc = await Test.findById(testId).select("resultsPublished title").lean();

  const attempts = await TestAttempt.find({
    testId,
    attemptMode: "scheduled_test",
  })
    .populate("studentProfileId", "name education schoolDetails avatar")
    .populate("userId", "email")
    .sort({ createdAt: -1 })
    .lean();

  const totalAttempts = attempts.length;
  const scores = attempts.map((a) => a.score || 0);
  const avgScore = totalAttempts ? scores.reduce((a, b) => a + b, 0) / totalAttempts : 0;
  const maxScoreAchieved = totalAttempts ? Math.max(...scores) : 0;

  return {
    totalAttempts,
    averageScore: Math.round(avgScore * 10) / 10,
    highestScore: maxScoreAchieved,
    resultsPublished: Boolean(testDoc?.resultsPublished),
    attempts,
  };
}

/**
 * Publish or unpublish results for a scheduled assessment and all its student attempts.
 */
export async function publishAssessmentResults(testId: string, publish: boolean = true) {
  if (!mongoose.Types.ObjectId.isValid(testId)) {
    throw new Error("Invalid assessment ID");
  }

  const testDoc = await Test.findById(testId);
  if (!testDoc) {
    throw new Error("Assessment not found");
  }

  testDoc.resultsPublished = publish;
  await testDoc.save();

  await TestAttempt.updateMany(
    { testId: testDoc._id, attemptMode: "scheduled_test" },
    { $set: { isResultPublished: publish } }
  );

  return {
    testId: testDoc._id.toString(),
    resultsPublished: publish,
  };
}
