import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db";
import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import TeacherProfile from "../models/TeacherProfile";
import TeachingContext from "../models/TeachingContext";
import Test from "../models/Test";
import Question from "../models/Question";
import TestAttempt from "../models/TestAttempt";
import ClassSection from "../models/ClassSection";
import StudentMembership from "../models/StudentMembership";
import {
  createClassSection,
  enrollStudentInClass,
  getTeacherClassesWithStudentCount,
  getStudentsInClassSection,
} from "../services/class_section_service";
import {
  createTeachingContext,
  getTeachingContextsByTeacher,
} from "../services/teaching_context_service";
import {
  saveAssessment,
  getAssessmentScheduledAttempts,
} from "../services/assessment_service";
import {
  listTests,
  startTestAttempt,
  submitTestAttempt,
  computeExamTimeWindow,
} from "../services/test_service";

interface VerificationResult {
  step: number;
  description: string;
  passed: boolean;
  details?: string;
}

const results: VerificationResult[] = [];

function record(step: number, description: string, passed: boolean, details?: string) {
  results.push({ step, description, passed, details });
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} Step ${step}: ${description}${details ? ` -> ${details}` : ""}`);
}

async function runVerification() {
  console.log("\n=======================================================");
  console.log("STARTING TEACHER ↔ STUDENT & CLASS/SECTION VERIFICATION");
  console.log("=======================================================\n");

  await connectDB();

  const timestamp = Date.now();
  const testRunSuffix = `_test_${timestamp}`;

  try {
    // -------------------------------------------------------------------------
    // SETUP USERS: 1 Teacher, 3 Students (Student A in 10-A, Student B in 10-B, Student C in 9-A, Student Ext external)
    // -------------------------------------------------------------------------
    const teacherUser = await User.create({
      email: `teacher${testRunSuffix}@edupye.test`,
      userType: "teacher",
      name: "Dr. Sarah Jenkins",
    });

    const teacherProfile = await TeacherProfile.create({
      userId: teacherUser._id,
      name: "Dr. Sarah Jenkins",
      teacherType: "institution",
      subjects: ["Mathematics", "Science"],
      classesTaught: ["Class 10", "Class 9"],
      boards: ["CBSE"],
      goal: "Lesson Planning",
    });

    // Student A (Will belong to 10-A)
    const studentUserA = await User.create({
      email: `studentA${testRunSuffix}@edupye.test`,
      userType: "student",
      name: "Alice Johnson",
    });
    const studentProfileA = await StudentProfile.create({
      userId: studentUserA._id,
      name: "Alice Johnson",
      studentType: "institution",
      education: { board: "CBSE", classLevel: "Class 10" },
    });

    // Student B (Will belong to 10-B)
    const studentUserB = await User.create({
      email: `studentB${testRunSuffix}@edupye.test`,
      userType: "student",
      name: "Bob Smith",
    });
    const studentProfileB = await StudentProfile.create({
      userId: studentUserB._id,
      name: "Bob Smith",
      studentType: "institution",
      education: { board: "CBSE", classLevel: "Class 10" },
    });

    // Student C (Will belong to 9-A)
    const studentUserC = await User.create({
      email: `studentC${testRunSuffix}@edupye.test`,
      userType: "student",
      name: "Charlie Brown",
    });
    const studentProfileC = await StudentProfile.create({
      userId: studentUserC._id,
      name: "Charlie Brown",
      studentType: "institution",
      education: { board: "CBSE", classLevel: "Class 9" },
    });

    // Student Ext (External independent student)
    const studentUserExt = await User.create({
      email: `studentExt${testRunSuffix}@edupye.test`,
      userType: "student",
      name: "Emma Watson",
    });
    const studentProfileExt = await StudentProfile.create({
      userId: studentUserExt._id,
      name: "Emma Watson",
      studentType: "external",
      education: { board: "CBSE", classLevel: "Class 10" },
    });

    // -------------------------------------------------------------------------
    // 1. Create institution Class 10-A
    // -------------------------------------------------------------------------
    const class10A = await createClassSection({
      classLevel: "Class 10",
      section: "A",
      board: "CBSE",
      academicYear: "2026-2027",
      type: "institution",
      name: "Class 10 - A",
    });
    record(1, "Create institution Class 10-A", Boolean(class10A?._id && class10A.name === "Class 10 - A"));

    // -------------------------------------------------------------------------
    // 2. Create institution Class 10-B
    // -------------------------------------------------------------------------
    const class10B = await createClassSection({
      classLevel: "Class 10",
      section: "B",
      board: "CBSE",
      academicYear: "2026-2027",
      type: "institution",
      name: "Class 10 - B",
    });
    record(2, "Create institution Class 10-B", Boolean(class10B?._id && class10B.name === "Class 10 - B"));

    // Also create Class 9-A for negative testing
    const class9A = await createClassSection({
      classLevel: "Class 9",
      section: "A",
      board: "CBSE",
      academicYear: "2026-2027",
      type: "institution",
      name: "Class 9 - A",
    });

    // -------------------------------------------------------------------------
    // 3. Associate students with 10-A
    // -------------------------------------------------------------------------
    const memA = await enrollStudentInClass({
      studentProfileId: studentProfileA._id,
      classSectionId: class10A._id,
      rollNumber: "101",
      academicYear: "2026-2027",
    });
    const studentsIn10A = await getStudentsInClassSection(class10A._id);
    record(
      3,
      "Associate students with 10-A",
      Boolean(memA?.isActive && studentsIn10A.some((s) => s.studentProfileId.toString() === studentProfileA._id.toString())),
      `Enrolled Alice (Roll 101) in ${class10A.name}`
    );

    // -------------------------------------------------------------------------
    // 4. Associate students with 10-B
    // -------------------------------------------------------------------------
    const memB = await enrollStudentInClass({
      studentProfileId: studentProfileB._id,
      classSectionId: class10B._id,
      rollNumber: "201",
      academicYear: "2026-2027",
    });
    const studentsIn10B = await getStudentsInClassSection(class10B._id);
    record(
      4,
      "Associate students with 10-B",
      Boolean(memB?.isActive && studentsIn10B.some((s) => s.studentProfileId.toString() === studentProfileB._id.toString())),
      `Enrolled Bob (Roll 201) in ${class10B.name}`
    );

    // Enroll Charlie in 9-A
    await enrollStudentInClass({
      studentProfileId: studentProfileC._id,
      classSectionId: class9A._id,
      rollNumber: "301",
      academicYear: "2026-2027",
    });

    // -------------------------------------------------------------------------
    // 5. Assign teacher to Mathematics 10-A
    // -------------------------------------------------------------------------
    const context10A = await createTeachingContext(teacherProfile._id, {
      classSectionId: class10A._id,
      classLevel: "Class 10",
      section: "A",
      subject: "Mathematics",
      curriculumBoard: "CBSE",
      academicYear: "2026-2027",
      contextType: "institution",
    });
    record(
      5,
      "Assign teacher to Mathematics 10-A",
      Boolean(context10A?.classSectionId?.toString() === class10A._id.toString() && context10A.subject === "Mathematics")
    );

    // -------------------------------------------------------------------------
    // 6. Assign same teacher to Mathematics 10-B
    // -------------------------------------------------------------------------
    const context10B = await createTeachingContext(teacherProfile._id, {
      classSectionId: class10B._id,
      classLevel: "Class 10",
      section: "B",
      subject: "Mathematics",
      curriculumBoard: "CBSE",
      academicYear: "2026-2027",
      contextType: "institution",
    });
    record(
      6,
      "Assign same teacher to Mathematics 10-B",
      Boolean(context10B?.classSectionId?.toString() === class10B._id.toString() && context10B.subject === "Mathematics")
    );

    // -------------------------------------------------------------------------
    // 7. Teacher can see both groups
    // -------------------------------------------------------------------------
    const teacherGroups = await getTeacherClassesWithStudentCount(teacherProfile._id);
    const has10A = teacherGroups.some((g) => g.classSectionId === class10A._id.toString() && g.studentCount >= 1);
    const has10B = teacherGroups.some((g) => g.classSectionId === class10B._id.toString() && g.studentCount >= 1);
    record(
      7,
      "Teacher can see both groups with accurate counts",
      Boolean(has10A && has10B),
      `Found ${teacherGroups.length} groups for teacher: ${teacherGroups.map((g) => `${g.name} (${g.studentCount} students)`).join(", ")}`
    );

    // -------------------------------------------------------------------------
    // 8. Teacher uploads / creates a question paper
    // -------------------------------------------------------------------------
    // 9. Assessment is created as Draft (Study Material: OFF, Practice: OFF, Scheduled: OFF)
    // -------------------------------------------------------------------------
    const sampleQuestions = [
      {
        questionNumber: 1,
        question: "What are the roots of the equation x^2 - 5x + 6 = 0?",
        questionType: "mcq" as const,
        options: [
          { id: "A", text: "2 and 3" },
          { id: "B", text: "-2 and -3" },
          { id: "C", text: "1 and 6" },
          { id: "D", text: "None" },
        ],
        correctAnswer: "A",
        marks: 2,
        explanation: "(x - 2)(x - 3) = 0 => x = 2, 3",
        difficulty: "Easy" as const,
      },
      {
        questionNumber: 2,
        question: "Find the discriminant of 2x^2 - 4x + 3 = 0.",
        questionType: "nat" as const,
        options: [],
        correctAnswer: "-8",
        numericalAnswer: -8,
        marks: 2,
        explanation: "b^2 - 4ac = 16 - 24 = -8",
        difficulty: "Medium" as const,
      },
    ];

    const draftTest = await saveAssessment({
      title: "Class 10 Mathematics Model Exam",
      description: "CBSE Class 10 Model Paper for Quadratic Equations",
      subject: "Mathematics",
      board: "CBSE",
      classLevel: "Class 10",
      durationMinutes: 60,
      teacherProfileId: teacherProfile._id.toString(),
      teachingContextId: context10A._id.toString(),
      targetClassSectionIds: [class10A._id.toString(), class10B._id.toString()],
      usages: { studyMaterial: false, practice: false, scheduledTest: false },
      originalDocument: {
        storageType: "local",
        fileName: "Class 10 Mathematics Model Exam.pdf",
        fileKey: "uploads/test.pdf",
        fileUrl: "/uploads/test.pdf",
        uploadedAt: new Date(),
      },
      questions: sampleQuestions,
    });

    record(8, "Teacher uploads a question paper and extracts questions", Boolean(draftTest?._id && draftTest.questions.length === 2));
    record(
      9,
      "Assessment is created as Draft with all usages OFF",
      Boolean(
        draftTest.status === "draft" &&
        !draftTest.usages?.studyMaterial &&
        !draftTest.usages?.practice &&
        !draftTest.usages?.scheduledTest
      ),
      `Status: ${draftTest.status}, usages: ${JSON.stringify(draftTest.usages)}`
    );

    // -------------------------------------------------------------------------
    // 10. Students cannot see it initially
    // -------------------------------------------------------------------------
    const testsForStudentA_Initial = await listTests({ studentProfileId: studentProfileA._id.toString() });
    const studentA_CanSeeInitial = testsForStudentA_Initial.some((t) => t.id === draftTest._id.toString());
    record(10, "Students cannot see Draft assessment initially", !studentA_CanSeeInitial, "Draft is hidden from students");

    // -------------------------------------------------------------------------
    // 11. Teacher enables Study Material targeting Class 10-A
    // -------------------------------------------------------------------------
    const testWithStudyMaterial = await saveAssessment({
      id: draftTest._id.toString(),
      usages: { studyMaterial: true, practice: false, scheduledTest: false },
      targetClassSectionIds: [class10A._id.toString()], // Only 10-A targeted for this study material
    });
    record(
      11,
      "Teacher enables Study Material",
      Boolean(testWithStudyMaterial.usages?.studyMaterial === true && testWithStudyMaterial.status === "published")
    );

    // -------------------------------------------------------------------------
    // 12. Correct students see it in Student Library
    // -------------------------------------------------------------------------
    const libraryForStudentA = await listTests({
      studentProfileId: studentProfileA._id.toString(),
      usage: "studyMaterial",
    });
    const libraryForStudentB = await listTests({
      studentProfileId: studentProfileB._id.toString(),
      usage: "studyMaterial",
    });

    const studentA_SeesMaterial = libraryForStudentA.some((t) => t.id === draftTest._id.toString());
    const studentB_SeesMaterial = libraryForStudentB.some((t) => t.id === draftTest._id.toString());
    record(
      12,
      "Targeted student (10-A) sees Study Material in Library; non-targeted student (10-B) does not",
      Boolean(studentA_SeesMaterial && !studentB_SeesMaterial),
      `Student A visible: ${studentA_SeesMaterial}, Student B visible: ${studentB_SeesMaterial}`
    );

    // -------------------------------------------------------------------------
    // 13. Teacher disables Study Material
    // -------------------------------------------------------------------------
    const testWithStudyMaterialOff = await saveAssessment({
      id: draftTest._id.toString(),
      usages: { studyMaterial: false, practice: false, scheduledTest: false },
    });
    record(13, "Teacher disables Study Material", Boolean(testWithStudyMaterialOff.usages?.studyMaterial === false));

    // -------------------------------------------------------------------------
    // 14. Students no longer see it as available
    // -------------------------------------------------------------------------
    const libraryForStudentA_After = await listTests({
      studentProfileId: studentProfileA._id.toString(),
      usage: "studyMaterial",
    });
    const studentA_SeesMaterialAfter = libraryForStudentA_After.some((t) => t.id === draftTest._id.toString());
    record(14, "Students no longer see it as available after disabling", !studentA_SeesMaterialAfter);

    // -------------------------------------------------------------------------
    // 15. Teacher enables Practice Mock for 10-A + 10-B
    // -------------------------------------------------------------------------
    const testWithPracticeMock = await saveAssessment({
      id: draftTest._id.toString(),
      usages: { studyMaterial: false, practice: true, scheduledTest: false },
      targetClassSectionIds: [class10A._id.toString(), class10B._id.toString()],
    });
    record(15, "Teacher enables Practice Mock for 10-A and 10-B", Boolean(testWithPracticeMock.usages?.practice === true));

    // -------------------------------------------------------------------------
    // 16. Correct students see it in Student Tests
    // -------------------------------------------------------------------------
    const testsForA = await listTests({ studentProfileId: studentProfileA._id.toString(), usage: "practice" });
    const testsForB = await listTests({ studentProfileId: studentProfileB._id.toString(), usage: "practice" });
    const testsForC = await listTests({ studentProfileId: studentProfileC._id.toString(), usage: "practice" });

    const aSeesPractice = testsForA.some((t) => t.id === draftTest._id.toString());
    const bSeesPractice = testsForB.some((t) => t.id === draftTest._id.toString());
    const cSeesPractice = testsForC.some((t) => t.id === draftTest._id.toString());
    record(
      16,
      "Students in 10-A and 10-B see Practice Mock; Student in 9-A does not",
      Boolean(aSeesPractice && bSeesPractice && !cSeesPractice),
      `10-A: ${aSeesPractice}, 10-B: ${bSeesPractice}, 9-A: ${cSeesPractice}`
    );

    // -------------------------------------------------------------------------
    // 17. Student completes Practice Mock
    // -------------------------------------------------------------------------
    const practiceSession = await startTestAttempt(
      draftTest._id.toString(),
      studentProfileA._id.toString(),
      studentUserA._id.toString(),
      "practice"
    );
    const practiceSubmission = await submitTestAttempt(
      draftTest._id.toString(),
      studentProfileA._id.toString(),
      studentUserA._id.toString(),
      {
        attemptId: practiceSession.attemptId,
        answers: { 0: "A", 1: -8 },
        timeSpentSeconds: 120,
        attemptMode: "practice",
      }
    );
    record(
      17,
      "Student completes Practice Mock (attemptMode = practice)",
      Boolean(practiceSubmission?.attemptId && practiceSubmission.score === 4)
    );

    // -------------------------------------------------------------------------
    // 18. Practice attempt does not appear in formal teacher assessment submissions
    // -------------------------------------------------------------------------
    const teacherFormalSubmissions = await getAssessmentScheduledAttempts(draftTest._id.toString());
    const practiceContaminated = teacherFormalSubmissions.attempts.some(
      (att: any) => att._id.toString() === practiceSession.attemptId
    );
    record(
      18,
      "Practice attempt does not appear in formal teacher assessment submissions",
      !practiceContaminated,
      `Formal attempts count: ${teacherFormalSubmissions.totalAttempts}`
    );

    // -------------------------------------------------------------------------
    // 19. Teacher schedules same Test for 10-A + 10-B
    // 20. No duplicate Test is created
    // -------------------------------------------------------------------------
    const initialTestCount = await Test.countDocuments({ title: "Class 10 Mathematics Model Exam" });

    // Configure test for currently active time window
    const now = new Date();
    const scheduledDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startHours = String(Math.max(0, now.getHours() - 1)).padStart(2, "0");
    const endHours = String(Math.min(23, now.getHours() + 2)).padStart(2, "0");

    const scheduledTestDoc = await saveAssessment({
      id: draftTest._id.toString(),
      usages: { studyMaterial: false, practice: false, scheduledTest: true },
      targetClassSectionIds: [class10A._id.toString(), class10B._id.toString()],
      schedule: {
        teachingContextId: context10A._id as any,
        scheduledDate: scheduledDate as any,
        startTime: `${startHours}:00`,
        endTime: `${endHours}:00`,
        targetGroups: [class10A._id.toString(), class10B._id.toString()] as any,
        instructions: "Formal Examination: Multiple Section Targeting",
      },
    });

    const finalTestCount = await Test.countDocuments({ title: "Class 10 Mathematics Model Exam" });
    record(19, "Teacher schedules same Test for 10-A + 10-B", Boolean(scheduledTestDoc.usages?.scheduledTest));
    record(
      20,
      "No duplicate Test is created (Single Test ID maintained)",
      Boolean(initialTestCount === 1 && finalTestCount === 1 && scheduledTestDoc._id.toString() === draftTest._id.toString()),
      `Count before: ${initialTestCount}, Count after: ${finalTestCount}`
    );

    // -------------------------------------------------------------------------
    // 21. Student from 10-A can see/attempt during scheduled time
    // 22. Student from 10-B can see/attempt during scheduled time
    // 23. Student from 9-A cannot see/attempt it
    // -------------------------------------------------------------------------
    const testsForStudentA_Sched = await listTests({ studentProfileId: studentProfileA._id.toString(), usage: "scheduledTest" });
    const testsForStudentB_Sched = await listTests({ studentProfileId: studentProfileB._id.toString(), usage: "scheduledTest" });
    const testsForStudentC_Sched = await listTests({ studentProfileId: studentProfileC._id.toString(), usage: "scheduledTest" });

    const aSeesSched = testsForStudentA_Sched.some((t) => t.id === draftTest._id.toString());
    const bSeesSched = testsForStudentB_Sched.some((t) => t.id === draftTest._id.toString());
    const cSeesSched = testsForStudentC_Sched.some((t) => t.id === draftTest._id.toString());

    record(21, "Student from 10-A can see test during scheduled time", aSeesSched);
    record(22, "Student from 10-B can see test during scheduled time", bSeesSched);
    record(23, "Student from 9-A cannot see test", !cSeesSched);

    // Verify student from 9-A cannot start attempt (server-side rejection)
    let cAttemptRejected = false;
    try {
      await startTestAttempt(
        draftTest._id.toString(),
        studentProfileC._id.toString(),
        studentUserC._id.toString(),
        "scheduled_test"
      );
    } catch (err) {
      cAttemptRejected = true;
    }
    record(23, "Student from 9-A is rejected from starting scheduled test by server", cAttemptRejected);

    // -------------------------------------------------------------------------
    // 24. Before start time, students see Upcoming
    // -------------------------------------------------------------------------
    // Configure future schedule: tomorrow 10:00 AM
    const tomorrow = new Date(Date.now() + 86400000);
    await saveAssessment({
      id: draftTest._id.toString(),
      usages: { studyMaterial: false, practice: false, scheduledTest: true },
      schedule: {
        scheduledDate: tomorrow as any,
        startTime: "10:00",
        endTime: "11:00",
        targetGroups: [class10A._id.toString(), class10B._id.toString()] as any,
      },
    });

    const testsUpcoming = await listTests({ studentProfileId: studentProfileA._id.toString(), usage: "scheduledTest" });
    const upcomingItem = testsUpcoming.find((t) => t.id === draftTest._id.toString());
    const seesUpcoming = upcomingItem?.windowStatus === "upcoming";

    let attemptBlockedBeforeStart = false;
    try {
      await startTestAttempt(
        draftTest._id.toString(),
        studentProfileA._id.toString(),
        studentUserA._id.toString(),
        "scheduled_test"
      );
    } catch (err: any) {
      if (err.message.includes("not started yet")) {
        attemptBlockedBeforeStart = true;
      }
    }
    record(
      24,
      "Before start time, students see Upcoming and server blocks attempt",
      Boolean(seesUpcoming && attemptBlockedBeforeStart),
      `windowStatus: ${upcomingItem?.windowStatus}, blocked: ${attemptBlockedBeforeStart}`
    );

    // -------------------------------------------------------------------------
    // 25. During exam window, students can Attend
    // -------------------------------------------------------------------------
    // Reset window to active (now)
    await saveAssessment({
      id: draftTest._id.toString(),
      usages: { studyMaterial: false, practice: false, scheduledTest: true },
      schedule: {
        scheduledDate: scheduledDate as any,
        startTime: `${startHours}:00`,
        endTime: `${endHours}:00`,
        targetGroups: [class10A._id.toString(), class10B._id.toString()] as any,
      },
    });

    const testsActive = await listTests({ studentProfileId: studentProfileA._id.toString(), usage: "scheduledTest" });
    const activeItem = testsActive.find((t) => t.id === draftTest._id.toString());
    const canAttend = activeItem?.windowStatus === "active";

    const scheduledSessionA = await startTestAttempt(
      draftTest._id.toString(),
      studentProfileA._id.toString(),
      studentUserA._id.toString(),
      "scheduled_test"
    );
    record(
      25,
      "During exam window, students can Attend (windowStatus = active)",
      Boolean(canAttend && scheduledSessionA?.attemptId),
      `Session created: ${scheduledSessionA?.attemptId}`
    );

    // -------------------------------------------------------------------------
    // 26. After end time, students cannot start
    // -------------------------------------------------------------------------
    // Configure closed schedule: yesterday
    const yesterday = new Date(Date.now() - 86400000);
    await saveAssessment({
      id: draftTest._id.toString(),
      usages: { studyMaterial: false, practice: false, scheduledTest: true },
      schedule: {
        scheduledDate: yesterday as any,
        startTime: "09:00",
        endTime: "10:00",
        targetGroups: [class10A._id.toString(), class10B._id.toString()] as any,
      },
    });

    const testsClosed = await listTests({ studentProfileId: studentProfileB._id.toString(), usage: "scheduledTest" });
    const closedItem = testsClosed.find((t) => t.id === draftTest._id.toString());
    const isClosed = closedItem?.windowStatus === "closed";

    let attemptBlockedAfterEnd = false;
    try {
      await startTestAttempt(
        draftTest._id.toString(),
        studentProfileB._id.toString(),
        studentUserB._id.toString(),
        "scheduled_test"
      );
    } catch (err: any) {
      if (err.message.includes("closed")) {
        attemptBlockedAfterEnd = true;
      }
    }
    record(
      26,
      "After end time, students cannot start (windowStatus = closed, server blocks attempt)",
      Boolean(isClosed && attemptBlockedAfterEnd),
      `windowStatus: ${closedItem?.windowStatus}, blocked: ${attemptBlockedAfterEnd}`
    );

    // -------------------------------------------------------------------------
    // 27. Scheduled attempts use attemptMode = scheduled_test
    // 28. Scheduled submissions appear in teacher formal assessment data
    // -------------------------------------------------------------------------
    // Re-enable active window for student submission test
    await saveAssessment({
      id: draftTest._id.toString(),
      usages: { studyMaterial: false, practice: false, scheduledTest: true },
      schedule: {
        scheduledDate: scheduledDate as any,
        startTime: `${startHours}:00`,
        endTime: `${endHours}:00`,
        targetGroups: [class10A._id.toString(), class10B._id.toString()] as any,
      },
    });

    // Student B submits formal exam
    const scheduledSessionB = await startTestAttempt(
      draftTest._id.toString(),
      studentProfileB._id.toString(),
      studentUserB._id.toString(),
      "scheduled_test"
    );

    const submissionB = await submitTestAttempt(
      draftTest._id.toString(),
      studentProfileB._id.toString(),
      studentUserB._id.toString(),
      {
        attemptId: scheduledSessionB.attemptId,
        answers: { 0: "A", 1: -8 },
        timeSpentSeconds: 300,
        attemptMode: "scheduled_test",
      }
    );

    const attemptDoc = await TestAttempt.findById(scheduledSessionB.attemptId);
    record(
      27,
      "Scheduled attempts use attemptMode = scheduled_test",
      Boolean(attemptDoc?.attemptMode === "scheduled_test")
    );

    const formalData = await getAssessmentScheduledAttempts(draftTest._id.toString());
    const studentBSubmissionIncluded = formalData.attempts.some(
      (a: any) => a.studentProfileId?._id?.toString() === studentProfileB._id.toString()
    );
    record(
      28,
      "Scheduled submissions appear in teacher formal assessment data",
      Boolean(studentBSubmissionIncluded && formalData.totalAttempts >= 1),
      `Formal submissions count: ${formalData.totalAttempts}, Average: ${formalData.averageScore}`
    );

    // -------------------------------------------------------------------------
    // 29. Existing Student Module functionality still works (External Student)
    // -------------------------------------------------------------------------
    const externalStudentTests = await listTests({
      studentProfileId: studentProfileExt._id.toString(),
    });
    record(
      29,
      "Existing Student Module functionality still works for external students",
      Array.isArray(externalStudentTests),
      `External student retrieved ${externalStudentTests.length} general tests without error`
    );

    // -------------------------------------------------------------------------
    // 30. Existing Lesson Planner and TeachingContext functionality still works
    // -------------------------------------------------------------------------
    const teacherContexts = await getTeachingContextsByTeacher(teacherProfile._id);
    const lessonPlannerCompatible = teacherContexts.length >= 2 && teacherContexts.every(
      (c) => c.subject && c.classLevel && c.curriculumBoard && c.academicYear
    );
    record(
      30,
      "Existing Lesson Planner and TeachingContext functionality preserved",
      lessonPlannerCompatible,
      `Teacher contexts retrieved: ${teacherContexts.length}`
    );

    // -------------------------------------------------------------------------
    // CLEANUP TEST FIXTURES
    // -------------------------------------------------------------------------
    await Question.deleteMany({ testId: draftTest._id });
    await TestAttempt.deleteMany({ testId: draftTest._id });
    await Test.findByIdAndDelete(draftTest._id);
    await StudentMembership.deleteMany({
      studentProfileId: { $in: [studentProfileA._id, studentProfileB._id, studentProfileC._id] },
    });
    await ClassSection.deleteMany({ _id: { $in: [class10A._id, class10B._id, class9A._id] } });
    await TeachingContext.deleteMany({ teacherId: teacherProfile._id });
    await StudentProfile.deleteMany({
      _id: { $in: [studentProfileA._id, studentProfileB._id, studentProfileC._id, studentProfileExt._id] },
    });
    await TeacherProfile.findByIdAndDelete(teacherProfile._id);
    await User.deleteMany({
      _id: { $in: [teacherUser._id, studentUserA._id, studentUserB._id, studentUserC._id, studentUserExt._id] },
    });

    console.log("\n=======================================================");
    console.log(`VERIFICATION COMPLETED: ${results.filter((r) => r.passed).length} / ${results.length} PASSED`);
    console.log("=======================================================\n");

    const failed = results.filter((r) => !r.passed);
    if (failed.length > 0) {
      console.error("Failed checks:", failed);
      process.exit(1);
    } else {
      console.log("ALL 30 TEST SPECIFICATIONS VERIFIED SUCCESSFULLY!");
      process.exit(0);
    }
  } catch (error) {
    console.error("Verification encountered unexpected error:", error);
    process.exit(1);
  }
}

runVerification();
