import mongoose from "mongoose";
import dotenv from "dotenv";
import connectDB from "./db";
import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import Test from "../models/Test";
import Question from "../models/Question";
import TestAttempt from "../models/TestAttempt";

dotenv.config();

const BASE_URL = "http://localhost:5000/api";

const runFullVerification = async () => {
  console.log("=================================================");
  console.log("   COMPREHENSIVE TEST MODULE VERIFICATION SUITE   ");
  console.log("=================================================\n");

  await connectDB();

  // 1. Setup two distinct student identities to test isolation and real student identity
  let studentA_User = await User.findOne({ email: "student_alpha@edupye.com" });
  if (!studentA_User) {
    studentA_User = await User.create({
      email: "student_alpha@edupye.com",
      name: "Alpha Student",
      userType: "student",
      language: "English",
    });
  }

  let studentA_Profile = await StudentProfile.findOne({ userId: studentA_User._id });
  if (!studentA_Profile) {
    studentA_Profile = await StudentProfile.create({
      userId: studentA_User._id,
      name: "Alpha Student",
      education: {
        level: "school",
        institution: "Delhi Public School",
        board: "CBSE",
        classLevel: "Class 10",
      },
      schoolDetails: {
        schoolName: "Delhi Public School",
        board: "CBSE",
        classLevel: "Class 10",
        studyMode: "full_syllabus",
        selectedSubject: "Science",
      },
    });
  }

  let studentB_User = await User.findOne({ email: "student_beta@edupye.com" });
  if (!studentB_User) {
    studentB_User = await User.create({
      email: "student_beta@edupye.com",
      name: "Beta Student",
      userType: "student",
      language: "English",
    });
  }

  let studentB_Profile = await StudentProfile.findOne({ userId: studentB_User._id });
  if (!studentB_Profile) {
    studentB_Profile = await StudentProfile.create({
      userId: studentB_User._id,
      name: "Beta Student",
      education: {
        level: "school",
        institution: "St. Xavier's",
        board: "ICSE",
        classLevel: "Class 10",
      },
      schoolDetails: {
        schoolName: "St. Xavier's",
        board: "ICSE",
        classLevel: "Class 10",
        studyMode: "full_syllabus",
        selectedSubject: "Mathematics",
      },
    });
  }

  const tokenA = studentA_User._id.toString();
  const profileIdA = studentA_Profile._id.toString();
  const tokenB = studentB_User._id.toString();
  const profileIdB = studentB_Profile._id.toString();

  console.log(`[Setup] Student Alpha ID: ${tokenA}, Profile: ${profileIdA} (${studentA_Profile.education?.board})`);
  console.log(`[Setup] Student Beta ID:  ${tokenB}, Profile: ${profileIdB} (${studentB_Profile.education?.board})\n`);

  let testsPassed = 0;
  let testsFailed = 0;

  const assert = (condition: boolean, testName: string, detail?: string) => {
    if (condition) {
      console.log(`  PASS: ${testName} ${detail ? `(${detail})` : ""}`);
      testsPassed++;
    } else {
      console.error(`  FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
      testsFailed++;
    }
  };

  // -------------------------------------------------------------
  // Test 1: Authentication & Identity Validation
  // -------------------------------------------------------------
  console.log("--- 1. Testing Student Authentication & Rejection of Invalid Credentials ---");

  // Invalid Token
  const resBadToken = await fetch(`${BASE_URL}/tests/attempts/my-history`, {
    headers: {
      Authorization: "Bearer 507f1f77bcf86cd799439099", // Non-existent user
      "x-user-id": "507f1f77bcf86cd799439099",
    },
  });
  assert(
    resBadToken.status === 401,
    "Reject non-existent authentication token with 401",
    `Status: ${resBadToken.status}`
  );

  // Invalid Profile ID
  const resBadProfile = await fetch(`${BASE_URL}/tests/attempts/my-history`, {
    headers: {
      "x-student-profile-id": "507f1f77bcf86cd799439099",
    },
  });
  assert(
    resBadProfile.status === 401,
    "Reject non-existent student profile ID with 401",
    `Status: ${resBadProfile.status}`
  );

  // Valid Student Alpha
  const resAuthA = await fetch(`${BASE_URL}/tests/attempts/my-history`, {
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "x-student-profile-id": profileIdA,
    },
  });
  assert(
    resAuthA.status === 200,
    "Accept valid student credentials for Alpha",
    `Status: ${resAuthA.status}`
  );

  // -------------------------------------------------------------
  // Test 2: Test Catalog & Syllabus Filtering
  // -------------------------------------------------------------
  console.log("\n--- 2. Testing Test Catalog & Syllabus Filtering ---");

  // Fetch with CBSE & Class 10
  const resCbse = await fetch(`${BASE_URL}/tests?board=CBSE&classLevel=Class%2010`);
  const cbseJson = await resCbse.json();
  assert(
    resCbse.status === 200 && Array.isArray(cbseJson.data) && cbseJson.data.length > 0,
    "Fetch CBSE Class 10 tests from MongoDB",
    `Found: ${cbseJson.data?.length} tests`
  );

  const availableTests = cbseJson.data.filter((t: any) => !t.isLocked);
  const lockedTests = cbseJson.data.filter((t: any) => t.isLocked);
  assert(availableTests.length > 0, "Available tests returned correctly", `Count: ${availableTests.length}`);
  assert(lockedTests.length > 0, "Locked tests returned correctly", `Count: ${lockedTests.length}`);

  const activeTestItem = availableTests[0];
  const lockedTestItem = lockedTests[0];

  // -------------------------------------------------------------
  // Test 3: Answer Masking During Active Test Taking
  // -------------------------------------------------------------
  console.log("\n--- 3. Testing Test Question Fetching & Answer Masking ---");

  const resTestPreview = await fetch(`${BASE_URL}/tests/${activeTestItem.id}`);
  const previewJson = await resTestPreview.json();
  const resTestTake = await fetch(`${BASE_URL}/tests/${activeTestItem.id}?mode=take`);
  const takeJson = await resTestTake.json();

  assert(
    resTestTake.status === 200 && takeJson.data.questions.length > 0,
    "Fetch questions for active test",
    `Question count: ${takeJson.data.questions.length}`
  );

  const firstQuestionTake = takeJson.data.questions[0];
  assert(
    firstQuestionTake.correctAnswer === undefined,
    "Verify correctAnswer is NOT exposed in take mode",
    `correctAnswer: ${firstQuestionTake.correctAnswer}`
  );
  assert(
    firstQuestionTake.explanation === undefined,
    "Verify explanation is NOT exposed in take mode",
    `explanation: ${firstQuestionTake.explanation}`
  );

  // -------------------------------------------------------------
  // Test 4: Locked Test Protection
  // -------------------------------------------------------------
  console.log("\n--- 4. Testing Locked Test Protection ---");

  const resStartLocked = await fetch(`${BASE_URL}/tests/${lockedTestItem.id}/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "x-student-profile-id": profileIdA,
    },
  });
  assert(
    resStartLocked.status === 403,
    "Reject start attempt on locked test with 403 Forbidden",
    `Status: ${resStartLocked.status}`
  );

  // -------------------------------------------------------------
  // Test 5: Start Test Session for Student Alpha
  // -------------------------------------------------------------
  console.log("\n--- 5. Testing Start & Resume Test Session ---");

  const resStartA = await fetch(`${BASE_URL}/tests/${activeTestItem.id}/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "x-student-profile-id": profileIdA,
    },
  });
  const startJsonA = await resStartA.json();
  assert(
    resStartA.status === 200 && startJsonA.data.attemptId,
    "Start new test attempt for Student Alpha",
    `Attempt ID: ${startJsonA.data?.attemptId}`
  );
  const attemptIdA = startJsonA.data.attemptId;

  // Resuming active attempt
  const resResumeA = await fetch(`${BASE_URL}/tests/${activeTestItem.id}/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "x-student-profile-id": profileIdA,
    },
  });
  const resumeJsonA = await resResumeA.json();
  assert(
    resumeJsonA.data.attemptId === attemptIdA,
    "Resume existing in-progress attempt returns same attempt ID",
    `Resumed Attempt ID: ${resumeJsonA.data.attemptId}`
  );

  // -------------------------------------------------------------
  // Test 6: Submit Test with Mixed Responses (Answered, Revise, Skipped)
  // -------------------------------------------------------------
  console.log("\n--- 6. Testing Answer Submission & Server Evaluation ---");

  const questionsList = previewJson.data.questions;
  // Let's answer Q1 correctly (B), Q2 incorrectly (A), mark Q3 as Revise Later (unanswered), leave rest skipped
  const answersPayload = {
    0: "B", // Correct for Test 1 Q1
    1: "A", // Incorrect for Test 1 Q2
  };
  const statusPayload = {
    0: "attempted",
    1: "attempted",
    2: "revise", // Marked for revise later
    3: "skipped",
    4: "skipped",
  };

  const resSubmit = await fetch(`${BASE_URL}/tests/${activeTestItem.id}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
      "x-student-profile-id": profileIdA,
    },
    body: JSON.stringify({
      attemptId: attemptIdA,
      answers: answersPayload,
      statusByQuestion: statusPayload,
      timeSpentSeconds: 120,
    }),
  });

  const submitJson = await resSubmit.json();
  assert(
    resSubmit.status === 200 && submitJson.success,
    "Submit test attempt evaluated successfully",
    `Score: ${submitJson.data?.score}/${submitJson.data?.maxScore}`
  );

  const evalResult = submitJson.data;
  const totalQ = questionsList.length;
  const expectedPercentage = Math.round((1 / totalQ) * 100);
  const expectedSkipped = Math.max(0, totalQ - 2 - 1); // totalQ - 2 attempted - 1 revise

  assert(evalResult.attempted === 2, "Attempted count is 2", `Evaluated: ${evalResult.attempted}`);
  assert(evalResult.correct === 1, "Correct count is 1", `Evaluated: ${evalResult.correct}`);
  assert(evalResult.incorrect === 1, "Incorrect count is 1", `Evaluated: ${evalResult.incorrect}`);
  assert(evalResult.reviseLater === 1, "Revise count is 1", `Evaluated: ${evalResult.reviseLater}`);
  assert(
    evalResult.skipped === expectedSkipped,
    `Skipped count is ${expectedSkipped}`,
    `Evaluated: ${evalResult.skipped}`
  );
  assert(
    evalResult.percentage === expectedPercentage,
    `Percentage is ${expectedPercentage}% (1 mark out of ${totalQ})`,
    `Percentage: ${evalResult.percentage}%`
  );
  assert(evalResult.accuracy === 50, "Accuracy is 50% (1 correct out of 2 attempted)", `Accuracy: ${evalResult.accuracy}%`);

  // Verify questions have explanations in evaluation
  assert(
    Boolean(evalResult.questions[0].explanation && evalResult.questions[0].correctAnswer),
    "Submitted analysis includes explanation and correct answers",
    `Q1 explanation length: ${evalResult.questions[0].explanation?.length}`
  );

  // -------------------------------------------------------------
  // Test 7: Idempotency (Submit only once)
  // -------------------------------------------------------------
  console.log("\n--- 7. Testing Idempotency (Prevent Duplicate Submission) ---");

  const resSubmitAgain = await fetch(`${BASE_URL}/tests/${activeTestItem.id}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
      "x-student-profile-id": profileIdA,
    },
    body: JSON.stringify({
      attemptId: attemptIdA,
      answers: answersPayload,
      statusByQuestion: statusPayload,
      timeSpentSeconds: 120,
    }),
  });
  const submitAgainJson = await resSubmitAgain.json();
  assert(
    resSubmitAgain.status === 200 && submitAgainJson.data.attemptId === attemptIdA,
    "Submitting already completed attempt returns existing evaluation without error",
    `Score preserved: ${submitAgainJson.data.score}/${submitAgainJson.data.maxScore}`
  );

  // -------------------------------------------------------------
  // Test 8: Student Identity Isolation (Student B cannot access Student A's attempt)
  // -------------------------------------------------------------
  console.log("\n--- 8. Testing Student Identity Isolation ---");

  const resStudentBAccess = await fetch(`${BASE_URL}/tests/attempts/${attemptIdA}`, {
    headers: {
      Authorization: `Bearer ${tokenB}`,
      "x-student-profile-id": profileIdB,
    },
  });
  assert(
    resStudentBAccess.status === 403,
    "Student B receives 403 Forbidden trying to view Student A's attempt",
    `Status: ${resStudentBAccess.status}`
  );

  const resStudentAAccess = await fetch(`${BASE_URL}/tests/attempts/${attemptIdA}`, {
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "x-student-profile-id": profileIdA,
    },
  });
  assert(
    resStudentAAccess.status === 200,
    "Student A can view their own attempt analysis",
    `Status: ${resStudentAAccess.status}`
  );

  // -------------------------------------------------------------
  // Test 9: Edge Cases (Invalid Test ID, Invalid Attempt ID)
  // -------------------------------------------------------------
  console.log("\n--- 9. Testing Edge Cases (Invalid IDs) ---");

  const resBadTestId = await fetch(`${BASE_URL}/tests/not-a-real-id`);
  assert(
    resBadTestId.status === 400,
    "Invalid test ID format returns 400 Bad Request",
    `Status: ${resBadTestId.status}`
  );

  const resNonExistentTest = await fetch(`${BASE_URL}/tests/507f1f77bcf86cd799439011`);
  assert(
    resNonExistentTest.status === 404,
    "Non-existent test ID returns 404 Not Found",
    `Status: ${resNonExistentTest.status}`
  );

  const resBadAttemptId = await fetch(`${BASE_URL}/tests/attempts/not-a-real-attempt-id`, {
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "x-student-profile-id": profileIdA,
    },
  });
  assert(
    resBadAttemptId.status === 400,
    "Invalid attempt ID format returns 400 Bad Request",
    `Status: ${resBadAttemptId.status}`
  );

  const resNonExistentAttempt = await fetch(`${BASE_URL}/tests/attempts/507f1f77bcf86cd799439011`, {
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "x-student-profile-id": profileIdA,
    },
  });
  assert(
    resNonExistentAttempt.status === 404,
    "Non-existent attempt ID returns 404 Not Found",
    `Status: ${resNonExistentAttempt.status}`
  );

  // -------------------------------------------------------------
  // Test 10: Additional Edge Cases (100% Answered & 0% Answered)
  // -------------------------------------------------------------
  console.log("\n--- 10. Testing All-Answered and Zero-Answered Tests ---");

  // Zero-answered test:
  const resStartEmpty = await fetch(`${BASE_URL}/tests/${activeTestItem.id}/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenB}`,
      "x-student-profile-id": profileIdB,
    },
  });
  const startEmptyJson = await resStartEmpty.json();

  const resSubmitEmpty = await fetch(`${BASE_URL}/tests/${activeTestItem.id}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenB}`,
      "x-student-profile-id": profileIdB,
    },
    body: JSON.stringify({
      attemptId: startEmptyJson.data.attemptId,
      answers: {},
      statusByQuestion: {},
      timeSpentSeconds: 30,
    }),
  });
  const emptyJson = await resSubmitEmpty.json();
  assert(
    resSubmitEmpty.status === 200 && emptyJson.data.score === 0,
    "Zero answers submitted evaluates to score 0 with 0% and 0 accuracy",
    `Score: ${emptyJson.data.score}, Skipped: ${emptyJson.data.skipped}, Accuracy: ${emptyJson.data.accuracy}%`
  );
  assert(
    emptyJson.data.skipped === totalQ,
    "All questions correctly marked as skipped when zero answers submitted",
    `Skipped: ${emptyJson.data.skipped}/${totalQ}`
  );

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log("\n=================================================");
  console.log(`VERIFICATION SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("=================================================");

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runFullVerification().catch((err) => {
  console.error("Verification suite encountered an error:", err);
  process.exit(1);
});
