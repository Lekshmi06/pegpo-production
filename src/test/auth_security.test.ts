import assert from "node:assert";
import { hashPassword, verifyPassword, isLegacyPlaintext } from "../utils/password";
import { generateSessionToken, verifySessionToken } from "../utils/token";

async function runAuthSecurityTests() {
  console.log("=== RUNNING CORE AUTH SECURITY VERIFICATION SUITE ===");

  // 1. Password validation & hashing
  console.log("\n[Test 1] Enforce non-empty and minimum length password validation");
  await assert.rejects(
    async () => await hashPassword(""),
    /Password cannot be empty/,
    "Should reject empty password"
  );
  await assert.rejects(
    async () => await hashPassword("   "),
    /Password cannot be empty/,
    "Should reject whitespace-only password"
  );
  await assert.rejects(
    async () => await hashPassword("123"),
    /at least 6 characters/,
    "Should reject short password"
  );
  console.log("  PASS: Empty and short passwords strictly rejected.");

  console.log("\n[Test 2] Password hashing produces valid bcrypt hash and verifies correctly");
  const plain = "SecureP@ssw0rd2026!";
  const hash = await hashPassword(plain);
  assert(hash.startsWith("$2"), "Hash must begin with bcrypt prefix ($2)");
  assert.notStrictEqual(plain, hash, "Hash must never match plain text");
  const isValid = await verifyPassword(plain, hash);
  assert.strictEqual(isValid, true, "Valid password must verify against hash");
  const isInvalid = await verifyPassword("WrongPassword123", hash);
  assert.strictEqual(isInvalid, false, "Incorrect password must fail verification");
  console.log("  PASS: Bcrypt hashing and verification working correctly.");

  console.log("\n[Test 3] Legacy plaintext detection and lazy migration support");
  const legacyPass = "old_plain_text_123";
  assert.strictEqual(isLegacyPlaintext(legacyPass), true, "Plaintext string detected as legacy");
  assert.strictEqual(isLegacyPlaintext(hash), false, "Bcrypt hash not detected as legacy");
  const legacyMatches = await verifyPassword(legacyPass, legacyPass);
  assert.strictEqual(legacyMatches, true, "Legacy plaintext matches correctly during migration check");
  console.log("  PASS: Legacy plaintext password detection and migration verified.");

  console.log("\n[Test 4] Cryptographic JWT session token issuance and verification");
  const mockUser = {
    _id: "60c72b2f9b1d8b2bad000001",
    email: "student@edupye.com",
    userType: "student",
  };
  const token = generateSessionToken(mockUser);
  assert(token && token.split(".").length === 3, "Token must be a valid 3-part JWT");
  assert.notStrictEqual(token, mockUser._id, "Token must NOT be raw user ObjectId");

  const verified = verifySessionToken(token);
  assert(verified !== null, "Token must verify successfully");
  assert.strictEqual(verified?.userId, mockUser._id, "Decoded userId must match original user _id");
  assert.strictEqual(verified?.email, mockUser.email, "Decoded email must match");
  assert.strictEqual(verified?.role, mockUser.userType, "Decoded role must match");
  console.log("  PASS: Cryptographic JWT session tokens signed and verified successfully.");

  console.log("\n[Test 5] Tampered token rejection");
  const tamperedToken = token.slice(0, -6) + "xxxxxx";
  const tamperedResult = verifySessionToken(tamperedToken);
  assert.strictEqual(tamperedResult, null, "Tampered JWT must be rejected");
  console.log("  PASS: Tampered JWT strictly rejected.");

  console.log("\n=== ALL CORE AUTH SECURITY VERIFICATIONS PASSED ===");
}

runAuthSecurityTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
