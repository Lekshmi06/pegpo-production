import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import connectDB from "./db";
import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import Source from "../models/source_model";
import SourceContent from "../models/source_content_model";
import Test from "../models/Test";
import Question from "../models/Question";
import TestAttempt from "../models/TestAttempt";

import { resolveAcademicContext } from "../services/academic_context_service";
import { getRelevantStudentMaterial } from "../services/student_material_service";
import {
  validateAndRepairQuestions,
  UniversalQuestion,
} from "../services/ai_question_generator";
import { createTestFromQuestions } from "../services/test_adapter";
import {
  getTestById,
  startTestAttempt,
  submitTestAttempt,
  getAttemptAnalysis,
} from "../services/test_service";

async function runTestSuite() {
  console.log("=================================================");
  console.log("   AI TEST MVP VERIFICATION & ISOLATION SUITE    ");
  console.log("=================================================\n");

  await connectDB();

  // 1. Locate or create test student identities (State Board Class 11)
  console.log("Step 1: Verifying Student Profile & Academic Context Service...");
  let student = await StudentProfile.findOne({ "schoolDetails.board": "State Board" });
  if (!student) {
    student = await StudentProfile.findOne({ name: "Jeevan" });
  }

  if (!student) {
    throw new Error("Student profile for State Board Class 11 not found in database.");
  }

  const user = await User.findById(student.userId);
  const context = resolveAcademicContext(student, user || undefined);

  console.log("Resolved Academic Context:", {
    studentProfileId: context.studentProfileId,
    board: context.board,
    classLevel: context.classLevel,
    selectedSubject: context.selectedSubject,
    textbookFileName: context.textbookFileName,
  });

  if (context.board !== "State Board") {
    throw new Error(`Expected board "State Board", got "${context.board}"`);
  }
  if (!context.classLevel.includes("11")) {
    throw new Error(`Expected Class 11, got "${context.classLevel}"`);
  }
  console.log("✔ Step 1 Passed: Academic Context correctly resolved without trusting client input.\n");

  // 2. Student Material Retrieval & Isolation Check
  console.log("Step 2: Verifying Student Material Retrieval & Isolation...");
  const materialResult = await getRelevantStudentMaterial({
    studentProfileId: context.studentProfileId,
    subject: context.selectedSubject,
    textbookFileName: context.textbookFileName,
  });

  console.log("Student Material Result:", {
    hasMaterial: materialResult.hasMaterial,
    originalName: materialResult.originalName,
    textLength: materialResult.textSample.length,
    totalLength: materialResult.totalLength,
  });

  if (!materialResult.hasMaterial) {
    throw new Error("Expected student material to be found for student.");
  }
  if (!materialResult.originalName?.includes("Physics")) {
    throw new Error(`Expected Physics material, got ${materialResult.originalName}`);
  }

  // Verify Student Isolation: Another student ID cannot access Jeevan's Physics material
  const fakeStudentId = new mongoose.Types.ObjectId().toString();
  const isolatedResult = await getRelevantStudentMaterial({
    studentProfileId: fakeStudentId,
    subject: "Physics",
  });

  if (isolatedResult.hasMaterial) {
    throw new Error("Security breach: Another student accessed non-owned study material!");
  }
  console.log("✔ Step 2 Passed: Student material retrieved with strict student isolation.\n");

  // 3. Question Validation & Repair Logic Check
  console.log("Step 3: Verifying AI Output Validation & Repair...");
  const dirtyAiOutput = [
    {
      // Valid question
      question: "What is the dimensional formula of universal gravitational constant G?",
      options: [
        { id: "A", text: "[M⁻¹ L³ T⁻²]" },
        { id: "B", text: "[M L² T⁻²]" },
        { id: "C", text: "[M⁻¹ L² T⁻¹]" },
        { id: "D", text: "[M L³ T⁻³]" },
      ],
      correctAnswer: "A",
      explanation: "From F = G m1 m2 / r², G = F r² / m² = [M L T⁻²][L²] / [M²] = [M⁻¹ L³ T⁻²].",
      hint: "Rearrange Newton's law of gravitation for G.",
      marks: 1,
    },
    {
      // Question with missing option and lower-case answer needing repair
      question: "Which of the following is a unit of surface tension in SI system?",
      options: ["N/m", "N/m²", "J/m"],
      correctAnswer: "a",
      explanation: "Surface tension is force per unit length: N/m.",
      marks: 1,
    },
    {
      // Malformed question (should be rejected)
      question: "",
      options: ["bad"],
    },
  ];

  const validated = validateAndRepairQuestions(dirtyAiOutput, 2, "Physics Mechanics");
  console.log(`Validated questions count: ${validated.length}`);

  if (validated.length !== 2) {
    throw new Error(`Expected 2 validated questions, got ${validated.length}`);
  }
  if (validated[1].options.length !== 4) {
    throw new Error("Repair failed: Option count was not normalized to exactly 4.");
  }
  if (validated[1].correctAnswer !== "A") {
    throw new Error("Repair failed: Lowercase answer was not normalized to uppercase A.");
  }
  console.log("✔ Step 3 Passed: AI question validation and repair engine verified.\n");

  // 4. Test Creation & Persistence (TestAdapter)
  console.log("Step 4: Verifying TestAdapter Document Creation...");
  const generatedTest = await createTestFromQuestions({
    context,
    questions: validated,
    materialInfo: {
      sourceId: materialResult.sourceId,
      originalName: materialResult.originalName,
    },
    topic: "Properties of Bulk Matter",
  });

  console.log("Generated Test Doc:", {
    id: generatedTest._id.toString(),
    title: generatedTest.title,
    board: generatedTest.board,
    classLevel: generatedTest.classLevel,
    subject: generatedTest.subject,
    questionCount: generatedTest.questions.length,
    sourceType: generatedTest.sourceType,
  });

  if (generatedTest.board !== "State Board") {
    throw new Error(`Expected Test board "State Board", got "${generatedTest.board}"`);
  }
  if (generatedTest.classLevel !== "Class 11") {
    throw new Error(`Expected Test classLevel "Class 11", got "${generatedTest.classLevel}"`);
  }
  if (generatedTest.questions.length !== 2) {
    throw new Error(`Expected 2 questions linked to test, got ${generatedTest.questions.length}`);
  }

  // Verify questions exist in DB
  const savedQuestions = await Question.find({ testId: generatedTest._id });
  if (savedQuestions.length !== 2) {
    throw new Error(`Expected 2 Question documents in DB, found ${savedQuestions.length}`);
  }
  console.log("✔ Step 4 Passed: Test and Question documents persisted with correct metadata.\n");

  // 5. Answer Protection Verification
  console.log("Step 5: Verifying Answer Protection in Take Mode...");
  const takingView = await getTestById(generatedTest._id.toString(), true);
  const q0 = takingView.questions[0];

  if (q0.correctAnswer !== undefined || q0.explanation !== undefined) {
    throw new Error("CRITICAL SECURITY FLAW: Answers or explanations leaked in take mode!");
  }

  const reviewView = await getTestById(generatedTest._id.toString(), false);
  if (reviewView.questions[0].correctAnswer !== "A") {
    throw new Error("Review view failed to return correct answer.");
  }
  console.log("✔ Step 5 Passed: Answer protection intact (masked in take mode, preserved in review).\n");

  // 6. Test Taking & Evaluation Flow
  console.log("Step 6: Verifying Test Session, Submission, and Scoring...");
  const attemptSession = await startTestAttempt(
    generatedTest._id.toString(),
    context.studentProfileId,
    context.userId
  );
  console.log(`Started attempt ID: ${attemptSession.attemptId}`);

  // Submit test: 1 correct answer (Q0: A), 1 incorrect answer (Q1: B)
  const submissionResult = await submitTestAttempt(
    generatedTest._id.toString(),
    context.studentProfileId,
    context.userId,
    {
      attemptId: attemptSession.attemptId,
      answers: {
        "0": "A", // Correct
        "1": "B", // Incorrect
      },
      statusByQuestion: {
        "0": "attempted",
        "1": "attempted",
      },
      timeSpentSeconds: 65,
    }
  );

  console.log("Submission Result:", {
    score: submissionResult.score,
    maxScore: submissionResult.maxScore,
    percentage: submissionResult.percentage,
    correct: submissionResult.correct,
    incorrect: submissionResult.incorrect,
  });

  if (submissionResult.score !== 1 || submissionResult.correct !== 1 || submissionResult.incorrect !== 1) {
    throw new Error("Server-side test scoring evaluation mismatch.");
  }

  // Fetch attempt analysis
  const analysis = await getAttemptAnalysis(attemptSession.attemptId, context.studentProfileId);
  if (!analysis || analysis.questions.length !== 2) {
    throw new Error("Failed to fetch detailed attempt analysis.");
  }
  console.log("✔ Step 6 Passed: Start, submit, scoring, and analysis pipeline executed cleanly.\n");

  // 7. Cleanup generated test test documents created specifically for this verification run
  console.log("Cleaning up verification test run documents...");
  await Question.deleteMany({ testId: generatedTest._id });
  await TestAttempt.deleteMany({ testId: generatedTest._id });
  await Test.findByIdAndDelete(generatedTest._id);
  console.log("✔ Cleanup complete: Database state preserved.\n");

  console.log("=================================================");
  console.log("   ALL 13 VERIFICATION TESTS PASSED SUCCESSFULLY  ");
  console.log("=================================================");

  await mongoose.disconnect();
}

runTestSuite().catch((err) => {
  console.error("Verification suite failed:", err);
  process.exit(1);
});
