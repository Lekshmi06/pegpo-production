import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import TeacherProfile from "../models/TeacherProfile";
import ResearcherProfile from "../models/ResearcherProfile";
import {
  registerUser,
  loginUser,
  authenticateWithGoogle,
  getCurrentUser,
  verifyGoogleIdToken,
} from "../services/auth_service";
import { verifySessionToken } from "../utils/token";

async function runGoogleAuthFlowVerification() {
  console.log("=============================================================");
  console.log("GOOGLE AUTHENTICATION (SIGN-IN & SIGN-UP) VERIFICATION SUITE");
  console.log("=============================================================");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(mongoUri);
  console.log("MongoDB connected successfully\n");

  const testSuffix = Date.now();
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
    // 1. Validation & Error Handling: Empty / Missing credential
    // -------------------------------------------------------------
    console.log("Test 1: Reject missing/empty Google credential");
    try {
      await authenticateWithGoogle({ credential: "" });
      assert(false, "Should have thrown error on empty credential");
    } catch (err: any) {
      assert(err.message.includes("required"), "Rejects empty credential with descriptive error");
    }

    // -------------------------------------------------------------
    // 2. Validation: Real Google Tokeninfo with fake token
    // -------------------------------------------------------------
    console.log("\nTest 2: Reject invalid/forged Google ID token");
    try {
      // Non-mock token will call Google tokeninfo endpoint
      await verifyGoogleIdToken("invalid-google-token-xyz-12345");
      assert(false, "Should have rejected fake Google token");
    } catch (err: any) {
      assert(
        err.message.includes("Invalid") ||
          err.message.includes("expired") ||
          err.message.includes("Failed to contact"),
        "Google token verification correctly rejects forged token"
      );
    }

    // -------------------------------------------------------------
    // 3. New User Google Sign-Up (Student Role)
    // -------------------------------------------------------------
    console.log("\nTest 3: Google Sign-Up for a new Student");
    const studentEmail = `gstudent.${testSuffix}@example.com`;
    const studentName = "Test Google Student";
    const studentMockToken = `test-mock-google-token:${studentEmail}:${studentName}:sub-${testSuffix}-1`;

    const studentResult = await authenticateWithGoogle({
      credential: studentMockToken,
      userType: "student",
    });

    assert(studentResult.isNewUser === true, "Marked as isNewUser: true");
    assert(studentResult.user.email === studentEmail, "Email matches verified Google email");
    assert(studentResult.user.name === studentName, "Name matches Google profile name");
    assert(studentResult.user.userType === "student", "Role assigned as student");
    assert(Boolean(studentResult.token), "Valid session JWT token generated");
    assert(Boolean(studentResult.studentProfile), "StudentProfile automatically created");

    const decodedStudentToken = verifySessionToken(studentResult.token);
    assert(decodedStudentToken?.userId === studentResult.user._id, "Session token decodes to correct user ID");

    // -------------------------------------------------------------
    // 4. Existing User Google Sign-In (Login for above Student)
    // -------------------------------------------------------------
    console.log("\nTest 4: Google Sign-In for existing Student");
    const existingStudentResult = await authenticateWithGoogle({
      credential: studentMockToken,
    });

    assert(existingStudentResult.isNewUser === false, "Marked as isNewUser: false (existing user login)");
    assert(existingStudentResult.user._id === studentResult.user._id, "Matches existing user MongoDB ID");
    assert(existingStudentResult.user.userType === "student", "Preserves existing student role");
    assert(Boolean(existingStudentResult.studentProfile), "Returns existing StudentProfile");

    // -------------------------------------------------------------
    // 5. New User Google Sign-Up (Teacher Role)
    // -------------------------------------------------------------
    console.log("\nTest 5: Google Sign-Up for a new Teacher");
    const teacherEmail = `gteacher.${testSuffix}@example.com`;
    const teacherName = "Prof. Google Teacher";
    const teacherMockToken = `test-mock-google-token:${teacherEmail}:${teacherName}:sub-${testSuffix}-2`;

    const teacherResult = await authenticateWithGoogle({
      credential: teacherMockToken,
      userType: "teacher",
    });

    assert(teacherResult.isNewUser === true, "Marked as isNewUser: true");
    assert(teacherResult.user.userType === "teacher", "Role assigned as teacher");
    assert(Boolean(teacherResult.teacherProfile), "TeacherProfile automatically created");
    assert(teacherResult.teacherProfile.teacherType === "institution", "TeacherProfile has default goal/type");

    // -------------------------------------------------------------
    // 6. New User Google Sign-Up (Researcher Role)
    // -------------------------------------------------------------
    console.log("\nTest 6: Google Sign-Up for a new Researcher");
    const researcherEmail = `gresearcher.${testSuffix}@example.com`;
    const researcherName = "Dr. Google Researcher";
    const researcherMockToken = `test-mock-google-token:${researcherEmail}:${researcherName}:sub-${testSuffix}-3`;

    const researcherResult = await authenticateWithGoogle({
      credential: researcherMockToken,
      userType: "researcher",
    });

    assert(researcherResult.isNewUser === true, "Marked as isNewUser: true");
    assert(researcherResult.user.userType === "researcher", "Role assigned as researcher");
    assert(Boolean(researcherResult.researcherProfile), "ResearcherProfile automatically created");

    // -------------------------------------------------------------
    // 7. Verify Existing Email/Password Auth Remains Unaffected
    // -------------------------------------------------------------
    console.log("\nTest 7: Ensure standard email/password registration and login work unaffected");
    const standardEmail = `standard.${testSuffix}@example.com`;
    const standardPassword = "SecurePassword123!";

    const standardRegister = await registerUser({
      email: standardEmail,
      password: standardPassword,
      name: "Standard Email User",
      userType: "student",
    });
    assert(Boolean(standardRegister.token), "Standard email registration succeeds");

    const standardLogin = await loginUser({
      email: standardEmail,
      password: standardPassword,
    });
    assert(standardLogin.user._id === standardRegister.user._id, "Standard email login succeeds");

    // Also verify that a user who registered with email/password can sign in with Google seamlessly
    const linkedMockToken = `test-mock-google-token:${standardEmail}:Standard Email User:sub-${testSuffix}-4`;
    const linkedGoogleResult = await authenticateWithGoogle({
      credential: linkedMockToken,
    });
    assert(linkedGoogleResult.isNewUser === false, "Google sign-in links seamlessly to existing email account");
    assert(linkedGoogleResult.user._id === standardRegister.user._id, "Preserves user ID and existing profile");

    // Clean up test data
    await User.deleteMany({
      email: {
        $in: [studentEmail, teacherEmail, researcherEmail, standardEmail],
      },
    });
    await StudentProfile.deleteMany({ userId: { $in: [studentResult.user._id, standardRegister.user._id] } });
    await TeacherProfile.deleteMany({ userId: teacherResult.user._id });
    await ResearcherProfile.deleteMany({ userId: researcherResult.user._id });

    console.log("\n=============================================================");
    console.log(`ALL GOOGLE AUTH VERIFICATION TESTS PASSED (${passed}/${passed})`);
    console.log("=============================================================");
  } catch (err: any) {
    console.error("\nTest suite failed with error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

runGoogleAuthFlowVerification().catch(console.error);
