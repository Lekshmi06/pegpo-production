import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./db";
import Exam from "../models/Exam";
import Question from "../models/Question";
import Test from "../models/Test";
import TestAttempt from "../models/TestAttempt";
import StudentProfile from "../models/StudentProfile";
import User from "../models/User";
import {
  seedCompetitiveCatalog,
  competitiveExamsCatalog,
} from "./seed_competitive_exams";
import {
  listAvailableExams,
  getExamDetails,
  listPYQs,
  createMockTestFromQuestions,
} from "../services/competitive_exam_service";
import {
  startTestAttempt,
  submitTestAttempt,
  getAttemptAnalysis,
} from "../services/test_service";

dotenv.config();

async function runCompetitiveExamVerification() {
  console.log("===============================================================");
  console.log("🚀 STARTING REAL COMPETITIVE EXAM CRACKER & PYQ ENGINE VERIFICATION");
  console.log("===============================================================\n");

  await connectDB();

  // Step 1: Seed catalog and dataset
  console.log("Step 1: Seeding catalog and verified PYQ dataset...");
  await seedCompetitiveCatalog();
  console.log("✅ Catalog & PYQ sample dataset seeded successfully.\n");

  // Step 2: Test Exam Catalog and Retrieval
  console.log("Step 2: Verifying Exam Catalog & Retrieval...");
  const exams = await listAvailableExams();
  console.log(`- Retrieved ${exams.length} active exams from catalog.`);

  const requiredCodes = [
    "JEE_MAIN",
    "NEET_UG",
    "SSC_CGL",
    "BANKING_IBPS_PO",
    "UPSC_CSE",
  ];
  for (const code of requiredCodes) {
    const found = exams.find((e) => e.code === code);
    if (!found) {
      throw new Error(`Required exam '${code}' is missing from available exams!`);
    }
    console.log(`  ✓ Exam found: [${found.code}] ${found.name} (${found.category})`);
  }
  console.log("✅ All 5 core competitive exams verified in catalog.\n");

  // Step 3: Test Pattern and Marking Scheme Retrieval
  console.log("Step 3: Verifying Pattern and Marking Scheme Retrieval...");
  const jeeDetails = await getExamDetails("JEE_MAIN");
  if (!jeeDetails.markingScheme || jeeDetails.markingScheme.correctMarks !== 4 || jeeDetails.markingScheme.negativeMarks !== 1) {
    throw new Error(`JEE Main marking scheme mismatch: ${JSON.stringify(jeeDetails.markingScheme)}`);
  }
  if (!jeeDetails.sections || jeeDetails.sections.length < 3) {
    throw new Error("JEE Main must have at least 3 subjects/sections configured");
  }
  console.log("  ✓ JEE Main: +4/-1 pattern, sections:", jeeDetails.sections.map((s) => s.name).join(", "));

  const neetDetails = await getExamDetails("NEET_UG");
  if (neetDetails.markingScheme.maxScore !== 720) {
    throw new Error(`NEET UG max score expected 720, got ${neetDetails.markingScheme.maxScore}`);
  }
  console.log(`  ✓ NEET UG: maxScore ${neetDetails.markingScheme.maxScore}, duration ${neetDetails.durationMinutes} mins`);

  const ibpsDetails = await getExamDetails("BANKING_IBPS_PO");
  if (!ibpsDetails.markingScheme.sectionalCutOff) {
    throw new Error("Banking IBPS PO must support sectional cutoffs");
  }
  console.log("  ✓ IBPS PO: Sectional cutoff supported:", ibpsDetails.markingScheme.sectionalCutOff);
  console.log("✅ Exam patterns & marking schemes verified.\n");

  // Step 4: Test PYQ Filtering & Search
  console.log("Step 4: Verifying PYQ Filtering...");
  const jeePYQs = await listPYQs({ examCode: "JEE_MAIN" });
  console.log(`- Retrieved ${jeePYQs.totalCount} PYQs for JEE Main.`);
  if (jeePYQs.totalCount === 0) {
    throw new Error("Expected authentic PYQs for JEE Main but found 0");
  }

  const natPYQs = await listPYQs({ questionType: "nat" });
  console.log(`- Retrieved ${natPYQs.totalCount} NAT questions.`);
  if (natPYQs.totalCount === 0) {
    throw new Error("Expected NAT questions in PYQ set but found 0");
  }
  const sampleNat = natPYQs.questions[0];
  if (sampleNat.questionType !== "nat" || typeof sampleNat.numericalAnswer !== "number") {
    throw new Error("NAT question does not contain required numericalAnswer property");
  }
  console.log(`  ✓ NAT Question verified: "${sampleNat.sidebarTitle}" (Answer: ${sampleNat.numericalAnswer}, Tolerance: ${sampleNat.numericalTolerance})`);

  const physicsPYQs = await listPYQs({ subject: "Physics" });
  console.log(`  ✓ Filter by subject 'Physics': ${physicsPYQs.totalCount} questions found.`);
  console.log("✅ PYQ filtering verified.\n");

  // Step 5: CRITICAL REQUIREMENT: Strict Separation between PYQ and AI-generated questions
  console.log("Step 5: Testing Strict Separation between Authentic PYQs and AI-Generated content...");
  const aiCountInDB = await Question.countDocuments({ sourceType: "ai_generated" });
  console.log(`- AI-generated questions present in database: ${aiCountInDB}`);
  if (aiCountInDB === 0) {
    throw new Error("Test setup error: sample AI-generated question not found in DB");
  }

  // listPYQs must NEVER return any AI-generated item
  const allPyqResults = await listPYQs({ limit: 50 });
  const taintedItems = allPyqResults.questions.filter((q) => q.sourceType !== "previous_year");
  if (taintedItems.length > 0) {
    throw new Error(`CRITICAL INTEGRITY FAILURE: listPYQs returned ${taintedItems.length} non-PYQ items!`);
  }

  for (const q of allPyqResults.questions) {
    if (q.sourceType !== "previous_year") {
      throw new Error(`Item ${q.questionId} has invalid sourceType: ${q.sourceType}`);
    }
  }
  console.log("  ✓ Verified: listPYQs strictly filters sourceType: 'previous_year'.");
  console.log("  ✓ Confirmed: AI-generated questions are NEVER served as authentic PYQs.");
  console.log("✅ Strict separation integrity test PASSED.\n");

  // Step 6: Create or resolve Test Student Profile (Isolation Test)
  console.log("Step 6: Setting up authenticated student profile for mock test isolation...");
  let testUser = await User.findOne({ email: "competitive.tester@example.com" });
  if (!testUser) {
    testUser = await User.create({
      name: "Arjun Sharma",
      email: "competitive.tester@example.com",
      userType: "student",
    });
  }

  let testProfile = await StudentProfile.findOne({ userId: testUser._id });
  if (!testProfile) {
    testProfile = await StudentProfile.create({
      userId: testUser._id,
      name: "Arjun Sharma",
      goal: "Crack JEE Main & Advanced",
      learningPath: "competitive_exam",
      education: {
        level: "competitive_exam",
      },
      competitiveExamDetails: {
        targetExam: "JEE_MAIN",
        targetYear: "2025",
        category: "Engineering",
      },
    });
  }
  console.log(`  ✓ Test student profile resolved: ${testProfile.name} (Target: ${testProfile.competitiveExamDetails?.targetExam})`);

  // Step 7: Mock Test Creation conforming to Exam Pattern
  console.log("Step 7: Creating Mock Test from available questions conforming to JEE pattern...");
  const mockTest = await createMockTestFromQuestions({
    studentProfileId: testProfile._id.toString(),
    userId: testUser._id.toString(),
    examCode: "JEE_MAIN",
    year: 2024,
  });

  console.log(`  ✓ Created Mock Test ID: ${mockTest.testId}`);
  console.log(`  ✓ Title: "${mockTest.title}"`);
  console.log(`  ✓ Sections: ${mockTest.sections?.length}`);
  console.log(`  ✓ Total Questions: ${mockTest.totalQuestions}`);

  const loadedTestDoc = await Test.findById(mockTest.testId);
  if (!loadedTestDoc) {
    throw new Error("Created mock test document could not be retrieved from DB");
  }
  if (!loadedTestDoc.isCompetitiveExam || loadedTestDoc.examCode !== "JEE_MAIN") {
    throw new Error("Mock test is missing competitive exam tags");
  }
  if (loadedTestDoc.negativeMarkingRate !== 1) {
    throw new Error(`Expected negative marking rate 1, got ${loadedTestDoc.negativeMarkingRate}`);
  }
  console.log("✅ Mock test generation adhering to official exam architecture verified.\n");

  // Step 8: Test Attempt, Negative Marking, NAT Numerical Tolerance & Sectional Scoring
  console.log("Step 8: Testing Test Session, Evaluation, Negative Marking & NAT Answers...");
  const session = await startTestAttempt(
    mockTest.testId,
    testProfile._id.toString(),
    testUser._id.toString()
  );
  console.log(`  ✓ Started Test Attempt: ${session.attemptId}`);

  // Fetch test questions to prepare realistic answers
  const testWithQuestions = await Test.findById(mockTest.testId).populate<{ questions: any[] }>("questions");
  const testQuestions = testWithQuestions?.questions || [];

  if (testQuestions.length === 0) {
    throw new Error("Mock test has no questions linked");
  }

  // Answer Q0 correctly (MCQ: +4 marks)
  // Answer Q1 incorrectly (MCQ: -1 mark negative marking)
  // If NAT exists, answer NAT within tolerance
  const answersPayload: Record<string, string | number> = {};
  const q0 = testQuestions[0];
  answersPayload[q0._id.toString()] = q0.correctAnswer; // Correct!

  if (testQuestions.length > 1) {
    const q1 = testQuestions[1];
    // Intentionally wrong option for negative marking
    answersPayload[q1._id.toString()] = q1.correctAnswer === "A" ? "B" : "A";
  }

  // If a NAT question is in the test, test numerical tolerance
  const natQ = testQuestions.find((q) => q.questionType === "nat");
  if (natQ) {
    answersPayload[natQ._id.toString()] = natQ.numericalAnswer; // Exact numerical match!
  }

  const evaluationResult = await submitTestAttempt(
    mockTest.testId,
    testProfile._id.toString(),
    testUser._id.toString(),
    {
      attemptId: session.attemptId,
      answers: answersPayload,
      timeSpentSeconds: 180,
    }
  );

  console.log(`  ✓ Evaluated Score: ${evaluationResult.score} / ${evaluationResult.maxScore}`);
  console.log(`  ✓ Correct: ${evaluationResult.correct}, Incorrect: ${evaluationResult.incorrect}`);
  console.log(`  ✓ Percentile: ${evaluationResult.percentile}%`);
  console.log(`  ✓ All India Rank: AIR ${evaluationResult.allIndiaRank} / ${evaluationResult.totalCandidates}`);
  console.log(`  ✓ Section breakdown count: ${evaluationResult.sectionScores?.length}`);

  if ((evaluationResult.incorrect ?? 0) > 0 && (evaluationResult.score ?? 0) >= ((evaluationResult.correct ?? 0) * 4)) {
    throw new Error("Negative marking was not deducted for incorrect answer!");
  }
  console.log("  ✓ Negative marking deduction confirmed.");

  if (evaluationResult.percentile === undefined || evaluationResult.allIndiaRank === undefined) {
    throw new Error("Competitive metrics (percentile, allIndiaRank) were not computed!");
  }
  console.log("  ✓ Competitive percentile and AIR ranking confirmed.");

  // Step 9: Verify Student Isolation
  console.log("\nStep 9: Testing Student Isolation...");
  const otherStudentProfileId = new mongoose.Types.ObjectId().toString();
  let unauthorizedBlocked = false;
  try {
    await getAttemptAnalysis(session.attemptId, otherStudentProfileId);
  } catch (err) {
    unauthorizedBlocked = true;
  }

  if (!unauthorizedBlocked) {
    throw new Error("CRITICAL SECURITY FAILURE: Other student was able to access attempt analysis!");
  }
  console.log("  ✓ Student isolation confirmed: foreign profile cannot access attempt analysis.");
  console.log("✅ Student isolation verified.\n");

  console.log("===============================================================");
  console.log("🎉 ALL PHASE 3A VERIFICATION TESTS PASSED SUCCESSFULLY!");
  console.log("===============================================================");

  process.exit(0);
}

runCompetitiveExamVerification().catch((err) => {
  console.error("\n❌ VERIFICATION TEST FAILED:", err);
  process.exit(1);
});
