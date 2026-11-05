import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import Test from "../models/Test";
import TestAttempt from "../models/TestAttempt";
import StudentProfile from "../models/StudentProfile";
import TeacherProfile from "../models/TeacherProfile";
import ClassSection from "../models/ClassSection";
import TeachingContext from "../models/TeachingContext";
import StudentMembership from "../models/StudentMembership";
import User from "../models/User";
import { listTests, startTestAttempt } from "../services/test_service";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
  }
}

async function runScheduledTestTargetingVerification() {
  console.log("===============================================================");
  console.log("SCHEDULED TEST TARGETING ELIGIBILITY REGRESSION SUITE");
  console.log("===============================================================\n");

  const mongoUri = process.env.MONGODB_URI || "";
  if (!mongoUri) {
    console.error("MONGODB_URI is not configured in .env");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB for real database verification.\n");

  const cleanupIds = {
    users: [] as mongoose.Types.ObjectId[],
    teachers: [] as mongoose.Types.ObjectId[],
    students: [] as mongoose.Types.ObjectId[],
    sections: [] as mongoose.Types.ObjectId[],
    contexts: [] as mongoose.Types.ObjectId[],
    memberships: [] as mongoose.Types.ObjectId[],
    tests: [] as mongoose.Types.ObjectId[],
    attempts: [] as mongoose.Types.ObjectId[],
  };

  try {
    const timestamp = Date.now();

    // 1. Setup Teacher
    const teacherUser = (await User.create({
      email: `teacher_targeting_${timestamp}@edupye.test`,
      userType: "teacher",
    })) as any;
    cleanupIds.users.push(teacherUser._id);

    const teacher = (await TeacherProfile.create({
      userId: teacherUser._id,
      name: "Dr. Targeting Examiner",
      teacherType: "institution",
    })) as any;
    cleanupIds.teachers.push(teacher._id);

    // 2. Setup Class Sections A and B
    const sectionA = (await ClassSection.create({
      teacherProfileId: teacher._id,
      name: `Class 10-A (${timestamp})`,
      classLevel: "Class 10",
      section: "A",
      board: "CBSE",
      academicYear: "2026-2027",
    } as any)) as any;
    cleanupIds.sections.push(sectionA._id);

    const sectionB = (await ClassSection.create({
      teacherProfileId: teacher._id,
      name: `Class 10-B (${timestamp})`,
      classLevel: "Class 10",
      section: "B",
      board: "CBSE",
      academicYear: "2026-2027",
    } as any)) as any;
    cleanupIds.sections.push(sectionB._id);

    // 3. Setup Teaching Contexts linked to sections
    const teachingContextA = (await TeachingContext.create({
      teacherId: teacher._id,
      classSectionId: sectionA._id,
      contextType: "institution",
      classLevel: "Class 10",
      section: "A",
      subject: "Science",
      curriculumBoard: "CBSE",
      academicYear: "2026-2027",
      isArchived: false,
    } as any)) as any;
    cleanupIds.contexts.push(teachingContextA._id);

    const teachingContextB = (await TeachingContext.create({
      teacherId: teacher._id,
      classSectionId: sectionB._id,
      contextType: "institution",
      classLevel: "Class 10",
      section: "B",
      subject: "Mathematics",
      curriculumBoard: "CBSE",
      academicYear: "2026-2027",
      isArchived: false,
    } as any)) as any;
    cleanupIds.contexts.push(teachingContextB._id);

    // 4. Setup Students
    // Student 1: Enrolled in Section A
    const studentUser1 = (await User.create({
      email: `student1_${timestamp}@edupye.test`,
      userType: "student",
    })) as any;
    cleanupIds.users.push(studentUser1._id);

    const student1 = (await StudentProfile.create({
      userId: studentUser1._id,
      name: "Student One (Section A)",
      education: { classLevel: "Class 10", board: "CBSE" },
    } as any)) as any;
    cleanupIds.students.push(student1._id);

    const membership1 = (await StudentMembership.create({
      classSectionId: sectionA._id,
      studentProfileId: student1._id,
      academicYear: "2026-2027",
      isActive: true,
      enrolledAt: new Date(),
    } as any)) as any;
    cleanupIds.memberships.push(membership1._id);

    // Student 2: Enrolled in Section B
    const studentUser2 = (await User.create({
      email: `student2_${timestamp}@edupye.test`,
      userType: "student",
    })) as any;
    cleanupIds.users.push(studentUser2._id);

    const student2 = (await StudentProfile.create({
      userId: studentUser2._id,
      name: "Student Two (Section B)",
      education: { classLevel: "Class 10", board: "CBSE" },
    } as any)) as any;
    cleanupIds.students.push(student2._id);

    const membership2 = (await StudentMembership.create({
      classSectionId: sectionB._id,
      studentProfileId: student2._id,
      academicYear: "2026-2027",
      isActive: true,
      enrolledAt: new Date(),
    } as any)) as any;
    cleanupIds.memberships.push(membership2._id);

    // Student 3: No active enrollment
    const studentUser3 = (await User.create({
      email: `student3_${timestamp}@edupye.test`,
      userType: "student",
    })) as any;
    cleanupIds.users.push(studentUser3._id);

    const student3 = (await StudentProfile.create({
      userId: studentUser3._id,
      name: "Student Three (Unenrolled)",
      education: { classLevel: "Class 10", board: "CBSE" },
    } as any)) as any;
    cleanupIds.students.push(student3._id);

    // 5. Windows
    const now = new Date();
    const activeStart = new Date(now.getTime() - 15 * 60 * 1000);
    const activeEnd = new Date(now.getTime() + 45 * 60 * 1000);

    const upcomingStart = new Date(now.getTime() + 60 * 60 * 1000);
    const upcomingEnd = new Date(now.getTime() + 120 * 60 * 1000);

    const closedStart = new Date(now.getTime() - 120 * 60 * 1000);
    const closedEnd = new Date(now.getTime() - 60 * 60 * 1000);

    // Helper to create test document
    async function createScheduledTest(
      title: string,
      targetGroups: any[],
      window: { start: Date; end: Date },
      teachingContextId?: any
    ) {
      const t = (await Test.create({
        title,
        description: `Targeting test: ${title}`,
        subject: "Science",
        board: "CBSE",
        classLevel: "Class 10",
        durationMinutes: 45,
        teacherProfileId: teacher._id,
        teachingContextId: teachingContextId || undefined,
        sourceType: "teacher",
        status: "published",
        isPublished: true,
        usages: {
          studyMaterial: false,
          practice: false,
          scheduledTest: true,
        },
        schedule: {
          teachingContextId: teachingContextId || undefined,
          scheduledDate: now,
          startDate: window.start,
          endDate: window.end,
          targetGroups,
        },
        targetClassSectionIds: targetGroups,
        questions: [],
      } as any)) as any;
      cleanupIds.tests.push(t._id);
      return t;
    }

    // Create tests
    const testDirectSectionA = await createScheduledTest(
      "Test Targeting Section A directly",
      [sectionA._id],
      { start: activeStart, end: activeEnd }
    );

    const testTeachingContextA = await createScheduledTest(
      "Test Targeting TeachingContext A",
      [teachingContextA._id],
      { start: activeStart, end: activeEnd },
      teachingContextA._id
    );

    const testTeachingContextB = await createScheduledTest(
      "Test Targeting TeachingContext B",
      [teachingContextB._id],
      { start: activeStart, end: activeEnd },
      teachingContextB._id
    );

    const unrelatedRandomId = new mongoose.Types.ObjectId();
    const testUnrelatedTarget = await createScheduledTest(
      "Test Targeting Unrelated Random ID",
      [unrelatedRandomId],
      { start: activeStart, end: activeEnd }
    );

    const testUpcoming = await createScheduledTest(
      "Upcoming Test for Section A",
      [sectionA._id],
      { start: upcomingStart, end: upcomingEnd }
    );

    const testClosed = await createScheduledTest(
      "Closed Test for Section A",
      [sectionA._id],
      { start: closedStart, end: closedEnd }
    );

    console.log("--- Case 1: Student enrolled in Section A; test targets ClassSection A ID ---");
    const attempt1 = await startTestAttempt(
      testDirectSectionA._id.toString(),
      student1._id.toString(),
      studentUser1._id.toString(),
      "scheduled_test"
    );
    cleanupIds.attempts.push(new mongoose.Types.ObjectId(attempt1.attemptId));
    assert(
      attempt1.status === "in_progress",
      "Student 1 successfully starts attempt for test targeting ClassSection A directly"
    );

    console.log("\n--- Case 2: Student enrolled in Section A; test targets linked TeachingContext A ID ---");
    const attempt2 = await startTestAttempt(
      testTeachingContextA._id.toString(),
      student1._id.toString(),
      studentUser1._id.toString(),
      "scheduled_test"
    );
    cleanupIds.attempts.push(new mongoose.Types.ObjectId(attempt2.attemptId));
    assert(
      attempt2.status === "in_progress",
      "Student 1 successfully starts attempt for test targeting linked TeachingContext A ID"
    );

    console.log("\n--- Case 3: Student enrolled in Section B; test targets unrelated TeachingContext A ID ---");
    let case3Threw = false;
    let case3Error = "";
    try {
      await startTestAttempt(
        testTeachingContextA._id.toString(),
        student2._id.toString(),
        studentUser2._id.toString(),
        "scheduled_test"
      );
    } catch (err: any) {
      case3Threw = true;
      case3Error = err?.message || String(err);
    }
    assert(case3Threw, "Student 2 (Section B) is blocked from taking test targeted to TeachingContext A");
    assert(
      case3Error.includes("not eligible to take this exam as you are not enrolled in the targeted class or section"),
      "Error correctly explains student is not enrolled in targeted class or section",
      `Received: ${case3Error}`
    );

    console.log("\n--- Case 4: Student with no active enrollment ---");
    let case4Threw = false;
    let case4Error = "";
    try {
      await startTestAttempt(
        testDirectSectionA._id.toString(),
        student3._id.toString(),
        studentUser3._id.toString(),
        "scheduled_test"
      );
    } catch (err: any) {
      case4Threw = true;
      case4Error = err?.message || String(err);
    }
    assert(case4Threw, "Student 3 (no enrollment) is rejected");
    assert(
      case4Error.includes("not eligible to take this exam as you are not enrolled in the targeted class or section"),
      "Unenrolled student rejected with ineligibility error"
    );

    console.log("\n--- Case 5: Test targets an unrelated ID ---");
    let case5Threw = false;
    let case5Error = "";
    try {
      await startTestAttempt(
        testUnrelatedTarget._id.toString(),
        student1._id.toString(),
        studentUser1._id.toString(),
        "scheduled_test"
      );
    } catch (err: any) {
      case5Threw = true;
      case5Error = err?.message || String(err);
    }
    assert(case5Threw, "Test targeting unrelated ID rejects Student 1");
    assert(
      case5Error.includes("not eligible to take this exam as you are not enrolled in the targeted class or section"),
      "Unrelated target rejects properly"
    );

    console.log("\n--- Case 6: Existing exam-window restriction - Upcoming Window ---");
    let case6Threw = false;
    let case6Error = "";
    try {
      await startTestAttempt(
        testUpcoming._id.toString(),
        student1._id.toString(),
        studentUser1._id.toString(),
        "scheduled_test"
      );
    } catch (err: any) {
      case6Threw = true;
      case6Error = err?.message || String(err);
    }
    assert(case6Threw, "Upcoming exam window blocks attempt");
    assert(
      case6Error.includes("has not started yet"),
      "Upcoming exam rejection message verified",
      `Received: ${case6Error}`
    );

    console.log("\n--- Case 7: Existing exam-window restriction - Closed Window ---");
    let case7Threw = false;
    let case7Error = "";
    try {
      await startTestAttempt(
        testClosed._id.toString(),
        student1._id.toString(),
        studentUser1._id.toString(),
        "scheduled_test"
      );
    } catch (err: any) {
      case7Threw = true;
      case7Error = err?.message || String(err);
    }
    assert(case7Threw, "Closed exam window blocks attempt");
    assert(
      case7Error.includes("is now closed. Submissions are no longer accepted"),
      "Closed exam rejection message verified",
      `Received: ${case7Error}`
    );

    console.log("\n--- Case 8: Attempt limit enforcement (Multiple attempts blocked) ---");
    // Mark attempt 1 as completed
    await TestAttempt.findByIdAndUpdate(attempt1.attemptId, {
      status: "completed",
      submittedAt: new Date(),
    });
    let case8Threw = false;
    let case8Error = "";
    try {
      await startTestAttempt(
        testDirectSectionA._id.toString(),
        student1._id.toString(),
        studentUser1._id.toString(),
        "scheduled_test"
      );
    } catch (err: any) {
      case8Threw = true;
      case8Error = err?.message || String(err);
    }
    assert(case8Threw, "Completed attempt prevents second attempt on scheduled test");
    assert(
      case8Error.includes("Multiple attempts are not permitted"),
      "Attempt limit rejection message verified",
      `Received: ${case8Error}`
    );

    console.log("\n--- Case 9: Consistency between listTests and startTestAttempt ---");
    const student1Catalog = await listTests({
      studentProfileId: student1._id.toString(),
    });
    console.log("student1Catalog results:", student1Catalog.map((t: any) => ({
      title: t.title,
      targetGroups: t.schedule?.targetGroups,
      targetClassSectionIds: t.targetClassSectionIds,
    })));
    const catalogTestIds = student1Catalog.map((t: any) => t._id.toString());
    assert(
      catalogTestIds.includes(testDirectSectionA._id.toString()),
      "listTests includes test targeting Section A directly"
    );
    assert(
      catalogTestIds.includes(testTeachingContextA._id.toString()),
      "listTests includes test targeting linked TeachingContext A"
    );
    assert(
      !catalogTestIds.includes(testTeachingContextB._id.toString()),
      "listTests excludes test targeting unrelated TeachingContext B"
    );

  } finally {
    console.log("\n--- Cleaning up temporary test documents from database ---");
    await Promise.all([
      TestAttempt.deleteMany({ _id: { $in: cleanupIds.attempts } }),
      Test.deleteMany({ _id: { $in: cleanupIds.tests } }),
      StudentMembership.deleteMany({ _id: { $in: cleanupIds.memberships } }),
      TeachingContext.deleteMany({ _id: { $in: cleanupIds.contexts } }),
      ClassSection.deleteMany({ _id: { $in: cleanupIds.sections } }),
      StudentProfile.deleteMany({ _id: { $in: cleanupIds.students } }),
      TeacherProfile.deleteMany({ _id: { $in: cleanupIds.teachers } }),
      User.deleteMany({ _id: { $in: cleanupIds.users } }),
    ]);
    await mongoose.disconnect();
    console.log("Cleanup complete and disconnected from MongoDB.");
  }

  console.log("\n===============================================================");
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("===============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runScheduledTestTargetingVerification().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
