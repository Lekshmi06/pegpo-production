import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import TeacherProfile from "../models/TeacherProfile";
import ResearcherProfile from "../models/ResearcherProfile";
import { registerUser, loginUser, updateUserRole, getCurrentUser } from "../services/auth_service";

async function runAllModulesAuthFlowVerification() {
  console.log("=============================================================");
  console.log("ALL MODULES LOGIN & ACCOUNT CREATION FLOW VERIFICATION SUITE");
  console.log("=============================================================");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(mongoUri);
  console.log("MongoDB connected successfully\n");

  const testSuffix = Date.now();
  const testAccounts = [
    {
      module: "Exam Prep / Academic Student",
      role: "student" as const,
      email: `test.student.${testSuffix}@example.com`,
      password: "TestPassword123!",
      expectedProfileType: "student",
    },
    {
      module: "Teacher / Faculty",
      role: "teacher" as const,
      email: `test.teacher.${testSuffix}@example.com`,
      password: "TestPassword123!",
      expectedProfileType: "teacher",
    },
    {
      module: "Academic Researcher",
      role: "researcher" as const,
      email: `test.researcher.${testSuffix}@example.com`,
      password: "TestPassword123!",
      expectedProfileType: "researcher",
    },
    {
      module: "Course Provider / Creator",
      role: "provider" as const,
      email: `test.provider.${testSuffix}@example.com`,
      password: "TestPassword123!",
      expectedProfileType: "none",
    },
    {
      module: "Online Learner",
      role: "learner" as const,
      email: `test.learner.${testSuffix}@example.com`,
      password: "TestPassword123!",
      expectedProfileType: "none",
    },
    {
      module: "Company / Corporate Academy",
      role: "company" as const,
      email: `test.company.${testSuffix}@example.com`,
      password: "TestPassword123!",
      expectedProfileType: "none",
    },
  ];

  const createdUserIds: mongoose.Types.ObjectId[] = [];

  try {
    // -------------------------------------------------------------
    // PHASE 1: ACCOUNT CREATION FOR EVERY MODULE
    // -------------------------------------------------------------
    console.log("--- PHASE 1: ACCOUNT CREATION FOR EVERY MODULE ---");
    for (const acc of testAccounts) {
      console.log(`[Account Creation] Registering ${acc.module} (${acc.role})...`);
      const regResult = await registerUser({
        email: acc.email,
        password: acc.password,
        name: `Test ${acc.role.toUpperCase()}`,
        userType: acc.role,
      });

      if (!regResult.token) {
        throw new Error(`Token missing from registration result for ${acc.role}`);
      }
      if (regResult.user.userType !== acc.role) {
        throw new Error(
          `UserType mismatch: expected ${acc.role}, got ${regResult.user.userType}`
        );
      }

      const dbUser = await User.findOne({ email: acc.email });
      if (!dbUser) {
        throw new Error(`User not saved in MongoDB for ${acc.email}`);
      }
      createdUserIds.push(dbUser._id);

      // Verify associated profiles
      if (acc.expectedProfileType === "student") {
        const studentProfile = await StudentProfile.findOne({ userId: dbUser._id });
        if (!studentProfile) throw new Error("StudentProfile was not created!");
        console.log(`  PASS: User ${acc.email} created with StudentProfile.`);
      } else if (acc.expectedProfileType === "teacher") {
        const teacherProfile = await TeacherProfile.findOne({ userId: dbUser._id });
        if (!teacherProfile) throw new Error("TeacherProfile was not created!");
        console.log(`  PASS: User ${acc.email} created with TeacherProfile.`);
      } else if (acc.expectedProfileType === "researcher") {
        const researcherProfile = await ResearcherProfile.findOne({ userId: dbUser._id });
        if (!researcherProfile) throw new Error("ResearcherProfile was not created!");
        console.log(`  PASS: User ${acc.email} created with ResearcherProfile.`);
      } else {
        console.log(`  PASS: User ${acc.email} created as specialized role ${acc.role}.`);
      }
    }

    // -------------------------------------------------------------
    // PHASE 2: LOGIN FLOW FOR EVERY MODULE
    // -------------------------------------------------------------
    console.log("\n--- PHASE 2: LOGIN FLOW FOR EVERY MODULE ---");
    for (const acc of testAccounts) {
      console.log(`[Login Flow] Authenticating ${acc.module} (${acc.role})...`);
      const loginResult = await loginUser({
        email: acc.email,
        password: acc.password,
      });

      if (!loginResult.token) {
        throw new Error(`Login token missing for ${acc.email}`);
      }
      if (loginResult.user.userType !== acc.role) {
        throw new Error(
          `Login resolved wrong role: expected ${acc.role}, got ${loginResult.user.userType}`
        );
      }

      console.log(
        `  PASS: Login successful. userType='${loginResult.user.userType}', token length=${loginResult.token.length}`
      );
    }

    // -------------------------------------------------------------
    // PHASE 3: GET CURRENT USER (ME) PROFILE VERIFICATION
    // -------------------------------------------------------------
    console.log("\n--- PHASE 3: GET CURRENT USER (TOKEN VERIFICATION) ---");
    for (const acc of testAccounts) {
      const loginResult = await loginUser({
        email: acc.email,
        password: acc.password,
      });
      const meResult = await getCurrentUser(loginResult.token);
      if (meResult.user.userType !== acc.role) {
        throw new Error(
          `getCurrentUser returned wrong role: expected ${acc.role}, got ${meResult.user.userType}`
        );
      }
      console.log(`  PASS: Token verification for ${acc.role} returned correct role '${meResult.user.userType}'`);
    }

    // -------------------------------------------------------------
    // PHASE 4: DUPLICATE REGISTRATION PREVENTION
    // -------------------------------------------------------------
    console.log("\n--- PHASE 4: DUPLICATE REGISTRATION PREVENTION ---");
    try {
      await registerUser({
        email: testAccounts[0].email,
        password: "AnotherPassword123!",
        userType: "student",
      });
      throw new Error("Duplicate registration should have been rejected!");
    } catch (err: any) {
      if (err.message.includes("already has an account") || err.message.includes("already in use")) {
        console.log("  PASS: Duplicate registration safely blocked with clear user-friendly error.");
      } else {
        throw err;
      }
    }

    // -------------------------------------------------------------
    // PHASE 5: SELECT ROLE / ROLE TRANSITION
    // -------------------------------------------------------------
    console.log("\n--- PHASE 5: ROLE TRANSITION (SELECT ROLE) ---");
    const transitionUser = testAccounts[0]; // student
    console.log(`Transitioning ${transitionUser.email} from student -> researcher...`);
    const updateRes = await updateUserRole({
      email: transitionUser.email,
      role: "researcher",
    });
    if (updateRes.user.userType !== "researcher") {
      throw new Error("Role transition to researcher failed");
    }
    const updatedResearcherProfile = await ResearcherProfile.findOne({ userId: updateRes.user._id });
    if (!updatedResearcherProfile) {
      throw new Error("ResearcherProfile missing after role transition");
    }
    console.log("  PASS: Role transition succeeded and initialized profile.");

    console.log("\n=============================================================");
    console.log("ALL 5 MODULE PHASES PASSED WITH COMPLETE DATA INTEGRITY!");
    console.log("=============================================================");
  } finally {
    // Clean up created test accounts to avoid polluting database
    console.log("\nCleaning up test accounts...");
    for (const uid of createdUserIds) {
      await User.findByIdAndDelete(uid);
      await StudentProfile.deleteMany({ userId: uid });
      await TeacherProfile.deleteMany({ userId: uid });
      await ResearcherProfile.deleteMany({ userId: uid });
    }
    await mongoose.disconnect();
    console.log("Cleanup complete. MongoDB disconnected.");
  }
}

runAllModulesAuthFlowVerification().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
