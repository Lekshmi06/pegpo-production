import http from "node:http";
import { AddressInfo } from "node:net";
import crypto from "node:crypto";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Set test environment so server doesn't auto-listen on fixed port
process.env.NODE_ENV = "test";

import { app } from "../server";
import User from "../models/User";
import TeacherProfile from "../models/TeacherProfile";
import StudentProfile from "../models/StudentProfile";
import TeachingContext from "../models/TeachingContext";
import SSOTokenRegistry from "../models/SSOTokenRegistry";
import * as ssoService from "../services/sso_service";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/edupye";

async function runHTTPIntegrationTests() {
  console.log("==================================================================");
  console.log("STARTING PHASE 1.5: GENUINE HTTP SSO INTEGRATION & SECURITY TESTS");
  console.log("==================================================================");

  // 1. Connect Database
  await mongoose.connect(MONGODB_URI);
  console.log("✓ Connected to MongoDB at:", MONGODB_URI);

  // 2. Start Real HTTP Server on Ephemeral Port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`✓ Real Express HTTP server listening on ${baseUrl}`);

  const testSuffix = Math.random().toString(36).substring(2, 8);
  const createdUserIds: mongoose.Types.ObjectId[] = [];

  try {
    // Reset registries
    await ssoService.resetSSORegistries();

    // ------------------------------------------------------------------------
    // 0. Verify Database TTL & Unique Indexes on SSOTokenRegistry
    // ------------------------------------------------------------------------
    console.log("\n0. Verifying MongoDB SSOTokenRegistry Physical Indexes...");
    await SSOTokenRegistry.init(); // Ensure indexes are compiled
    const indexes = await SSOTokenRegistry.collection.indexes();
    const hasJtiUnique = indexes.some(
      (idx) => idx.key.jti === 1 && idx.unique === true
    );
    const hasTtlIndex = indexes.some(
      (idx) => idx.key.expiresAt === 1 && idx.expireAfterSeconds === 0
    );

    if (!hasJtiUnique) {
      throw new Error("Missing unique index on SSOTokenRegistry.jti");
    }
    if (!hasTtlIndex) {
      throw new Error("Missing TTL index on SSOTokenRegistry.expiresAt with expireAfterSeconds: 0");
    }
    console.log("✓ Verified unique index on SSOTokenRegistry.jti in live MongoDB.");
    console.log("✓ Verified TTL index on SSOTokenRegistry.expiresAt (expireAfterSeconds: 0).");

    // ------------------------------------------------------------------------
    // 1. Flow 1: School Teacher HTTP Authentication & SSO Exchange
    // ------------------------------------------------------------------------
    console.log("\n1. Testing Flow 1: School Teacher → HTTP SSO Launch → Core Exchange...");
    const teacherExtId = `sch_teach_${testSuffix}`;
    const schoolId = `greenwood_sch_${testSuffix}`;

    const teacherToken = ssoService.generateSSOToken({
      iss: "edupye:school",
      sub: ssoService.buildExternalNamespace("school", "teacher", teacherExtId),
      sourceSystem: "school",
      externalUserId: teacherExtId,
      institutionId: schoolId,
      role: "teacher",
      name: "Sunita Patel",
      email: `sunita_${testSuffix}@greenwood.edu`,
      academicContext: {
        schoolName: "Greenwood High School",
        sclassName: "Class 10",
        section: "A",
        subjectName: "Mathematics",
        academicYear: "2026-2027",
      },
    });

    const teacherRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: teacherToken }),
    });

    const teacherData = await teacherRes.json();
    if (teacherRes.status !== 200 || !teacherData.success) {
      throw new Error(`Teacher exchange failed: ${JSON.stringify(teacherData)}`);
    }

    createdUserIds.push(new mongoose.Types.ObjectId(teacherData.data.user._id));
    const teacherSessionToken = teacherData.data.token;

    console.log("✓ HTTP 200 OK received for School Teacher SSO exchange.");
    console.log("✓ Core User ID:", teacherData.data.user._id, "Role:", teacherData.data.role);

    // Verify Teacher can make authorized Core requests with their session token
    const teacherMeRes = await fetch(`${baseUrl}/api/teaching-contexts`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${teacherSessionToken}`,
      },
    });

    if (teacherMeRes.status !== 200) {
      throw new Error(`Teacher session rejected on Core teaching-contexts: HTTP ${teacherMeRes.status}`);
    }
    console.log("✓ Authorized Core Teacher session successfully called GET /api/teaching-contexts (HTTP 200).");

    // ------------------------------------------------------------------------
    // 2. Flow 2: School Student HTTP Authentication (Roll-Number Account)
    // ------------------------------------------------------------------------
    console.log("\n2. Testing Flow 2: School Student → HTTP SSO Launch → Core Exchange...");
    const studentExtId = `sch_std_${testSuffix}`;

    const studentToken = ssoService.generateSSOToken({
      iss: "edupye:school",
      sub: ssoService.buildExternalNamespace("school", "student", studentExtId),
      sourceSystem: "school",
      externalUserId: studentExtId,
      institutionId: schoolId,
      role: "student",
      name: "Karan Verma",
      academicContext: {
        schoolName: "Greenwood High School",
        sclassName: "Class 10",
        rollNum: 108,
      },
    });

    const studentRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: studentToken }),
    });

    const studentData = await studentRes.json();
    if (studentRes.status !== 200 || !studentData.success) {
      throw new Error(`Student exchange failed: ${JSON.stringify(studentData)}`);
    }

    createdUserIds.push(new mongoose.Types.ObjectId(studentData.data.user._id));
    const studentSessionToken = studentData.data.token;

    console.log("✓ HTTP 200 OK received for School Student SSO exchange.");
    console.log("✓ Deterministic Synthetic Email:", studentData.data.user.email);
    console.log("✓ Core UserType:", studentData.data.user.userType);

    // ------------------------------------------------------------------------
    // 3. Flow 3: College Faculty HTTP Authentication & SSO Exchange
    // ------------------------------------------------------------------------
    console.log("\n3. Testing Flow 3: College Faculty → HTTP SSO Launch → Core Exchange...");
    const facultyExtId = `clg_fac_${testSuffix}`;
    const collegeDeptId = `dept_cse_${testSuffix}`;

    const facultyToken = ssoService.generateSSOToken({
      iss: "edupye:college",
      sub: ssoService.buildExternalNamespace("college", "teacher", facultyExtId),
      sourceSystem: "college",
      externalUserId: facultyExtId,
      institutionId: collegeDeptId,
      role: "teacher",
      name: "Dr. Arvind Rao",
      email: `arvind_${testSuffix}@campusiq.edu`,
      academicContext: {
        departmentName: "Computer Science",
        facultyId: "FAC-101",
      },
    });

    const facultyRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: facultyToken }),
    });

    const facultyData = await facultyRes.json();
    if (facultyRes.status !== 200 || !facultyData.success) {
      throw new Error(`Faculty exchange failed: ${JSON.stringify(facultyData)}`);
    }

    createdUserIds.push(new mongoose.Types.ObjectId(facultyData.data.user._id));
    console.log("✓ HTTP 200 OK received for College Faculty SSO exchange.");
    console.log("✓ Faculty profile department:", facultyData.data.profile.department);

    // ------------------------------------------------------------------------
    // 4. Flow 4: College Student HTTP Authentication & SSO Exchange
    // ------------------------------------------------------------------------
    console.log("\n4. Testing Flow 4: College Student → HTTP SSO Launch → Core Exchange...");
    const clgStdExtId = `clg_std_${testSuffix}`;

    const clgStdToken = ssoService.generateSSOToken({
      iss: "edupye:college",
      sub: ssoService.buildExternalNamespace("college", "student", clgStdExtId),
      sourceSystem: "college",
      externalUserId: clgStdExtId,
      institutionId: collegeDeptId,
      role: "student",
      name: "Meera Nair",
      email: `meera_${testSuffix}@campusiq.edu`,
      academicContext: {
        departmentName: "Computer Science",
        studentId: "STU-2026-09",
      },
    });

    const clgStdRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: clgStdToken }),
    });

    const clgStdData = await clgStdRes.json();
    if (clgStdRes.status !== 200 || !clgStdData.success) {
      throw new Error(`College student exchange failed: ${JSON.stringify(clgStdData)}`);
    }

    createdUserIds.push(new mongoose.Types.ObjectId(clgStdData.data.user._id));
    console.log("✓ HTTP 200 OK received for College Student SSO exchange.");
    console.log("✓ Student learning path:", clgStdData.data.profile.learningPath);

    // ------------------------------------------------------------------------
    // 5. Returning User Identity Stability (Zero Duplicate Accounts)
    // ------------------------------------------------------------------------
    console.log("\n5. Testing Returning User Re-Login Stability...");
    const returnTeacherToken = ssoService.generateSSOToken({
      iss: "edupye:school",
      sub: ssoService.buildExternalNamespace("school", "teacher", teacherExtId),
      sourceSystem: "school",
      externalUserId: teacherExtId,
      institutionId: schoolId,
      role: "teacher",
      name: "Sunita Patel",
      email: `sunita_${testSuffix}@greenwood.edu`,
    });

    const returnRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: returnTeacherToken }),
    });

    const returnData = await returnRes.json();
    if (returnData.data.user._id !== teacherData.data.user._id) {
      throw new Error("Re-login created a duplicate user ID instead of mapping to existing account");
    }

    const teacherCount = await User.countDocuments({
      "externalIdentity.namespace": ssoService.buildExternalNamespace("school", "teacher", teacherExtId),
    });
    if (teacherCount !== 1) {
      throw new Error(`Expected exactly 1 user in DB, found ${teacherCount}`);
    }
    console.log("✓ Re-login mapped to existing Core User ID. Zero duplicate accounts created.");

    // ------------------------------------------------------------------------
    // 6. HTTP Token Replay Detection
    // ------------------------------------------------------------------------
    console.log("\n6. Testing HTTP Token Replay Detection (Atomic One-Time Consumption)...");
    const replayRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: returnTeacherToken }),
    });

    const replayData = await replayRes.json();
    if (replayRes.status !== 401 || replayData.code !== "TOKEN_REPLAY_DETECTED") {
      throw new Error(`Expected 401 TOKEN_REPLAY_DETECTED, got ${replayRes.status} ${JSON.stringify(replayData)}`);
    }
    console.log("✓ Token replay rejected over HTTP with 401 Unauthorized (TOKEN_REPLAY_DETECTED).");

    // ------------------------------------------------------------------------
    // 7. HTTP Expired Token Rejection
    // ------------------------------------------------------------------------
    console.log("\n7. Testing HTTP Expired Token Rejection...");
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = ssoService.generateSSOToken({
      iss: "edupye:school",
      sub: `ext:school:teacher:exp_${testSuffix}`,
      sourceSystem: "school",
      externalUserId: `exp_${testSuffix}`,
      institutionId: schoolId,
      role: "teacher",
      name: "Expired User",
      iat: now - 1800,
      exp: now - 900,
    });

    const expiredRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: expiredToken }),
    });

    const expiredData = await expiredRes.json();
    if (expiredRes.status !== 401 || expiredData.code !== "TOKEN_EXPIRED") {
      throw new Error(`Expected 401 TOKEN_EXPIRED, got ${expiredRes.status}`);
    }
    console.log("✓ Expired token rejected over HTTP with 401 Unauthorized (TOKEN_EXPIRED).");

    // ------------------------------------------------------------------------
    // 8. HTTP Tampered Signature Rejection
    // ------------------------------------------------------------------------
    console.log("\n8. Testing HTTP Invalid Signature Rejection...");
    const tamperedToken = ssoService.generateSSOToken(
      {
        iss: "edupye:school",
        sub: `ext:school:teacher:tamp_${testSuffix}`,
        sourceSystem: "school",
        externalUserId: `tamp_${testSuffix}`,
        institutionId: schoolId,
        role: "teacher",
        name: "Tampered User",
      },
      "invalid_rogue_signing_secret_key_123"
    );

    const tamperedRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: tamperedToken }),
    });

    const tamperedData = await tamperedRes.json();
    if (tamperedRes.status !== 401 || tamperedData.code !== "INVALID_SIGNATURE") {
      throw new Error(`Expected 401 INVALID_SIGNATURE, got ${tamperedRes.status}`);
    }
    console.log("✓ Tampered signature rejected over HTTP with 401 Unauthorized (INVALID_SIGNATURE).");

    // ------------------------------------------------------------------------
    // 9. HTTP Untrusted Issuer Rejection
    // ------------------------------------------------------------------------
    console.log("\n9. Testing HTTP Untrusted Issuer Rejection...");
    const rogueToken = ssoService.generateSSOToken({
      iss: "edupye:rogue_server" as any,
      sub: "ext:rogue:teacher:1",
      sourceSystem: "school",
      externalUserId: "1",
      institutionId: schoolId,
      role: "teacher",
      name: "Rogue",
    });

    const rogueRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: rogueToken }),
    });

    const rogueData = await rogueRes.json();
    if (rogueRes.status !== 401 || rogueData.code !== "INVALID_ISSUER") {
      throw new Error(`Expected 401 INVALID_ISSUER, got ${rogueRes.status}`);
    }
    console.log("✓ Untrusted issuer rejected over HTTP with 401 Unauthorized (INVALID_ISSUER).");

    // ------------------------------------------------------------------------
    // 10. HTTP Wrong Audience Rejection
    // ------------------------------------------------------------------------
    console.log("\n10. Testing HTTP Wrong Audience Rejection...");
    const wrongAudToken = ssoService.generateSSOToken({
      iss: "edupye:school",
      aud: "edupye:other_audience" as any,
      sub: "ext:school:teacher:1",
      sourceSystem: "school",
      externalUserId: "1",
      institutionId: schoolId,
      role: "teacher",
      name: "Wrong Aud",
    });

    const wrongAudRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: wrongAudToken }),
    });

    const wrongAudData = await wrongAudRes.json();
    if (wrongAudRes.status !== 401 || wrongAudData.code !== "INVALID_AUDIENCE") {
      throw new Error(`Expected 401 INVALID_AUDIENCE, got ${wrongAudRes.status}`);
    }
    console.log("✓ Wrong audience rejected over HTTP with 401 Unauthorized (INVALID_AUDIENCE).");

    // ------------------------------------------------------------------------
    // 11. HTTP Issuer / Source System Mismatch
    // ------------------------------------------------------------------------
    console.log("\n11. Testing HTTP Issuer / Source System Mismatch...");
    const mismatchToken = ssoService.generateSSOToken({
      iss: "edupye:school",
      sub: "ext:school:teacher:1",
      sourceSystem: "college", // Mismatch
      externalUserId: "1",
      institutionId: schoolId,
      role: "teacher",
      name: "Mismatch",
    });

    const mismatchRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: mismatchToken }),
    });

    const mismatchData = await mismatchRes.json();
    if (mismatchRes.status !== 401 || mismatchData.code !== "SOURCE_ISSUER_MISMATCH") {
      throw new Error(`Expected 401 SOURCE_ISSUER_MISMATCH, got ${mismatchRes.status}`);
    }
    console.log("✓ Mismatched issuer/source rejected over HTTP with 401 Unauthorized (SOURCE_ISSUER_MISMATCH).");

    // ------------------------------------------------------------------------
    // 12. HTTP Token Revocation Endpoint & Rejection
    // ------------------------------------------------------------------------
    console.log("\n12. Testing HTTP Token Revocation Flow...");
    const revokeJti = crypto.randomUUID();
    const tokenToRevoke = ssoService.generateSSOToken({
      iss: "edupye:school",
      sub: `ext:school:teacher:rev_${testSuffix}`,
      sourceSystem: "school",
      externalUserId: `rev_${testSuffix}`,
      institutionId: schoolId,
      role: "teacher",
      name: "Revoke User",
      jti: revokeJti,
    });

    // Revoke via HTTP POST /api/sso/revoke
    const revokeRes = await fetch(`${baseUrl}/api/sso/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jti: revokeJti }),
    });
    const revokeData = await revokeRes.json();
    if (revokeRes.status !== 200 || !revokeData.success) {
      throw new Error(`Revocation endpoint failed: ${JSON.stringify(revokeData)}`);
    }
    console.log("✓ Token JTI revoked successfully via HTTP POST /api/sso/revoke.");

    // Exchange attempt must fail with TOKEN_REVOKED
    const postRevokeRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: tokenToRevoke }),
    });
    const postRevokeData = await postRevokeRes.json();
    if (postRevokeRes.status !== 401 || postRevokeData.code !== "TOKEN_REVOKED") {
      throw new Error(`Expected 401 TOKEN_REVOKED, got ${postRevokeRes.status}`);
    }
    console.log("✓ Revoked token exchange blocked over HTTP with 401 Unauthorized (TOKEN_REVOKED).");

    // ------------------------------------------------------------------------
    // 13. HTTP Deactivated / Suspended Account Access Blocking
    // ------------------------------------------------------------------------
    console.log("\n13. Testing HTTP Deactivated Account Blocking...");
    const suspExtId = `susp_${testSuffix}`;
    const suspToken = ssoService.generateSSOToken({
      iss: "edupye:college",
      sub: `ext:college:student:${suspExtId}`,
      sourceSystem: "college",
      externalUserId: suspExtId,
      institutionId: collegeDeptId,
      role: "student",
      name: "Suspended User",
    });

    // Initial exchange
    const suspExRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: suspToken }),
    });
    const suspExData = await suspExRes.json();
    createdUserIds.push(new mongoose.Types.ObjectId(suspExData.data.user._id));

    // Suspend in database
    await User.findByIdAndUpdate(suspExData.data.user._id, {
      status: "suspended",
      isSuspended: true,
    });

    // Re-exchange attempt with new token
    const freshSuspToken = ssoService.generateSSOToken({
      iss: "edupye:college",
      sub: `ext:college:student:${suspExtId}`,
      sourceSystem: "college",
      externalUserId: suspExtId,
      institutionId: collegeDeptId,
      role: "student",
      name: "Suspended User",
    });

    const suspBlockedRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: freshSuspToken }),
    });
    const suspBlockedData = await suspBlockedRes.json();
    if (suspBlockedRes.status !== 403 || suspBlockedData.code !== "ACCOUNT_DEACTIVATED") {
      throw new Error(`Expected 403 ACCOUNT_DEACTIVATED, got ${suspBlockedRes.status}`);
    }
    console.log("✓ Suspended user exchange blocked over HTTP with 403 Forbidden (ACCOUNT_DEACTIVATED).");

    // ------------------------------------------------------------------------
    // 14. Direct SSO Token Misuse on Protected Endpoint (SSO_EXCHANGE_REQUIRED)
    // ------------------------------------------------------------------------
    console.log("\n14. Testing Direct SSO Launch Token Misuse on Protected Endpoints...");
    const unexchangedToken = ssoService.generateSSOToken({
      iss: "edupye:school",
      sub: `ext:school:teacher:direct_${testSuffix}`,
      sourceSystem: "school",
      externalUserId: `direct_${testSuffix}`,
      institutionId: schoolId,
      role: "teacher",
      name: "Direct User",
    });

    // Try sending raw SSO launch token directly to GET /api/teaching-contexts
    const directMisuseRes = await fetch(`${baseUrl}/api/teaching-contexts`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${unexchangedToken}`,
      },
    });

    const directMisuseData = await directMisuseRes.json();
    if (directMisuseRes.status !== 401 || directMisuseData.code !== "SSO_EXCHANGE_REQUIRED") {
      throw new Error(
        `Expected 401 SSO_EXCHANGE_REQUIRED, got ${directMisuseRes.status}: ${JSON.stringify(directMisuseData)}`
      );
    }
    console.log("✓ Raw SSO token passed directly to protected endpoint was rejected with 401 (SSO_EXCHANGE_REQUIRED).");

    // ------------------------------------------------------------------------
    // 15. Role Boundary Enforcement Post-Exchange
    // ------------------------------------------------------------------------
    console.log("\n15. Testing Role Boundary Isolation Post-Exchange...");
    // Student session token attempting teacher teaching-contexts creation
    const studentTeacherAttempt = await fetch(`${baseUrl}/api/teaching-contexts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${studentSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: "Physics",
        classLevel: "Class 12",
      }),
    });

    // Expect 401 or 403 because student is not a teacher
    if (studentTeacherAttempt.status !== 401 && studentTeacherAttempt.status !== 403) {
      throw new Error(`Expected student attempting teacher action to fail, got ${studentTeacherAttempt.status}`);
    }
    console.log("✓ Student session attempting teacher action was blocked (HTTP 401/403). Role boundary preserved.");

    // ------------------------------------------------------------------------
    // 16. Cold Restart Replay Prevention Over HTTP
    // ------------------------------------------------------------------------
    console.log("\n16. Testing Multi-Instance / Cold Restart Replay Protection Over HTTP...");
    const restartJti = crypto.randomUUID();
    const restartHttpToken = ssoService.generateSSOToken({
      iss: "edupye:school",
      sub: `ext:school:teacher:restart_http_${testSuffix}`,
      sourceSystem: "school",
      externalUserId: `restart_http_${testSuffix}`,
      institutionId: schoolId,
      role: "teacher",
      name: "Restart HTTP Teacher",
      jti: restartJti,
    });

    // First HTTP exchange
    const firstExRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: restartHttpToken }),
    });
    const firstExData = await firstExRes.json();
    createdUserIds.push(new mongoose.Types.ObjectId(firstExData.data.user._id));
    console.log("✓ First HTTP exchange succeeded and recorded to MongoDB SSOTokenRegistry.");

    // Simulate cold restart by wiping memory cache
    ssoService.clearInMemorySSOCache();

    // Replay attempt over HTTP
    const replayPostRestartRes = await fetch(`${baseUrl}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssoToken: restartHttpToken }),
    });
    const replayPostRestartData = await replayPostRestartRes.json();
    if (replayPostRestartRes.status !== 401 || replayPostRestartData.code !== "TOKEN_REPLAY_DETECTED") {
      throw new Error(`Expected post-restart replay to fail via persistent DB check, got ${replayPostRestartRes.status}`);
    }
    console.log("✓ Post-restart replay blocked over HTTP via persistent MongoDB check (TOKEN_REPLAY_DETECTED).");

    // ------------------------------------------------------------------------
    // 17. Production Secret Missing/Weak Startup Check
    // ------------------------------------------------------------------------
    console.log("\n17. Testing Production Secret Missing/Weak Startup Check...");
    const origEnv = process.env.NODE_ENV;
    const origSec = process.env.EDUPYE_SSO_SECRET;
    const origCross = process.env.CROSS_MODULE_SSO_SECRET;

    try {
      process.env.NODE_ENV = "production";
      delete process.env.EDUPYE_SSO_SECRET;
      delete process.env.CROSS_MODULE_SSO_SECRET;

      let caughtMissing = false;
      try {
        ssoService.validateSSOConfigurationOnStartup();
      } catch (err: any) {
        caughtMissing = true;
        console.log("✓ Missing production secret correctly caused startup failure:", err.message);
      }
      if (!caughtMissing) throw new Error("Expected missing production secret to fail, but it passed!");

      process.env.EDUPYE_SSO_SECRET = "weak_key_12345";
      let caughtWeak = false;
      try {
        ssoService.validateSSOConfigurationOnStartup();
      } catch (err: any) {
        caughtWeak = true;
        console.log("✓ Weak production secret (<32 chars) correctly caused startup failure:", err.message);
      }
      if (!caughtWeak) throw new Error("Expected weak production secret to fail, but it passed!");
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origSec) process.env.EDUPYE_SSO_SECRET = origSec;
      else delete process.env.EDUPYE_SSO_SECRET;
      if (origCross) process.env.CROSS_MODULE_SSO_SECRET = origCross;
      else delete process.env.CROSS_MODULE_SSO_SECRET;
    }

    console.log("\n==================================================================");
    console.log("ALL 18 HTTP INTEGRATION & SECURITY TESTS PASSED!");
    console.log("==================================================================");
  } finally {
    console.log("\nCleaning up test artifacts...");
    if (createdUserIds.length > 0) {
      const users = await User.find({ _id: { $in: createdUserIds } });
      const userObjIds = users.map((u) => u._id);
      await TeacherProfile.deleteMany({ userId: { $in: userObjIds } });
      await StudentProfile.deleteMany({ userId: { $in: userObjIds } });
      await TeachingContext.deleteMany({
        institution: { $in: ["Greenwood High School", "Computer Science"] },
      });
      await User.deleteMany({ _id: { $in: userObjIds } });
      console.log(`✓ Cleaned up ${createdUserIds.length} test user records.`);
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    console.log("✓ HTTP test server shut down.");

    await mongoose.disconnect();
    console.log("✓ Disconnected from MongoDB.");
  }
}

runHTTPIntegrationTests().catch((err) => {
  console.error("HTTP Integration Test Failed:", err);
  process.exit(1);
});
