import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import assert from "assert";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import User from "../models/User";
import TuitionProviderProfile from "../models/TuitionProviderProfile";
import TuitionOffering from "../models/TuitionOffering";
import TuitionBatch from "../models/TuitionBatch";
import TuitionRequest from "../models/TuitionRequest";
import TuitionEnrollment from "../models/TuitionEnrollment";
import TuitionSession from "../models/TuitionSession";
import TuitionAttendance from "../models/TuitionAttendance";
import TuitionMaterial from "../models/TuitionMaterial";
import TuitionAssessment from "../models/TuitionAssessment";
import TuitionTransaction from "../models/TuitionTransaction";
import TuitionSlotReservation from "../models/TuitionSlotReservation";

import * as providerService from "../services/tuition_provider_service";
import * as scheduleService from "../services/tuition_schedule_service";
import * as requestService from "../services/tuition_request_service";
import * as marketplaceService from "../services/tuition_marketplace_service";
import * as studentService from "../services/tuition_student_service";
import * as tierService from "../services/tuition_tier_service";
import * as reviewService from "../services/tuition_review_service";

async function runSteps4To8E2ETestSuite() {
  console.log("==========================================================================");
  console.log("  EDUPYE PHASE 3: STEPS 4–8 COMPLETE INTEGRATION & SECURITY TEST SUITE    ");
  console.log("==========================================================================\n");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(mongoUri);
  console.log("✓ Connected to MongoDB.\n");

  const timestamp = Date.now();
  let testsPassed = 0;
  let testsFailed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      testsPassed++;
    } catch (err: any) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    -> ${err.message}`);
      testsFailed++;
    }
  }

  try {
    // ------------------------------------------------------------------------
    // SETUP TEST ACTORS
    // ------------------------------------------------------------------------
    console.log("--- SETUP: PROVIDERS, STUDENTS & VERIFICATION ---");

    const providerUser = await User.create({
      email: `master_tutor_${timestamp}@edupye.test`,
      name: `Prof. Rajesh Nair ${timestamp}`,
      userType: "tuition_provider",
      roles: ["tuition_provider"],
      activeRole: "tuition_provider",
    });

    const providerProfile = await TuitionProviderProfile.create({
      userId: providerUser._id,
      fullName: `Prof. Rajesh Nair ${timestamp}`,
      headline: "Senior Physics & Mathematics Faculty",
      bio: "14+ years coaching JEE Advanced, Olympiads, and CBSE Physics.",
      education: [
        {
          degree: "PhD in Theoretical Physics",
          institution: "IIT Bombay",
          yearOfPassing: 2010,
          isVerified: true,
        },
      ],
      qualifications: ["PhD Physics", "MSc Physics IITB"],
      experienceYears: 14,
      isQualificationsVerified: true,
      isExperienceVerified: true,
      subjects: ["Physics", "Mathematics"],
      classesTaught: ["Class 12", "JEE Prep"],
      teachingMode: ["online", "hybrid"],
      verificationStatus: "verified",
      platformTier: "diamond",
      calculatedTier: "diamond",
      isProvisionalTier: false,
      rating: { average: 4.9, count: 12 },
      pricing: { minHourlyRate: 2000, maxHourlyRate: 4000, currency: "INR" },
      isActive: true,
    });

    const studentUser1 = await User.create({
      email: `student_alpha_${timestamp}@edupye.test`,
      name: `Aditya Varma ${timestamp}`,
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });

    const studentUser2 = await User.create({
      email: `student_beta_${timestamp}@edupye.test`,
      name: `Priya Sen ${timestamp}`,
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });

    const outsiderUser = await User.create({
      email: `outsider_${timestamp}@edupye.test`,
      name: `Outsider User ${timestamp}`,
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });

    // Create a group offering with strict capacity 2
    const groupOffering = await scheduleService.createOffering(providerUser._id.toString(), {
      title: "JEE Advanced Rotational & Quantum Mechanics",
      subject: "Physics",
      classLevel: "Class 12",
      description: "Complete mastery of angular momentum, gyroscopes, and quantum wavefunctions.",
      teachingMode: "online",
      classFormat: "group",
      scheduleModel: "fixed_batch",
      maxCapacity: 2, // Strict 2-seat capacity
      feeAmount: 4500,
      billingUnit: "monthly",
      currency: "INR",
      availableDays: ["Monday", "Wednesday", "Friday"],
    });

    // Create a batch with capacity 2
    const cohortBatch = await scheduleService.createBatch(providerUser._id.toString(), {
      offeringId: groupOffering._id,
      title: "JEE Cohort Elite Batch 1",
      daysOfWeek: ["Monday", "Wednesday"],
      startTime: "18:00",
      endTime: "19:30",
      maxCapacity: 2,
    });

    // Create a 1:1 offering
    const oneToOneOffering = await scheduleService.createOffering(providerUser._id.toString(), {
      title: "1:1 Elite Physics Mentorship",
      subject: "Physics",
      classLevel: "Class 12",
      description: "Personalized 1:1 problem solving and doubt clearing.",
      teachingMode: "online",
      classFormat: "1:1",
      scheduleModel: "flexible_slot",
      maxCapacity: 1,
      feeAmount: 3000,
      billingUnit: "hourly",
      currency: "INR",
      availableDays: ["Friday"],
    });

    // ------------------------------------------------------------------------
    // STEP 4: BOOKING REQUESTS, APPROVAL, SIMULATED PAYMENT & CAPACITY INTEGRITY
    // ------------------------------------------------------------------------
    console.log("\n--- STEP 4: BOOKING WORKFLOW, PAYMENT & ATOMIC CAPACITY ---");

    let requestS1: any;
    let requestS2: any;
    let enrollmentS1: any;
    let enrollmentS2: any;

    await test("Step 4.1: Student submits tuition request with initial status 'pending'", async () => {
      requestS1 = await requestService.createTuitionRequest(studentUser1._id.toString(), {
        offeringId: groupOffering._id.toString(),
        batchId: cohortBatch._id.toString(),
        classFormat: "group",
        teachingMode: "online",
        studentNotes: "Aiming for top 500 in JEE Advanced.",
      });

      assert.strictEqual(requestS1.status, "pending");
      assert.strictEqual(requestS1.feeAmount, 4500);
      assert.strictEqual(requestS1.studentId.toString(), studentUser1._id.toString());
      assert.strictEqual(requestS1.providerId.toString(), providerUser._id.toString());
    });

    await test("Step 4.2: Duplicate pending request by same student for same offering is blocked", async () => {
      try {
        await requestService.createTuitionRequest(studentUser1._id.toString(), {
          offeringId: groupOffering._id.toString(),
          batchId: cohortBatch._id.toString(),
          classFormat: "group",
          teachingMode: "online",
        });
        assert.fail("Duplicate pending request should be blocked");
      } catch (err: any) {
        assert(err.message.includes("active request"));
      }
    });

    await test("Step 4.3: Payment attempt before provider acceptance is strictly blocked", async () => {
      try {
        await requestService.studentVerifyAndSettleTuitionPayment(studentUser1._id.toString(), {
          requestId: requestS1._id.toString(),
          gatewayTransactionId: "FAKE_TXN_PREMATURE",
          signature: "FAKE_SIG",
        });
        assert.fail("Premature payment should be rejected");
      } catch (err: any) {
        assert(err.message.includes("Cannot pay for request with status 'pending'"));
      }
    });

    await test("Step 4.4: Unauthorized provider cannot respond to another provider's request", async () => {
      try {
        await requestService.providerRespondToTuitionRequest(
          outsiderUser._id.toString(),
          requestS1._id.toString(),
          "accept"
        );
        assert(false, "Unauthorized provider should be rejected");
      } catch (err: any) {
        assert(err.message.includes("Unauthorized: You are not the provider"));
      }
    });

    await test("Step 4.5: Provider accepts request; cryptographic payment tokens generated", async () => {
      requestS1 = await requestService.providerRespondToTuitionRequest(
        providerUser._id.toString(),
        requestS1._id.toString(),
        "accept",
        "Accepted. Class materials will be shared upon fee confirmation."
      );

      assert.strictEqual(requestS1.status, "accepted");
      assert(Boolean(requestS1.simulationPaymentToken), "Simulation payment token must be generated");
      assert(Boolean(requestS1.simulationTransactionId), "Simulation transaction ID must be generated");
      assert(requestS1.expiresAt > new Date());
    });

    await test("Step 4.6: Tampered/forged payment signature is strictly rejected by HMAC check", async () => {
      try {
        await requestService.studentVerifyAndSettleTuitionPayment(studentUser1._id.toString(), {
          requestId: requestS1._id.toString(),
          gatewayTransactionId: requestS1.simulationTransactionId,
          signature: "FORGED_SIGNATURE_TAMPERED",
        });
        assert(false, "Forged signature must fail verification");
      } catch (err: any) {
        assert(err.message.includes("Cryptographic payment signature verification failed"));
      }
    });

    await test("Step 4.7: Valid simulated payment settlement activates enrolment and atomically increments batch count", async () => {
      const settlement = await requestService.studentVerifyAndSettleTuitionPayment(studentUser1._id.toString(), {
        requestId: requestS1._id.toString(),
        gatewayTransactionId: requestS1.simulationTransactionId,
        signature: requestS1.simulationPaymentToken,
      });

      enrollmentS1 = settlement.enrollment;
      assert.strictEqual(enrollmentS1.status, "active");
      assert.strictEqual(enrollmentS1.feePaid, 4500);

      // Verify batch count atomically incremented to 1
      const updatedBatch = await TuitionBatch.findById(cohortBatch._id);
      assert.strictEqual(updatedBatch?.enrolledCount, 1);

      // Verify independent tuition transaction recorded with 100% gross earnings (NO commission split)
      const txn = await TuitionTransaction.findOne({ gatewayTransactionId: requestS1.simulationTransactionId });
      assert(txn, "Tuition transaction must exist in ledger");
      assert.strictEqual(txn.grossAmount, 4500, "Gross amount must be 100% of offering fee (zero platform deduction)");
      assert.strictEqual(txn.status, "paid");
    });

    await test("Step 4.8: Payment replay protection prevents duplicate settlement of same transaction", async () => {
      try {
        await requestService.studentVerifyAndSettleTuitionPayment(studentUser1._id.toString(), {
          requestId: requestS1._id.toString(),
          gatewayTransactionId: requestS1.simulationTransactionId,
          signature: requestS1.simulationPaymentToken,
        });
        assert(false, "Replay settlement must be rejected");
      } catch (err: any) {
        assert(err.message.includes("Duplicate payment transaction detected") || err.message.includes("Cannot pay for request"));
      }
    });

    await test("Step 4.9: Second student enroled; batch reaches full capacity (2/2)", async () => {
      requestS2 = await requestService.createTuitionRequest(studentUser2._id.toString(), {
        offeringId: groupOffering._id.toString(),
        batchId: cohortBatch._id.toString(),
        classFormat: "group",
        teachingMode: "online",
      });

      await requestService.providerRespondToTuitionRequest(
        providerUser._id.toString(),
        requestS2._id.toString(),
        "accept"
      );

      const refreshedReqS2 = await TuitionRequest.findById(requestS2._id);
      const settlement2 = await requestService.studentVerifyAndSettleTuitionPayment(studentUser2._id.toString(), {
        requestId: requestS2._id.toString(),
        gatewayTransactionId: refreshedReqS2!.simulationTransactionId!,
        signature: refreshedReqS2!.simulationPaymentToken!,
      });

      enrollmentS2 = settlement2.enrollment;
      assert.strictEqual(enrollmentS2.status, "active");

      const fullBatch = await TuitionBatch.findById(cohortBatch._id);
      assert.strictEqual(fullBatch?.enrolledCount, 2);
      assert.strictEqual(fullBatch?.maxCapacity, 2);
    });

    await test("Step 4.10: Third student attempting to join full batch is rejected by backend capacity guard", async () => {
      const thirdStudent = await User.create({
        email: `student_gamma_${timestamp}@edupye.test`,
        name: "Dev Patel",
        userType: "student",
      });

      try {
        await requestService.createTuitionRequest(thirdStudent._id.toString(), {
          offeringId: groupOffering._id.toString(),
          batchId: cohortBatch._id.toString(),
          classFormat: "group",
          teachingMode: "online",
        });
        assert.fail("Full batch request should be rejected");
      } catch (err: any) {
        assert(err.message.includes("maximum student capacity"));
      }
    });

    await test("Step 4.11: Student cancels active enrolment; batch seat capacity atomically released", async () => {
      const cancelResult = await requestService.cancelTuitionEnrollment(
        studentUser2._id.toString(),
        enrollmentS2._id.toString(),
        "Personal schedule conflict"
      );

      assert.strictEqual(cancelResult.status, "cancelled");

      const releasedBatch = await TuitionBatch.findById(cohortBatch._id);
      assert.strictEqual(releasedBatch?.enrolledCount, 1, "Enrolled count must decrement from 2 to 1");
    });

    await test("Step 4.12: Student cancels pending request; request status transitions to 'cancelled'", async () => {
      const newReq = await requestService.createTuitionRequest(studentUser2._id.toString(), {
        offeringId: oneToOneOffering._id.toString(),
        classFormat: "1:1",
        teachingMode: "online",
        requestedSlot: { day: "Friday", startTime: "17:00", endTime: "18:00" },
      });

      const cancelledReq = await requestService.cancelTuitionRequest(
        studentUser2._id.toString(),
        newReq._id.toString(),
        "Changed mind"
      );
      assert.strictEqual(cancelledReq.status, "cancelled");
    });

    // ------------------------------------------------------------------------
    // STEP 5: SCHEDULING, SESSIONS, LIVE CLASS, ATTENDANCE & CONFLICT CHECKS
    // ------------------------------------------------------------------------
    console.log("\n--- STEP 5: SCHEDULING, SESSIONS & ATTENDANCE ---");

    let createdSession: any;

    await test("Step 5.1: Provider creates scheduled session for cohort batch", async () => {
      // Clear any conflicting sessions for this test provider to avoid collisions across repeated runs
      await TuitionSession.deleteMany({ providerId: providerUser._id });

      const sessionDate = new Date();
      sessionDate.setDate(sessionDate.getDate() + 10);

      createdSession = await scheduleService.createSession(providerUser._id.toString(), {
        offeringId: groupOffering._id.toString(),
        batchId: cohortBatch._id.toString(),
        title: "Rotational Dynamics Core Numerical Drill",
        topic: "Conservation of Angular Momentum & Gyroscopes",
        sessionDate,
        startTime: "18:00",
        endTime: "19:30",
        meetingProvider: "edupye_smartboard",
        meetingLink: "/teacher/smartboard/integrated",
        notes: "Bring your formula notebook and JEE Advanced previous year sheets.",
      });

      assert.strictEqual(createdSession.title, "Rotational Dynamics Core Numerical Drill");
      assert.strictEqual(createdSession.status, "scheduled");
      assert.strictEqual(createdSession.meetingProvider, "edupye_smartboard");
      assert(createdSession.studentIds.some((s: any) => s.toString() === studentUser1._id.toString()));
    });

    await test("Step 5.2: Double-booking prevention blocks conflicting session on same date & time interval", async () => {
      try {
        await scheduleService.createSession(providerUser._id.toString(), {
          offeringId: groupOffering._id.toString(),
          batchId: cohortBatch._id.toString(),
          title: "Conflicting Session",
          sessionDate: createdSession.sessionDate,
          startTime: "18:30", // Overlaps 18:00-19:30
          endTime: "20:00",
        });
        assert(false, "Conflicting session should be rejected");
      } catch (err: any) {
        assert(err.message.includes("Double-booking conflict"));
      }
    });

    await test("Step 5.3: Provider launches session -> status becomes 'live' with meeting link", async () => {
      const liveSession = await scheduleService.updateSessionStatus(
        providerUser._id.toString(),
        createdSession._id.toString(),
        "live",
        `/teacher/smartboard/integrated?session=${createdSession._id.toString()}`
      );

      assert.strictEqual(liveSession.status, "live");
      assert(Boolean(liveSession.startedAt));
      assert(liveSession.meetingLink?.includes(createdSession._id.toString()));
    });

    await test("Step 5.4: Provider completes session and records student attendance", async () => {
      await scheduleService.updateSessionStatus(
        providerUser._id.toString(),
        createdSession._id.toString(),
        "completed"
      );

      const attendance = await scheduleService.recordAttendance(
        providerUser._id.toString(),
        createdSession._id.toString(),
        [
          {
            studentId: studentUser1._id,
            status: "present",
            remarks: "Solved all rotational dynamics questions actively.",
            markedAt: new Date(),
          },
        ]
      );

      assert.strictEqual(attendance.records.length, 1);
      assert.strictEqual(attendance.records[0].status, "present");

      // Verify student enrolment counters updated
      const updatedEnr = await TuitionEnrollment.findById(enrollmentS1._id);
      assert.strictEqual(updatedEnr?.sessionsAttended, 1);
      assert.strictEqual(updatedEnr?.totalSessionsConducted, 1);
    });

    await test("Step 5.5: Provider reschedules upcoming session with conflict prevention", async () => {
      // Create another session at 14:00 (non-overlapping with 18:00 recurring cohort)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      const sessionToReschedule = await scheduleService.createSession(providerUser._id.toString(), {
        offeringId: groupOffering._id.toString(),
        batchId: cohortBatch._id.toString(),
        title: "Wave Optics Interference Patterns",
        sessionDate: futureDate,
        startTime: "14:00",
        endTime: "15:30",
      });

      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 6);

      const rescheduled = await scheduleService.rescheduleSession(
        providerUser._id.toString(),
        sessionToReschedule._id.toString(),
        newDate,
        "15:00",
        "16:30",
        "Faculty travel schedule adjustment"
      );

      assert.strictEqual(rescheduled.startTime, "15:00");
      assert.strictEqual(rescheduled.endTime, "16:30");
      assert.strictEqual(rescheduled.rescheduleReason, "Faculty travel schedule adjustment");
      assert.strictEqual(rescheduled.rescheduledFromSessionId?.toString(), sessionToReschedule._id.toString());
    });

    await test("Step 5.6: Provider cancels session; status set to 'cancelled' with timestamp and reason", async () => {
      const cancelDate = new Date();
      cancelDate.setDate(cancelDate.getDate() + 10);

      const sessionToCancel = await scheduleService.createSession(providerUser._id.toString(), {
        offeringId: groupOffering._id.toString(),
        batchId: cohortBatch._id.toString(),
        title: "Optional Doubt Clearing Hour",
        sessionDate: cancelDate,
        startTime: "10:00",
        endTime: "11:00",
      });

      const cancelled = await scheduleService.cancelSession(
        providerUser._id.toString(),
        sessionToCancel._id.toString(),
        "National holiday observatory visit"
      );

      assert.strictEqual(cancelled.status, "cancelled");
      assert.strictEqual(cancelled.cancellationReason, "National holiday observatory visit");
      assert(Boolean(cancelled.cancelledAt));
    });

    await test("Step 5.7: Student schedule endpoint returns only their enrolled sessions", async () => {
      const studentSessions = await scheduleService.getStudentSchedule(studentUser1._id.toString());
      assert(studentSessions.length >= 1);
      assert(studentSessions.every((s: any) => s.studentIds.some((id: any) => id.toString() === studentUser1._id.toString())));

      // Outsider should have 0 scheduled sessions
      const outsiderSessions = await scheduleService.getStudentSchedule(outsiderUser._id.toString());
      assert.strictEqual(outsiderSessions.length, 0);
    });

    // ------------------------------------------------------------------------
    // STEP 6: TUITION STUDENT DASHBOARD APIS, MATERIALS & ASSESSMENTS
    // ------------------------------------------------------------------------
    console.log("\n--- STEP 6: TUITION STUDENT DASHBOARD, MATERIALS & ASSESSMENTS ---");

    let materialDoc: any;
    let assessmentDoc: any;

    await test("Step 6.1: Provider shares study material for offering", async () => {
      materialDoc = await TuitionMaterial.create({
        providerId: providerUser._id,
        offeringId: groupOffering._id,
        batchId: cohortBatch._id,
        title: "JEE Advanced Rotational Motion Formula Handbook",
        description: "Standard formula bank with solved illustrations.",
        fileUrl: "https://edupye-storage.s3.amazonaws.com/tuition/physics_rotational.pdf",
        fileType: "pdf",
        fileSize: "4.8 MB",
      });

      assert.strictEqual(materialDoc.title, "JEE Advanced Rotational Motion Formula Handbook");
    });

    await test("Step 6.2: Enrolled student can access material; unenrolled outsider cannot", async () => {
      const studentMats = await studentService.getStudentTuitionMaterials(studentUser1._id.toString());
      assert(studentMats.some((m) => m._id.toString() === materialDoc._id.toString()));

      const outsiderMats = await studentService.getStudentTuitionMaterials(outsiderUser._id.toString());
      assert.strictEqual(outsiderMats.length, 0, "Outsider must not receive materials for classes they are not enrolled in");
    });

    await test("Step 6.3: Provider creates assessment; enrolled student submits response", async () => {
      assessmentDoc = await TuitionAssessment.create({
        providerId: providerUser._id,
        offeringId: groupOffering._id,
        batchId: cohortBatch._id,
        title: "Rotational Mechanics Problem Set 1",
        description: "Submit 5 subjective problems with complete free-body diagrams.",
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        totalMarks: 50,
      });

      // Student views assessments
      const studentAss = await studentService.getStudentTuitionAssessments(studentUser1._id.toString());
      assert(studentAss.some((a) => a._id.toString() === assessmentDoc._id.toString()));

      // Student submits response
      const submittedAss = await studentService.submitStudentAssessment(
        studentUser1._id.toString(),
        assessmentDoc._id.toString(),
        {
          fileUrl: "https://edupye-storage.s3.amazonaws.com/submissions/aditya_phys_ps1.pdf",
          notes: "All 5 solutions attached with step-by-step vector diagrams.",
        }
      );

      assert.strictEqual(submittedAss.submissions.length, 1);
      assert.strictEqual(submittedAss.submissions[0].studentId.toString(), studentUser1._id.toString());
      assert.strictEqual(submittedAss.submissions[0].notes, "All 5 solutions attached with step-by-step vector diagrams.");
    });

    await test("Step 6.4: Student overview endpoint aggregates classes, sessions, attendance rate & requests", async () => {
      const overview = await studentService.getTuitionStudentOverview(studentUser1._id.toString());

      assert(overview.activeEnrollmentsCount >= 1);
      assert.strictEqual(overview.attendanceRate, 100);
      assert(overview.activeEnrollments.length >= 1);
      assert(Array.isArray(overview.upcomingSessions));
      assert(Array.isArray(overview.recentRequests));
    });

    await test("Step 6.5: Student payments history returns exact transaction records", async () => {
      const payments = await studentService.getStudentTuitionPayments(studentUser1._id.toString());
      assert(payments.length >= 1);
      assert.strictEqual(payments[0].grossAmount, 4500);
      assert.strictEqual(payments[0].status, "paid");
    });

    // ------------------------------------------------------------------------
    // STEP 7: REVIEWS, RATINGS, TIERS, BADGES & FINANCIALS
    // ------------------------------------------------------------------------
    console.log("\n--- STEP 7: REVIEWS, RATINGS, TIERS, BADGES & FINANCIALS ---");

    await test("Step 7.1: Outsider cannot review provider without active/completed enrolment", async () => {
      // Mark enrollment as completed so eligibility check reaches ownership
      enrollmentS1.status = "completed";
      await enrollmentS1.save();

      try {
        await reviewService.createTuitionReview(outsiderUser._id.toString(), {
          providerId: providerUser._id.toString(),
          enrollmentId: enrollmentS1._id.toString(), // Belongs to Student 1, not outsider
          rating: 5,
          reviewText: "Unauthorized outsider review attempt",
        });
        assert.fail("Outsider review should be blocked");
      } catch (err: any) {
        assert(err.message.includes("eligible enrolment"));
      }
    });

    await test("Step 7.2: Enrolled student submits 5-star review; provider aggregate rating updated", async () => {
      const review = await reviewService.createTuitionReview(studentUser1._id.toString(), {
        providerId: providerUser._id.toString(),
        enrollmentId: enrollmentS1._id.toString(),
        rating: 5,
        reviewText: "Brilliant explanations of rotational physics! Cleared all my JEE Advanced doubts.",
      });

      assert.strictEqual(review.rating, 5);
      assert.strictEqual(review.status, "published");

      // Verify provider profile rating was updated
      const refreshedProfile = await TuitionProviderProfile.findById(providerProfile._id);
      assert(refreshedProfile!.rating.count >= 1);
      assert(refreshedProfile!.rating.average >= 4.8);
    });

    await test("Step 7.3: Duplicate review for same enrolment is strictly blocked", async () => {
      try {
        await reviewService.createTuitionReview(studentUser1._id.toString(), {
          providerId: providerUser._id.toString(),
          enrollmentId: enrollmentS1._id.toString(),
          rating: 5,
          reviewText: "Duplicate review attempt",
        });
        assert.fail("Duplicate review must fail");
      } catch (err: any) {
        assert(err.message.includes("already submitted a review"));
      }
    });

    await test("Step 7.4: Platform achievement badges are calculated and awarded server-side", async () => {
      // Recalculate provider profile tier & badges
      const evaluatedProfile = await tierService.recalculateAndSaveProviderTier(providerProfile._id.toString());

      assert(Array.isArray(evaluatedProfile.badges), "Provider profile must contain badges array");
      assert(evaluatedProfile.badges.length >= 3, `Expected at least 3 badges, found ${evaluatedProfile.badges.length}`);

      const badgeIds = evaluatedProfile.badges.map((b) => b.badgeId);
      assert(badgeIds.includes("verified_educator"), "Must have EduPye Verified Educator badge");
      assert(badgeIds.includes("experienced_tutor"), "Must have EduPye Experienced Tutor badge (14 yrs > 5)");
      assert(badgeIds.includes("consistent_performer"), "Must have EduPye Consistent Performer badge");

      // Points-based evaluation maps 55 pts (PhD:30 + Exp:25) to Gold tier
      assert.strictEqual(evaluatedProfile.platformTier, "gold");
    });

    await test("Step 7.5: Provider financial dashboard shows 100% gross earnings and student breakdown", async () => {
      const financials = await providerService.getTuitionProviderFinancials(providerUser._id.toString());

      assert.strictEqual(financials.summary.totalGrossEarnings, 9000); // 2 student enrolments of 4500 each
      assert.strictEqual(financials.summary.totalRefunded, 0);
      assert.strictEqual(financials.summary.netEarnings, 9000);
      assert.strictEqual(financials.summary.currency, "INR");
      assert.strictEqual(financials.summary.transactionCount, 2);

      assert(financials.studentBreakdown.length >= 2);
      assert(financials.studentBreakdown.some((s: any) => s.studentEmail === `student_alpha_${timestamp}@edupye.test`));
    });

    // ------------------------------------------------------------------------
    // STEP 8: SECURITY AUDIT & OBJECT-LEVEL OWNERSHIP CONTROLS
    // ------------------------------------------------------------------------
    console.log("\n--- STEP 8: OBJECT-LEVEL AUTHORIZATION & SECURITY GUARDS ---");

    await test("Step 8.1: Student cannot cancel another student's request", async () => {
      const student3 = await User.create({
        email: `student_intruder_${timestamp}@edupye.test`,
        name: "Intruder Student",
        userType: "student",
      });

      const legitReq = await requestService.createTuitionRequest(studentUser1._id.toString(), {
        offeringId: oneToOneOffering._id.toString(),
        classFormat: "1:1",
        teachingMode: "online",
        requestedSlot: { day: "Friday", startTime: "14:00", endTime: "15:00" },
      });

      try {
        await requestService.cancelTuitionRequest(student3._id.toString(), legitReq._id.toString());
        assert(false, "Cross-student request cancellation must fail");
      } catch (err: any) {
        assert(err.message.includes("Unauthorized: You can only cancel your own tuition request"));
      }
    });

    await test("Step 8.2: Provider cannot reschedule or cancel another provider's session", async () => {
      const rogueProvider = await User.create({
        email: `rogue_tutor_${timestamp}@edupye.test`,
        name: "Rogue Tutor",
        userType: "tuition_provider",
        roles: ["tuition_provider"],
      });

      try {
        await scheduleService.rescheduleSession(
          rogueProvider._id.toString(),
          createdSession._id.toString(),
          new Date(),
          "10:00",
          "11:00",
          "Malicious reschedule"
        );
        assert(false, "Cross-provider reschedule should be blocked");
      } catch (err: any) {
        assert(err.message.includes("Unauthorized: Only the assigned provider can reschedule"));
      }

      try {
        await scheduleService.cancelSession(
          rogueProvider._id.toString(),
          createdSession._id.toString(),
          "Malicious cancel"
        );
        assert(false, "Cross-provider cancel should be blocked");
      } catch (err: any) {
        assert(err.message.includes("Unauthorized: Only the assigned provider can cancel"));
      }
    });

    // ------------------------------------------------------------------------
    // SUMMARY
    // ------------------------------------------------------------------------
    console.log("\n==========================================================================");
    console.log(`  STEPS 4–8 E2E SUITE: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log("==========================================================================\n");

  } finally {
    await mongoose.disconnect();
    console.log("✓ MongoDB test connection closed.");
    if (testsFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runSteps4To8E2ETestSuite().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
