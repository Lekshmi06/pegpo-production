import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import Test from "../models/Test";
import { resolveAcademicContext } from "../services/academic_context_service";
import { getRelevantStudentMaterial } from "../services/student_material_service";
import { generateUniversalQuestions } from "../services/ai_question_generator";

async function verifyCurriculumAI() {
  console.log("=== VERIFYING CURRICULUM-BASED AI GENERATION ===");

  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log("Connected to MongoDB Atlas.");

  // 1. Fetch Jaya's user and profile
  const user = await User.findOne({ email: "jaya@mail.com" });
  if (!user) {
    throw new Error("Student jaya@mail.com not found in database!");
  }
  const profile = await StudentProfile.findOne({ userId: user._id });
  if (!profile) {
    throw new Error("Student profile for jaya@mail.com not found!");
  }

  console.log(`Found student: ${user.name} (${user.email})`);
  console.log(`Profile ID: ${profile._id}`);
  console.log(`Raw School Details:`, JSON.stringify(profile.schoolDetails));

  // 2. Verify Academic Context Resolution
  const context = resolveAcademicContext(profile, user);
  console.log("\n--- Resolved Academic Context ---");
  console.log(`Board: "${context.board}"`);
  console.log(`Class Level: "${context.classLevel}"`);
  console.log(`Academic Year: "${context.academicYear}"`);
  console.log(`Selected Subject: "${context.selectedSubject}"`);
  console.log(`Syllabus File: "${context.syllabusFileName}"`);

  if (context.board !== "State Board") throw new Error(`Expected board "State Board", got "${context.board}"`);
  if (context.classLevel !== "Class 7") throw new Error(`Expected class "Class 7", got "${context.classLevel}"`);
  if (context.selectedSubject !== "Basic Science") throw new Error(`Expected subject "Basic Science", got "${context.selectedSubject}"`);
  if (!context.syllabusFileName?.includes("Kerala_State_Board_Class_7_Syllabus")) {
    throw new Error(`Expected syllabus file to match Kerala Class 7 Syllabus, got "${context.syllabusFileName}"`);
  }
  console.log(" Academic Context Resolution: PASSED");

  // 3. Verify Student Material Retrieval
  console.log("\n--- Student Material Retrieval ---");
  const materialResult = await getRelevantStudentMaterial({
    studentProfileId: context.studentProfileId,
    subject: context.selectedSubject,
    syllabusFileName: context.syllabusFileName,
    topic: "Wonders of Visible Light",
  });

  console.log(`Has Material: ${materialResult.hasMaterial}`);
  console.log(`Source File Name: ${materialResult.originalName}`);
  console.log(`Total Length: ${materialResult.totalLength} chars`);
  console.log(`Text Sample Preview: ${materialResult.textSample.slice(0, 180)}...`);

  if (!materialResult.hasMaterial) throw new Error("Expected student to have uploaded curriculum material!");
  if (!materialResult.originalName?.includes("Class_7_Syllabus")) throw new Error("Expected Class 7 syllabus to be selected!");
  console.log(" Student Material Retrieval: PASSED");

  // 4. Verify AI Generation of Class 7 Questions
  console.log("\n--- AI Question Generation for Class 7 ---");
  const questions = await generateUniversalQuestions({
    context,
    materialText: materialResult.textSample,
    materialName: materialResult.originalName,
    questionCount: 5,
    difficulty: "medium",
    topic: "Wonders of Visible Light",
    mode: "practice",
  });

  console.log(`Generated ${questions.length} questions.`);
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`\nQ${i + 1}: ${q.question}`);
    console.log(`   Options: ${q.options.map(o => `(${o.id}) ${o.text}`).join(" | ")}`);
    console.log(`   Correct Answer: ${q.correctAnswer}`);
    console.log(`   Explanation: ${q.explanation}`);
    console.log(`   Hint: ${q.hint}`);
    if (q.stepByStepSolution) {
      console.log(`   Step-by-step: ${q.stepByStepSolution.join(" -> ")}`);
    }
    // Check that question does NOT mention senior secondary kinematics
    const qLower = q.question.toLowerCase();
    if (qLower.includes("cross product") || qLower.includes("impulse") || qLower.includes("projectile motion")) {
      throw new Error(`Question contains unrelated high-school physics: "${q.question}"`);
    }
  }

  if (questions.length !== 5) throw new Error(`Expected 5 questions, got ${questions.length}`);
  console.log(" AI Question Generation: PASSED");

  // 5. Test Live HTTP Endpoints
  console.log("\n--- Testing Live HTTP Endpoints on http://localhost:5000 ---");
  const authHeaders = {
    "Content-Type": "application/json",
    "x-user-id": user._id.toString(),
    "x-student-profile-id": profile._id.toString(),
  };

  // 5a. GET /api/tests/practice
  console.log("Testing GET /api/tests/practice...");
  const practiceRes = await fetch("http://localhost:5000/api/tests/practice?subject=Basic Science&count=4", {
    headers: authHeaders,
  });
  if (!practiceRes.ok) {
    const err = await practiceRes.text();
    throw new Error(`Practice endpoint returned status ${practiceRes.status}: ${err}`);
  }
  const practiceJson = await practiceRes.json();
  console.log(`Practice returned ${practiceJson.data?.length} problems.`);
  console.log(`Sample Practice Problem:`, practiceJson.data[0]?.text);
  if (!practiceJson.data || practiceJson.data.length === 0) throw new Error("Expected practice problems from backend!");
  console.log(" GET /api/tests/practice: PASSED");

  // 5b. GET /api/tests/quizzes
  console.log("\nTesting GET /api/tests/quizzes...");
  const quizRes = await fetch("http://localhost:5000/api/tests/quizzes?subject=Basic Science", {
    headers: authHeaders,
  });
  if (!quizRes.ok) {
    const err = await quizRes.text();
    throw new Error(`Quizzes endpoint returned status ${quizRes.status}: ${err}`);
  }
  const quizJson = await quizRes.json();
  console.log(`Quizzes returned ${quizJson.data?.length} quizzes.`);
  for (const qz of quizJson.data) {
    console.log(`   - ${qz.title} (${qz.chapter}): ${qz.questions?.length} questions`);
  }
  if (!quizJson.data || quizJson.data.length === 0) throw new Error("Expected quizzes from backend!");
  console.log(" GET /api/tests/quizzes: PASSED");

  // 5c. POST /api/tests/generate
  console.log("\nTesting POST /api/tests/generate...");
  const genRes = await fetch("http://localhost:5000/api/tests/generate", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      subject: "Basic Science",
      topic: "Wonders of Visible Light",
      questionCount: 5,
      difficulty: "easy",
    }),
  });
  if (!genRes.ok) {
    const err = await genRes.text();
    throw new Error(`Test generation endpoint returned status ${genRes.status}: ${err}`);
  }
  const genJson = await genRes.json();
  console.log("Generated Test Data:", genJson.data);
  if (!genJson.data?.testId) throw new Error("Expected generated testId!");

  // Verify test persisted in MongoDB
  const savedTest = await Test.findById(genJson.data.testId);
  if (!savedTest) throw new Error("Saved test not found in MongoDB!");
  console.log(`Verified test saved in MongoDB: "${savedTest.title}" (Board: ${savedTest.board}, Class: ${savedTest.classLevel}, Subject: ${savedTest.subject})`);
  if (savedTest.studentProfileId?.toString() !== profile._id.toString()) {
    throw new Error("Test not associated with studentProfileId!");
  }
  console.log(" POST /api/tests/generate & MongoDB Persistence: PASSED");

  // 5d. GET /api/tests (Catalog for Class 7 State Board)
  console.log("\nTesting GET /api/tests?board=State Board&classLevel=Class 7...");
  const testsRes = await fetch("http://localhost:5000/api/tests?board=State Board&classLevel=Class 7", {
    headers: authHeaders,
  });
  if (!testsRes.ok) {
    const err = await testsRes.text();
    throw new Error(`Tests catalog returned status ${testsRes.status}: ${err}`);
  }
  const testsJson = await testsRes.json();
  console.log(`Tests catalog returned ${testsJson.data?.length} tests.`);
  for (const t of testsJson.data) {
    console.log(`   - "${t.title}" (Board: ${t.board}, Class: ${t.classLevel}, Subject: ${t.subject})`);
    if (t.classLevel && !t.classLevel.includes("7") && t.board === "CBSE") {
      throw new Error(`Unrelated CBSE test found in student's catalog: "${t.title}"`);
    }
  }
  console.log(" GET /api/tests: PASSED");

  console.log("\n========================================================");
  console.log(" ALL CURRICULUM-BASED AI GENERATION TESTS PASSED!");
  console.log("========================================================");

  await mongoose.disconnect();
}

verifyCurriculumAI().catch((err) => {
  console.error("\n Verification failed:", err);
  process.exit(1);
});
