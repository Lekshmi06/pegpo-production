import assert from "node:assert";
import crypto from "node:crypto";
import {
  generateSSOToken,
  verifySSOToken,
  getSSOSecret,
  isTokenRevoked,
  revokeSSOToken,
  SSOAuthError,
} from "../services/sso_service";

async function runSSOSecurityTests() {
  console.log("=== RUNNING SSO SECURITY VERIFICATION SUITE ===");

  const secret = getSSOSecret();
  assert(secret && secret.length >= 16, "SSO secret must be configured");

  console.log("\n[Test 1] Generate and verify valid School ERP launch token");
  const validSchoolPayload = {
    iss: "edupye:school" as const,
    aud: "edupye:core" as const,
    sub: "ext:school:teacher:t100",
    sourceSystem: "school" as const,
    externalUserId: "t100",
    institutionId: "school_100",
    role: "teacher" as const,
    name: "Mathematics Teacher",
    email: "math@school.edu",
    jti: crypto.randomUUID(),
    academicContext: {
      schoolName: "Greenwood High",
      sclassName: "Class 10-A",
      subjectName: "Mathematics",
    },
  };

  const schoolToken = generateSSOToken(validSchoolPayload);
  assert(schoolToken.split(".").length === 3, "SSO token must be valid 3-part JWT");

  const verifiedSchool = verifySSOToken(schoolToken);
  assert.strictEqual(verifiedSchool.sub, validSchoolPayload.sub);
  assert.strictEqual(verifiedSchool.sourceSystem, "school");
  assert.strictEqual(verifiedSchool.role, "teacher");
  assert.strictEqual(verifiedSchool.institutionId, "school_100");
  console.log("  PASS: School ERP launch token generated and verified.");

  console.log("\n[Test 2] Generate and verify valid College ERP launch token");
  const validCollegePayload = {
    iss: "edupye:college" as const,
    aud: "edupye:core" as const,
    sub: "ext:college:student:c200",
    sourceSystem: "college" as const,
    externalUserId: "c200",
    institutionId: "college_200",
    role: "student" as const,
    name: "Engineering Student",
    jti: crypto.randomUUID(),
    academicContext: {
      departmentName: "Computer Science",
      courseName: "Distributed Systems",
    },
  };

  const collegeToken = generateSSOToken(validCollegePayload);
  const verifiedCollege = verifySSOToken(collegeToken);
  assert.strictEqual(verifiedCollege.sub, validCollegePayload.sub);
  assert.strictEqual(verifiedCollege.sourceSystem, "college");
  assert.strictEqual(verifiedCollege.role, "student");
  console.log("  PASS: College ERP launch token generated and verified.");

  console.log("\n[Test 3] Reject token with invalid cryptographic signature");
  const tamperedToken = schoolToken.slice(0, -8) + "badsigna";
  assert.throws(
    () => verifySSOToken(tamperedToken),
    (err: any) => err instanceof SSOAuthError && err.code === "INVALID_SIGNATURE",
    "Tampered signature must be rejected"
  );
  console.log("  PASS: Invalid token signature strictly rejected.");

  console.log("\n[Test 4] Reject expired launch ticket");
  const now = Math.floor(Date.now() / 1000);
  const expiredPayload = {
    ...validSchoolPayload,
    jti: crypto.randomUUID(),
    iat: now - 3600,
    exp: now - 1800, // expired 30 minutes ago
  };
  const expiredToken = generateSSOToken(expiredPayload);
  assert.throws(
    () => verifySSOToken(expiredToken),
    (err: any) => err instanceof SSOAuthError && err.code === "TOKEN_EXPIRED",
    "Expired token must be rejected"
  );
  console.log("  PASS: Expired launch ticket strictly rejected.");

  console.log("\n[Test 5] Token revocation check");
  const testJti = crypto.randomUUID();
  assert.strictEqual(await isTokenRevoked(testJti), false, "Fresh JTI not revoked");
  await revokeSSOToken(testJti, { sourceSystem: "school" });
  assert.strictEqual(await isTokenRevoked(testJti), true, "Revoked JTI detected");
  console.log("  PASS: Token revocation registry operational.");

  console.log("\n=== ALL SSO SECURITY VERIFICATIONS PASSED ===");
}

runSSOSecurityTests().catch((err) => {
  console.error("SSO TEST FAILED:", err);
  process.exit(1);
});
