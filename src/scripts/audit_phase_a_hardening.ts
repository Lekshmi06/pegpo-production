import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User";
import TuitionProviderProfile from "../models/TuitionProviderProfile";
import TuitionRequest from "../models/TuitionRequest";
import TuitionEnrollment from "../models/TuitionEnrollment";
import TuitionSession from "../models/TuitionSession";
import TuitionPricing from "../models/TuitionPricing";
import TeacherAssignment from "../models/TeacherAssignment";
import TeacherPayout from "../models/TeacherPayout";
import SessionRecording from "../models/SessionRecording";
import SessionChat from "../models/SessionChat";
import TuitionAttendance from "../models/TuitionAttendance";
import TuitionTransaction from "../models/TuitionTransaction";
import CalendarEvent from "../models/CalendarEvent";
import { resolveTuitionPricing } from "../services/tuition_pricing_service";
import * as centralizedService from "../services/tuition_centralized_service";
import * as payoutService from "../services/tuition_payout_service";
import * as complianceService from "../services/tuition_compliance_service";
import * as providerController from "../controllers/tuition_provider_controller";
import * as marketplaceController from "../controllers/tuition_marketplace_controller";

dotenv.config();

let passedChecks = 0;
let failedChecks = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passedChecks++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedChecks++;
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runHardeningAudit() {
  console.log("============================================================================");
  console.log("  EDUPYE TUITION – PHASE A FINAL VALIDATION & HARDENING AUDIT");
  console.log("============================================================================");

  await mongoose.connect(process.env.MONGODB_URI || "");
  console.log("Connected to MongoDB.");

  const prefix = "hardening_audit_";
  await User.deleteMany({ email: new RegExp(prefix) });

  // -------------------------------------------------------------------------
  // SECTION 1: DATABASE, INDEXES & MIGRATION COMPATIBILITY
  // -------------------------------------------------------------------------
  console.log("\n--- [AUDIT 1] Database, Indexes & Legacy Record Compatibility ---");
  const db = mongoose.connection.db!;

  // 1.1 Verify partial unique index on tuitionrequests
  const reqIndexes = await db.collection("tuitionrequests").indexes();
  const reqPartialIdx = reqIndexes.find((i) => i.name === "studentId_1_offeringId_1");
  assert(
    Boolean(reqPartialIdx && reqPartialIdx.unique && reqPartialIdx.partialFilterExpression?.offeringId),
    "tuitionrequests has partial unique index requiring offeringId to exist"
  );

  // 1.2 Verify partial unique index on tuitionenrollments
  const enrIndexes = await db.collection("tuitionenrollments").indexes();
  const enrPartialIdx = enrIndexes.find((i) => i.name === "studentId_1_offeringId_1");
  assert(
    Boolean(enrPartialIdx && enrPartialIdx.unique && enrPartialIdx.partialFilterExpression?.offeringId),
    "tuitionenrollments has partial unique index requiring offeringId to exist"
  );

  // 1.3 Verify unique index on teacherpayouts sessionId
  const payoutIndexes = await db.collection("teacherpayouts").indexes();
  const payoutUniqueIdx = payoutIndexes.find((i) => i.name === "sessionId_1");
  assert(
    Boolean(payoutUniqueIdx && payoutUniqueIdx.unique),
    "teacherpayouts has strict unique index on sessionId to prevent duplicate payouts"
  );

  // 1.4 Verify historical records accessibility
  const historicalOfferings = await db.collection("tuitionofferings").countDocuments();
  const historicalRequests = await db.collection("tuitionrequests").countDocuments();
  const historicalEnrollments = await db.collection("tuitionenrollments").countDocuments();
  const historicalSessions = await db.collection("tuitionsessions").countDocuments();

  assert(historicalOfferings > 0, `Historical offerings preserved (${historicalOfferings} docs)`);
  assert(historicalRequests > 0, `Historical requests preserved (${historicalRequests} docs)`);
  assert(historicalEnrollments > 0, `Historical enrollments preserved (${historicalEnrollments} docs)`);
  assert(historicalSessions > 0, `Historical sessions preserved (${historicalSessions} docs)`);

  // Query sample historical enrollment with populate
  const sampleLegacyEnrollment = await TuitionEnrollment.findOne({ offeringId: { $exists: true, $ne: null } })
    .populate("studentId", "name email")
    .populate("providerId", "name email");
  assert(Boolean(sampleLegacyEnrollment), "Historical enrollment successfully populated with studentId and providerId");

  // -------------------------------------------------------------------------
  // SECTION 2: TRIAL WORKFLOW HARDENING & ELIGIBILITY ENFORCEMENT
  // -------------------------------------------------------------------------
  console.log("\n--- [AUDIT 2] Trial Workflow Hardening & Constraints ---");

  // Create student & 3 verified teachers
  const student = await User.create({
    name: "Hardening Test Student",
    email: `${prefix}student@edupye.test`,
    password: "Password123!",
    userType: "student",
    roles: ["student"],
  });

  const teachers: any[] = [];
  for (let i = 1; i <= 3; i++) {
    const t = await User.create({
      name: `Hardening Teacher ${i}`,
      email: `${prefix}teacher${i}@edupye.test`,
      password: "Password123!",
      userType: "tuition_provider",
      roles: ["tuition_provider"],
    });
    await TuitionProviderProfile.create({
      userId: t._id,
      fullName: t.name,
      verificationStatus: "verified",
      platformTier: "gold",
    });
    teachers.push(t);
  }

  // Create unverified teacher
  const unverifiedTeacher = await User.create({
    name: "Unverified Teacher",
    email: `${prefix}unverified@edupye.test`,
    password: "Password123!",
    userType: "tuition_provider",
    roles: ["tuition_provider"],
  });
  await TuitionProviderProfile.create({
    userId: unverifiedTeacher._id,
    fullName: unverifiedTeacher.name,
    verificationStatus: "pending",
  });

  const admin = await User.create({
    name: "Platform Admin",
    email: `${prefix}admin@edupye.admin`,
    password: "Password123!",
    userType: "institution",
    roles: ["institution"],
  });

  // 2.1 Submit centralized request
  const request = await centralizedService.submitCentralizedTuitionRequest(student._id.toString(), {
    subject: "Physics",
    classLevel: "Grade 11-12",
    curriculum: "CBSE",
    preferredDays: ["Monday", "Wednesday"],
    preferredTimeSlot: { startTime: "16:00", endTime: "18:00" },
  });
  assert(request.requestType === "trial" && request.trialSessions.length === 3, "Request initializes 3 trial slots");

  // 2.2 Reject duplicate teachers allocation
  let duplicateTeacherBlocked = false;
  try {
    await centralizedService.adminAssignTrialTeachers(admin._id.toString(), request._id.toString(), [
      { trialIndex: 1, teacherId: teachers[0]._id.toString(), scheduledDate: "2026-11-25", startTime: "16:00" },
      { trialIndex: 2, teacherId: teachers[0]._id.toString(), scheduledDate: "2026-11-26", startTime: "16:00" },
      { trialIndex: 3, teacherId: teachers[1]._id.toString(), scheduledDate: "2026-11-27", startTime: "16:00" },
    ]);
  } catch (err: any) {
    duplicateTeacherBlocked = err.message.includes("distinct teacher");
  }
  assert(duplicateTeacherBlocked, "Duplicate teacher allocation strictly blocked");

  // 2.3 Reject unverified teacher allocation
  let unverifiedTeacherBlocked = false;
  try {
    await centralizedService.adminAssignTrialTeachers(admin._id.toString(), request._id.toString(), [
      { trialIndex: 1, teacherId: teachers[0]._id.toString(), scheduledDate: "2026-11-25", startTime: "16:00" },
      { trialIndex: 2, teacherId: teachers[1]._id.toString(), scheduledDate: "2026-11-26", startTime: "16:00" },
      { trialIndex: 3, teacherId: unverifiedTeacher._id.toString(), scheduledDate: "2026-11-27", startTime: "16:00" },
    ]);
  } catch (err: any) {
    unverifiedTeacherBlocked = err.message.includes("not a verified tuition provider");
  }
  assert(unverifiedTeacherBlocked, "Unverified teacher allocation strictly blocked");

  // 2.4 Allocate 3 distinct verified teachers
  const assignedReq = await centralizedService.adminAssignTrialTeachers(admin._id.toString(), request._id.toString(), [
    { trialIndex: 1, teacherId: teachers[0]._id.toString(), scheduledDate: "2026-11-25", startTime: "16:00" },
    { trialIndex: 2, teacherId: teachers[1]._id.toString(), scheduledDate: "2026-11-26", startTime: "16:00" },
    { trialIndex: 3, teacherId: teachers[2]._id.toString(), scheduledDate: "2026-11-27", startTime: "16:00" },
  ]);
  assert(assignedReq.status === "trial_assigned", "Request status updated to trial_assigned");

  // 2.5 Prevent duplicate trial assignment on the same request
  let reassignBlocked = false;
  try {
    await centralizedService.adminAssignTrialTeachers(admin._id.toString(), request._id.toString(), [
      { trialIndex: 1, teacherId: teachers[0]._id.toString(), scheduledDate: "2026-11-28", startTime: "16:00" },
      { trialIndex: 2, teacherId: teachers[1]._id.toString(), scheduledDate: "2026-11-29", startTime: "16:00" },
      { trialIndex: 3, teacherId: teachers[2]._id.toString(), scheduledDate: "2026-11-30", startTime: "16:00" },
    ]);
  } catch (err: any) {
    reassignBlocked = err.message.includes("already been assigned") || err.message.includes("Duplicate allocation");
  }
  assert(reassignBlocked, "Reassigning trials to an already assigned request is strictly blocked");

  // 2.6 Verify trial duration is strictly 30 minutes
  const trialSessions = await TuitionSession.find({ requestId: request._id, isTrial: true });
  assert(trialSessions.length === 3, "Exactly 3 trial sessions created");
  assert(
    trialSessions.every((s) => s.durationMinutes === 30 && s.startTime === "16:00" && s.endTime === "16:30"),
    "All trial sessions have duration of exactly 30 minutes (16:00 - 16:30)"
  );

  // 2.7 Verify feedback CANNOT be submitted for uncompleted trial session
  let prematureFeedbackBlocked = false;
  try {
    await centralizedService.submitTrialFeedback(student._id.toString(), request._id.toString(), 1, 5, "Too early!");
  } catch (err: any) {
    prematureFeedbackBlocked = err.message.includes("not been completed yet");
  }
  assert(prematureFeedbackBlocked, "Submitting feedback before trial completion is strictly blocked");

  // 2.8 Verify preferred teacher selection CANNOT happen before all 3 trials complete
  let prematureSelectionBlocked = false;
  try {
    await centralizedService.selectPreferredTeacher(student._id.toString(), request._id.toString(), teachers[0]._id.toString());
  } catch (err: any) {
    prematureSelectionBlocked = err.message.includes("must be completed before selecting");
  }
  assert(prematureSelectionBlocked, "Selecting preferred teacher before completing all 3 trials is strictly blocked");

  // 2.9 Complete all 3 trials
  for (const session of trialSessions) {
    await centralizedService.completeTrialSession(session._id.toString(), session.providerId.toString(), {
      status: "present",
      remarks: "Trial conducted successfully",
    });
  }

  // 2.10 Submit feedback for completed trials
  await centralizedService.submitTrialFeedback(student._id.toString(), request._id.toString(), 1, 5, "Great lesson!");
  await centralizedService.submitTrialFeedback(student._id.toString(), request._id.toString(), 2, 4, "Helpful session.");
  await centralizedService.submitTrialFeedback(student._id.toString(), request._id.toString(), 3, 5, "Exceptional pedagogy.");
  const reqWithFeedback = await TuitionRequest.findById(request._id);
  assert(
    Boolean(reqWithFeedback?.trialSessions.every((s) => s.studentRating && s.studentFeedback)),
    "All 3 trial sessions have recorded 1-5 star ratings and student feedback"
  );

  // 2.11 Prevent selecting a teacher who was NOT among the 3 assigned trial teachers
  let invalidTeacherChoiceBlocked = false;
  try {
    await centralizedService.selectPreferredTeacher(
      student._id.toString(),
      request._id.toString(),
      unverifiedTeacher._id.toString()
    );
  } catch (err: any) {
    invalidTeacherChoiceBlocked = err.message.includes("must be one of the teachers from your 3 trial sessions");
  }
  assert(invalidTeacherChoiceBlocked, "Selecting a teacher not in the 3 trial sessions is strictly blocked");

  // 2.12 Select preferred teacher from the 3 trial teachers
  const reqWithChoice = await centralizedService.selectPreferredTeacher(
    student._id.toString(),
    request._id.toString(),
    teachers[0]._id.toString(),
    "Dr. Raman explained kinematics brilliantly."
  );
  assert(reqWithChoice.preferredTeacherId?.toString() === teachers[0]._id.toString(), "Student preferred teacher recorded");

  // -------------------------------------------------------------------------
  // SECTION 3: PRICING, PAYMENT GATEWAY VALIDATION & SNAPSHOT IMMUTABILITY
  // -------------------------------------------------------------------------
  console.log("\n--- [AUDIT 3] Pricing & Payments Hardening ---");

  // 3.1 Historical pricing snapshot immutability
  const originalStudentRate = reqWithChoice.pricingSnapshot?.studentHourlyRate || 1000;
  // Artificially change the platform rate card for Physics to ₹2500/hr
  await TuitionPricing.findOneAndUpdate(
    { subject: "Physics", curriculum: "CBSE" },
    { $set: { studentHourlyRate: 2500 } }
  );

  // Finalize regular teacher
  await centralizedService.adminFinalizeRegularTeacher(
    admin._id.toString(),
    request._id.toString(),
    teachers[0]._id.toString(),
    "Confirmed student choice"
  );

  // Settle payment: verify that original snapshot rate (₹1000/hr) is preserved, NOT ₹2500/hr!
  const hardeningTxnId = `TXN-HARDENING-${Date.now()}`;
  const enrollmentResult = await centralizedService.activateRegular1to1Enrollment(
    student._id.toString(),
    request._id.toString(),
    {
      gatewayTransactionId: hardeningTxnId,
      hoursPurchased: 10,
      amountPaid: 10000,
    }
  );

  assert(
    enrollmentResult.enrollment.hourlyRate === originalStudentRate,
    `Historical pricing snapshot preserved immutably (₹${enrollmentResult.enrollment.hourlyRate}/hr vs updated rate card ₹2500/hr)`
  );

  // Restore rate card
  await TuitionPricing.findOneAndUpdate(
    { subject: "Physics", curriculum: "CBSE" },
    { $set: { studentHourlyRate: 1000 } }
  );

  // 3.2 Duplicate payment transaction ID protection
  let duplicateTxnBlocked = false;
  try {
    await centralizedService.activateRegular1to1Enrollment(student._id.toString(), request._id.toString(), {
      gatewayTransactionId: hardeningTxnId,
      hoursPurchased: 10,
      amountPaid: 10000,
    });
  } catch (err: any) {
    duplicateTxnBlocked = err.message.includes("already been enrolled") || err.message.includes("Duplicate payment transaction");
  }
  assert(duplicateTxnBlocked, "Duplicate payment transaction ID & re-enrollment strictly blocked");

  // -------------------------------------------------------------------------
  // SECTION 4: TEACHER PAYOUTS & TRIAL COMPENSATION POLICY
  // -------------------------------------------------------------------------
  console.log("\n--- [AUDIT 4] Teacher Payouts & Internal Trial Compensation Policy ---");

  // 4.1 Trial payouts withheld check (ENABLE_TRIAL_PAYOUTS is unset/false by default)
  const trialPayouts = await TeacherPayout.find({ requestId: request._id, isTrial: true });
  assert(trialPayouts.length === 3, "Payout records generated for all 3 trial sessions");
  assert(
    trialPayouts.every((p) => p.status === "withheld" && p.totalAmount === 0),
    "Trial payouts are withheld at ₹0 amount pending internal trial compensation policy confirmation"
  );

  // 4.2 Admin approval of trial payout blocked when policy is unconfirmed
  let trialApprovalBlocked = false;
  try {
    await payoutService.adminApprovePayout(admin._id.toString(), trialPayouts[0]._id.toString());
  } catch (err: any) {
    trialApprovalBlocked = err.message.includes("internal trial compensation policy has not been confirmed");
  }
  assert(trialApprovalBlocked, "Admin approval of trial payout strictly blocked pending compensation policy confirmation");

  // 4.3 Payout cannot be created for a non-completed or unverified session
  const fakeSession = await TuitionSession.create({
    providerId: teachers[0]._id,
    studentIds: [student._id],
    title: "Unattended Scheduled Session",
    sessionDate: new Date(),
    startTime: "10:00",
    endTime: "11:00",
    status: "scheduled",
  });

  let nonCompletedPayoutBlocked = false;
  try {
    await payoutService.createTeacherPayoutForSession(fakeSession._id.toString());
  } catch (err: any) {
    nonCompletedPayoutBlocked = err.message.includes("must be 'completed'");
  }
  assert(nonCompletedPayoutBlocked, "Payout generation for non-completed session strictly blocked");

  fakeSession.status = "completed";
  await fakeSession.save();

  let unverifiedAttendancePayoutBlocked = false;
  try {
    await payoutService.createTeacherPayoutForSession(fakeSession._id.toString());
  } catch (err: any) {
    unverifiedAttendancePayoutBlocked = err.message.includes("attendance has not been verified");
  }
  assert(unverifiedAttendancePayoutBlocked, "Payout generation without verified attendance strictly blocked");
  await TuitionSession.deleteOne({ _id: fakeSession._id });

  // -------------------------------------------------------------------------
  // SECTION 5: RECORDING, COMPLIANCE & PHYSICAL MEDIA RETENTION
  // -------------------------------------------------------------------------
  console.log("\n--- [AUDIT 5] Recording, Compliance & Physical File Retention ---");

  // 5.1 Verification of recording scope
  console.log("  [INFO] Verifying recording architecture:");
  console.log("    - SessionRecording metadata model: IMPLEMENTED (admin_only accessLevel, 365-day TTL).");
  console.log("    - Admin Recording Vault API: IMPLEMENTED.");
  console.log("    - Server-side WebRTC track capture / composite recording engine: NOT IMPLEMENTED in Phase A (peer-to-peer browser mesh).");

  const testRec = await complianceService.createSessionRecording({
    sessionId: trialSessions[0]._id.toString(),
    recordingUrl: "https://storage.edupye.com/recordings/sample-audit-rec.webm",
    storageKey: "sample-audit-rec.webm",
    fileSizeBytes: 2048000,
    durationSeconds: 1800,
  });
  assert(testRec.accessLevel === "admin_only", "Recording accessLevel is strictly admin_only");

  const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;
  const diffDays = Math.abs(testRec.expiresAt.getTime() - oneYearFromNow) / (1000 * 60 * 60 * 24);
  assert(diffDays < 2, "Recording retention expiry is set to exactly 1 year (365 days)");

  // 5.2 Test physical file purge routine
  const purgeResult = await complianceService.purgeExpiredComplianceArtifacts();
  assert(typeof purgeResult.purgedRecordings === "number", "Purge maintenance routine operates cleanly");

  // -------------------------------------------------------------------------
  // SECTION 6: AUTHORIZATION & MARKETPLACE RETIREMENT
  // -------------------------------------------------------------------------
  console.log("\n--- [AUDIT 6] Role-Based Authorization & Marketplace Retirement ---");

  // 6.1 Check offering creation blocked
  let offeringCreated = true;
  // Provider controller direct check
  const fakeReq: any = { user: { _id: teachers[0]._id, userType: "tuition_provider" }, body: {} };
  let statusCode = 0;
  let responseBody: any = null;
  const fakeRes: any = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (body: any) => {
          responseBody = body;
        },
      };
    },
  };

  await providerController.createOffering(fakeReq, fakeRes);
  assert(
    statusCode === 403 && responseBody?.code === "MARKETPLACE_RETIRED",
    "Teacher createOffering endpoint returns 403 Forbidden with MARKETPLACE_RETIRED"
  );

  await providerController.createBatch(fakeReq, fakeRes);
  assert(
    statusCode === 403 && responseBody?.code === "MARKETPLACE_RETIRED",
    "Teacher createBatch endpoint returns 403 Forbidden with MARKETPLACE_RETIRED"
  );

  // 6.2 Check public marketplace search deprecated
  await marketplaceController.searchProviders(fakeReq, fakeRes);
  assert(
    responseBody?.deprecated === true && responseBody?.count === 0,
    "Public searchProviders endpoint returns clean deprecation guidance response"
  );

  // -------------------------------------------------------------------------
  // CLEANUP & SUMMARY
  // -------------------------------------------------------------------------
  console.log("\n--- Cleaning up audit test fixtures ---");
  await User.deleteMany({ email: new RegExp(prefix) });
  await TuitionProviderProfile.deleteMany({ userId: { $in: [...teachers.map((t) => t._id), unverifiedTeacher._id] } });
  await TuitionRequest.deleteOne({ _id: request._id });
  await TuitionEnrollment.deleteOne({ _id: enrollmentResult.enrollment._id });
  await TuitionSession.deleteMany({ requestId: request._id });
  await TeacherAssignment.deleteMany({ requestId: request._id });
  await TeacherPayout.deleteMany({ requestId: request._id });
  await SessionRecording.deleteOne({ _id: testRec._id });
  await CalendarEvent.deleteMany({ userId: { $in: [student._id, ...teachers.map((t) => t._id)] } });

  console.log("\n============================================================================");
  console.log(`  AUDIT COMPLETED: ${passedChecks} CHECKS PASSED, ${failedChecks} FAILED`);
  console.log("============================================================================");

  await mongoose.disconnect();
}

runHardeningAudit().catch((err) => {
  console.error("HARDENING AUDIT FAILED:", err);
  process.exit(1);
});

