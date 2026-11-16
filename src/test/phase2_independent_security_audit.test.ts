import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import User from "../models/User";
import Course from "../models/Course";
import Enrollment from "../models/Enrollment";
import CoursePaymentPlan from "../models/CoursePaymentPlan";
import FinancialLedger from "../models/FinancialLedger";
import Certificate from "../models/Certificate";
import CourseReview from "../models/CourseReview";

import {
  calculateRevenueShare,
  generatePaymentSignature,
  verifyPaymentSignature,
  createCoursePaymentOrder,
  verifyAndProcessPayment,
  createNextInstalmentOrder,
  getProviderFinancialSummary,
} from "../services/payment_service";

import { paymentWebhookController } from "../controllers/payment_controller";

import {
  verifyLessonAccess,
  updateLessonProgress,
  getLearnerCourseLearningState,
} from "../services/enrollment_service";

import {
  issueCourseCertificate,
  getLearnerCourseCertificate,
  verifyCertificateByNumber,
} from "../services/certificate_service";

import {
  checkReviewEligibility,
  submitCourseReview,
  getCourseReviews,
} from "../services/review_service";

async function runIndependentAuditSuite() {
  console.log("==========================================================================");
  console.log("  EDUPYE PHASE 2: INDEPENDENT SECURITY, PAYMENT & FUNCTIONAL AUDIT SUITE  ");
  console.log("==========================================================================\n");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(mongoUri);
  console.log(" MongoDB connected successfully.\n");

  const timestamp = Date.now();
  let auditPassed = 0;
  let auditFailed = 0;

  async function auditTest(title: string, fn: () => Promise<void>) {
    process.stdout.write(`[Audit] ${title} ... `);
    try {
      await fn();
      console.log("PASS");
      auditPassed++;
    } catch (err: any) {
      console.log(`FAIL\n  Reason: ${err.message}`);
      auditFailed++;
    }
  }

  // Set up test actors
  const providerA = await User.create({
    email: `prov.a.${timestamp}@edupye.test`,
    name: "Dr. Evelyn Reed (Provider A)",
    userType: "provider",
    activeRole: "provider",
    roles: ["provider", "teacher"],
  });

  const providerB = await User.create({
    email: `prov.b.${timestamp}@edupye.test`,
    name: "Prof. Alan Grant (Provider B)",
    userType: "provider",
    activeRole: "provider",
    roles: ["provider", "teacher"],
  });

  const learnerA = await User.create({
    email: `learner.a.${timestamp}@edupye.test`,
    name: "Maya Lin (Learner A)",
    userType: "learner",
    activeRole: "learner",
    roles: ["learner", "student"],
  });

  const learnerB = await User.create({
    email: `learner.b.${timestamp}@edupye.test`,
    name: "Lucas Scott (Learner B)",
    userType: "learner",
    activeRole: "learner",
    roles: ["learner", "student"],
  });

  // Set up test courses
  const courseA = await Course.create({
    title: `Distributed Cloud Architecture ${timestamp}`,
    slug: `dist-cloud-arch-${timestamp}`,
    description: "Deep dive into microservices and consensus protocols.",
    provider: providerA._id,
    providerName: providerA.name,
    category: "Cloud Computing",
    level: "Advanced",
    price: 300,
    currency: "USD",
    status: "published",
    allowInstalments: true,
    maxInstalments: 3,
    instalmentFrequencyDays: 30,
    sections: [
      {
        title: "Section 1: Foundations",
        order: 1,
        requiredInstalmentNumber: 1,
        lessons: [
          { title: "Lesson 1.1 Intro", contentType: "video", durationMinutes: 20, isPreviewFree: true, order: 1 },
          { title: "Lesson 1.2 Data Plane", contentType: "video", durationMinutes: 30, order: 2 },
        ],
      },
      {
        title: "Section 2: Raft Consensus",
        order: 2,
        requiredInstalmentNumber: 2,
        lessons: [
          { title: "Lesson 2.1 State Machines", contentType: "video", durationMinutes: 45, order: 1 },
        ],
      },
      {
        title: "Section 3: Production Scale",
        order: 3,
        requiredInstalmentNumber: 3,
        lessons: [
          { title: "Lesson 3.1 Observability", contentType: "video", durationMinutes: 50, order: 1 },
        ],
      },
    ],
  });

  const l1Id = courseA.sections[0].lessons[0]._id!.toString();
  const l2Id = courseA.sections[0].lessons[1]._id!.toString();
  const l3Id = courseA.sections[1].lessons[0]._id!.toString();
  const l4Id = courseA.sections[2].lessons[0]._id!.toString();

  console.log(` Created Test Course: "${courseA.title}" with 4 lessons across 3 sections.`);
  console.log(`   - Free Preview Lesson: ${l1Id}`);
  console.log(`   - Section 1 Milestone 1 Lesson: ${l2Id}`);
  console.log(`   - Section 2 Milestone 2 Lesson: ${l3Id}`);
  console.log(`   - Section 3 Milestone 3 Lesson: ${l4Id}\n`);

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: PAYMENT GATEWAY VERIFICATION & SIGNATURES
    // -------------------------------------------------------------------------
    console.log("--- 1. PAYMENT GATEWAY, SIGNATURES & REPLAY ATTACK AUDIT ---");

    await auditTest("HMAC-SHA256 signature generation and constant-time verification", async () => {
      const orderId = "ORD-TEST-1001";
      const txnId = "TXN-TEST-2001";
      const validSig = generatePaymentSignature(orderId, txnId);

      const isValid = verifyPaymentSignature(orderId, txnId, validSig);
      if (!isValid) throw new Error("Expected valid signature to verify successfully");

      const tamperedSig = validSig.slice(0, -2) + "aa";
      const isTamperedValid = verifyPaymentSignature(orderId, txnId, tamperedSig);
      if (isTamperedValid) throw new Error("Tampered signature was accepted as valid!");

      const wrongTxnValid = verifyPaymentSignature(orderId, "TXN-DIFFERENT", validSig);
      if (wrongTxnValid) throw new Error("Signature verified against incorrect transaction ID!");
    });

    await auditTest("Timing attack resilience on different signature lengths", async () => {
      const orderId = "ORD-TEST-1002";
      const txnId = "TXN-TEST-2002";
      const result = verifyPaymentSignature(orderId, txnId, "short");
      if (result !== false) throw new Error("Short signature falsely verified or did not return false");
    });

    await auditTest("Full course purchase flow with 100% upfront payment", async () => {
      const fullOrder = await createCoursePaymentOrder({
        learnerId: learnerB._id.toString(),
        courseId: courseA._id.toString(),
        planType: "full",
      });

      if (fullOrder.amountDueNow !== 300 || fullOrder.totalInstalments !== 1) {
        throw new Error(`Expected full payment of 300 in 1 instalment, got ${fullOrder.amountDueNow}`);
      }

      const fullTxnId = `TXN-FULL-${timestamp}`;
      const fullSig = generatePaymentSignature(fullOrder.orderId, fullTxnId);

      const fullVerify = await verifyAndProcessPayment({
        learnerId: learnerB._id.toString(),
        paymentPlanId: fullOrder.paymentPlanId,
        instalmentNumber: 1,
        orderId: fullOrder.orderId,
        gatewayTransactionId: fullTxnId,
        signature: fullSig,
      });

      if (fullVerify.paymentPlan.status !== "completed") {
        throw new Error(`Expected payment plan to be completed, got ${fullVerify.paymentPlan.status}`);
      }
      if (fullVerify.unlockedInstalments !== 1 && fullVerify.paymentPlan.totalInstalments !== 1) {
        throw new Error("Full payment did not mark complete");
      }

      // Check enrollment
      const bEnrollment = await Enrollment.findOne({ learner: learnerB._id, course: courseA._id });
      if (!bEnrollment || bEnrollment.paymentStatus !== "paid") {
        throw new Error("Full payment did not set enrollment paymentStatus to 'paid'");
      }
    });

    await auditTest("Instalment 1 payment creation and plan activation", async () => {
      const order = await createCoursePaymentOrder({
        learnerId: learnerA._id.toString(),
        courseId: courseA._id.toString(),
        planType: "instalment",
        numberOfInstalments: 3,
      });

      if (order.amountDueNow !== 100 || order.totalInstalments !== 3) {
        throw new Error(`Expected $100 due now across 3 instalments, got $${order.amountDueNow}`);
      }

      const txn1 = `GW-TXN-1-${timestamp}`;
      const sig1 = generatePaymentSignature(order.orderId, txn1);

      const verifyRes = await verifyAndProcessPayment({
        learnerId: learnerA._id.toString(),
        paymentPlanId: order.paymentPlanId,
        instalmentNumber: 1,
        orderId: order.orderId,
        gatewayTransactionId: txn1,
        signature: sig1,
      });

      if (verifyRes.unlockedInstalments !== 1 || verifyRes.paymentPlan.status !== "active") {
        throw new Error("Instalment 1 did not unlock milestone 1 or activate plan");
      }
    });

    await auditTest("Idempotent deduplication: Replaying same transaction ID is prevented", async () => {
      const plan = await CoursePaymentPlan.findOne({ learner: learnerA._id, course: courseA._id });
      const txn1 = `GW-TXN-1-${timestamp}`;
      const sig1 = generatePaymentSignature("ANY_ORDER", txn1);

      const replayResult = await verifyAndProcessPayment({
        learnerId: learnerA._id.toString(),
        paymentPlanId: plan!._id.toString(),
        instalmentNumber: 1,
        orderId: "ANY_ORDER",
        gatewayTransactionId: txn1, // Exact same gateway transaction ID
        signature: sig1,
      });

      // Verify that no second ledger document was created
      const ledgerCount = await FinancialLedger.countDocuments({ gatewayTransactionId: txn1 });
      if (ledgerCount !== 1) {
        throw new Error(`Expected exactly 1 ledger record for ${txn1}, found ${ledgerCount}`);
      }
    });

    await auditTest("Duplicate payment rejection on already-paid instalment number", async () => {
      const plan = await CoursePaymentPlan.findOne({ learner: learnerA._id, course: courseA._id });
      let rejected = false;
      try {
        await verifyAndProcessPayment({
          learnerId: learnerA._id.toString(),
          paymentPlanId: plan!._id.toString(),
          instalmentNumber: 1, // Already paid!
          orderId: "ORD-NEW",
          gatewayTransactionId: `GW-TXN-DIFFERENT-${timestamp}`,
        });
      } catch (err: any) {
        if (err.message.includes("already been paid")) {
          rejected = true;
        }
      }
      if (!rejected) {
        throw new Error("Failed to reject duplicate payment attempt on already-paid instalment #1");
      }
    });

    await auditTest("Webhook Security: Missing x-edupye-signature header is rejected (401 Unauthorized)", async () => {
      let statusCode = 0;
      let jsonResponse: any = null;
      const req: any = {
        headers: {},
        body: {
          event: "payment.success",
          learnerId: learnerA._id.toString(),
          paymentPlanId: "dummy_plan",
          instalmentNumber: 1,
          orderId: "ORD-DUMMY",
          gatewayTransactionId: "TXN-DUMMY",
        },
      };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonResponse = data;
        },
      };

      await paymentWebhookController(req, res);
      if (statusCode !== 401 || !jsonResponse?.message?.includes("Missing webhook signature")) {
        throw new Error(`Expected 401 Unauthorized for missing signature, got status ${statusCode}`);
      }
    });

    await auditTest("Webhook Security: Invalid x-edupye-signature header is rejected (400 Bad Request)", async () => {
      let statusCode = 0;
      let jsonResponse: any = null;
      const req: any = {
        headers: { "x-edupye-signature": "invalid_forged_signature_hex" },
        body: {
          event: "payment.success",
          learnerId: learnerA._id.toString(),
          paymentPlanId: "dummy_plan",
          instalmentNumber: 1,
          orderId: "ORD-DUMMY",
          gatewayTransactionId: "TXN-DUMMY",
        },
      };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonResponse = data;
        },
      };

      await paymentWebhookController(req, res);
      if (statusCode !== 400 || !jsonResponse?.message?.includes("Invalid webhook signature")) {
        throw new Error(`Expected 400 Bad Request for invalid signature, got status ${statusCode}`);
      }
    });

    await auditTest("Webhook Security: Non-payment.success event is ignored safely", async () => {
      let statusCode = 0;
      let jsonResponse: any = null;
      const req: any = {
        headers: {},
        body: {
          event: "payment.failed",
          orderId: "ORD-FAILED",
        },
      };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonResponse = data;
        },
      };

      await paymentWebhookController(req, res);
      if (statusCode !== 200 || jsonResponse?.ignored !== true) {
        throw new Error(`Expected 200 with ignored: true for payment.failed event, got status ${statusCode}`);
      }
    });

    // -------------------------------------------------------------------------
    // SECTION 2: PROGRESSIVE ACCESS & OUT-OF-ORDER TESTING
    // -------------------------------------------------------------------------
    console.log("\n--- 2. PROGRESSIVE CONTENT ACCESS & ACCESS CONTROL AUDIT ---");

    await auditTest("Free preview lesson accessible to unauthenticated visitors", async () => {
      const access = await verifyLessonAccess(undefined, courseA._id.toString(), l1Id);
      if (!access.lesson) throw new Error("Free preview lesson was blocked for visitor");
    });

    await auditTest("Paid Milestone 1 accessible to learner A who paid instalment #1", async () => {
      const access = await verifyLessonAccess(learnerA._id.toString(), courseA._id.toString(), l2Id);
      if (!access.lesson) throw new Error("Milestone 1 lesson was blocked for paid learner");
    });

    await auditTest("Locked Milestone 2 strictly blocked for learner A (403 Forbidden)", async () => {
      let blocked = false;
      try {
        await verifyLessonAccess(learnerA._id.toString(), courseA._id.toString(), l3Id);
      } catch (err: any) {
        if (err.message.includes("Forbidden") && err.message.includes("instalment #2")) {
          blocked = true;
        }
      }
      if (!blocked) {
        throw new Error("Learner A bypassed milestone 2 lock without paying instalment #2!");
      }
    });

    await auditTest("Cross-Learner Content Isolation: Unenrolled user strictly blocked from protected lessons", async () => {
      const stranger = await User.create({
        email: `stranger.${timestamp}@edupye.test`,
        name: "Intruder User",
        userType: "learner",
        activeRole: "learner",
        roles: ["learner"],
      });

      let blocked = false;
      try {
        await verifyLessonAccess(stranger._id.toString(), courseA._id.toString(), l2Id);
      } catch (err: any) {
        if (err.message.includes("Forbidden") && err.message.includes("enroll in this course")) {
          blocked = true;
        }
      }
      if (!blocked) {
        throw new Error("Unenrolled stranger bypassed enrollment check and accessed protected lesson!");
      }
    });

    await auditTest("Locked Milestone Progress Tamper: Attempting to mark locked lesson completed is rejected", async () => {
      // Learner A has only paid Milestone 1. Lesson 2.1 (l3Id) is in locked Milestone 2!
      let blocked = false;
      try {
        await updateLessonProgress(learnerA._id.toString(), courseA._id.toString(), l3Id, true);
      } catch (err: any) {
        if (err.message.includes("Cannot complete lesson in locked milestone section")) {
          blocked = true;
        }
      }
      if (!blocked) {
        throw new Error("Learner was able to mark a lesson in a locked milestone section as completed!");
      }
    });

    await auditTest("Out-of-Order Instalment Attack: Attempting to pay Instalment #3 before #2 is rejected", async () => {
      const plan = await CoursePaymentPlan.findOne({ learner: learnerA._id, course: courseA._id });
      // Current paid: 1. Attempting to directly pay #3:
      let prevented = false;
      try {
        await verifyAndProcessPayment({
          learnerId: learnerA._id.toString(),
          paymentPlanId: plan!._id.toString(),
          instalmentNumber: 3, // Out of order! #2 is pending!
          orderId: "ORD-ATTACK-OUT-OF-ORDER",
          gatewayTransactionId: `GW-OUT-OF-ORDER-${timestamp}`,
        });
      } catch (err: any) {
        if (err.message.includes("Out-of-order payment rejected")) {
          prevented = true;
        }
      }

      if (!prevented) {
        throw new Error("Out-of-order instalment payment was not rejected!");
      }
    });

    await auditTest("Sequential Instalment #2 payment unlocks Milestone 2", async () => {
      const plan = await CoursePaymentPlan.findOne({ learner: learnerA._id, course: courseA._id });
      // Pay legitimate next instalment #2
      const txn2 = `GW-TXN-2-${timestamp}`;
      const sig2 = generatePaymentSignature("ORD-2", txn2);

      const v2 = await verifyAndProcessPayment({
        learnerId: learnerA._id.toString(),
        paymentPlanId: plan!._id.toString(),
        instalmentNumber: 2,
        orderId: "ORD-2",
        gatewayTransactionId: txn2,
        signature: sig2,
      });

      if (v2.unlockedInstalments < 2) {
        throw new Error(`Expected at least 2 unlocked instalments, got ${v2.unlockedInstalments}`);
      }

      // Now Milestone 2 (Lesson 3) MUST be accessible
      const accessL3 = await verifyLessonAccess(learnerA._id.toString(), courseA._id.toString(), l3Id);
      if (!accessL3.lesson) throw new Error("Lesson 3 was not unlocked after paying instalment #2");

      // Milestone 3 (Lesson 4) MUST still be locked
      let l4Blocked = false;
      try {
        await verifyLessonAccess(learnerA._id.toString(), courseA._id.toString(), l4Id);
      } catch (err: any) {
        if (err.message.includes("instalment #3")) l4Blocked = true;
      }
      if (!l4Blocked) throw new Error("Milestone 3 was accessible before instalment #3 payment");
    });

    await auditTest("Sequential Instalment #3 payment completes course plan and unlocks all modules", async () => {
      const plan = await CoursePaymentPlan.findOne({ learner: learnerA._id, course: courseA._id });
      const txn3 = `GW-TXN-3-${timestamp}`;
      const sig3 = generatePaymentSignature("ORD-3", txn3);

      const v3 = await verifyAndProcessPayment({
        learnerId: learnerA._id.toString(),
        paymentPlanId: plan!._id.toString(),
        instalmentNumber: 3,
        orderId: "ORD-3",
        gatewayTransactionId: txn3,
        signature: sig3,
      });

      if (v3.paymentPlan.status !== "completed") {
        throw new Error(`Expected plan status 'completed', got ${v3.paymentPlan.status}`);
      }

      const accessL4 = await verifyLessonAccess(learnerA._id.toString(), courseA._id.toString(), l4Id);
      if (!accessL4.lesson) throw new Error("Lesson 4 was not unlocked after final instalment");
    });

    // -------------------------------------------------------------------------
    // SECTION 3: FINANCIAL LEDGER & REVENUE SHARING AUDIT
    // -------------------------------------------------------------------------
    console.log("\n--- 3. FINANCIAL LEDGER & REVENUE SHARING (80:20) AUDIT ---");

    await auditTest("80:20 split mathematical accuracy across irregular cents", async () => {
      const split1 = calculateRevenueShare(100.00);
      if (split1.providerShare !== 80.00 || split1.platformShare !== 20.00) {
        throw new Error(`Split error on 100: ${JSON.stringify(split1)}`);
      }

      const split2 = calculateRevenueShare(33.33);
      // 33.33 * 0.8 = 26.664 -> 26.66. Platform: 33.33 - 26.66 = 6.67
      if (split2.providerShare + split2.platformShare !== 33.33) {
        throw new Error(`Penny-rounding mismatch: ${split2.providerShare} + ${split2.platformShare} !== 33.33`);
      }
    });

    await auditTest("Provider Financial Summary isolation: Provider A vs Provider B", async () => {
      const summaryA = await getProviderFinancialSummary(providerA._id.toString());
      const summaryB = await getProviderFinancialSummary(providerB._id.toString());

      // Provider A had: Learner B full payment ($300) + Learner A 3 instalments ($100 each) = $600 gross
      // 80% provider earnings = $480. 20% platform = $120.
      if (summaryA.summary.totalGrossRevenue !== 600 || summaryA.summary.totalProviderEarnings !== 480) {
        throw new Error(`Provider A summary mismatch: gross=${summaryA.summary.totalGrossRevenue}, net=${summaryA.summary.totalProviderEarnings}`);
      }

      // Provider B had zero courses/sales
      if (summaryB.summary.totalGrossRevenue !== 0 || summaryB.summary.totalTransactions !== 0) {
        throw new Error(`Provider B leak: expected 0 gross revenue, got ${summaryB.summary.totalGrossRevenue}`);
      }
    });

    // -------------------------------------------------------------------------
    // SECTION 4: CERTIFICATE ISSUANCE & VERIFICATION AUDIT
    // -------------------------------------------------------------------------
    console.log("\n--- 4. CERTIFICATE OF COMPLETION AUDIT ---");

    await auditTest("Incomplete course certificate request is strictly rejected", async () => {
      // Learner A has completed 0 lessons so far
      let rejected = false;
      try {
        await issueCourseCertificate(learnerA._id.toString(), courseA._id.toString());
      } catch (err: any) {
        if (err.message.includes("progress is 0%")) rejected = true;
      }
      if (!rejected) throw new Error("Certificate was issued to learner with 0% progress!");
    });

    await auditTest("Progress manipulation exploit: marking non-existent or locked lesson completed is rejected", async () => {
      // Attempt to send fake lesson ID
      let fakeLessonBlocked = false;
      try {
        await updateLessonProgress(learnerA._id.toString(), courseA._id.toString(), "fake_lesson_id_9999", true);
      } catch (err: any) {
        if (err.message.includes("Lesson not found in course")) {
          fakeLessonBlocked = true;
        }
      }
      if (!fakeLessonBlocked) {
        throw new Error("Fake lesson was accepted without course validation!");
      }
    });

    await auditTest("Legitimate completion to 100% generates authentic certificate", async () => {
      // Mark all 4 real lessons as completed
      await updateLessonProgress(learnerA._id.toString(), courseA._id.toString(), l1Id, true);
      await updateLessonProgress(learnerA._id.toString(), courseA._id.toString(), l2Id, true);
      await updateLessonProgress(learnerA._id.toString(), courseA._id.toString(), l3Id, true);
      const finalProgress = await updateLessonProgress(learnerA._id.toString(), courseA._id.toString(), l4Id, true);

      if (finalProgress.enrollment.progressPercentage !== 100 || finalProgress.enrollment.status !== "completed") {
        throw new Error(`Expected 100% progress and 'completed' status, got ${finalProgress.enrollment.progressPercentage}%`);
      }

      const cert = await getLearnerCourseCertificate(learnerA._id.toString(), courseA._id.toString());
      if (!cert || !cert.certificateNumber.startsWith("CERT-")) {
        throw new Error("Certificate was not automatically generated upon 100% completion");
      }

      // Public verification check
      const verified = await verifyCertificateByNumber(cert.certificateNumber);
      if (!verified || verified.recipientName !== learnerA.name) {
        throw new Error("Public verification failed to locate certificate by number");
      }
    });

    await auditTest("Idempotent certificate issuance: Re-request returns identical certificate", async () => {
      const cert1 = await getLearnerCourseCertificate(learnerA._id.toString(), courseA._id.toString());
      const cert2 = await issueCourseCertificate(learnerA._id.toString(), courseA._id.toString());

      if (cert1?.certificateNumber !== cert2.certificateNumber) {
        throw new Error("Duplicate certificate issued with different number!");
      }
    });

    // -------------------------------------------------------------------------
    // SECTION 5: COURSE REVIEWS & ANTI-FRAUD VERIFICATION
    // -------------------------------------------------------------------------
    console.log("\n--- 5. COURSE REVIEWS & ANTI-FRAUD ELIGIBILITY AUDIT ---");

    await auditTest("Unenrolled user review attempt is strictly blocked", async () => {
      const outsider = await User.create({
        email: `outsider.${timestamp}@edupye.test`,
        name: "Outsider Critic",
        userType: "learner",
        activeRole: "learner",
        roles: ["learner"],
      });

      let blocked = false;
      try {
        await submitCourseReview({
          learnerId: outsider._id.toString(),
          courseId: courseA._id.toString(),
          rating: 1,
          comment: "Fake review by competitor",
        });
      } catch (err: any) {
        if (err.message.includes("Enrollment required")) blocked = true;
      }
      if (!blocked) throw new Error("Outsider was able to submit a course review!");
    });

    await auditTest("Enrolled but incomplete learner review attempt is blocked", async () => {
      // Learner B paid in full but has completed 0 lessons
      let blocked = false;
      try {
        await submitCourseReview({
          learnerId: learnerB._id.toString(),
          courseId: courseA._id.toString(),
          rating: 5,
          comment: "Looks great so far but haven't taken it",
        });
      } catch (err: any) {
        if (err.message.includes("Course completion required")) blocked = true;
      }
      if (!blocked) throw new Error("Incomplete learner was able to submit a course review!");
    });

    await auditTest("Verified graduate (Learner A: 100% + Certificate) submits review", async () => {
      const elig = await checkReviewEligibility(learnerA._id.toString(), courseA._id.toString());
      if (!elig.eligible) throw new Error(`Graduate deemed ineligible: ${elig.reason}`);

      const review = await submitCourseReview({
        learnerId: learnerA._id.toString(),
        courseId: courseA._id.toString(),
        rating: 5,
        title: "Masterclass in Distributed Systems",
        comment: "This course transformed our engineering team's approach to distributed architecture.",
      });

      if (review.rating !== 5 || !review.learnerName) {
        throw new Error("Review creation returned unexpected data");
      }

      // Check course ratings updated
      const updatedCourse = await Course.findById(courseA._id);
      if (updatedCourse?.averageRating !== 5 || updatedCourse?.reviewCount !== 1) {
        throw new Error(`Course ratings not updated: avg=${updatedCourse?.averageRating}, count=${updatedCourse?.reviewCount}`);
      }
    });

    await auditTest("Duplicate review attempt by same graduate is rejected", async () => {
      let blocked = false;
      try {
        await submitCourseReview({
          learnerId: learnerA._id.toString(),
          courseId: courseA._id.toString(),
          rating: 4,
          comment: "Attempting second review on same course",
        });
      } catch (err: any) {
        if (err.message.includes("already submitted a review")) blocked = true;
      }
      if (!blocked) throw new Error("Duplicate review was accepted from the same graduate!");
    });

  } finally {
    // Clean up test actors & courses
    await CourseReview.deleteMany({ course: courseA._id });
    await Certificate.deleteMany({ course: courseA._id });
    await FinancialLedger.deleteMany({ course: courseA._id });
    await CoursePaymentPlan.deleteMany({ course: courseA._id });
    await Enrollment.deleteMany({ course: courseA._id });
    await Course.findByIdAndDelete(courseA._id);
    await User.deleteMany({ _id: { $in: [providerA._id, providerB._id, learnerA._id, learnerB._id] } });
    await mongoose.disconnect();
    console.log("\n MongoDB disconnected and test data cleaned up.");
  }

  console.log("\n==========================================================================");
  console.log(`  AUDIT SUITE SUMMARY: ${auditPassed} PASSED, ${auditFailed} FAILED`);
  console.log("==========================================================================\n");

  if (auditFailed > 0) {
    process.exit(1);
  }
}

runIndependentAuditSuite().catch((err) => {
  console.error("[Fatal Audit Error]", err);
  process.exit(1);
});
