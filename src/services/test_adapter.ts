import mongoose from "mongoose";
import Test, { ITest } from "../models/Test";
import Question, { IQuestion } from "../models/Question";
import { AcademicContext } from "./academic_context_service";
import { UniversalQuestion } from "./ai_question_generator";

export interface CreateTestFromQuestionsParams {
  context: AcademicContext;
  questions: UniversalQuestion[];
  materialInfo?: {
    sourceId?: mongoose.Types.ObjectId;
    originalName?: string;
  };
  title?: string;
  durationMinutes?: number;
  topic?: string;
}

/**
 * Adapts UniversalQuestion[] into persistent Test & Question documents in MongoDB.
 * Ensures complete compatibility with the existing test taking, answer protection,
 * and server-side evaluation engines.
 */
export async function createTestFromQuestions(
  params: CreateTestFromQuestionsParams
): Promise<ITest> {
  const {
    context,
    questions,
    materialInfo,
    title,
    durationMinutes,
    topic,
  } = params;

  if (!questions || questions.length === 0) {
    throw new Error("Cannot create test without questions");
  }

  const subject = context.selectedSubject || "Physics";
  const board = context.board || "State Board";
  const classLevel = context.classLevel || "Class 11";

  const resolvedTitle =
    title ||
    (topic
      ? `${subject} - ${topic} Test`
      : materialInfo?.originalName
      ? `${subject} - ${materialInfo.originalName.replace(/\.[^/.]+$/, "")} Assessment`
      : `${subject} - Academic Assessment`);

  const resolvedDuration =
    durationMinutes && durationMinutes > 0
      ? durationMinutes
      : Math.max(10, questions.length * 2);

  const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 1), 0);
  const passingMarks = Math.ceil(totalMarks * 0.4);

  // 1. Instantiate the Test document
  const testDoc = new Test({
    title: resolvedTitle,
    description: materialInfo?.originalName
      ? `AI-generated assessment grounded in your uploaded study material: "${materialInfo.originalName}".`
      : `AI-generated assessment for ${board} ${classLevel} ${subject}.`,
    subject,
    board,
    classLevel,
    durationMinutes: resolvedDuration,
    totalMarks,
    passingMarks,
    isLocked: false,
    category: `${subject} (${board} ${classLevel})`,
    status: "published",
    sourceType: "ai_generated",
    studentProfileId: new mongoose.Types.ObjectId(context.studentProfileId),
    createdBy: new mongoose.Types.ObjectId(context.userId),
    sourceId: materialInfo?.sourceId,
    topic,
    questions: [],
  });

  await testDoc.save();

  // 2. Persist individual Question documents linked to this Test
  const questionIds: mongoose.Types.ObjectId[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    const questionDoc = await Question.create({
      testId: testDoc._id,
      question: q.question,
      sidebarTitle: q.sidebarTitle || q.question.slice(0, 45),
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      hint: q.hint,
      difficulty: q.difficulty,
      marks: q.marks || 1,
      order: i + 1,
      subject,
      board,
      classLevel,
      topic: q.topic || topic,
      chapter: q.chapter || materialInfo?.originalName,
      stepByStepSolution: q.stepByStepSolution,
    });

    questionIds.push(questionDoc._id as mongoose.Types.ObjectId);
  }

  // 3. Link question IDs into the Test document
  testDoc.questions = questionIds;
  await testDoc.save();

  return testDoc;
}
