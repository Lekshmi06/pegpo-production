import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import User from "../models/User";
import TuitionProviderProfile from "../models/TuitionProviderProfile";
import TuitionOffering from "../models/TuitionOffering";
import TuitionBatch from "../models/TuitionBatch";
import TuitionRequest from "../models/TuitionRequest";
import TuitionEnrollment from "../models/TuitionEnrollment";
import TuitionSession from "../models/TuitionSession";
import TuitionAttendance from "../models/TuitionAttendance";
import TuitionTransaction from "../models/TuitionTransaction";
import TuitionReview from "../models/TuitionReview";
import TuitionSlotReservation from "../models/TuitionSlotReservation";

import * as providerService from "../services/tuition_provider_service";
import * as marketplaceService from "../services/tuition_marketplace_service";
import * as requestService from "../services/tuition_request_service";
import * as scheduleService from "../services/tuition_schedule_service";
import * as studentService from "../services/tuition_student_service";
import * as reviewService from "../services/tuition_review_service";
import { activateUserRole } from "../services/auth_service";
import { getPaymentHmacSecret } from "../services/payment_service";

async function runPhase3TuitionSuite() {
  console.log("==========================================================================");
  console.log("     EDUPYE PHASE 3: TUITION MARKETPLACE & SCHEDULING TEST SUITE         ");
  console.log("==========================================================================\n");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(mongoUri);
  console.log("✓ MongoDB connected successfully.\n");

  // Synchronize partial and unique indexes
  try { await TuitionReview.collection.dropIndex("enrollmentId_1"); } catch {}
  try { await TuitionRequest.collection.dropIndex("studentId_1_offeringId_1_status_1"); } catch {}
  try { await TuitionEnrollment.collection.dropIndex("studentId_1_offeringId_1"); } catch {}
  try { await TuitionSlotReservation.collection.dropIndex("providerId_1_day_1_timeBucket_1"); } catch {}
  await TuitionRequest.syncIndexes();
  await TuitionEnrollment.syncIndexes();
  await TuitionReview.syncIndexes();
  await TuitionTransaction.syncIndexes();
  await TuitionSlotReservation.syncIndexes();

  const timestamp = Date.now();
  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: ${testName}`);
      if (detail) console.error(`    Details: ${detail}`);
      testsFailed++;
    }
  }

  try {
    // ------------------------------------------------------------------------
    // SETUP TEST ACTORS
    // ------------------------------------------------------------------------
    const teacherUser = await User.create({
      email: `teacher_applicant_${timestamp}@edupye.test`,
      name: `Dr. Ananya Sharma ${timestamp}`,
      userType: "teacher",
      roles: ["teacher"],
      activeRole: "teacher",
    });

    const studentUser = await User.create({
      email: `tuition_student_${timestamp}@edupye.test`,
      name: "Rohan Patel",
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });

    const studentUser2 = await User.create({
      email: `tuition_student2_${timestamp}@edupye.test`,
      name: "Kavya Menon",
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });

    console.log("--- 1. TUITION IDENTITY, ONBOARDING & ACCESS SECURITY ---");

    // Test 1: Direct self-activation of tuition_provider role without verification is blocked
    try {
      await activateUserRole({
        userId: teacherUser._id.toString(),
        role: "tuition_provider" as any,
      });
      assert(false, "Test 1: Self-activation of tuition_provider should be rejected");
    } catch (err: any) {
      assert(
        err.message.includes("requires official verification"),
        "Test 1: Direct self-activation of tuition_provider via API is blocked",
        err.message
      );
    }

    // Test 2: Teacher submits tuition onboarding details -> status is 'pending'
    const submittedProfile = await providerService.submitTuitionProviderOnboarding(
      teacherUser._id.toString(),
      {
        fullName: `Dr. Ananya Sharma ${timestamp}`,
        headline: "Senior Physics Educator & Olympiad Mentor",
        bio: "Over 12 years of coaching students for CBSE Class 11-12 and JEE Physics.",
        experienceYears: 12,
        subjects: ["Physics", "Mechanics", "Thermodynamics"],
        classesTaught: ["Class 11", "Class 12", "JEE Prep"],
        teachingMode: ["online", "hybrid"],
        education: [
          { degree: "M.Sc. Physics", institution: "IIT Madras", yearOfPassing: 2012 },
          { degree: "Ph.D. Applied Physics", institution: "IISc Bangalore", yearOfPassing: 2016 },
        ],
        availableHours: "Evenings 5 PM - 9 PM IST",
        pricing: { minHourlyRate: 750, maxHourlyRate: 1500, currency: "INR" },
      }
    );
    assert(
      submittedProfile.verificationStatus === "pending" &&
        submittedProfile.subjects.includes("Physics"),
      "Test 2: Provider onboarding profile created with 'pending' verification status"
    );

    // Test 3: Unverified provider is strictly excluded from public marketplace search
    const unverifiedSearch = await marketplaceService.searchTuitionProviders({
      subject: "Physics",
    });
    const foundUnverified = unverifiedSearch.providers.some(
      (p) => p.userId.toString() === teacherUser._id.toString()
    );
    assert(
      !foundUnverified,
      "Test 3: Unverified pending provider is strictly excluded from public marketplace search"
    );

    // Test 4: Admin verifies provider and assigns Platinum tier
    const verifiedProfile = await providerService.adminUpdateVerificationStatus(
      submittedProfile._id.toString(),
      "verified",
      "Verified against academic credentials and state board certificates",
      "platinum"
    );
    const refreshedUser = await User.findById(teacherUser._id);
    assert(
      verifiedProfile.verificationStatus === "verified" &&
        verifiedProfile.platformTier === "platinum" &&
        Boolean(refreshedUser?.roles?.includes("tuition_provider")),
      "Test 4: Admin verification grants 'tuition_provider' role and assigns Platinum tier"
    );

    console.log("\n--- 2. OFFERINGS, BATCHES & SCHEDULING MODELS ---");

    // Test 5: Verified provider creates 1:1 and group offerings
    const groupOffering = await scheduleService.createOffering(teacherUser._id.toString(), {
      title: "Class 12 CBSE & JEE Advanced Physics Cohort",
      subject: "Physics",
      classLevel: "Class 12",
      description: "Comprehensive coverage of Electrodynamics, Optics, and Modern Physics.",
      teachingMode: "online",
      classFormat: "group",
      scheduleModel: "fixed_batch",
      maxCapacity: 3, // Small capacity for rigorous testing
      feeAmount: 3500,
      billingUnit: "monthly",
      currency: "INR",
      availableDays: ["Monday", "Wednesday", "Friday"],
    });
    assert(
      groupOffering.maxCapacity === 3 && groupOffering.scheduleModel === "fixed_batch",
      "Test 5: Group tuition offering created with fixed_batch schedule model and capacity limit"
    );

    // Test 6: Provider creates recurring batch for offering
    const batchA = await scheduleService.createBatch(teacherUser._id.toString(), {
      offeringId: groupOffering._id as any,
      title: "Weekday Evening Batch (Mon/Wed/Fri 6:00 PM)",
      daysOfWeek: ["Monday", "Wednesday", "Friday"],
      startTime: "18:00",
      endTime: "19:30",
      maxCapacity: 2, // Strict 2-student capacity limit for testing
      startDate: new Date(),
    });
    assert(
      batchA.maxCapacity === 2 && batchA.enrolledCount === 0,
      "Test 6: Recurring batch created with exact days and time slots"
    );

    // Test 7: Double-booking prevention - attempting overlapping batch on identical days and times
    try {
      await scheduleService.createBatch(teacherUser._id.toString(), {
        offeringId: groupOffering._id as any,
        title: "Conflicting Batch",
        daysOfWeek: ["Wednesday"],
        startTime: "18:00",
        endTime: "19:30",
      });
      assert(false, "Test 7: Double-booking batch creation should be rejected");
    } catch (err: any) {
      assert(
        err.message.includes("Double-booking conflict"),
        "Test 7: Double-booking conflict prevented when creating overlapping batch",
        err.message
      );
    }

    console.log("\n--- 3. MARKETPLACE DISCOVERY & PUBLIC PROFILE ---");

    // Test 8: Verified provider now appears in marketplace search
    const verifiedSearch = await marketplaceService.searchTuitionProviders({
      search: `${timestamp}`,
      subject: "Physics",
      tier: "platinum",
    });
    const foundVerified = verifiedSearch.providers.find(
      (p) => p.userId.toString() === teacherUser._id.toString()
    );
    assert(
      Boolean(foundVerified && foundVerified.offerings.length > 0),
      "Test 8: Verified provider is discoverable in marketplace search with offerings attached"
    );

    // Test 9: Public profile lookup returns profile, active offerings, and batches
    const publicProfile = await marketplaceService.getPublicTuitionProviderDetails(
      teacherUser._id.toString()
    );
    assert(
      publicProfile.profile.fullName === `Dr. Ananya Sharma ${timestamp}` &&
        publicProfile.offerings.length >= 1 &&
        publicProfile.batches.length >= 1,
      "Test 9: Public profile endpoint returns comprehensive details, offerings, and batches"
    );

    console.log("\n--- 4. TUITION REQUEST & ENROLMENT WORKFLOW ---");

    // Test 10: Provider cannot request enrollment in their own tuition offering
    try {
      await requestService.createTuitionRequest(teacherUser._id.toString(), {
        offeringId: groupOffering._id.toString(),
        batchId: batchA._id.toString(),
        classFormat: "group",
        teachingMode: "online",
      });
      assert(false, "Test 10: Provider self-enrollment request should fail");
    } catch (err: any) {
      assert(
        err.message.includes("Providers cannot enroll into their own"),
        "Test 10: Provider self-enrollment request is rejected",
        err.message
      );
    }

    // Test 11: Student submits request for batch
    const studentRequest = await requestService.createTuitionRequest(
      studentUser._id.toString(),
      {
        offeringId: groupOffering._id.toString(),
        batchId: batchA._id.toString(),
        classFormat: "group",
        teachingMode: "online",
        studentNotes: "Aiming for JEE Advanced 2027. Need guidance in Rotational Mechanics.",
      }
    );
    assert(
      studentRequest.status === "pending" &&
        studentRequest.feeAmount === 3500 &&
        studentRequest.batchId?.toString() === batchA._id.toString(),
      "Test 11: Student creates tuition request with status 'pending'"
    );

    // Test 12: Duplicate pending request rejected
    try {
      await requestService.createTuitionRequest(studentUser._id.toString(), {
        offeringId: groupOffering._id.toString(),
        batchId: batchA._id.toString(),
        classFormat: "group",
        teachingMode: "online",
      });
      assert(false, "Test 12: Duplicate pending request should fail");
    } catch (err: any) {
      assert(
        err.message.includes("already have an active request"),
        "Test 12: Duplicate pending request for same offering is blocked",
        err.message
      );
    }

    // Test 13: Student cannot pay before provider acceptance
    try {
      await requestService.studentVerifyAndSettleTuitionPayment(
        studentUser._id.toString(),
        {
          requestId: studentRequest._id.toString(),
          gatewayTransactionId: "TXN-TEST-EARLY",
          signature: "dummy_sig",
        }
      );
      assert(false, "Test 13: Payment before acceptance should fail");
    } catch (err: any) {
      assert(
        err.message.includes("Provider acceptance is required first"),
        "Test 13: Payment before provider acceptance is strictly blocked",
        err.message
      );
    }

    // Test 14: Provider accepts request and generates simulated payment token
    const acceptedRequest = await requestService.providerRespondToTuitionRequest(
      teacherUser._id.toString(),
      studentRequest._id.toString(),
      "accept",
      "Welcome Rohan! Looking forward to working on mechanics together."
    );
    assert(
      acceptedRequest.status === "accepted" &&
        Boolean(acceptedRequest.simulationPaymentToken) &&
        Boolean(acceptedRequest.simulationTransactionId),
      "Test 14: Provider accepts request; cryptographic simulation payment token generated"
    );

    // Test 15: Forged signature settlement is rejected
    try {
      await requestService.studentVerifyAndSettleTuitionPayment(
        studentUser._id.toString(),
        {
          requestId: acceptedRequest._id.toString(),
          gatewayTransactionId: acceptedRequest.simulationTransactionId!,
          signature: "forged_hex_signature_abcdef1234567890",
        }
      );
      assert(false, "Test 15: Forged payment signature should be rejected");
    } catch (err: any) {
      assert(
        err.message.includes("payment signature verification failed"),
        "Test 15: Forged cryptographic payment signature is rejected",
        err.message
      );
    }

    // Test 16: Valid payment settlement activates tuition enrolment
    const { enrollment, request: paidRequest } =
      await requestService.studentVerifyAndSettleTuitionPayment(
        studentUser._id.toString(),
        {
          requestId: acceptedRequest._id.toString(),
          gatewayTransactionId: acceptedRequest.simulationTransactionId!,
          signature: acceptedRequest.simulationPaymentToken!,
        }
      );
    const updatedBatchAfterPay = await TuitionBatch.findById(batchA._id);
    assert(
      enrollment.status === "active" &&
        paidRequest.status === "paid" &&
        updatedBatchAfterPay?.enrolledCount === 1,
      "Test 16: Valid payment verified; enrollment active and batch enrolledCount incremented"
    );

    // Test 17: Separate TuitionTransaction ledger entry recorded
    const tuitionTx = await TuitionTransaction.findOne({
      gatewayTransactionId: acceptedRequest.simulationTransactionId!,
    });
    assert(
      tuitionTx?.status === "paid" &&
        tuitionTx?.grossAmount === 3500 &&
        tuitionTx?.studentId.toString() === studentUser._id.toString(),
      "Test 17: Independent TuitionTransaction ledger entry recorded with gross amount"
    );

    // Test 18: Duplicate payment settlement rejected (idempotency)
    try {
      await requestService.studentVerifyAndSettleTuitionPayment(
        studentUser._id.toString(),
        {
          requestId: acceptedRequest._id.toString(),
          gatewayTransactionId: acceptedRequest.simulationTransactionId!,
          signature: acceptedRequest.simulationPaymentToken!,
        }
      );
      assert(false, "Test 18: Replaying payment settlement should fail");
    } catch (err: any) {
      assert(
        err.message.includes("Cannot pay for request with status 'paid'") ||
          err.message.includes("Duplicate payment transaction detected"),
        "Test 18: Idempotent payment replay protection prevents duplicate charges",
        err.message
      );
    }

    // Test 19: Batch capacity enforcement - fill the remaining 1 seat (capacity = 2)
    const req2 = await requestService.createTuitionRequest(
      studentUser2._id.toString(),
      {
        offeringId: groupOffering._id.toString(),
        batchId: batchA._id.toString(),
        classFormat: "group",
        teachingMode: "online",
      }
    );
    const acceptedReq2 = await requestService.providerRespondToTuitionRequest(
      teacherUser._id.toString(),
      req2._id.toString(),
      "accept"
    );
    await requestService.studentVerifyAndSettleTuitionPayment(
      studentUser2._id.toString(),
      {
        requestId: acceptedReq2._id.toString(),
        gatewayTransactionId: acceptedReq2.simulationTransactionId!,
        signature: acceptedReq2.simulationPaymentToken!,
      }
    );
    const fullBatch = await TuitionBatch.findById(batchA._id);
    assert(
      fullBatch?.enrolledCount === 2 && fullBatch.enrolledCount >= fullBatch.maxCapacity,
      "Test 19: Second student enrolled; batch capacity strictly reached (2/2)"
    );

    // Test 20: 3rd student attempt to request the full batch is blocked
    const studentUser3 = await User.create({
      email: `tuition_student3_${timestamp}@edupye.test`,
      name: "Aditya Verma",
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });
    try {
      await requestService.createTuitionRequest(studentUser3._id.toString(), {
        offeringId: groupOffering._id.toString(),
        batchId: batchA._id.toString(),
        classFormat: "group",
        teachingMode: "online",
      });
      assert(false, "Test 20: Requesting full batch should fail");
    } catch (err: any) {
      assert(
        err.message.includes("maximum student capacity"),
        "Test 20: Joining full batch is rejected by backend capacity guard",
        err.message
      );
    }

    console.log("\n--- 5. SESSIONS, ATTENDANCE & CALENDAR ---");

    // Test 21: Upcoming scheduled sessions automatically created for enrolment
    const studentSchedule = await scheduleService.getStudentSchedule(
      studentUser._id.toString()
    );
    assert(
      studentSchedule.length > 0 &&
        studentSchedule[0].status === "scheduled" &&
        Boolean(studentSchedule[0].meetingLink),
      "Test 21: Scheduled sessions with meeting links available in student calendar"
    );

    // Test 22: Session status lifecycle transition (scheduled -> live -> completed)
    const targetSession = studentSchedule[0];
    const liveSession = await scheduleService.updateSessionStatus(
      teacherUser._id.toString(),
      targetSession._id.toString(),
      "live",
      "/teacher/smartboard/integrated?session=live-123"
    );
    assert(
      liveSession.status === "live" && Boolean(liveSession.startedAt),
      "Test 22: Provider launches live class session (status: 'live')"
    );

    // Test 23: Provider marks attendance and increments student session attendance
    const attendance = await scheduleService.recordAttendance(
      teacherUser._id.toString(),
      targetSession._id.toString(),
      [
        {
          studentId: studentUser._id,
          status: "present",
          remarks: "Excellent participation",
          markedAt: new Date(),
        },
      ]
    );
    const updatedEnrollment = await TuitionEnrollment.findById(enrollment._id);
    assert(
      attendance.records.length === 1 &&
        attendance.records[0].status === "present" &&
        updatedEnrollment?.sessionsAttended === 1,
      "Test 23: Attendance recorded; student sessionsAttended incremented to 1"
    );

    console.log("\n--- 6. VERIFIED REVIEWS & RATINGS ---");

    // Test 23b: Active enrolment cannot submit review before tuition completion
    try {
      await reviewService.createTuitionReview(studentUser._id.toString(), {
        providerId: teacherUser._id.toString(),
        enrollmentId: enrollment._id.toString(),
        rating: 5,
        reviewText: "Attempting to review while class is still active",
      });
      assert(false, "Active enrolment review should fail");
    } catch (err: any) {
      assert(
        err.message.includes("completed"),
        "Test 23b: Review before service completion is rejected",
        err.message
      );
    }

    // Conclude tuition batch sessions so enrolment reaches 'completed' state
    await TuitionEnrollment.updateOne(
      { _id: enrollment._id },
      { status: "completed", completedAt: new Date() }
    );

    // Test 24: Unenrolled user cannot review provider (403 Forbidden)
    try {
      await reviewService.createTuitionReview(studentUser3._id.toString(), {
        providerId: teacherUser._id.toString(),
        enrollmentId: enrollment._id.toString(),
        rating: 5,
        reviewText: "Great teacher!",
      });
      assert(false, "Test 24: Unenrolled review should fail with 403");
    } catch (err: any) {
      assert(
        err.message.includes("Forbidden"),
        "Test 24: Unenrolled outsider cannot review tuition provider",
        err.message
      );
    }

    // Test 25: Enrolled student with verified enrolment submits 5-star review
    const review = await reviewService.createTuitionReview(
      studentUser._id.toString(),
      {
        providerId: teacherUser._id.toString(),
        enrollmentId: enrollment._id.toString(),
        rating: 5,
        reviewText:
          "Dr. Sharma explains complex rotational mechanics principles with crystal clarity. Highly recommended!",
      }
    );
    const updatedProfile = await TuitionProviderProfile.findOne({
      userId: teacherUser._id,
    });
    assert(
      review.rating === 5 &&
        updatedProfile?.rating.average === 5 &&
        updatedProfile?.rating.count === 1,
      "Test 25: Enrolled student submits 5-star review; provider aggregate rating updated to 5.0"
    );

    // Test 26: Duplicate review for same enrolment is rejected
    try {
      await reviewService.createTuitionReview(studentUser._id.toString(), {
        providerId: teacherUser._id.toString(),
        enrollmentId: enrollment._id.toString(),
        rating: 4,
        reviewText: "Trying to submit a second review",
      });
      assert(false, "Test 26: Duplicate review should fail");
    } catch (err: any) {
      assert(
        err.message.includes("already submitted a review"),
        "Test 26: Duplicate review for same tuition enrolment is blocked",
        err.message
      );
    }

    // Restore enrollment status to 'active' for student overview and partial-index duplicate checks
    await TuitionEnrollment.updateOne(
      { _id: enrollment._id },
      { status: "active" }
    );

    console.log("\n--- 7. TUITION FINANCIALS & STUDENT PORTAL ---");

    // Test 27: Provider financials summary shows gross earnings and student breakdown
    const financials = await providerService.getTuitionProviderFinancials(
      teacherUser._id.toString()
    );
    assert(
      financials.summary.totalGrossEarnings === 7000 && // 3500 * 2 students
        financials.summary.transactionCount === 2 &&
        financials.studentBreakdown.length === 2,
      "Test 27: Provider financials shows exact gross earnings (₹7,000) and student breakdown"
    );

    // Test 28: Student tuition overview aggregates active enrolments and attendance
    const studentOverview = await studentService.getTuitionStudentOverview(
      studentUser._id.toString()
    );
    assert(
      studentOverview.activeEnrollmentsCount === 1 &&
        studentOverview.upcomingSessions.length > 0 &&
        studentOverview.recentRequests.length > 0,
      "Test 28: Student tuition overview accurately aggregates active classes and upcoming schedule"
    );

    console.log("\n--- 8. FOCUSED VERIFICATION: 1:1 CONCURRENCY, CAPACITY RELEASE, INDEXES & SCHEDULING ---");

    // Test 29: 1:1 Booking Concurrency & Provider Appointment Overlap Prevention
    // Create a 1:1 offering for Dr. Ananya Sharma
    const oneToOneOffering = await scheduleService.createOffering(teacherUser._id.toString(), {
      title: "1:1 JEE Physics Problem Solving Mentorship",
      description: "Dedicated personalized 1:1 problem solving and mentorship for JEE Advanced physics.",
      subject: "Physics",
      classLevel: "Class 12",
      teachingMode: "online",
      classFormat: "1:1",
      scheduleModel: "flexible_slot",
      maxCapacity: 1,
      feeAmount: 1500,
      billingUnit: "hourly",
      currency: "INR",
    });

    // Student 1 requests Monday 18:30 - 19:30 (overlaps batchA which is Mon/Wed/Fri 18:00 - 19:30)
    const conflictingSlotReq = await requestService.createTuitionRequest(studentUser._id.toString(), {
      offeringId: oneToOneOffering._id.toString(),
      classFormat: "1:1",
      teachingMode: "online",
      requestedSlot: {
        day: "Monday",
        startTime: "18:30",
        endTime: "19:30",
      },
    });

    try {
      // Provider attempts to accept 1:1 request overlapping recurring batchA -> must be blocked
      await requestService.providerRespondToTuitionRequest(
        teacherUser._id.toString(),
        conflictingSlotReq._id.toString(),
        "accept"
      );
      assert(false, "Test 29: Accepting 1:1 request overlapping batch should fail");
    } catch (err: any) {
      assert(
        err.message.includes("Double-booking conflict"),
        "Test 29: Accepting 1:1 request overlapping provider's recurring batch is strictly blocked",
        err.message
      );
    }

    // Now update request to valid non-overlapping 1:1 slot (Saturday 10:00 - 11:00) and accept
    conflictingSlotReq.requestedSlot = {
      day: "Saturday",
      startTime: "10:00",
      endTime: "11:00",
    };
    await conflictingSlotReq.save();
    const accepted1on1 = await requestService.providerRespondToTuitionRequest(
      teacherUser._id.toString(),
      conflictingSlotReq._id.toString(),
      "accept"
    );
    assert(
      accepted1on1.status === "accepted",
      "Test 30: Non-overlapping 1:1 slot request accepted successfully"
    );

    // Another student tries to request overlapping 1:1 slot for Saturday 10:30 - 11:30
    const studentUser4 = await User.create({
      email: `tuition_student4_${timestamp}@edupye.test`,
      name: "Aditya Nair",
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });
    const overlapping1on1Req = await requestService.createTuitionRequest(studentUser4._id.toString(), {
      offeringId: oneToOneOffering._id.toString(),
      classFormat: "1:1",
      teachingMode: "online",
      requestedSlot: {
        day: "Saturday",
        startTime: "10:30",
        endTime: "11:30",
      },
    });

    try {
      await requestService.providerRespondToTuitionRequest(
        teacherUser._id.toString(),
        overlapping1on1Req._id.toString(),
        "accept"
      );
      assert(false, "Test 31: Provider accepting conflicting 1:1 slot should be rejected");
    } catch (err: any) {
      assert(
        err.message.includes("Double-booking conflict"),
        "Test 31: Provider cannot accept second 1:1 booking overlapping already accepted 1:1 slot",
        err.message
      );
    }

    // Test 32: Student cancels pending request
    const cancelledReq = await requestService.cancelTuitionRequest(
      studentUser4._id.toString(),
      overlapping1on1Req._id.toString(),
      "Change of schedule"
    );
    assert(
      cancelledReq.status === "cancelled",
      "Test 32: Student can cancel pending tuition request"
    );

    // Test 33: Safe batch capacity release on enrolment cancellation
    // BatchA currently has 2 students (full, 2/2)
    const batchBeforeCancel = await TuitionBatch.findById(batchA._id);
    assert(
      batchBeforeCancel?.enrolledCount === 2,
      "Test 33a: Batch capacity is initially at 2/2"
    );

    // Cancel enrolment for studentUser2
    const student2Enrollment = await TuitionEnrollment.findOne({
      studentId: studentUser2._id,
      batchId: batchA._id,
      status: "active",
    });
    assert(Boolean(student2Enrollment), "Test 33b: Active enrolment found for student 2");

    await requestService.cancelTuitionEnrollment(
      studentUser2._id.toString(),
      student2Enrollment!._id.toString(),
      "Relocating to another city"
    );

    const batchAfterCancel = await TuitionBatch.findById(batchA._id);
    assert(
      batchAfterCancel?.enrolledCount === 1,
      "Test 33c: Enrolment cancellation safely releases batch seat capacity (decremented from 2 to 1)"
    );

    // Test 34: Expired requests sweep
    const staleRequest = await TuitionRequest.create({
      studentId: studentUser4._id,
      providerId: teacherUser._id,
      offeringId: groupOffering._id,
      scheduleModel: "fixed_batch",
      classFormat: "group",
      teachingMode: "online",
      subject: "Physics",
      feeAmount: 3500,
      currency: "INR",
      status: "accepted",
      expiresAt: new Date(Date.now() - 1000 * 60 * 60), // Expired 1 hour ago
      statusHistory: [{ status: "accepted", changedAt: new Date() }],
    });
    const expiredCount = await requestService.expireStaleRequests();
    const refreshedStaleReq = await TuitionRequest.findById(staleRequest._id);
    assert(
      expiredCount >= 1 && refreshedStaleReq?.status === "expired",
      "Test 34: Stale requests past expiresAt are safely transitioned to 'expired'"
    );

    // Test 35: MongoDB Partial Unique Index on TuitionRequest
    try {
      await TuitionRequest.create({
        studentId: studentUser._id,
        providerId: teacherUser._id,
        offeringId: oneToOneOffering._id,
        scheduleModel: "flexible_slot",
        classFormat: "1:1",
        teachingMode: "online",
        subject: "Physics",
        feeAmount: 1500,
        currency: "INR",
        status: "pending",
        statusHistory: [{ status: "pending", changedAt: new Date() }],
      });
      await TuitionRequest.create({
        studentId: studentUser._id,
        providerId: teacherUser._id,
        offeringId: oneToOneOffering._id,
        scheduleModel: "flexible_slot",
        classFormat: "1:1",
        teachingMode: "online",
        subject: "Physics",
        feeAmount: 1500,
        currency: "INR",
        status: "pending",
        statusHistory: [{ status: "pending", changedAt: new Date() }],
      });
      assert(false, "Test 35: Duplicate pending request should trigger MongoDB E11000 duplicate key error");
    } catch (err: any) {
      assert(
        err.code === 11000 || err.message.includes("E11000"),
        "Test 35: MongoDB partial unique index prevents duplicate pending requests at database level",
        err.message
      );
    }

    // Test 36: MongoDB Partial Unique Index on TuitionEnrollment
    try {
      await TuitionEnrollment.create({
        studentId: studentUser._id,
        providerId: teacherUser._id,
        offeringId: groupOffering._id,
        requestId: new mongoose.Types.ObjectId(),
        subject: "Physics",
        classLevel: "Class 12",
        classFormat: "group",
        teachingMode: "online",
        scheduleModel: "fixed_batch",
        status: "active",
        feePaid: 3500,
        currency: "INR",
        paymentTransactionId: `TXN-DUP-${timestamp}`,
      });
      assert(false, "Test 36: Duplicate active enrolment should trigger MongoDB E11000 duplicate key error");
    } catch (err: any) {
      assert(
        err.code === 11000 || err.message.includes("E11000"),
        "Test 36: MongoDB partial unique index prevents duplicate active enrolments for same student & offering",
        err.message
      );
    }

    // Test 37: MongoDB Unique Index on TuitionReview
    try {
      const student1Enrollment = await TuitionEnrollment.findOne({
        studentId: studentUser._id,
        offeringId: groupOffering._id,
      });
      await TuitionReview.create({
        studentId: studentUser._id,
        providerId: teacherUser._id,
        enrollmentId: student1Enrollment!._id,
        subject: "Physics",
        rating: 4,
        reviewText: "Duplicate attempt",
        status: "published",
      });
      assert(false, "Test 37: Duplicate review on same enrolment should trigger MongoDB E11000");
    } catch (err: any) {
      assert(
        err.code === 11000 || err.message.includes("E11000"),
        "Test 37: MongoDB unique index prevents duplicate reviews on the same enrolment",
        err.message
      );
    }

    // Test 38: Scheduling - Reschedule session with collision detection
    const existingSession = await TuitionSession.findOne({
      providerId: teacherUser._id,
      status: "scheduled",
    });
    assert(Boolean(existingSession), "Test 38a: Existing scheduled session found");

    const sundaySession = await TuitionSession.create({
      offeringId: groupOffering._id,
      providerId: teacherUser._id,
      studentIds: [studentUser._id],
      title: "Sunday Special Problem Session",
      sessionDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      startTime: "14:00",
      endTime: "15:00",
      status: "scheduled",
      meetingProvider: "edupye_smartboard",
    });

    try {
      await scheduleService.rescheduleSession(
        teacherUser._id.toString(),
        existingSession!._id.toString(),
        sundaySession.sessionDate,
        "14:30",
        "15:30",
        "Conflict test"
      );
      assert(false, "Test 38b: Rescheduling to conflicting session slot should fail");
    } catch (err: any) {
      assert(
        err.message.includes("Reschedule conflict"),
        "Test 38: Session rescheduling collision check prevents overlapping session booking",
        err.message
      );
    }

    // Legitimate reschedule to a free slot (Sunday 16:00 - 17:00)
    const rescheduled = await scheduleService.rescheduleSession(
      teacherUser._id.toString(),
      existingSession!._id.toString(),
      sundaySession.sessionDate,
      "16:00",
      "17:00",
      "Student requested afternoon slot"
    );
    assert(
      rescheduled.startTime === "16:00" &&
        rescheduled.rescheduleReason === "Student requested afternoon slot" &&
        Boolean(rescheduled.rescheduledFromSessionId),
      "Test 39: Legitimate session rescheduling updates time and preserves audit trail"
    );

    // Test 40: Session cancellation with audit reason
    const cancelledSession = await scheduleService.cancelSession(
      teacherUser._id.toString(),
      sundaySession._id.toString(),
      "Public holiday - class called off"
    );
    assert(
      cancelledSession.status === "cancelled" &&
        cancelledSession.cancellationReason === "Public holiday - class called off" &&
        Boolean(cancelledSession.cancelledAt),
      "Test 40: Session cancellation sets status to 'cancelled' and records cancellation reason and timestamp"
    );

    console.log("\n--- 9. AUDIT RECTIFICATION: 1:1 CONCURRENCY, CANCELLATION ATOMICITY, PAYMENT INTEGRITY & LIFECYCLE ---");

    // Test 41: Simultaneous Concurrent Settlement for Overlapping 1:1 Slots
    // Two students submit 1:1 requests with overlapping Friday slots:
    // Student C1: Friday 16:00 - 17:00 (buckets: 16:00, 16:30)
    // Student C2: Friday 16:30 - 17:30 (buckets: 16:30, 17:00) -> bucket 16:30 overlaps!
    const studentC1 = await User.create({
      email: `tuition_c1_${timestamp}@edupye.test`,
      name: "Concurrent Student 1",
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });
    const studentC2 = await User.create({
      email: `tuition_c2_${timestamp}@edupye.test`,
      name: "Concurrent Student 2",
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });

    const reqC1 = await requestService.createTuitionRequest(studentC1._id.toString(), {
      offeringId: oneToOneOffering._id.toString(),
      classFormat: "1:1",
      teachingMode: "online",
      requestedSlot: { day: "Friday", startTime: "16:00", endTime: "17:00" },
    });
    const reqC2 = await requestService.createTuitionRequest(studentC2._id.toString(), {
      offeringId: oneToOneOffering._id.toString(),
      classFormat: "1:1",
      teachingMode: "online",
      requestedSlot: { day: "Friday", startTime: "16:30", endTime: "17:30" },
    });

    // Prepare both requests in 'accepted' state with cryptographic tokens to simulate concurrent settlement race
    const orderId1 = `TUITION-ORD-${reqC1._id.toString()}`;
    const txn1 = `TXN-TUITION-${crypto.randomBytes(8).toString("hex")}`;
    reqC1.status = "accepted";
    reqC1.simulationTransactionId = txn1;
    reqC1.simulationPaymentToken = crypto.createHmac("sha256", process.env.JWT_SECRET || "edupye_secure_payment_secret_2026").update(`${orderId1}|${txn1}`).digest("hex");
    await reqC1.save();

    const orderId2 = `TUITION-ORD-${reqC2._id.toString()}`;
    const txn2 = `TXN-TUITION-${crypto.randomBytes(8).toString("hex")}`;
    reqC2.status = "accepted";
    reqC2.simulationTransactionId = txn2;
    reqC2.simulationPaymentToken = crypto.createHmac("sha256", process.env.JWT_SECRET || "edupye_secure_payment_secret_2026").update(`${orderId2}|${txn2}`).digest("hex");
    await reqC2.save();

    const refreshedC1 = await TuitionRequest.findById(reqC1._id);
    const refreshedC2 = await TuitionRequest.findById(reqC2._id);

    // Simultaneous payment settlement attempts
    const [settleC1Result, settleC2Result] = await Promise.allSettled([
      requestService.studentVerifyAndSettleTuitionPayment(studentC1._id.toString(), {
        requestId: refreshedC1!._id.toString(),
        gatewayTransactionId: refreshedC1!.simulationTransactionId!,
        signature: refreshedC1!.simulationPaymentToken!,
      }),
      requestService.studentVerifyAndSettleTuitionPayment(studentC2._id.toString(), {
        requestId: refreshedC2!._id.toString(),
        gatewayTransactionId: refreshedC2!.simulationTransactionId!,
        signature: refreshedC2!.simulationPaymentToken!,
      }),
    ]);

    const c1Fulfilled = settleC1Result.status === "fulfilled";
    const c2Fulfilled = settleC2Result.status === "fulfilled";
    assert(
      (c1Fulfilled && !c2Fulfilled) || (!c1Fulfilled && c2Fulfilled),
      "Test 41a: Simultaneous overlapping settlement attempts yield exactly ONE winner and ONE rejection"
    );

    const rejectedResult = c1Fulfilled ? settleC2Result : settleC1Result;
    if (rejectedResult.status === "rejected") {
      assert(
        rejectedResult.reason.message.includes("Slot conflict"),
        "Test 41b: Database-enforced atomic slot lock rejected the overlapping settlement",
        rejectedResult.reason.message
      );
    }

    const fridayEnrollments = await TuitionEnrollment.find({
      providerId: teacherUser._id,
      scheduleModel: "flexible_slot",
      "scheduleDetails.slotDay": "Friday",
      status: "active",
    });
    assert(
      fridayEnrollments.length === 1,
      "Test 41c: Exactly ONE active 1:1 enrolment exists in MongoDB for the overlapping Friday appointment"
    );

    // Test 42: Batch Cancellation Atomicity & Concurrency Safety
    // Test repeated cancellation on student2Enrollment (already cancelled earlier in Test 33)
    try {
      await requestService.cancelTuitionEnrollment(
        studentUser2._id.toString(),
        student2Enrollment!._id.toString(),
        "Repeated cancel attempt"
      );
      assert(false, "Test 42a: Repeated cancellation should fail");
    } catch (err: any) {
      assert(
        err.message.includes("already 'cancelled'"),
        "Test 42a: Repeated enrolment cancellation is rejected and does not decrement batch capacity",
        err.message
      );
    }

    // Test concurrent cancellation on student 1's enrolment in batchA
    // Enrol studentC1 into batchA first to test concurrent cancellation
    const batchBeforeConcurrent = await TuitionBatch.findById(batchA._id);
    const countBeforeCancel = batchBeforeConcurrent!.enrolledCount; // e.g. 1

    const student1EnrollmentInBatch = await TuitionEnrollment.findOne({
      studentId: studentUser._id,
      batchId: batchA._id,
      status: "active",
    });

    if (student1EnrollmentInBatch) {
      const [canc1, canc2] = await Promise.allSettled([
        requestService.cancelTuitionEnrollment(
          studentUser._id.toString(),
          student1EnrollmentInBatch._id.toString(),
          "Concurrent cancel test 1"
        ),
        requestService.cancelTuitionEnrollment(
          studentUser._id.toString(),
          student1EnrollmentInBatch._id.toString(),
          "Concurrent cancel test 2"
        ),
      ]);

      const canc1Fulfilled = canc1.status === "fulfilled";
      const canc2Fulfilled = canc2.status === "fulfilled";
      assert(
        (canc1Fulfilled && !canc2Fulfilled) || (!canc1Fulfilled && canc2Fulfilled),
        "Test 42b: Concurrent cancellation attempts on the same enrolment yield exactly ONE success and ONE rejection"
      );

      const batchAfterConcurrent = await TuitionBatch.findById(batchA._id);
      assert(
        batchAfterConcurrent!.enrolledCount === countBeforeCancel - 1,
        "Test 42c: Batch enrolledCount decremented exactly ONCE (zero double decrement under race condition)"
      );
    }

    // Test 43: Payment Integrity & Tamper Resistance
    // Tamper test: Alter order ID or signature
    const forgedReq = await requestService.createTuitionRequest(studentUser4._id.toString(), {
      offeringId: oneToOneOffering._id.toString(),
      classFormat: "1:1",
      teachingMode: "online",
      requestedSlot: { day: "Sunday", startTime: "18:00", endTime: "19:00" },
    });
    await requestService.providerRespondToTuitionRequest(teacherUser._id.toString(), forgedReq._id.toString(), "accept");
    const acceptedForgedReq = await TuitionRequest.findById(forgedReq._id);

    try {
      // Client tries to pay with forged signature
      await requestService.studentVerifyAndSettleTuitionPayment(studentUser4._id.toString(), {
        requestId: acceptedForgedReq!._id.toString(),
        gatewayTransactionId: acceptedForgedReq!.simulationTransactionId!,
        signature: "forged_client_signature_00000000000000000000000000000000",
      });
      assert(false, "Test 43a: Forged signature must be rejected");
    } catch (err: any) {
      assert(
        err.message.includes("Cryptographic payment signature verification failed"),
        "Test 43a: Tampered signature is strictly rejected; client cannot claim payment",
        err.message
      );
    }

    try {
      // Impersonator tries to settle studentUser4's request
      await requestService.studentVerifyAndSettleTuitionPayment(studentUser._id.toString(), {
        requestId: acceptedForgedReq!._id.toString(),
        gatewayTransactionId: acceptedForgedReq!.simulationTransactionId!,
        signature: acceptedForgedReq!.simulationPaymentToken!,
      });
      assert(false, "Test 43b: Cross-user payment settlement must be rejected");
    } catch (err: any) {
      assert(
        err.message.includes("Unauthorized: You are not the student"),
        "Test 43b: Cross-user request payment settlement strictly blocked by ownership check",
        err.message
      );
    }

    // Test 44: Request Lifecycle & Future Request Unblocking
    // A student whose request was cancelled CAN legitimately submit a new request
    const studentLifecycleUser = await User.create({
      email: `tuition_lifecycle_${timestamp}@edupye.test`,
      name: "Lifecycle Student",
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });

    // 1. Submit request -> Cancel it
    const reqLife1 = await requestService.createTuitionRequest(studentLifecycleUser._id.toString(), {
      offeringId: oneToOneOffering._id.toString(),
      classFormat: "1:1",
      teachingMode: "online",
      requestedSlot: { day: "Tuesday", startTime: "10:00", endTime: "11:00" },
    });
    await requestService.cancelTuitionRequest(studentLifecycleUser._id.toString(), reqLife1._id.toString());

    // 2. Submit new request after cancellation -> must SUCCEED (not blocked by partial index)
    const reqLife2 = await requestService.createTuitionRequest(studentLifecycleUser._id.toString(), {
      offeringId: oneToOneOffering._id.toString(),
      classFormat: "1:1",
      teachingMode: "online",
      requestedSlot: { day: "Tuesday", startTime: "11:00", endTime: "12:00" },
    });
    assert(
      reqLife2.status === "pending",
      "Test 44a: Student can immediately submit a new request after cancelling previous request"
    );

    // 3. Provider rejects request 2 -> student submits request 3 -> must SUCCEED
    await requestService.providerRespondToTuitionRequest(teacherUser._id.toString(), reqLife2._id.toString(), "reject");
    const reqLife3 = await requestService.createTuitionRequest(studentLifecycleUser._id.toString(), {
      offeringId: oneToOneOffering._id.toString(),
      classFormat: "1:1",
      teachingMode: "online",
      requestedSlot: { day: "Tuesday", startTime: "14:00", endTime: "15:00" },
    });
    assert(
      reqLife3.status === "pending",
      "Test 44b: Student can immediately submit a new request after previous request was rejected"
    );

    // Test 45: On-Access Lazy Expiration Verification
    // Manually backdate expiresAt on reqLife3
    reqLife3.expiresAt = new Date(Date.now() - 1000 * 60 * 60 * 24); // Expired yesterday
    await reqLife3.save();

    try {
      await requestService.providerRespondToTuitionRequest(teacherUser._id.toString(), reqLife3._id.toString(), "accept");
      assert(false, "Test 45: Expired request access should fail");
    } catch (err: any) {
      const refreshedExpired = await TuitionRequest.findById(reqLife3._id);
      assert(
        refreshedExpired?.status === "expired" && err.message.includes("expired"),
        "Test 45: Accessing an expired request immediately triggers on-access lazy transition to 'expired'",
        err.message
      );
    }

    console.log("\n--- 10. FINAL FOCUSED VERIFICATION: CALENDAR DATES, ARBITRARY INTERVALS, ROLLBACK & PAYMENT SIGNING ---");

    // Test 46: Calendar Date Scoped Reservations - Consecutive Fridays
    // Student F1 books Friday 2026-11-14 at 10:00 - 11:00
    const studentF1 = await User.create({
      email: `tuition_f1_${timestamp}@edupye.test`,
      name: "Friday 1 Student",
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });
    const reqF1 = await requestService.createTuitionRequest(studentF1._id.toString(), {
      offeringId: oneToOneOffering._id.toString(),
      classFormat: "1:1",
      teachingMode: "online",
      requestedSlot: {
        day: "Friday",
        startTime: "10:00",
        endTime: "11:00",
        specificDate: new Date("2026-11-14T00:00:00.000Z"),
      },
    });
    // Set to accepted and settle
    reqF1.status = "accepted";
    reqF1.simulationTransactionId = `TXN-F1-${timestamp}`;
    reqF1.simulationPaymentToken = crypto.createHmac("sha256", process.env.PAYMENT_HMAC_SECRET || process.env.JWT_SECRET || "edupye_dev_payment_hmac_secret_2026").update(`TUITION-ORD-${reqF1._id.toString()}|${reqF1.simulationTransactionId}`).digest("hex");
    await reqF1.save();
    const settleF1 = await requestService.studentVerifyAndSettleTuitionPayment(studentF1._id.toString(), {
      requestId: reqF1._id.toString(),
      gatewayTransactionId: reqF1.simulationTransactionId!,
      signature: reqF1.simulationPaymentToken!,
    });
    assert(
      settleF1.enrollment.status === "active",
      "Test 46a: Student F1 successfully settles 1:1 slot on Friday 2026-11-14"
    );

    // Student F2 books consecutive Friday 2026-11-21 at the EXACT SAME TIME (10:00 - 11:00)
    const studentF2 = await User.create({
      email: `tuition_f2_${timestamp}@edupye.test`,
      name: "Friday 2 Student",
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });
    const reqF2 = await requestService.createTuitionRequest(studentF2._id.toString(), {
      offeringId: oneToOneOffering._id.toString(),
      classFormat: "1:1",
      teachingMode: "online",
      requestedSlot: {
        day: "Friday",
        startTime: "10:00",
        endTime: "11:00",
        specificDate: new Date("2026-11-21T00:00:00.000Z"),
      },
    });
    reqF2.status = "accepted";
    reqF2.simulationTransactionId = `TXN-F2-${timestamp}`;
    reqF2.simulationPaymentToken = crypto.createHmac("sha256", process.env.PAYMENT_HMAC_SECRET || process.env.JWT_SECRET || "edupye_dev_payment_hmac_secret_2026").update(`TUITION-ORD-${reqF2._id.toString()}|${reqF2.simulationTransactionId}`).digest("hex");
    await reqF2.save();
    const settleF2 = await requestService.studentVerifyAndSettleTuitionPayment(studentF2._id.toString(), {
      requestId: reqF2._id.toString(),
      gatewayTransactionId: reqF2.simulationTransactionId!,
      signature: reqF2.simulationPaymentToken!,
    });
    assert(
      settleF2.enrollment.status === "active",
      "Test 46b: Student F2 successfully books consecutive Friday (2026-11-21); distinct calendar dates on same day-of-week do NOT collide"
    );

    // Test 47: Arbitrary Non-30-Minute-Aligned Interval Collision on Same Date
    // Student F3 attempts to book Friday 2026-11-14 from 10:15 to 11:15 (overlaps 10:00 - 11:00 from 10:15 to 11:00)
    const studentF3 = await User.create({
      email: `tuition_f3_${timestamp}@edupye.test`,
      name: "Friday 3 Non-Aligned Student",
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });
    const reqF3 = await requestService.createTuitionRequest(studentF3._id.toString(), {
      offeringId: oneToOneOffering._id.toString(),
      classFormat: "1:1",
      teachingMode: "online",
      requestedSlot: {
        day: "Friday",
        startTime: "10:15",
        endTime: "11:15",
        specificDate: new Date("2026-11-14T00:00:00.000Z"),
      },
    });
    reqF3.status = "accepted";
    reqF3.simulationTransactionId = `TXN-F3-${timestamp}`;
    reqF3.simulationPaymentToken = crypto.createHmac("sha256", process.env.PAYMENT_HMAC_SECRET || process.env.JWT_SECRET || "edupye_dev_payment_hmac_secret_2026").update(`TUITION-ORD-${reqF3._id.toString()}|${reqF3.simulationTransactionId}`).digest("hex");
    await reqF3.save();

    try {
      await requestService.studentVerifyAndSettleTuitionPayment(studentF3._id.toString(), {
        requestId: reqF3._id.toString(),
        gatewayTransactionId: reqF3.simulationTransactionId!,
        signature: reqF3.simulationPaymentToken!,
      });
      assert(false, "Test 47: Overlapping arbitrary interval (10:15 - 11:15) on same date should fail");
    } catch (err: any) {
      assert(
        err.message.includes("Slot conflict"),
        "Test 47: Non-30-minute-aligned overlapping interval (10:15 - 11:15) correctly rejected by 5-minute bucket lock",
        err.message
      );
    }

    // Test 48: Cancellation Atomicity & Compensation Rollback on Simulated Capacity Release Failure
    // Create an active test batch enrolment
    const testEnrollmentForRollback = await TuitionEnrollment.create({
      studentId: studentF1._id,
      providerId: teacherUser._id,
      offeringId: groupOffering._id,
      batchId: batchA._id,
      requestId: new mongoose.Types.ObjectId(),
      subject: "Physics",
      classLevel: "Class 12",
      classFormat: "group",
      teachingMode: "online",
      scheduleModel: "fixed_batch",
      status: "active",
      feePaid: 3500,
      currency: "INR",
      paymentTransactionId: `TXN-ROLLBACK-${timestamp}`,
    });

    // Temporarily monkey-patch TuitionBatch.findOneAndUpdate to simulate network/database failure
    const originalFindOneAndUpdate = TuitionBatch.findOneAndUpdate;
    (TuitionBatch as any).findOneAndUpdate = async () => {
      throw new Error("Simulated transient MongoDB network failure during batch capacity release");
    };

    try {
      await requestService.cancelTuitionEnrollment(
        studentF1._id.toString(),
        testEnrollmentForRollback._id.toString(),
        "Testing rollback"
      );
      assert(false, "Test 48: Should have thrown simulated capacity release error");
    } catch (err: any) {
      // Verify rollback occurred: enrolment status must be reverted to 'active'
      const rolledBackEnrollment = await TuitionEnrollment.findById(testEnrollmentForRollback._id);
      assert(
        rolledBackEnrollment?.status === "active" &&
          err.message.includes("Capacity release failed; cancellation rolled back"),
        "Test 48: Compensation rollback safely restores enrolment to 'active' on capacity-release failure (prevents orphaned state)"
      );
    } finally {
      // Restore original function
      TuitionBatch.findOneAndUpdate = originalFindOneAndUpdate;
      // Clean up test enrollment
      await TuitionEnrollment.findByIdAndDelete(testEnrollmentForRollback._id);
    }

    // Test 49: Production Security Guard on Missing PAYMENT_HMAC_SECRET
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.PAYMENT_HMAC_SECRET;

    try {
      process.env.NODE_ENV = "production";
      delete process.env.PAYMENT_HMAC_SECRET;

      try {
        getPaymentHmacSecret();
        assert(false, "Test 49: Missing PAYMENT_HMAC_SECRET in production must throw error");
      } catch (err: any) {
        assert(
          err.message.includes("Dedicated PAYMENT_HMAC_SECRET must be configured in production"),
          "Test 49: System securely fails fast when PAYMENT_HMAC_SECRET is missing in production (JWT_SECRET fallback rejected)",
          err.message
        );
      }
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origSecret) process.env.PAYMENT_HMAC_SECRET = origSecret;
    }

    console.log("\n--- 11. STEP 2: TUITION PROVIDER ONBOARDING, AUDIT TRAIL, DECISION APIS & WORKSPACE ACCESS ---");

    // Test 50: Step 2 Provider Application & Document Upload
    const step2Teacher = await User.create({
      email: `step2_teacher_${timestamp}@edupye.test`,
      name: "Prof. Rajesh Raman",
      userType: "teacher",
      roles: ["teacher"],
      activeRole: "teacher",
    });

    const step2Profile = await providerService.submitTuitionProviderOnboarding(
      step2Teacher._id.toString(),
      {
        fullName: "Prof. Rajesh Raman",
        headline: "Professor of Organic & Inorganic Chemistry",
        bio: "Specializing in IIT-JEE Advanced chemistry concepts and reaction mechanisms.",
        experienceYears: 15,
        subjects: ["Chemistry", "Organic Chemistry"],
        classesTaught: ["Class 11", "Class 12", "JEE Prep"],
        teachingMode: ["online", "hybrid"],
        education: [
          { degree: "Ph.D. Chemistry", institution: "IISc Bangalore", yearOfPassing: 2010 },
          { degree: "M.Sc. Chemistry", institution: "Delhi University", yearOfPassing: 2005 },
        ],
        supportingDocuments: [
          { title: "Ph.D. Degree Certificate", documentUrl: "https://documents.edupye.test/phd_cert.pdf" },
          { title: "National Teaching Excellence Award", documentUrl: "https://documents.edupye.test/award.pdf" },
        ],
        pricing: { minHourlyRate: 800, maxHourlyRate: 2500, currency: "INR" },
      }
    );

    assert(
      step2Profile.verificationStatus === "pending" &&
        step2Profile.supportingDocuments.length === 2 &&
        step2Profile.education.length === 2,
      "Test 50: Step 2 Provider onboarding profile created with qualifications and supporting documents in 'pending' state"
    );

    // Test 51: Step 2 Decision - Needs Information State & Audit Trail
    const needsInfoProfile = await providerService.adminUpdateVerificationStatus(
      step2Profile._id.toString(),
      "needs_info",
      "Please provide government photo ID for identity verification",
      undefined,
      "Compliance Officer Sharma"
    );
    const step2TeacherRefreshed1 = await User.findById(step2Teacher._id);
    assert(
      needsInfoProfile.verificationStatus === "needs_info" &&
        needsInfoProfile.verificationAuditTrail.length === 1 &&
        needsInfoProfile.verificationAuditTrail[0].status === "needs_info" &&
        needsInfoProfile.verificationAuditTrail[0].decisionBy === "Compliance Officer Sharma" &&
        !step2TeacherRefreshed1?.roles?.includes("tuition_provider"),
      "Test 51: Admin transitions profile to 'needs_info'; audit trail recorded; role NOT granted"
    );

    // Test 52: Step 2 Decision - Rejection State & Role Gate
    const rejectedProfile = await providerService.adminUpdateVerificationStatus(
      step2Profile._id.toString(),
      "rejected",
      "Incomplete academic documentation submitted",
      undefined,
      "Chief Academic Reviewer"
    );
    const step2TeacherRefreshed2 = await User.findById(step2Teacher._id);
    assert(
      rejectedProfile.verificationStatus === "rejected" &&
        rejectedProfile.verificationAuditTrail.length === 2 &&
        rejectedProfile.verificationAuditTrail[1].status === "rejected" &&
        !step2TeacherRefreshed2?.roles?.includes("tuition_provider"),
      "Test 52: Admin transitions profile to 'rejected'; audit history updated; role denied"
    );

    // Test 53: Step 2 Decision - Approval State, Platinum Tier & Role Assignment
    const approvedProfile = await providerService.adminUpdateVerificationStatus(
      step2Profile._id.toString(),
      "verified",
      "All credentials, doctoral thesis, and identity documents authenticated",
      "platinum",
      "Platform Director"
    );
    const step2TeacherRefreshed3 = await User.findById(step2Teacher._id);
    assert(
      approvedProfile.verificationStatus === "verified" &&
        approvedProfile.platformTier === "platinum" &&
        Boolean(approvedProfile.verifiedAt) &&
        approvedProfile.verificationAuditTrail.length === 3 &&
        approvedProfile.verificationAuditTrail[2].status === "verified" &&
        Boolean(step2TeacherRefreshed3?.roles?.includes("tuition_provider")),
      "Test 53: Admin approval grants 'tuition_provider' role, assigns Platinum tier, and records audit trail"
    );

    // Test 54: Step 2 Admin Verifications Listing API
    const pendingList = await providerService.getTuitionVerifications("pending");
    const verifiedList = await providerService.getTuitionVerifications("verified");
    assert(
      Array.isArray(pendingList) &&
        Array.isArray(verifiedList) &&
        verifiedList.some((p) => p.userId && (p.userId as any)._id?.toString() === step2Teacher._id.toString()),
      "Test 54: Admin verifications listing API filters by status with populated user records"
    );

    // Test 55: Step 2 Secure Provider Workspace Access & Public Marketplace Visibility Isolation
    // 1. Unverified applicant cannot see their profile in public search
    const unverifiedApplicant = await User.create({
      email: `unverified_applicant_${timestamp}@edupye.test`,
      name: "Pending Tutor",
      userType: "teacher",
      roles: ["teacher"],
      activeRole: "teacher",
    });
    const unverifiedProfile = await providerService.submitTuitionProviderOnboarding(
      unverifiedApplicant._id.toString(),
      {
        fullName: "Pending Tutor",
        subjects: ["Biology"],
        classesTaught: ["Class 10"],
        teachingMode: ["online"],
      }
    );

    const publicSearch = await marketplaceService.searchTuitionProviders({ search: "Pending Tutor" });
    assert(
      publicSearch.providers.length === 0,
      "Test 55a: Unverified pending provider is strictly excluded from public marketplace search"
    );

    // 2. Verified provider Prof. Rajesh Raman IS discoverable in public search
    const verifiedStep2Search = await marketplaceService.searchTuitionProviders({ search: "Rajesh Raman" });
    assert(
      verifiedStep2Search.providers.length >= 1 &&
        verifiedStep2Search.providers.some(
          (p) => p.fullName === "Prof. Rajesh Raman" && p.platformTier === "platinum"
        ),
      "Test 55b: Officially verified provider appears in public marketplace with assigned tier"
    );

    // ------------------------------------------------------------------------
    // SUMMARY
    // ------------------------------------------------------------------------
    console.log("\n==========================================================================");
    console.log(`  PHASE 3 TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log("==========================================================================\n");

    if (testsFailed > 0) {
      process.exit(1);
    }
  } finally {
    await mongoose.disconnect();
    console.log("✓ MongoDB disconnected.");
  }
}

runPhase3TuitionSuite().catch((err) => {
  console.error("Test Suite execution failed:", err);
  process.exit(1);
});

