import dotenv from "dotenv";
import connectDB from "./db";
import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import {
  listAvailableExams,
  getExamDetails,
  createMockTestFromQuestions,
  listPYQs,
} from "../services/competitive_exam_service";
import {
  getTestById,
  startTestAttempt,
  submitTestAttempt,
  getAttemptAnalysis,
} from "../services/test_service";

dotenv.config();

async function verifyPhase3BFlows() {
  console.log("===============================================================");
  console.log("🚀 VERIFYING PHASE 3B END-TO-END FLOWS (FRONTEND API INTEGRATION)");
  console.log("===============================================================\n");

  await connectDB();

  // 1. Resolve student profile
  console.log("1. Resolving student profile with JEE target exam...");
  const user = await User.findOne({ email: "competitive.tester@example.com" });
  if (!user) throw new Error("Test user not found");

  const profile = await StudentProfile.findOne({ userId: user._id });
  if (!profile) throw new Error("Student profile not found");
  console.log(`✓ Student: ${profile.name}, Target: ${profile.competitiveExamDetails?.targetExam}`);

  // 2. Flow 1: Exam Catalog & Selection (JEE)
  console.log("\n2. Flow 1: Fetching available exams and selecting JEE Main...");
  const catalog = await listAvailableExams();
  console.log(`✓ Catalog loaded with ${catalog.length} exams.`);

  const jeeExam = catalog.find((e) => e.code === "JEE_MAIN");
  if (!jeeExam) throw new Error("JEE_MAIN not found in catalog");

  const jeeDetails = await getExamDetails(jeeExam.code);
  console.log(`✓ Retrieved JEE details: ${jeeDetails.name}, Duration: ${jeeDetails.durationMinutes}m, Max Score: ${jeeDetails.markingScheme.maxScore}`);
  console.log(`✓ Sections count: ${jeeDetails.sections.length}`);

  // 3. Flow 1: Mock Generation & Session
  console.log("\n3. Flow 1: Generating Mock Exam & Starting Attempt...");
  const generatedMock = await createMockTestFromQuestions({
    studentProfileId: profile._id.toString(),
    userId: user._id.toString(),
    examCode: "JEE_MAIN",
    year: 2024,
  });
  console.log(`✓ Mock Test Created: ID ${generatedMock.testId}, Title: "${generatedMock.title}"`);

  const attemptSession = await startTestAttempt(
    generatedMock.testId,
    profile._id.toString(),
    user._id.toString()
  );
  console.log(`✓ Attempt Started: ID ${attemptSession.attemptId}`);

  // 4. Flow 1: Masked questions in take mode
  console.log("\n4. Flow 1: Fetching questions in 'take' mode (Answers masked)...");
  const testData = await getTestById(generatedMock.testId, true);
  console.log(`✓ Retrieved ${testData.questions.length} questions.`);

  const sampleQ = testData.questions[0];
  if (sampleQ.correctAnswer !== undefined) {
    throw new Error("Answers were NOT masked in take mode!");
  }
  console.log(`✓ Confirmed answer protection: correctAnswer is masked.`);

  // Find a NAT question
  const natQ = testData.questions.find((q) => q.questionType === "nat");
  if (natQ) {
    console.log(`✓ NAT question verified: ID ${natQ.id}, Type: ${natQ.questionType}, Tolerance: ${natQ.numericalTolerance}`);
  }

  // 5. Flow 1: Submission & Analysis
  console.log("\n5. Flow 1: Submitting answers (MCQ + NAT) and generating Performance Analysis...");
  // Answer first question with option 'B'
  const answers: Record<string, string | number> = {};
  answers[sampleQ._id.toString()] = "B";

  if (natQ) {
    answers[natQ._id.toString()] = 72; // Exact NAT value
  }

  const analysis = await submitTestAttempt(
    generatedMock.testId,
    profile._id.toString(),
    user._id.toString(),
    {
      attemptId: attemptSession.attemptId,
      answers,
      timeSpentSeconds: 240,
    }
  );

  console.log(`✓ Score: ${analysis.score} / ${analysis.maxScore}`);
  console.log(`✓ Accuracy: ${analysis.accuracy}%, Percentile: ${analysis.percentile}%`);
  console.log(`✓ Est. AIR: #${analysis.allIndiaRank} out of ${analysis.totalCandidates?.toLocaleString()}`);
  console.log(`✓ Section Scores count: ${analysis.sectionScores?.length}`);
  if (analysis.sectionScores?.length !== jeeDetails.sections.length) {
    throw new Error(
      `Section scores count mismatch: Expected official pattern ${jeeDetails.sections.length} sections, but got ${analysis.sectionScores?.length}!`
    );
  }
  console.log(`✓ Verified official section structure alignment: ${jeeDetails.sections.length} sections across pattern, test, and attempt.`);

  // Verify Analysis Retrieval
  const savedAnalysis = await getAttemptAnalysis(attemptSession.attemptId, profile._id.toString());
  if (savedAnalysis.score !== analysis.score) {
    throw new Error("Saved analysis score does not match submitted score");
  }
  console.log("✓ Saved attempt analysis retrieved successfully.");

  // 6. Flow 2: PYQ Explorer & Filtering
  console.log("\n6. Flow 2: PYQ Explorer Filtering & Solution Inspection...");
  const pyqResults = await listPYQs({
    examCode: "JEE_MAIN",
    year: 2024,
    subject: "Physics",
  });
  console.log(`✓ Filtered PYQs found: ${pyqResults.totalCount}`);
  if (pyqResults.totalCount === 0) throw new Error("Expected PYQs for JEE Main 2024 Physics but got 0");

  const pyqItem = pyqResults.questions[0];
  console.log(`✓ Opened Question: "${pyqItem.sidebarTitle}"`);
  console.log(`  Source Reference: ${pyqItem.sourceReference}`);
  console.log(`  Verified Solution: ${pyqItem.explanation.slice(0, 80)}...`);
  console.log(`  Verified Answer: ${pyqItem.questionType === 'nat' ? pyqItem.numericalAnswer : pyqItem.correctAnswer}`);

  console.log("\n===============================================================");
  console.log("🎉 ALL PHASE 3B END-TO-END FLOWS VERIFIED SUCCESSFULLY!");
  console.log("===============================================================");
  process.exit(0);
}

verifyPhase3BFlows().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
