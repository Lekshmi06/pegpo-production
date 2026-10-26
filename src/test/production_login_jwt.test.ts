import assert from "node:assert";
import { getJwtSecret, generateSessionToken, verifySessionToken } from "../utils/token";
import { hashPassword, verifyPassword, isLegacyPlaintext } from "../utils/password";

async function runProductionLoginJwtTests() {
  console.log("=== RUNNING PRODUCTION LOGIN & JWT VERIFICATION SUITE ===");

  const originalEnv = { ...process.env };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Strict Fail-Safe in Production when JWT_SECRET is unset
    // -------------------------------------------------------------------------
    console.log("\n[Test 1] Strict fail-safe behavior in production mode when JWT_SECRET is missing");
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_SECRET;

    assert.throws(
      () => {
        getJwtSecret();
      },
      (err: any) => {
        return (
          err instanceof Error &&
          err.message.includes("FATAL: JWT_SECRET or AUTH_SECRET must be set in production mode.")
        );
      },
      "getJwtSecret() must throw FATAL error in production mode when no secret is configured"
    );

    // Also verify generateSessionToken fails safely when secret is unset in production
    const testUser = {
      _id: "60c72b2f9b1d8b2bad000099",
      email: "production.tester@edupye.com",
      userType: "teacher",
    };

    assert.throws(
      () => {
        generateSessionToken(testUser);
      },
      (err: any) => {
        return (
          err instanceof Error &&
          err.message.includes("FATAL: JWT_SECRET or AUTH_SECRET must be set in production mode.")
        );
      },
      "generateSessionToken() must fail safely when no secret is configured in production"
    );
    console.log("  PASS: Missing secret in production strictly triggers fail-safe throw (no insecure fallbacks).");

    // -------------------------------------------------------------------------
    // TEST 2: Production mode with CONFIGURED JWT_SECRET (Correct Operational State)
    // -------------------------------------------------------------------------
    console.log("\n[Test 2] Production mode with configured production JWT_SECRET");
    const customSecret = "production_secure_secret_key_minimum_32_characters_2026!";
    process.env.JWT_SECRET = customSecret;

    const prodSecret = getJwtSecret();
    assert.strictEqual(prodSecret, customSecret, "Must use configured JWT_SECRET");

    const prodToken = generateSessionToken(testUser);
    assert(prodToken && prodToken.split(".").length === 3, "Must generate valid JWT");

    const prodVerified = verifySessionToken(prodToken);
    assert(prodVerified !== null, "Must successfully verify with configured JWT_SECRET");
    assert.strictEqual(prodVerified.userId, testUser._id);
    assert.strictEqual(prodVerified.email, testUser.email);
    assert.strictEqual(prodVerified.role, testUser.userType);

    // Tampered token must still be rejected
    const tampered = prodToken.slice(0, -6) + "000000";
    assert.strictEqual(verifySessionToken(tampered), null, "Tampered token must be rejected");
    console.log("  PASS: Configured JWT_SECRET properly signs and verifies session tokens.");

    // -------------------------------------------------------------------------
    // TEST 3: Local Development Mode (Permissive dev fallback)
    // -------------------------------------------------------------------------
    console.log("\n[Test 3] Local development mode with missing secret");
    process.env.NODE_ENV = "development";
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_SECRET;

    const devSecret = getJwtSecret();
    assert.strictEqual(
      devSecret,
      "edupye_core_jwt_secret_key_2026_default_dev",
      "Development mode must provide default dev secret for convenience"
    );

    const devToken = generateSessionToken(testUser);
    const devVerified = verifySessionToken(devToken);
    assert(devVerified !== null && devVerified.userId === testUser._id);
    console.log("  PASS: Development environment safely falls back to local dev secret.");

    // -------------------------------------------------------------------------
    // TEST 4: Password verification integrity (no weakening)
    // -------------------------------------------------------------------------
    console.log("\n[Test 4] Password verification integrity check");
    const rawPassword = "SecurePassword2026!";
    const hashedPassword = await hashPassword(rawPassword);

    assert(hashedPassword.startsWith("$2"), "Hashed password must be standard bcrypt hash");
    assert.strictEqual(isLegacyPlaintext(hashedPassword), false, "Bcrypt hash must not be marked plaintext");

    // Correct password must match
    const isValid = await verifyPassword(rawPassword, hashedPassword);
    assert.strictEqual(isValid, true, "Valid password must verify against bcrypt hash");

    // Incorrect password must be rejected
    const isInvalid = await verifyPassword("WrongPassword123!", hashedPassword);
    assert.strictEqual(isInvalid, false, "Invalid password must be rejected");

    // Empty or missing password must be rejected
    assert.strictEqual(await verifyPassword("", hashedPassword), false, "Empty password must be rejected");
    assert.strictEqual(await verifyPassword(rawPassword, ""), false, "Empty hash must be rejected");
    assert.strictEqual(await verifyPassword(rawPassword, null), false, "Null hash must be rejected");

    // Legacy plaintext support (migration check)
    assert.strictEqual(isLegacyPlaintext("plainTextPass"), true, "Plaintext string must be marked plaintext");
    assert.strictEqual(await verifyPassword("plainTextPass", "plainTextPass"), true, "Legacy plaintext must match itself");
    assert.strictEqual(await verifyPassword("wrong", "plainTextPass"), false, "Wrong password against plaintext must fail");
    console.log("  PASS: Password verification is strict, secure, and preserves legacy migration.");

    // -------------------------------------------------------------------------
    // TEST 5: Legacy ObjectId migration fallback in verifySessionToken
    // -------------------------------------------------------------------------
    console.log("\n[Test 5] Legacy ObjectId migration fallback in verifySessionToken");
    const rawObjectId = "507f1f77bcf86cd799439011";
    const legacyResolved = verifySessionToken(rawObjectId);
    assert(legacyResolved !== null, "Legacy 24-char ObjectId must resolve for backwards compatibility");
    assert.strictEqual(legacyResolved.userId, rawObjectId);

    // Invalid non-hex or wrong length string must be rejected
    assert.strictEqual(verifySessionToken("invalid-token-string"), null, "Random string must be rejected");
    assert.strictEqual(verifySessionToken(""), null, "Empty token must be rejected");
    console.log("  PASS: Migration fallback properly resolves legacy ObjectIds and rejects arbitrary strings.");

    console.log("\n=============================================================");
    console.log("ALL PRODUCTION LOGIN & JWT VERIFICATION TESTS PASSED!");
    console.log("=============================================================");
  } finally {
    // Restore environment
    process.env = originalEnv;
  }
}

runProductionLoginJwtTests().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
