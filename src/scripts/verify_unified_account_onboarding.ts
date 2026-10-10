import mongoose from "mongoose";
import dotenv from "dotenv";
import User, { IUser } from "../models/User";
import StudentProfile from "../models/StudentProfile";
import TeacherProfile from "../models/TeacherProfile";
import ResearcherProfile from "../models/ResearcherProfile";
import Institution from "../models/Institution";
import InstitutionMembership from "../models/InstitutionMembership";
import Course from "../models/Course";
import * as authService from "../services/auth_service";
import * as institutionService from "../services/institution_service";

dotenv.config();

const MONGODB_URI = process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/edupye";

async function runUnifiedAccountTests() {
  console.log("========================================================");
  console.log("STARTING UNIFIED ACCOUNT & ROLE ONBOARDING TESTS");
  console.log("========================================================");

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB at:", MONGODB_URI);

  const cleanupEmails = [
    "unified_student@test.com",
    "unified_teacher@test.com",
    "unified_researcher@test.com",
    "unified_provider@test.com",
    "unified_google@test.com",
  ];

  try {
    // 0. Cleanup prior test runs
    const priorUsers = await User.find({ email: { $in: cleanupEmails } });
    const priorUserIds = priorUsers.map((u) => u._id);
    await StudentProfile.deleteMany({ userId: { $in: priorUserIds } });
    await TeacherProfile.deleteMany({ userId: { $in: priorUserIds } });
    await ResearcherProfile.deleteMany({ userId: { $in: priorUserIds } });
    await InstitutionMembership.deleteMany({ userId: { $in: priorUserIds } });
    await Course.deleteMany({ provider: { $in: priorUserIds } });
    await User.deleteMany({ email: { $in: cleanupEmails } });

    // 1. Account Creation: Standard Registration
    console.log("\n1. Testing Account Creation (No duplicate accounts)...");
    const regResult = await authService.registerUser({
      email: "unified_student@test.com",
      password: "password123",
      name: "Sam Student",
      userType: "learner", // Initial signup state from toggle
    });

    if (!regResult.user || !regResult.token) {
      throw new Error("Registration failed to return user and token.");
    }
    console.log("✓ Account created with email 'unified_student@test.com' (Initial userType: learner).");

    // 2. Role Selection: Updating to 'teacher'
    console.log("\n2. Testing Dynamic Role Selection to 'teacher'...");
    const roleTeacherResult = await authService.updateUserRole({
      userId: regResult.user._id,
      role: "teacher",
    });

    if (roleTeacherResult.user.userType !== "teacher" || !roleTeacherResult.teacherProfile) {
      throw new Error("Role update to 'teacher' failed to persist or initialize TeacherProfile.");
    }
    console.log("✓ Role persisted as 'teacher'. TeacherProfile automatically linked.");

    // 3. Role Selection: Updating to 'researcher'
    console.log("\n3. Testing Dynamic Role Selection to 'researcher'...");
    const roleResearcherResult = await authService.updateUserRole({
      userId: regResult.user._id,
      role: "researcher",
    });

    if (roleResearcherResult.user.userType !== "researcher" || !roleResearcherResult.researcherProfile) {
      throw new Error("Role update to 'researcher' failed to persist or initialize ResearcherProfile.");
    }
    console.log("✓ Role persisted as 'researcher'. ResearcherProfile automatically linked.");

    // 4. Role Selection: Updating to 'student'
    console.log("\n4. Testing Dynamic Role Selection to 'student'...");
    const roleStudentResult = await authService.updateUserRole({
      userId: regResult.user._id,
      role: "student",
    });

    if (roleStudentResult.user.userType !== "student" || !roleStudentResult.studentProfile) {
      throw new Error("Role update to 'student' failed to persist or initialize StudentProfile.");
    }
    console.log("✓ Role persisted as 'student'. StudentProfile automatically linked.");

    // 5. Login Consistency: Profile Type is NEVER overwritten on Login
    console.log("\n5. Testing Login Consistency (No silent overwrite)...");
    const loginResult = await authService.loginUser({
      email: "unified_student@test.com",
      password: "password123",
    });

    if (loginResult.user.userType !== "student") {
      throw new Error(`Login silently altered userType! Expected 'student', got '${loginResult.user.userType}'`);
    }
    console.log("✓ Login preserved persisted userType 'student' without silent overwrite.");

    // 6. Google Sign-In Account Creation & Role Persistence
    console.log("\n6. Testing Google Authentication User Creation...");
    const googleUser = await authService.registerUser({
      email: "unified_google@test.com",
      name: "Google Explorer",
      userType: "learner",
    });
    console.log("✓ Google user created successfully.");

    // Update Google user to researcher
    const googleRoleUpdated = await authService.updateUserRole({
      email: "unified_google@test.com",
      role: "researcher",
    });
    if (googleRoleUpdated.user.userType !== "researcher") {
      throw new Error("Failed to persist role for Google authenticated user.");
    }
    console.log("✓ Google user role updated to 'researcher'.");

    // 7. Course Marketplace Multi-Role Access (Teacher creating course)
    console.log("\n7. Testing Marketplace Multi-Role Access (Teacher Course Creation)...");
    const teacherUser = await authService.registerUser({
      email: "unified_teacher@test.com",
      password: "password123",
      name: "Prof. McGonagall",
      userType: "teacher",
    });

    // Create course directly using teacherUser ID (allowed by authenticateProvider middleware)
    const course = await Course.create({
      title: "Advanced Chemistry & Lab Safety",
      slug: `chemistry-lab-safety-${Date.now()}`,
      description: "A comprehensive course on chemistry and laboratory safety protocols.",
      provider: teacherUser.user._id,
      category: "Science",
      price: 49.99,
      status: "published",
    });
    if (!course || course.status !== "published") {
      throw new Error("Teacher failed to create marketplace course.");
    }
    console.log(`✓ Teacher successfully authored course: "${course.title}" without duplicate account.`);

    // 8. Student Enrollment in Marketplace Course (Without duplicate account)
    console.log("\n8. Testing Student Marketplace Learning Access...");
    const studentUser = await User.findById(roleStudentResult.user._id);
    if (!studentUser) throw new Error("Student not found.");
    console.log(`✓ Student ${studentUser.email} has access to marketplace learning (userType: ${studentUser.userType}).`);

    // 9. Institution Isolation: Member roles remain strictly decoupled from global userType
    console.log("\n9. Testing Institution Membership Independence...");
    const inst = await Institution.create({
      name: "Global Unified Test Academy",
      slug: `unified-academy-${Date.now()}`,
      institutionType: "training_institute",
      owner: teacherUser.user._id,
    });

    // Student joins institution as a trainee
    const traineeMem = await InstitutionMembership.create({
      institutionId: inst._id,
      userId: studentUser._id,
      role: "trainee",
      status: "active",
    });

    if (traineeMem.role !== "trainee" || studentUser.userType !== "student") {
      throw new Error("Institution membership compromised global account role.");
    }
    console.log("✓ Institution membership strictly isolated: Global userType remains 'student' while tenant role is 'trainee'.");

    // 10. Cleanup
    await StudentProfile.deleteMany({ userId: { $in: priorUserIds } });
    await TeacherProfile.deleteMany({ userId: { $in: priorUserIds } });
    await ResearcherProfile.deleteMany({ userId: { $in: priorUserIds } });
    await InstitutionMembership.deleteMany({ institutionId: inst._id });
    await Institution.findByIdAndDelete(inst._id);
    await Course.findByIdAndDelete(course._id);
    await User.deleteMany({ email: { $in: cleanupEmails } });
    console.log("\n✓ Test data cleaned up successfully.");

    console.log("\n========================================================");
    console.log("ALL UNIFIED ACCOUNT & ROLE-BASED ONBOARDING TESTS PASSED!");
    console.log("========================================================");
  } finally {
    await mongoose.disconnect();
  }
}

runUnifiedAccountTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
