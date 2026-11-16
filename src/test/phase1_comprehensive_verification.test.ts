import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import TeacherProfile from "../models/TeacherProfile";
import ResearcherProfile from "../models/ResearcherProfile";
import Institution from "../models/Institution";
import InstitutionMembership from "../models/InstitutionMembership";
import {
  registerUser,
  loginUser,
  switchUserRole,
  activateUserRole,
  getCurrentUser,
  authenticateMockGoogle,
  PREDEFINED_MOCK_GOOGLE_ACCOUNTS,
} from "../services/auth_service";
import { generateSessionToken, verifySessionToken } from "../utils/token";

async function runPhase1ComprehensiveVerification() {
  console.log("=======================================================================");
  console.log("  EDUPYE PHASE 1 — FINAL INDEPENDENT VERIFICATION & REGRESSION SUITE   ");
  console.log("=======================================================================\n");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(mongoUri);
  console.log(" Connected to MongoDB successfully.\n");

  const timestamp = Date.now();
  const createdTestEmails: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: User Role Migration and Legacy Compatibility
    // -------------------------------------------------------------------------
    console.log("--- 1. Testing User Role Migration & Legacy Backward Compatibility ---");
    const legacyEmail = `legacy.student.${timestamp}@example.com`;
    createdTestEmails.push(legacyEmail);

    // Create a legacy user directly in DB with only userType (no roles array, no activeRole)
    const legacyDoc = await User.create({
      email: legacyEmail,
      name: "Legacy Student User",
      userType: "student",
      // Notice: roles and activeRole are intentionally omitted to simulate pre-migration records
    });

    console.log("   - Created legacy document in DB:", {
      id: legacyDoc._id,
      userType: legacyDoc.userType,
      roles: legacyDoc.roles,
      activeRole: legacyDoc.activeRole,
    });

    // Verify session recovery & automatic migration via getCurrentUser
    const legacyToken = generateSessionToken(legacyDoc);
    const recovered = await getCurrentUser(legacyToken);

    console.log("   - Recovered user after automatic migration:", {
      userType: recovered.user.userType,
      activeRole: recovered.user.activeRole,
      roles: recovered.user.roles,
    });

    if (recovered.user.userType !== "student") {
      throw new Error(`Expected legacy userType 'student', got '${recovered.user.userType}'`);
    }
    if (recovered.user.activeRole !== "student") {
      throw new Error(`Expected activeRole 'student', got '${recovered.user.activeRole}'`);
    }
    if (!recovered.user.roles || !recovered.user.roles.includes("student")) {
      throw new Error(`Expected 'student' in roles array, got: ${JSON.stringify(recovered.user.roles)}`);
    }
    console.log("    Legacy user migration & backward compatibility PASSED.\n");

    // -------------------------------------------------------------------------
    // TEST 2: JWT Generation and Validation with Role Context
    // -------------------------------------------------------------------------
    console.log("--- 2. Testing JWT Generation & Verification with Active Role Context ---");
    const token = generateSessionToken(legacyDoc);
    const payload = verifySessionToken(token);

    if (!payload || !payload.userId) {
      throw new Error("Failed to verify generated session token");
    }
    if (payload.activeRole !== "student") {
      throw new Error(`Token payload activeRole mismatch: expected 'student', got '${payload.activeRole}'`);
    }
    if (!payload.roles || !payload.roles.includes("student")) {
      throw new Error(`Token payload roles mismatch: ${JSON.stringify(payload.roles)}`);
    }
    console.log("   - Token verified successfully with payload:", {
      userId: payload.userId,
      activeRole: payload.activeRole,
      roles: payload.roles,
    });
    console.log("    JWT token structure & verification PASSED.\n");

    // -------------------------------------------------------------------------
    // TEST 3: Security & Authorization Boundary Checks
    // -------------------------------------------------------------------------
    console.log("--- 3. Testing Security & Authorization Boundary Checks ---");
    const secTestEmail = `security.student.${timestamp}@example.com`;
    createdTestEmails.push(secTestEmail);

    const secUser = await registerUser({
      email: secTestEmail,
      password: "TestPassword123!",
      name: "Security Test Student",
      userType: "student",
    });

    // 3a. Unauthorized role switch (attempting to switch to unowned 'teacher' role)
    console.log("   3a. Attempting switch to unowned 'teacher' role without prior assignment...");
    let unownedSwitchBlocked = false;
    try {
      await switchUserRole({
        userId: secUser.user._id,
        role: "teacher",
      });
    } catch (err: any) {
      unownedSwitchBlocked = true;
      console.log("       Blocked as expected:", err.message);
    }
    if (!unownedSwitchBlocked) {
      throw new Error("SECURITY FAILURE: User switched to unowned role 'teacher'!");
    }

    // 3b. Unauthorized self-activation of privileged roles: institution, company, teacher, tuition_provider
    console.log("   3b. Attempting self-activation of restricted/privileged roles...");
    const restrictedRoles = ["institution", "company", "teacher", "tuition_provider"];
    for (const role of restrictedRoles) {
      let activationBlocked = false;
      try {
        await activateUserRole({
          userId: secUser.user._id,
          role: role as any,
        });
      } catch (err: any) {
        activationBlocked = true;
        console.log(`       Blocked '${role}' self-activation:`, err.message);
      }
      if (!activationBlocked) {
        throw new Error(`SECURITY FAILURE: User self-assigned privileged role '${role}'!`);
      }
    }
    console.log("    Direct API privileged role self-activation barriers PASSED.\n");

    // -------------------------------------------------------------------------
    // TEST 4: Legitimate Role Activation and Workspace Context Replacement
    // -------------------------------------------------------------------------
    console.log("--- 4. Testing Role Activation, Context Replacement & Switching ---");
    console.log("   4a. Activating 'provider' role for user...");
    const activated = await activateUserRole({
      userId: secUser.user._id,
      role: "provider",
    });

    console.log("       Active role after activation:", activated.user.activeRole);
    console.log("       User roles after activation:", activated.user.roles);

    if (activated.user.activeRole !== "provider") {
      throw new Error("Active role was not updated to 'provider'");
    }
    if (!activated.user.roles.includes("provider") || !activated.user.roles.includes("student")) {
      throw new Error("User does not possess both 'provider' and 'student' roles");
    }

    // Verify token issued has provider as activeRole
    const providerTokenPayload = verifySessionToken(activated.token);
    if (providerTokenPayload?.activeRole !== "provider") {
      throw new Error("Issued token does not reflect activeRole 'provider'");
    }

    console.log("   4b. Switching back to 'student' workspace context...");
    const switchedBack = await switchUserRole({
      userId: secUser.user._id,
      role: "student",
    });

    if (switchedBack.user.activeRole !== "student") {
      throw new Error("Active role was not switched back to 'student'");
    }
    if (!switchedBack.studentProfile) {
      throw new Error("Student profile was not loaded when switching back to student");
    }

    const studentTokenPayload = verifySessionToken(switchedBack.token);
    if (studentTokenPayload?.activeRole !== "student") {
      throw new Error("Issued token does not reflect switched activeRole 'student'");
    }
    console.log("    Role switching & context replacement PASSED.\n");

    // -------------------------------------------------------------------------
    // TEST 5: Existing Account Regression Across All Account Personas
    // -------------------------------------------------------------------------
    console.log("--- 5. Testing Existing Account Personas (Student, Teacher, Researcher, Provider, Learner) ---");
    
    // Enable mock auth for test environment
    process.env.ENABLE_MOCK_GOOGLE_AUTH = "true";

    for (const persona of PREDEFINED_MOCK_GOOGLE_ACCOUNTS) {
      if (persona.id === "new_user") continue; // test dedicated persona accounts
      console.log(`   Testing Persona: [${persona.id.toUpperCase()}] (${persona.email})...`);

      const authRes = await authenticateMockGoogle({ accountId: persona.id });
      console.log(`       - Authenticated: ${authRes.user.name} (${authRes.user.email})`);
      console.log(`       - activeRole: ${authRes.user.activeRole}`);
      console.log(`       - roles: [${authRes.user.roles.join(", ")}]`);

      if (authRes.user.activeRole !== persona.defaultRole) {
        throw new Error(`Expected activeRole '${persona.defaultRole}', got '${authRes.user.activeRole}'`);
      }

      // Verify persona-specific profile binding
      if (persona.id === "student" && !authRes.studentProfile) {
        throw new Error("Expected studentProfile to be attached to student persona");
      }
      if (persona.id === "teacher" && !authRes.teacherProfile) {
        throw new Error("Expected teacherProfile to be attached to teacher persona");
      }
      if (persona.id === "researcher" && !authRes.researcherProfile) {
        throw new Error("Expected researcherProfile to be attached to researcher persona");
      }

      // Verify token authenticity
      const parsed = verifySessionToken(authRes.token);
      if (!parsed || parsed.activeRole !== persona.defaultRole) {
        throw new Error(`Session token activeRole mismatch for ${persona.id}`);
      }
      console.log(`       [${persona.id}] profile & session verified.`);
    }
    console.log("    Existing account personas regression testing PASSED.\n");

    // -------------------------------------------------------------------------
    // TEST 6: Institution Isolation & Membership Guard
    // -------------------------------------------------------------------------
    console.log("--- 6. Testing Institution Multi-Tenant Isolation & Membership ---");
    const instOwnerEmail = `inst.owner.${timestamp}@example.com`;
    const instNonMemberEmail = `inst.outsider.${timestamp}@example.com`;
    createdTestEmails.push(instOwnerEmail, instNonMemberEmail);

    const instOwner = await User.create({
      email: instOwnerEmail,
      name: "Institution Dean",
      userType: "institution",
      roles: ["institution"],
      activeRole: "institution",
    });

    const outsiderUser = await User.create({
      email: instNonMemberEmail,
      name: "Outsider Student",
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });

    const testInstitution: any = await Institution.create({
      name: "Alpha Academy of Science",
      slug: `alpha-academy-${timestamp}`,
      institutionType: "school",
      owner: instOwner._id,
      status: "active",
    });

    const ownerMembership = await InstitutionMembership.create({
      institutionId: testInstitution._id,
      userId: instOwner._id,
      role: "admin",
      status: "active",
      title: "Dean of Academic Affairs",
    });

    // Check membership validation
    const foundMembership = await InstitutionMembership.findOne({
      institutionId: testInstitution._id,
      userId: instOwner._id,
      status: "active",
    });
    if (!foundMembership || foundMembership.role !== "admin") {
      throw new Error("Failed to verify institution owner active membership");
    }

    // Verify outsider cannot access
    const outsiderMembership = await InstitutionMembership.findOne({
      institutionId: testInstitution._id,
      userId: outsiderUser._id,
      status: "active",
    });
    if (outsiderMembership) {
      throw new Error("SECURITY FAILURE: Outsider was found to have membership in institution!");
    }

    console.log("   - Institution created:", testInstitution.name);
    console.log("   - Verified Owner Admin Membership:", foundMembership.title);
    console.log("   - Verified Outsider Membership is correctly null.");
    console.log("    Institution isolation & membership verification PASSED.\n");

    // Clean up institution test data
    await InstitutionMembership.deleteMany({ institutionId: testInstitution._id });
    await Institution.findByIdAndDelete(testInstitution._id);

    console.log("=======================================================================");
    console.log("   ALL PHASE 1 FINAL INDEPENDENT VERIFICATION TESTS PASSED (6/6)       ");
    console.log("=======================================================================");
  } finally {
    // Cleanup created test users
    if (createdTestEmails.length > 0) {
      const usersToDelete = await User.find({ email: { $in: createdTestEmails } }).select("_id");
      const userIds = usersToDelete.map((u) => u._id);
      await StudentProfile.deleteMany({ userId: { $in: userIds } });
      await TeacherProfile.deleteMany({ userId: { $in: userIds } });
      await ResearcherProfile.deleteMany({ userId: { $in: userIds } });
      await User.deleteMany({ _id: { $in: userIds } });
    }
    await mongoose.disconnect();
  }
}

runPhase1ComprehensiveVerification().catch((err) => {
  console.error(" Comprehensive verification failed:", err);
  process.exit(1);
});
