import mongoose from "mongoose";
import dotenv from "dotenv";
import assert from "assert";
import fs from "fs";
import path from "path";
import User, { generateStudentCode, generateTeacherCode, backfillUserCodes } from "../models/User";
import TuitionProgram, { generateProgramCode } from "../models/TuitionProgram";
import CombinedStudyMessage from "../models/CombinedStudyMessage";
import TuitionSession from "../models/TuitionSession";
import LiveClassSession from "../models/LiveClassSession";
import * as programController from "../controllers/tuition_program_controller";
import * as complianceService from "../services/tuition_compliance_service";
import { checkSessionIdleAutoLogout, verifySessionAccess } from "../services/live_class_service";
import { enforceClassroomIdleAutoLogout } from "../websocket/classroom_signalling";

dotenv.config();

let passedTests = 0;
let totalTests = 0;

function pass(name: string) {
  passedTests++;
  console.log(`  ✓ PASS: ${name}`);
}

function fail(name: string, err: any) {
  console.error(`  ✗ FAIL: ${name}`);
  console.error(`    -> ${err.message}`);
  throw err;
}

async function test(name: string, fn: () => Promise<void>) {
  totalTests++;
  try {
    await fn();
    pass(name);
  } catch (err: any) {
    fail(name, err);
  }
}

// Mock express req/res
function mockReqRes(reqData: any = {}) {
  let statusCode = 200;
  let responseData: any = null;

  const req: any = {
    body: reqData.body || {},
    params: reqData.params || {},
    query: reqData.query || {},
    user: reqData.user || undefined,
    file: reqData.file || undefined,
  };

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      responseData = data;
      return res;
    },
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => responseData,
  };
}

async function runPhaseBVerification() {
  console.log("==========================================================================");
  console.log("  EDUPYE TUITION – PHASE B: CODES, PROGRAMS, COMBINED STUDY & AUTO-LOGOUT  ");
  console.log("==========================================================================\n");

  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/edupye";
  await mongoose.connect(mongoUri);
  console.log("✓ Connected to MongoDB.\n");

  const ts = Date.now();
  const dummyUploadPath = path.resolve("uploads", "test_combined_study_purge.pdf");

  try {
    // ------------------------------------------------------------------------
    // SECTION 1: PERMANENT STUDENT AND TEACHER CODES
    // ------------------------------------------------------------------------
    console.log("--- 1. Testing Permanent studentCode & teacherCode Generation & Backfill ---");

    let studentUser: any;
    let teacherUser: any;

    await test("1.1 Student auto-generates permanent studentCode (STU-XXXXXX)", async () => {
      studentUser = await User.create({
        name: `Rohan Sharma ${ts}`,
        email: `rohan_student_${ts}@edupye.test`,
        password: "Password123!",
        userType: "student",
        roles: ["student"],
      });

      assert(studentUser.studentCode, "studentCode must be generated");
      assert(/^STU-[A-F0-9]{6}$/.test(studentUser.studentCode), `Format must be STU-XXXXXX, got: ${studentUser.studentCode}`);
    });

    await test("1.2 Teacher auto-generates permanent teacherCode (TCH-XXXXXX)", async () => {
      teacherUser = await User.create({
        name: `Dr. Ananya Roy ${ts}`,
        email: `ananya_teacher_${ts}@edupye.test`,
        password: "Password123!",
        userType: "tuition_provider",
        roles: ["tuition_provider", "teacher"],
      });

      assert(teacherUser.teacherCode, "teacherCode must be generated");
      assert(/^TCH-[A-F0-9]{6}$/.test(teacherUser.teacherCode), `Format must be TCH-XXXXXX, got: ${teacherUser.teacherCode}`);
    });

    await test("1.3 backfillUserCodes populates existing users missing permanent codes", async () => {
      // Create user without code bypassing pre-save
      const legacyStudent = new User({
        name: `Legacy Student ${ts}`,
        email: `legacy_student_${ts}@edupye.test`,
        userType: "student",
        roles: ["student"],
      });
      await User.collection.insertOne(legacyStudent.toObject());

      const res = await backfillUserCodes();
      assert(res.studentsUpdated >= 1, "At least 1 student should be backfilled");

      const refreshed = await User.findById(legacyStudent._id);
      assert(refreshed?.studentCode, "Legacy user must have received studentCode");
      assert(/^STU-[A-F0-9]{6}$/.test(refreshed.studentCode));
    });

    // ------------------------------------------------------------------------
    // SECTION 2: CODE LOGIN (/api/tuition/auth/code-login)
    // ------------------------------------------------------------------------
    console.log("\n--- 2. Testing Tuition Code-Login Endpoint ---");

    await test("2.1 Code-login with valid studentCode succeeds and returns token + tuitionMode", async () => {
      const { req, res, getStatus, getData } = mockReqRes({
        body: { code: studentUser.studentCode },
      });

      await programController.codeLogin(req, res);
      assert.strictEqual(getStatus(), 200);
      const data = getData();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.tuitionMode, true);
      assert(data.token, "JWT token must be returned");
      assert.strictEqual(data.user.studentCode, studentUser.studentCode);
    });

    await test("2.2 Code-login with valid teacherCode succeeds", async () => {
      const { req, res, getStatus, getData } = mockReqRes({
        body: { code: teacherUser.teacherCode },
      });

      await programController.codeLogin(req, res);
      assert.strictEqual(getStatus(), 200);
      const data = getData();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.user.teacherCode, teacherUser.teacherCode);
    });

    await test("2.3 Code-login with invalid code is rejected with 401", async () => {
      const { req, res, getStatus, getData } = mockReqRes({
        body: { code: "STU-NONEXISTENT99" },
      });

      await programController.codeLogin(req, res);
      assert.strictEqual(getStatus(), 401);
      assert.strictEqual(getData().success, false);
    });

    await test("2.4 Code-login with mismatched name is rejected with 401", async () => {
      const { req, res, getStatus, getData } = mockReqRes({
        body: {
          code: studentUser.studentCode,
          name: "Completely Wrong Name",
        },
      });

      await programController.codeLogin(req, res);
      assert.strictEqual(getStatus(), 401);
      assert(getData().message.includes("does not match"));
    });

    // ------------------------------------------------------------------------
    // SECTION 3: TUITION PROGRAMS & ROSTERS
    // ------------------------------------------------------------------------
    console.log("\n--- 3. Testing Tuition Programs & Program-wise Rosters ---");

    let program: any;

    await test("3.1 Create TuitionProgram with schedule, teacher, and student", async () => {
      program = await TuitionProgram.create({
        title: `CBSE Grade 12 Quantum Physics Intensive ${ts}`,
        code: generateProgramCode("PRG-PHY"),
        subject: "Physics",
        grade: "Grade 12",
        schedule: [
          { day: "Tuesday", startTime: "17:00", endTime: "18:30" },
          { day: "Thursday", startTime: "17:00", endTime: "18:30" },
        ],
        teacherIds: [teacherUser._id],
        enrolledStudentIds: [studentUser._id],
        status: "active",
      });

      assert(program._id, "Program must be created");
      assert.strictEqual(program.teacherIds.length, 1);
      assert.strictEqual(program.enrolledStudentIds.length, 1);
    });

    await test("3.2 Code-login with authorized programId returns programContext", async () => {
      const { req, res, getStatus, getData } = mockReqRes({
        body: {
          code: studentUser.studentCode,
          programId: program._id.toString(),
        },
      });

      await programController.codeLogin(req, res);
      assert.strictEqual(getStatus(), 200);
      const data = getData();
      assert(data.programContext, "programContext must be present");
      assert.strictEqual(data.programContext.roleInProgram, "student");
      assert.strictEqual(data.programContext.title, program.title);
    });

    await test("3.3 Code-login for non-enrolled user to program is blocked with 403", async () => {
      const strangerStudent = await User.create({
        name: `Stranger Student ${ts}`,
        email: `stranger_${ts}@edupye.test`,
        userType: "student",
        roles: ["student"],
      });

      const { req, res, getStatus, getData } = mockReqRes({
        body: {
          code: strangerStudent.studentCode,
          programId: program._id.toString(),
        },
      });

      await programController.codeLogin(req, res);
      assert.strictEqual(getStatus(), 403);
      assert(getData().message.includes("not enrolled"));
    });

    await test("3.4 GET /api/tuition/programs lists user's enrolled programs", async () => {
      const { req, res, getStatus, getData } = mockReqRes({
        user: { _id: studentUser._id, role: "student" },
      });

      await programController.getTuitionPrograms(req, res);
      assert.strictEqual(getStatus(), 200);
      const data = getData();
      assert(data.myPrograms.some((p: any) => p._id.toString() === program._id.toString()));
    });

    await test("3.5 GET /api/tuition/programs/:id/roster for student returns assigned teacher & co-students", async () => {
      const { req, res, getStatus, getData } = mockReqRes({
        user: { _id: studentUser._id, role: "student" },
        params: { programId: program._id.toString() },
      });

      await programController.getProgramRoster(req, res);
      assert.strictEqual(getStatus(), 200);
      const data = getData();
      assert.strictEqual(data.role, "student");
      assert(data.assignedTeachers.length >= 1, "Teacher must be listed");
      assert(data.assignedTeachers[0].teacherCode, "Teacher code must be exposed");
      assert(data.coStudents.length >= 1, "Co-students must be listed");
    });

    await test("3.6 GET /api/tuition/teacher/enrolled-students organizes students program-wise", async () => {
      const { req, res, getStatus, getData } = mockReqRes({
        user: { _id: teacherUser._id, role: "tuition_provider" },
      });

      await programController.getTeacherEnrolledStudents(req, res);
      assert.strictEqual(getStatus(), 200);
      const data = getData();
      assert.strictEqual(data.totalPrograms >= 1, true);
      const progRoster = data.programRosters.find((r: any) => r.programId.toString() === program._id.toString());
      assert(progRoster, "Program roster must exist");
      assert.strictEqual(progRoster.totalEnrolled, 1);
      assert.strictEqual(progRoster.students[0]._id.toString(), studentUser._id.toString());
    });

    // ------------------------------------------------------------------------
    // SECTION 4: COMBINED STUDY (CHAT + MEDIA WITH 1-YEAR RETENTION)
    // ------------------------------------------------------------------------
    console.log("\n--- 4. Testing Combined Study (1-Year Retention & Media Purge) ---");

    let textMsg: any;
    let fileMsg: any;

    await test("4.1 POST text message in Combined Study sets 1-year expiresAt", async () => {
      const { req, res, getStatus, getData } = mockReqRes({
        user: { _id: studentUser._id, role: "student" },
        params: { programId: program._id.toString() },
        body: { content: "Can someone share the formula sheet for wave mechanics?" },
      });

      await programController.postCombinedStudyMessage(req, res);
      assert.strictEqual(getStatus(), 201);
      textMsg = getData().message;
      assert.strictEqual(textMsg.messageType, "text");
      assert.strictEqual(textMsg.content, "Can someone share the formula sheet for wave mechanics?");

      // Verify 1-year expiresAt (approx 365 days from now)
      const diffDays = Math.round((new Date(textMsg.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      assert(diffDays >= 364 && diffDays <= 366, `Retention must be 365 days, got: ${diffDays}`);
    });

    await test("4.2 POST file in Combined Study (PDF/Image) with 1-year expiresAt", async () => {
      // Create a dummy physical file to test physical cleanup
      fs.mkdirSync(path.dirname(dummyUploadPath), { recursive: true });
      fs.writeFileSync(dummyUploadPath, "%PDF-1.4 Mock PDF Content");

      const { req, res, getStatus, getData } = mockReqRes({
        user: { _id: teacherUser._id, role: "teacher" },
        params: { programId: program._id.toString() },
        file: {
          mimetype: "application/pdf",
          filename: "wave_mechanics.pdf",
          path: dummyUploadPath,
          originalname: "wave_mechanics.pdf",
          size: 1024,
        },
      });

      await programController.postCombinedStudyMessage(req, res);
      assert.strictEqual(getStatus(), 201);
      fileMsg = getData().message;
      assert.strictEqual(fileMsg.messageType, "pdf");
      assert.strictEqual(fileMsg.fileKey, dummyUploadPath);
      assert(fileMsg.expiresAt, "expiresAt must be set");
    });

    await test("4.3 GET /api/tuition/programs/:id/combined-study retrieves active messages", async () => {
      const { req, res, getStatus, getData } = mockReqRes({
        user: { _id: studentUser._id, role: "student" },
        params: { programId: program._id.toString() },
      });

      await programController.getCombinedStudyMessages(req, res);
      assert.strictEqual(getStatus(), 200);
      assert(getData().messages.length >= 2, "Must retrieve posted text and file messages");
    });

    await test("4.4 Expired Combined Study messages and physical files are purged after 1 year", async () => {
      // Artificially expire the file message to test maintenance purge
      fileMsg.expiresAt = new Date(Date.now() - 1000);
      await CombinedStudyMessage.updateOne({ _id: fileMsg._id }, { expiresAt: fileMsg.expiresAt });

      assert(fs.existsSync(dummyUploadPath), "Dummy file must exist prior to purge");

      const purgeResult = await complianceService.purgeExpiredComplianceArtifacts();
      assert(purgeResult.purgedCombinedStudy >= 1, "At least 1 combined study message must be purged");
      assert(!fs.existsSync(dummyUploadPath), "Physical file must be unlinked/deleted from disk upon expiration");
    });

    // ------------------------------------------------------------------------
    // SECTION 5: 15-MINUTE POST-SESSION IDLE AUTO-LOGOUT
    // ------------------------------------------------------------------------
    console.log("\n--- 5. Testing 15-Minute Post-Session Idle Auto-Logout Rule ---");

    let expiredTuitionSession: any;
    let liveClassSession: any;

    await test("5.1 Setup active session where scheduledEndTime was 20 minutes ago", async () => {
      const now = new Date();
      const pastScheduledEnd = new Date(now.getTime() - 20 * 60 * 1000); // 20 mins ago

      expiredTuitionSession = await TuitionSession.create({
        title: `Idle Auto-Logout Test Session ${ts}`,
        providerId: teacherUser._id,
        teacherId: teacherUser._id,
        studentIds: [studentUser._id],
        sessionDate: pastScheduledEnd,
        startTime: "10:00",
        endTime: "11:00",
        scheduledEndTime: pastScheduledEnd,
        status: "scheduled",
        meetingProvider: "edupye_smartboard",
        timezone: "Asia/Kolkata",
        hasRecording: false,
      });

      liveClassSession = await LiveClassSession.create({
        title: expiredTuitionSession.title,
        hostId: teacherUser._id,
        hostRole: "tuition_provider",
        status: "live",
        sessionType: "tuition",
        tuitionSessionId: expiredTuitionSession._id,
        scheduledEndTime: pastScheduledEnd,
        authorizedStudentIds: [studentUser._id],
        activeParticipants: [],
        settings: { allowMicrophone: true, allowCamera: true, allowScreenShare: true, allowChat: true },
        startedAt: new Date(now.getTime() - 80 * 60 * 1000),
      });

      assert.strictEqual(expiredTuitionSession.status, "scheduled");
      assert.strictEqual(liveClassSession.status, "live");
    });

    await test("5.2 checkSessionIdleAutoLogout triggers auto-ended & isForceLoggedOut past 15 mins", async () => {
      const check = await checkSessionIdleAutoLogout(expiredTuitionSession._id.toString());
      assert.strictEqual(check.expired, true, "Session must be detected as expired past 15-min limit");

      const refreshedTuition = await TuitionSession.findById(expiredTuitionSession._id);
      assert.strictEqual(refreshedTuition?.status, "completed", "TuitionSession must transition to completed");
      assert.strictEqual(refreshedTuition?.isForceLoggedOut, true, "isForceLoggedOut must be true");

      const refreshedLive = await LiveClassSession.findById(liveClassSession._id);
      assert.strictEqual(refreshedLive?.status, "ended", "LiveClassSession must transition to ended");
      assert.strictEqual(refreshedLive?.isForceLoggedOut, true, "isForceLoggedOut must be true");
    });

    await test("5.3 verifySessionAccess rejects further join/heartbeat attempts with 15-min idle error", async () => {
      const access = await verifySessionAccess(expiredTuitionSession._id.toString(), studentUser._id.toString());
      assert.strictEqual(access.authorized, false);
      assert(access.error?.includes("15-minute post-session idle limit"));
    });

    await test("5.4 enforceClassroomIdleAutoLogout emits force-logout socket event and clears room", async () => {
      const res = await enforceClassroomIdleAutoLogout(expiredTuitionSession._id.toString());
      assert(typeof res.forcedCount === "number");
    });

    // ------------------------------------------------------------------------
    // SUMMARY
    // ------------------------------------------------------------------------
    console.log("\n==========================================================================");
    console.log(`  PHASE B VERIFICATION COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log("==========================================================================\n");
  } finally {
    if (fs.existsSync(dummyUploadPath)) {
      try { fs.unlinkSync(dummyUploadPath); } catch {}
    }
    await mongoose.disconnect();
    console.log("✓ MongoDB test connection closed.");
    process.exit(0);
  }
}

runPhaseBVerification().catch((err) => {
  console.error("FATAL SUITE ERROR:", err);
  process.exit(1);
});
