import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import User from "../models/User";
import {
  registerUser,
  loginUser,
  switchUserRole,
  activateUserRole,
  getCurrentUser,
} from "../services/auth_service";

async function runMultiRoleAuthTests() {
  console.log("=================================================");
  console.log("PHASE 1: MULTI-ROLE IDENTITY & AUTHENTICATION TEST");
  console.log("=================================================");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(mongoUri);
  console.log(" Connected to MongoDB successfully.\n");

  const testSuffix = Date.now();
  const testEmail = `multirole.test.${testSuffix}@example.com`;
  const testPassword = "SecurePassword123!";

  try {
    // 1. Register a user with default role: 'student'
    console.log("1. Testing Registration with Single Role ('student')...");
    const regResult = await registerUser({
      email: testEmail,
      password: testPassword,
      name: "Alex MultiRole",
      userType: "student",
    });

    console.log("   - Registered user ID:", regResult.user._id);
    console.log("   - activeRole:", regResult.user.activeRole);
    console.log("   - userType (backward-compat):", regResult.user.userType);
    console.log("   - roles array:", regResult.user.roles);

    if (regResult.user.activeRole !== "student") {
      throw new Error(`Expected activeRole 'student', got '${regResult.user.activeRole}'`);
    }
    if (!regResult.user.roles.includes("student")) {
      throw new Error(`Expected 'student' in roles, got ${JSON.stringify(regResult.user.roles)}`);
    }
    console.log("    Registration multi-role defaults verified.\n");

    // 2. Test Login & Role Synchronization
    console.log("2. Testing Login and Initial Profile Loading...");
    const loginResult = await loginUser({
      email: testEmail,
      password: testPassword,
    });

    console.log("   - Logged in activeRole:", loginResult.user.activeRole);
    console.log("   - Student Profile attached:", !!loginResult.studentProfile);
    if (!loginResult.studentProfile) {
      throw new Error("Expected studentProfile to be attached to student login result");
    }
    console.log("    Login verified.\n");

    // 3. Test Unauthorized Role Switching (User does not possess 'teacher' yet)
    console.log("3. Testing Unauthorized Role Switch (switching to unowned role 'teacher')...");
    let switchUnauthorizedFailed = false;
    try {
      await switchUserRole({
        userId: regResult.user._id,
        role: "teacher",
      });
    } catch (err: any) {
      switchUnauthorizedFailed = true;
      console.log("   - Expected error caught:", err.message);
      if (!err.message.includes("Unauthorized") && !err.message.includes("do not possess")) {
        throw new Error(`Unexpected error message: ${err.message}`);
      }
    }
    if (!switchUnauthorizedFailed) {
      throw new Error("Security vulnerability: User was able to switch to unowned role without activation!");
    }
    console.log("    Unauthorized role switch blocked as expected.\n");

    // 4. Test Privileged Role Self-Activation Rejection ('institution', 'company', 'teacher', 'tuition_provider')
    console.log("4. Testing Privileged Role Self-Activation Rejection ('institution', 'teacher', 'tuition_provider')...");
    for (const forbiddenRole of ["institution", "company", "teacher", "tuition_provider"] as const) {
      let activationBlocked = false;
      try {
        await activateUserRole({
          userId: regResult.user._id,
          role: forbiddenRole as any,
        });
      } catch (err: any) {
        activationBlocked = true;
        console.log(`   - Blocked '${forbiddenRole}' activation:`, err.message);
        if (!err.message.includes("requires official verification") && !err.message.includes("Invalid role")) {
          throw new Error(`Unexpected error message for ${forbiddenRole}: ${err.message}`);
        }
      }
      if (!activationBlocked) {
        throw new Error(`Security vulnerability: User self-assigned privileged role '${forbiddenRole}'!`);
      }
    }
    console.log("    Privileged/unverified self-activation blocked as expected.\n");

    // 5. Test Authorized Role Activation ('provider')
    console.log("5. Testing Legitimate Role Activation ('provider')...");
    const activateResult = await activateUserRole({
      userId: regResult.user._id,
      role: "provider",
    });

    console.log("   - New activeRole:", activateResult.user.activeRole);
    console.log("   - Updated roles array:", activateResult.user.roles);
    if (activateResult.user.activeRole !== "provider") {
      throw new Error(`Expected activeRole 'provider', got '${activateResult.user.activeRole}'`);
    }
    if (!activateResult.user.roles.includes("provider") || !activateResult.user.roles.includes("student")) {
      throw new Error(`Expected both 'student' and 'provider' in roles, got ${JSON.stringify(activateResult.user.roles)}`);
    }
    console.log("    Role activation succeeded and activeRole switched.\n");

    // 6. Test Switching Back to 'student'
    console.log("6. Testing Switching Back to 'student' Role...");
    const switchBackResult = await switchUserRole({
      userId: regResult.user._id,
      role: "student",
    });

    console.log("   - Switched activeRole:", switchBackResult.user.activeRole);
    console.log("   - Backward-compat userType:", switchBackResult.user.userType);
    console.log("   - Student Profile restored:", !!switchBackResult.studentProfile);
    if (switchBackResult.user.activeRole !== "student" || switchBackResult.user.userType !== "student") {
      throw new Error("Active role switch failed to reflect on both activeRole and userType");
    }
    if (!switchBackResult.studentProfile) {
      throw new Error("Student profile was not loaded upon switching back to student role");
    }
    console.log("    Switching back verified.\n");

    // 7. Test Session Recovery via getCurrentUser
    console.log("7. Testing Session Recovery via getCurrentUser...");
    const meResult = await getCurrentUser(switchBackResult.token);
    console.log("   - Recovered user activeRole:", meResult.user.activeRole);
    console.log("   - Recovered roles:", meResult.user.roles);
    if (meResult.user.activeRole !== "student" || meResult.user.roles.length !== 2) {
      throw new Error("Session recovery did not preserve multi-role state");
    }
    console.log("    Session recovery verified.\n");

    console.log("=================================================");
    console.log(" ALL PHASE 1 MULTI-ROLE BACKEND TESTS PASSED!");
    console.log("=================================================");
  } finally {
    // Clean up test user
    await User.deleteMany({ email: testEmail });
    await mongoose.disconnect();
  }
}

runMultiRoleAuthTests().catch((err) => {
  console.error(" Multi-role auth test failed:", err);
  process.exit(1);
});

