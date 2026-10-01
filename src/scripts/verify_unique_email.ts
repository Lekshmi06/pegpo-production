import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import User from "../models/User";
import { registerUser, loginUser } from "../services/auth_service";

async function runVerification() {
  console.log("=== Starting Email Uniqueness & Prompt Verification ===");
  await mongoose.connect(process.env.MONGODB_URI!);

  const testEmail = `test.unique.${Date.now()}@edupye.test`;
  const testPassword = "SecurePassword123!";
  const testName = "Unique Test User";

  try {
    // Clean up if it somehow existed
    await User.deleteMany({ email: testEmail.toLowerCase() });

    console.log(`\nStep 1: Registering new user with email: ${testEmail}`);
    const regResult = await registerUser({
      email: testEmail,
      password: testPassword,
      name: testName,
      userType: "student",
    });

    if (!regResult.user || regResult.user.email !== testEmail.toLowerCase()) {
      throw new Error(`Failed initial registration: ${JSON.stringify(regResult)}`);
    }
    console.log("✓ Initial registration succeeded for new unique email.");

    console.log("\nStep 2: Attempting to register again with the EXACT SAME email...");
    let duplicateRejected = false;
    let duplicatePrompt = "";
    try {
      await registerUser({
        email: testEmail,
        password: "AnotherPassword456!",
        name: "Second Person",
        userType: "student",
      });
    } catch (err: any) {
      duplicateRejected = true;
      duplicatePrompt = err.message;
      console.log(`✓ Duplicate registration rejected with message: "${duplicatePrompt}"`);
    }

    if (!duplicateRejected) {
      throw new Error("FAILED: Duplicate email registration was erroneously permitted!");
    }

    const expectedPrompt = "This email ID already has an account or is already in use. Please log in instead.";
    if (duplicatePrompt !== expectedPrompt) {
      throw new Error(`FAILED: Expected prompt "${expectedPrompt}", but got "${duplicatePrompt}"`);
    }
    console.log("✓ Prompt matches required user-friendly text exactly.");

    console.log("\nStep 3: Attempting to register with variation in case and whitespace...");
    const variantEmail = `  ${testEmail.toUpperCase()}  `;
    let variantRejected = false;
    let variantPrompt = "";
    try {
      await registerUser({
        email: variantEmail,
        password: "VariantPassword789!",
        name: "Third Person",
        userType: "student",
      });
    } catch (err: any) {
      variantRejected = true;
      variantPrompt = err.message;
      console.log(`✓ Variant email registration rejected with message: "${variantPrompt}"`);
    }

    if (!variantRejected || variantPrompt !== expectedPrompt) {
      throw new Error(`FAILED: Case/trim variant was not rejected properly. Message: "${variantPrompt}"`);
    }
    console.log("✓ Case-insensitive and trimmed uniqueness verified.");

    console.log("\nStep 4: Verifying MongoDB Unique Index at collection level...");
    let indexTriggered = false;
    try {
      // Force direct low-level insert bypassing mongoose middleware
      await User.collection.insertOne({
        email: testEmail.toLowerCase(),
        password: "raw_duplicate_password",
        userType: "student",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (err: any) {
      if (err.code === 11000) {
        indexTriggered = true;
        console.log("✓ MongoDB unique index (code 11000) successfully blocked raw duplicate insert.");
      } else {
        console.warn("MongoDB threw unexpected error code:", err);
      }
    }

    if (!indexTriggered) {
      throw new Error("FAILED: Database unique index did not block duplicate insert!");
    }

    console.log("\nStep 5: Verifying existing user can still log in normally...");
    const loginResult = await loginUser({
      email: testEmail,
      password: testPassword,
    });
    if (!loginResult.user || loginResult.user.email !== testEmail.toLowerCase()) {
      throw new Error("FAILED: Legitimate user could not log in!");
    }
    console.log("✓ Legitimate user login succeeded seamlessly.");

    // Clean up test user
    await User.deleteMany({ email: testEmail.toLowerCase() });
    console.log("\n✓ Cleaned up test user.");

    console.log("\n========================================================");
    console.log("🎉 ALL TESTS PASSED: Email uniqueness strictly enforced!");
    console.log("========================================================");
  } finally {
    await mongoose.disconnect();
  }
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
