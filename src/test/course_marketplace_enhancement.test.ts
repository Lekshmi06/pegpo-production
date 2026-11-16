import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import User from "../models/User";
import Course from "../models/Course";
import Enrollment from "../models/Enrollment";
import CoursePaymentPlan from "../models/CoursePaymentPlan";
import FinancialLedger from "../models/FinancialLedger";
import Certificate from "../models/Certificate";
import CourseReview from "../models/CourseReview";

import {
  createCoursePaymentOrder,
  verifyAndProcessPayment,
  createNextInstalmentOrder,
  getProviderFinancialSummary,
  calculateRevenueShare,
  generatePaymentSignature,
} from "../services/payment_service";
import {
  getLearnerCourseLearningState,
  verifyLessonAccess,
  updateLessonProgress,
} from "../services/enrollment_service";
import { issueCourseCertificate, getLearnerCourseCertificate } from "../services/certificate_service";
import {
  checkReviewEligibility,
  submitCourseReview,
  getCourseReviews,
} from "../services/review_service";

async function runCourseMarketplaceEnhancementTests() {
  console.log("=========================================================================");
  console.log("  EDUPYE PHASE 2 — COURSE MARKETPLACE ENHANCEMENT VERIFICATION SUITE    ");
  console.log("=========================================================================\n");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(mongoUri);
  console.log(" Connected to MongoDB successfully.\n");

  const timestamp = Date.now();
  const providerEmail = `provider.test.${timestamp}@edupye.test`;
  const learnerEmail = `learner.test.${timestamp}@edupye.test`;

  let providerUser: any = null;
  let learnerUser: any = null;
  let testCourse: any = null;

  try {
    // -------------------------------------------------------------------------
    // Setup Provider and Learner Users
    // -------------------------------------------------------------------------
    providerUser = await User.create({
      email: providerEmail,
      name: "Marcus Instructor",
      userType: "provider",
      roles: ["provider"],
      activeRole: "provider",
    });

    learnerUser = await User.create({
      email: learnerEmail,
      name: "Alice Graduate",
      userType: "learner",
      roles: ["learner"],
      activeRole: "learner",
    });

    console.log(" Test Users Created: Provider and Learner");

    // -------------------------------------------------------------------------
    // TEST 1: Configurable 80:20 Revenue Sharing Split Calculation
    // -------------------------------------------------------------------------
    console.log("\n--- 1. Testing Configurable 80:20 Revenue Sharing Rule ---");
    const split100 = calculateRevenueShare(100);
    console.log("   - Split on $100.00 gross:", split100);
    if (split100.providerShare !== 80 || split100.platformShare !== 20) {
      throw new Error(`Expected 80/20 split on $100, got ${split100.providerShare}/${split100.platformShare}`);
    }

    const split89 = calculateRevenueShare(89.99);
    console.log("   - Split on $89.99 gross:", split89);
    if (split89.providerShare !== 71.99 || split89.platformShare !== 18.0) {
      throw new Error(`Split calculation mismatch on $89.99: ${JSON.stringify(split89)}`);
    }
    console.log("    Revenue sharing calculation PASSED.\n");

    // -------------------------------------------------------------------------
    // Setup 3-Milestone Modular Course with Instalment Support
    // -------------------------------------------------------------------------
    console.log("--- 2. Setting up Course with 3 Sections Mapped to Instalment Milestones ---");
    const lesson1Id = new mongoose.Types.ObjectId();
    const lesson2Id = new mongoose.Types.ObjectId();
    const lesson3Id = new mongoose.Types.ObjectId();

    testCourse = await Course.create({
      title: `Advanced Full-Stack Engineering ${timestamp}`,
      slug: `advanced-full-stack-engineering-${timestamp}`,
      description: "Comprehensive 3-part mastery course with instalment payment options.",
      shortDescription: "Master modern software engineering.",
      category: "Software Engineering",
      level: "Advanced",
      price: 300,
      currency: "USD",
      allowInstalments: true,
      maxInstalments: 3,
      instalmentFrequencyDays: 30,
      provider: providerUser._id,
      providerName: providerUser.name,
      status: "published",
      sections: [
        {
          title: "Part 1: Core Architecture (Milestone 1)",
          order: 0,
          requiredInstalmentNumber: 1,
          lessons: [
            {
              _id: lesson1Id,
              title: "Lesson 1: Domain-Driven Architecture",
              contentType: "video",
              durationMinutes: 45,
              videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              order: 0,
              isPreviewFree: false,
            },
          ],
        },
        {
          title: "Part 2: Scalable Distributed Systems (Milestone 2)",
          order: 1,
          requiredInstalmentNumber: 2,
          lessons: [
            {
              _id: lesson2Id,
              title: "Lesson 2: Event Sourcing & CQRS",
              contentType: "video",
              durationMinutes: 50,
              videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              order: 0,
              isPreviewFree: false,
            },
          ],
        },
        {
          title: "Part 3: Production Deployment & Observability (Milestone 3)",
          order: 2,
          requiredInstalmentNumber: 3,
          lessons: [
            {
              _id: lesson3Id,
              title: "Lesson 3: Zero-Downtime Deployments",
              contentType: "video",
              durationMinutes: 60,
              videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              order: 0,
              isPreviewFree: false,
            },
          ],
        },
      ],
    });

    console.log("   - Created Course with 3 Instalment Milestones:", testCourse.title);
    console.log("   - Total Price: $300.00 across 3 instalments ($100 each)");

    // -------------------------------------------------------------------------
    // TEST 2: Course Payment Plan & Instalment Order Creation
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Testing Payment Plan Creation (Instalment Plan) ---");
    const order = await createCoursePaymentOrder({
      learnerId: learnerUser._id.toString(),
      courseId: testCourse._id.toString(),
      planType: "instalment",
      numberOfInstalments: 3,
    });

    console.log("   - Generated Order:", {
      orderId: order.orderId,
      amountDueNow: order.amountDueNow,
      totalInstalments: order.totalInstalments,
      scheduleLength: order.schedule.length,
    });

    if (order.amountDueNow !== 100 || order.totalInstalments !== 3) {
      throw new Error(`Order amount/instalment mismatch: expected 100/3, got ${order.amountDueNow}/${order.totalInstalments}`);
    }
    console.log("    Instalment Order creation PASSED.\n");

    // -------------------------------------------------------------------------
    // TEST 3: Server-Side Cryptographic Payment Verification & Ledger Recording
    // -------------------------------------------------------------------------
    console.log("--- 4. Testing Payment Verification, Cryptographic Signature & Ledger ---");
    const gatewayTxn1 = `GW-TXN-1-${timestamp}`;
    const sig1 = generatePaymentSignature(order.orderId, gatewayTxn1);

    const verifyRes1 = await verifyAndProcessPayment({
      learnerId: learnerUser._id.toString(),
      paymentPlanId: order.paymentPlanId,
      instalmentNumber: 1,
      orderId: order.orderId,
      gatewayTransactionId: gatewayTxn1,
      signature: sig1,
      gatewayProvider: "edupye_secure_gateway",
    });

    console.log("   - Payment 1 Verified:", {
      transactionId: verifyRes1.transactionId,
      unlockedInstalments: verifyRes1.unlockedInstalments,
      planStatus: verifyRes1.paymentPlan.status,
    });

    if (verifyRes1.unlockedInstalments !== 1 || verifyRes1.paymentPlan.status !== "active") {
      throw new Error("Instalment 1 payment did not unlock milestone 1 or activate plan");
    }

    // Verify Financial Ledger Entry
    const ledger1 = await FinancialLedger.findOne({ transactionId: verifyRes1.transactionId });
    if (!ledger1) throw new Error("Financial ledger entry missing!");
    console.log("   - Financial Ledger Entry Recorded:", {
      grossAmount: ledger1.grossAmount,
      providerShare: ledger1.providerShare,
      platformShare: ledger1.platformShare,
      paymentStatus: ledger1.paymentStatus,
    });

    if (ledger1.grossAmount !== 100 || ledger1.providerShare !== 80 || ledger1.platformShare !== 20) {
      throw new Error(`Financial ledger split mismatch: ${ledger1.providerShare}/${ledger1.platformShare}`);
    }
    console.log("    Payment verification & financial ledger recording PASSED.\n");

    // -------------------------------------------------------------------------
    // TEST 4: Idempotent Webhook & Duplicate Transaction Prevention
    // -------------------------------------------------------------------------
    console.log("--- 5. Testing Idempotent Deduplication (Replaying Same Transaction) ---");
    const replayRes = await verifyAndProcessPayment({
      learnerId: learnerUser._id.toString(),
      paymentPlanId: order.paymentPlanId,
      instalmentNumber: 1,
      orderId: order.orderId,
      gatewayTransactionId: gatewayTxn1, // EXACT SAME GATEWAY TXN
      signature: sig1,
    });

    if (replayRes.transactionId !== verifyRes1.transactionId) {
      throw new Error("Idempotency violation: Replay generated a different transaction ID!");
    }

    const ledgerCount = await FinancialLedger.countDocuments({ gatewayTransactionId: gatewayTxn1 });
    if (ledgerCount !== 1) {
      throw new Error(`Duplicate ledger entry created! Count: ${ledgerCount}`);
    }
    console.log("    Idempotent replay protection PASSED (Duplicate charges prevented).\n");

    // -------------------------------------------------------------------------
    // TEST 5: Progressive Content Access Enforcement (Milestone Locking)
    // -------------------------------------------------------------------------
    console.log("--- 6. Testing Progressive Content Access Enforcement ---");
    // Learner has paid Instalment 1.
    // Milestone 1 (Lesson 1) MUST be accessible.
    // Milestone 2 (Lesson 2) MUST be blocked with 403 Forbidden.
    // Milestone 3 (Lesson 3) MUST be blocked with 403 Forbidden.

    console.log("   6a. Verifying access to Milestone 1 (Lesson 1)...");
    const accessL1 = await verifyLessonAccess(
      learnerUser._id.toString(),
      testCourse._id.toString(),
      lesson1Id.toString()
    );
    if (!accessL1 || !accessL1.lesson) {
      throw new Error("Failed to access paid Milestone 1 lesson!");
    }
    console.log("       Milestone 1 accessible as expected.");

    console.log("   6b. Attempting access to locked Milestone 2 (Lesson 2) without payment...");
    let m2Blocked = false;
    try {
      await verifyLessonAccess(
        learnerUser._id.toString(),
        testCourse._id.toString(),
        lesson2Id.toString()
      );
    } catch (err: any) {
      m2Blocked = true;
      console.log("       Blocked as expected:", err.message);
      if (!err.message.includes("Section locked") && !err.message.includes("instalment #2")) {
        throw new Error(`Unexpected lock message: ${err.message}`);
      }
    }
    if (!m2Blocked) {
      throw new Error("SECURITY FAILURE: Learner accessed locked Milestone 2 without paying instalment #2!");
    }

    // Now Pay Instalment 2!
    console.log("\n   6c. Paying Instalment #2 to unlock Milestone 2...");
    const nextOrder = await createNextInstalmentOrder(
      learnerUser._id.toString(),
      order.paymentPlanId
    );
    const gatewayTxn2 = `GW-TXN-2-${timestamp}`;
    const sig2 = generatePaymentSignature(nextOrder.orderId, gatewayTxn2);

    const verifyRes2 = await verifyAndProcessPayment({
      learnerId: learnerUser._id.toString(),
      paymentPlanId: order.paymentPlanId,
      instalmentNumber: 2,
      orderId: nextOrder.orderId,
      gatewayTransactionId: gatewayTxn2,
      signature: sig2,
    });

    if (verifyRes2.unlockedInstalments !== 2) {
      throw new Error(`Expected unlockedInstalments = 2, got ${verifyRes2.unlockedInstalments}`);
    }

    console.log("   6d. Verifying Milestone 2 (Lesson 2) is now unlocked...");
    const accessL2 = await verifyLessonAccess(
      learnerUser._id.toString(),
      testCourse._id.toString(),
      lesson2Id.toString()
    );
    if (!accessL2 || !accessL2.lesson) {
      throw new Error("Failed to access newly unlocked Milestone 2 lesson!");
    }
    console.log("       Milestone 2 accessible after payment #2.");

    // Milestone 3 must still be locked
    let m3Blocked = false;
    try {
      await verifyLessonAccess(
        learnerUser._id.toString(),
        testCourse._id.toString(),
        lesson3Id.toString()
      );
    } catch (err: any) {
      m3Blocked = true;
      console.log("       Milestone 3 still locked as expected:", err.message);
    }
    if (!m3Blocked) {
      throw new Error("SECURITY FAILURE: Milestone 3 was unlocked prematurely!");
    }

    // Pay final instalment 3 to complete the plan
    console.log("\n   6e. Paying Final Instalment #3 to complete the course payment...");
    const nextOrder3 = await createNextInstalmentOrder(
      learnerUser._id.toString(),
      order.paymentPlanId
    );
    const gatewayTxn3 = `GW-TXN-3-${timestamp}`;
    const sig3 = generatePaymentSignature(nextOrder3.orderId, gatewayTxn3);

    const verifyRes3 = await verifyAndProcessPayment({
      learnerId: learnerUser._id.toString(),
      paymentPlanId: order.paymentPlanId,
      instalmentNumber: 3,
      orderId: nextOrder3.orderId,
      gatewayTransactionId: gatewayTxn3,
      signature: sig3,
    });

    if (verifyRes3.paymentPlan.status !== "completed") {
      throw new Error(`Expected plan status 'completed', got '${verifyRes3.paymentPlan.status}'`);
    }

    const accessL3 = await verifyLessonAccess(
      learnerUser._id.toString(),
      testCourse._id.toString(),
      lesson3Id.toString()
    );
    if (!accessL3 || !accessL3.lesson) {
      throw new Error("Failed to access Milestone 3 lesson after full completion!");
    }
    console.log("       All 3 Milestones fully unlocked and verified.\n");

    // -------------------------------------------------------------------------
    // TEST 6: Course Completion and Certificate Issuance
    // -------------------------------------------------------------------------
    console.log("--- 7. Testing Course Completion & Certificate Issuance ---");
    // Mark all lessons complete
    await updateLessonProgress(learnerUser._id.toString(), testCourse._id.toString(), lesson1Id.toString(), true);
    await updateLessonProgress(learnerUser._id.toString(), testCourse._id.toString(), lesson2Id.toString(), true);
    const finalProgress = await updateLessonProgress(
      learnerUser._id.toString(),
      testCourse._id.toString(),
      lesson3Id.toString(),
      true
    );

    console.log("   - Course Progress:", finalProgress.enrollment.progressPercentage + "%");
    console.log("   - Enrollment Status:", finalProgress.enrollment.status);

    if (finalProgress.enrollment.progressPercentage !== 100 || finalProgress.enrollment.status !== "completed") {
      throw new Error("Enrollment did not transition to 100% completed");
    }

    // Check certificate
    const cert = await getLearnerCourseCertificate(learnerUser._id.toString(), testCourse._id.toString());
    if (!cert) {
      throw new Error("Certificate was not automatically generated upon 100% course completion!");
    }
    console.log("   - Certificate Generated:", {
      certificateNumber: cert.certificateNumber,
      recipientName: cert.recipientName,
      courseTitle: cert.courseTitle,
      issueDate: cert.issueDate,
    });
    console.log("    Course completion and certificate issuance PASSED.\n");

    // -------------------------------------------------------------------------
    // TEST 7: Review Eligibility & Rating Submission Guard
    // -------------------------------------------------------------------------
    console.log("--- 8. Testing Course Review & Rating Eligibility Guard ---");
    // 7a. Non-enrolled or unverified user review attempt
    const outsider = await User.create({
      email: `outsider.${timestamp}@edupye.test`,
      name: "Outsider User",
      userType: "learner",
      roles: ["learner"],
      activeRole: "learner",
    });

    console.log("   8a. Testing unearned review rejection on outsider student...");
    const outsiderElig = await checkReviewEligibility(outsider._id.toString(), testCourse._id.toString());
    if (outsiderElig.eligible) {
      throw new Error("Outsider was incorrectly judged eligible to review!");
    }
    console.log("       Blocked outsider review eligibility:", outsiderElig.reason);

    // 7b. Verified graduate review submission
    console.log("   8b. Submitting verified graduate review (5 stars)...");
    const review = await submitCourseReview({
      learnerId: learnerUser._id.toString(),
      courseId: testCourse._id.toString(),
      rating: 5,
      title: "Exceptional Modular Curriculum",
      comment: "The instalment-based milestones made this high-value masterclass accessible. Great pacing and projects!",
    });

    console.log("   - Review Created:", {
      id: review._id,
      rating: review.rating,
      reviewer: review.learnerName,
      title: review.title,
    });

    // Verify Course average rating and review count updated
    const updatedCourse = await Course.findById(testCourse._id);
    console.log("   - Updated Course Ratings:", {
      averageRating: updatedCourse?.averageRating,
      reviewCount: updatedCourse?.reviewCount,
    });
    if (updatedCourse?.averageRating !== 5 || updatedCourse?.reviewCount !== 1) {
      throw new Error("Course averageRating / reviewCount failed to update!");
    }

    // 7c. Duplicate review prevention
    console.log("   8c. Attempting duplicate review submission...");
    let dupBlocked = false;
    try {
      await submitCourseReview({
        learnerId: learnerUser._id.toString(),
        courseId: testCourse._id.toString(),
        rating: 4,
        comment: "Attempting to spam another review.",
      });
    } catch (err: any) {
      dupBlocked = true;
      console.log("       Blocked duplicate review:", err.message);
    }
    if (!dupBlocked) {
      throw new Error("SECURITY FAILURE: Duplicate review was accepted!");
    }
    console.log("    Review eligibility & fraud prevention PASSED.\n");

    // -------------------------------------------------------------------------
    // TEST 8: Provider Financial Analytics & Ledger Audit
    // -------------------------------------------------------------------------
    console.log("--- 9. Testing Provider Financial Dashboard Analytics ---");
    const financials = await getProviderFinancialSummary(providerUser._id.toString());
    console.log("   - Financial Summary for Provider:", financials.summary);
    console.log("   - Transaction Count:", financials.transactions.length);

    // 3 instalments of $100 = $300 gross. Provider share 80% = $240. Platform share 20% = $60.
    if (
      financials.summary.totalGrossRevenue !== 300 ||
      financials.summary.totalProviderEarnings !== 240 ||
      financials.summary.totalPlatformCommission !== 60
    ) {
      throw new Error(`Financial summary numbers mismatch: ${JSON.stringify(financials.summary)}`);
    }
    console.log("    Provider financial analytics & 80:20 split verified.\n");

    console.log("=========================================================================");
    console.log("   ALL PHASE 2 COURSE MARKETPLACE BACKEND VERIFICATIONS PASSED (8/8)     ");
    console.log("=========================================================================");
  } finally {
    // Cleanup test data
    if (testCourse?._id) {
      await CourseReview.deleteMany({ course: testCourse._id });
      await Certificate.deleteMany({ course: testCourse._id });
      await FinancialLedger.deleteMany({ course: testCourse._id });
      await CoursePaymentPlan.deleteMany({ course: testCourse._id });
      await Enrollment.deleteMany({ course: testCourse._id });
      await Course.findByIdAndDelete(testCourse._id);
    }
    if (providerUser?._id) await User.findByIdAndDelete(providerUser._id);
    if (learnerUser?._id) await User.findByIdAndDelete(learnerUser._id);
    await mongoose.disconnect();
  }
}

runCourseMarketplaceEnhancementTests().catch((err) => {
  console.error(" Phase 2 Backend Verification Failed:", err);
  process.exit(1);
});

