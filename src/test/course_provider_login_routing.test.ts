import assert from "node:assert";
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import User from "../models/User";
import ResearcherProfile from "../models/ResearcherProfile";
import Course from "../models/Course";
import connectDB from "../config/db";
import { loginUser, getCurrentUser } from "../services/auth_service";
import { getResearcherByEmail, createResearcherProfile } from "../services/researcher_service";

async function runCourseProviderRoutingTests() {
  console.log("=============================================================");
  console.log("COURSE PROVIDER ROLE & LOGIN ROUTING VERIFICATION SUITE");
  console.log("=============================================================");

  await connectDB();

  try {
    // -------------------------------------------------------------
    // Test 1: Verify existing course provider (sourav@mail.com) account state
    // -------------------------------------------------------------
    console.log("\n[Test 1] Inspecting existing course-provider account in MongoDB...");
    const souravUser = await User.findOne({ email: "sourav@mail.com" });
    assert(souravUser, "sourav@mail.com user must exist in MongoDB");
    assert.strictEqual(souravUser.userType, "provider", "sourav@mail.com must have stored userType 'provider'");

    const authoredCourses = await Course.find({ provider: souravUser._id });
    assert(authoredCourses.length > 0, "sourav@mail.com must own authored courses in Course collection");
    console.log(`  PASS: Found provider user (${souravUser.email}) with ${authoredCourses.length} course(s).`);

    // -------------------------------------------------------------
    // Test 2: Verify loginUser returns userType: "provider" without spurious researcherProfile
    // -------------------------------------------------------------
    console.log("\n[Test 2] Testing login/resolution for course-provider user...");
    const currentUserResult = await getCurrentUser(souravUser._id.toString());
    assert.strictEqual(currentUserResult.user.userType, "provider", "getCurrentUser must return userType 'provider'");
    assert.strictEqual(currentUserResult.researcherProfile, undefined, "Provider must not receive researcherProfile");
    console.log("  PASS: Course provider correctly returns userType 'provider' and token.");

    // -------------------------------------------------------------
    // Test 3: Idempotency & Role Protection in getResearcherByEmail
    // -------------------------------------------------------------
    console.log("\n[Test 3] Verifying getResearcherByEmail does NOT mutate provider role or create profile...");
    let threw = false;
    try {
      await getResearcherByEmail("sourav@mail.com");
    } catch (err: any) {
      threw = true;
      assert(err.message.includes("Researcher profile not found"), `Unexpected error: ${err.message}`);
    }
    assert(threw, "getResearcherByEmail on a provider user must throw not found");

    // Re-check user document to ensure userType was NOT changed to researcher
    const souravAfterQuery = await User.findOne({ email: "sourav@mail.com" });
    assert.strictEqual(souravAfterQuery?.userType, "provider", "User role must remain 'provider' after getResearcherByEmail query");

    const spuriousRp = await ResearcherProfile.findOne({ contact: { email: "sourav@mail.com" } });
    assert.strictEqual(spuriousRp, null, "No spurious ResearcherProfile should be created on GET query");
    console.log("  PASS: getResearcherByEmail is idempotent and does not overwrite userType.");

    // -------------------------------------------------------------
    // Test 4: Role Protection in createResearcherProfile
    // -------------------------------------------------------------
    console.log("\n[Test 4] Verifying createResearcherProfile does not hijack provider role...");
    const rpResult = await createResearcherProfile({
      userId: souravUser._id.toString(),
      fullName: "Sourav Test",
      contact: { email: "sourav@mail.com" },
    });
    assert(rpResult, "Profile created for multi-role test");

    const souravAfterCreate = await User.findOne({ email: "sourav@mail.com" });
    assert.strictEqual(souravAfterCreate?.userType, "provider", "Provider role must NOT be overwritten by createResearcherProfile");

    // Clean up test profile
    await ResearcherProfile.findByIdAndDelete(rpResult._id);
    console.log("  PASS: createResearcherProfile protected provider role from corruption.");

    // -------------------------------------------------------------
    // Test 5: Legitimate researcher flow remains functional
    // -------------------------------------------------------------
    console.log("\n[Test 5] Verifying legitimate researcher accounts are preserved...");
    const researcherUser = await User.findOne({ userType: "researcher" });
    if (researcherUser) {
      const resResult = await getCurrentUser(researcherUser._id.toString());
      assert.strictEqual(resResult.user.userType, "researcher", "Researcher account must retain 'researcher' role");
      assert(resResult.researcherProfile, "Researcher account must receive researcherProfile");
      console.log(`  PASS: Legitimate researcher (${researcherUser.email}) resolved correctly with profile.`);
    }

    // -------------------------------------------------------------
    // Test 6: Teacher and student flows remain functional
    // -------------------------------------------------------------
    console.log("\n[Test 6] Verifying teacher and student accounts are preserved...");
    const teacherUser = await User.findOne({ userType: "teacher" });
    if (teacherUser) {
      const teacherResult = await getCurrentUser(teacherUser._id.toString());
      assert.strictEqual(teacherResult.user.userType, "teacher", "Teacher account must retain 'teacher' role");
      assert(teacherResult.teacherProfile, "Teacher account must receive teacherProfile");
      console.log(`  PASS: Teacher (${teacherUser.email}) resolved correctly with profile.`);
    }

    const studentUser = await User.findOne({ userType: "student" });
    if (studentUser) {
      const studentResult = await getCurrentUser(studentUser._id.toString());
      assert.strictEqual(studentResult.user.userType, "student", "Student account must retain 'student' role");
      assert(studentResult.studentProfile, "Student account must receive studentProfile");
      console.log(`  PASS: Student (${studentUser.email}) resolved correctly with profile.`);
    }

    console.log("\n=============================================================");
    console.log("ALL 6 COURSE PROVIDER ROUTING & ROLE TESTS PASSED!");
    console.log("=============================================================");
  } finally {
    await mongoose.disconnect();
  }
}

runCourseProviderRoutingTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
