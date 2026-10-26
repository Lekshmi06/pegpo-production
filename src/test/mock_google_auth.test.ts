import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import TeacherProfile from "../models/TeacherProfile";
import ResearcherProfile from "../models/ResearcherProfile";
import {
  authenticateMockGoogle,
  PREDEFINED_MOCK_GOOGLE_ACCOUNTS,
  registerUser,
  loginUser,
} from "../services/auth_service";
import { verifySessionToken } from "../utils/token";

async function runMockGoogleAuthVerification() {
  console.log("=============================================================");
  console.log("MOCK GOOGLE AUTHENTICATION TEST SUITE & SAFEGUARD VERIFICATION");
  console.log("=============================================================");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(mongoUri);
  console.log("MongoDB connected successfully\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`  FAIL: ${msg}`);
      failed++;
      throw new Error(`Assertion failed: ${msg}`);
    }
    console.log(`  PASS: ${msg}`);
    passed++;
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Production Safeguard Verification
    // -------------------------------------------------------------
    console.log("Test 1: Reject mock authentication when in production environment");
    const originalNodeEnv = process.env.NODE_ENV;
    const originalMockFlag = process.env.ENABLE_MOCK_GOOGLE_AUTH;

    try {
      process.env.NODE_ENV = "production";
      process.env.ENABLE_MOCK_GOOGLE_AUTH = "true";

      try {
        await authenticateMockGoogle({ accountId: "student" });
        assert(false, "Should have strictly rejected in production even if flag is true");
      } catch (err: any) {
        assert(
          err.message.includes("disabled in this environment"),
          "Rejects mock auth in production with HTTP 403 / disabled error"
        );
      }

      process.env.NODE_ENV = "development";
      process.env.ENABLE_MOCK_GOOGLE_AUTH = "false";
      try {
        await authenticateMockGoogle({ accountId: "student" });
        assert(false, "Should have rejected when ENABLE_MOCK_GOOGLE_AUTH is false");
      } catch (err: any) {
        assert(
          err.message.includes("disabled in this environment"),
          "Rejects mock auth when ENABLE_MOCK_GOOGLE_AUTH is false"
        );
      }
    } finally {
      process.env.NODE_ENV = originalNodeEnv || "development";
      process.env.ENABLE_MOCK_GOOGLE_AUTH = "true";
    }

    // -------------------------------------------------------------
    // Test 2: Spoofing Prevention / Domain Restriction
    // -------------------------------------------------------------
    console.log("\nTest 2: Reject arbitrary real domains to prevent account spoofing");
    try {
      await authenticateMockGoogle({ email: "admin@edupye.com", name: "Admin" });
      assert(false, "Should have rejected arbitrary production domain");
    } catch (err: any) {
      assert(
        err.message.includes("designated test domain"),
        "Enforces test domain restriction (@edupye.test or @example.com)"
      );
    }

    // -------------------------------------------------------------
    // Test 3: Authenticate Predefined Student
    // -------------------------------------------------------------
    console.log("\nTest 3: Authenticate predefined Student (Alex Mercer)");
    const studentRes = await authenticateMockGoogle({ accountId: "student" });
    assert(studentRes.user.email === "alex.student@edupye.test", "Email is alex.student@edupye.test");
    assert(studentRes.user.userType === "student", "Role is student");
    assert(Boolean(studentRes.token), "Valid session JWT token generated");
    assert(Boolean(studentRes.studentProfile), "StudentProfile initialized");

    const decoded = verifySessionToken(studentRes.token);
    assert(decoded?.userId === studentRes.user._id, "Session token signature is valid");

    // -------------------------------------------------------------
    // Test 4: Existing User Login Without Duplicate Creation
    // -------------------------------------------------------------
    console.log("\nTest 4: Re-authenticating existing test user logs them in without duplicates");
    const repeatRes = await authenticateMockGoogle({ accountId: "student" });
    assert(repeatRes.user._id === studentRes.user._id, "Same MongoDB ID preserved");
    assert(repeatRes.isNewUser === false, "Recognized as existing user (isNewUser: false)");

    const totalStudentUsers = await User.countDocuments({ email: "alex.student@edupye.test" });
    assert(totalStudentUsers === 1, "Exactly one user record exists in MongoDB (no duplicates)");

    // -------------------------------------------------------------
    // Test 5: Authenticate Predefined Teacher
    // -------------------------------------------------------------
    console.log("\nTest 5: Authenticate predefined Teacher (Prof. Sarah Jenkins)");
    const teacherRes = await authenticateMockGoogle({ accountId: "teacher" });
    assert(teacherRes.user.email === "sarah.teacher@edupye.test", "Email is sarah.teacher@edupye.test");
    assert(teacherRes.user.userType === "teacher", "Role is teacher");
    assert(Boolean(teacherRes.teacherProfile), "TeacherProfile initialized");

    // -------------------------------------------------------------
    // Test 6: Authenticate Predefined Researcher
    // -------------------------------------------------------------
    console.log("\nTest 6: Authenticate predefined Researcher (Dr. Elena Rostova)");
    const researcherRes = await authenticateMockGoogle({ accountId: "researcher" });
    assert(researcherRes.user.email === "elena.researcher@edupye.test", "Email is elena.researcher@edupye.test");
    assert(researcherRes.user.userType === "researcher", "Role is researcher");
    assert(Boolean(researcherRes.researcherProfile), "ResearcherProfile initialized");

    // -------------------------------------------------------------
    // Test 7: New User Simulation (Onboarding Flow Testing)
    // -------------------------------------------------------------
    console.log("\nTest 7: Simulate fresh new user registration");
    const newUserRes = await authenticateMockGoogle({
      accountId: "new_user",
      userType: "teacher",
      isNewUserTest: true,
    });
    assert(newUserRes.isNewUser === true, "Marked as isNewUser: true");
    assert(newUserRes.user.userType === "teacher", "Assigned intended role 'teacher'");
    assert(Boolean(newUserRes.teacherProfile), "TeacherProfile initialized for new user");

    // Clean up created new user test account
    await User.findByIdAndDelete(newUserRes.user._id);
    await TeacherProfile.deleteMany({ userId: newUserRes.user._id });

    // -------------------------------------------------------------
    // Test 8: Ensure Email/Password Auth Remains Functional
    // -------------------------------------------------------------
    console.log("\nTest 8: Verify email/password auth remains functional");
    const testEmail = `standard.mockcheck.${Date.now()}@example.com`;
    const regRes = await registerUser({
      email: testEmail,
      password: "TestPassword123!",
      name: "Standard Check",
      userType: "student",
    });
    assert(Boolean(regRes.token), "Standard registration succeeds");

    const logRes = await loginUser({
      email: testEmail,
      password: "TestPassword123!",
    });
    assert(logRes.user._id === regRes.user._id, "Standard login succeeds");

    await User.findByIdAndDelete(regRes.user._id);
    await StudentProfile.deleteMany({ userId: regRes.user._id });

    console.log("\n=============================================================");
    console.log(`ALL MOCK GOOGLE AUTH TESTS PASSED (${passed}/${passed})`);
    console.log("=============================================================");
  } catch (err: any) {
    console.error("\nTest suite failed with error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

runMockGoogleAuthVerification().catch(console.error);
