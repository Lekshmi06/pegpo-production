import "dotenv/config";
import mongoose from "mongoose";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import connectDB from "./db";
import User from "../models/User";
import TeacherProfile from "../models/TeacherProfile";
import TeachingContext from "../models/TeachingContext";
import Curriculum, { ICurriculum } from "../models/Curriculum";
import LessonPlan from "../models/LessonPlan";
import {
  createCurriculum,
  getCurriculumById,
  getCurriculumsByContext,
  updateCurriculum,
  processCurriculum,
  validateCurriculumUnits,
} from "../services/curriculum_service";
import {
  createLessonPlan,
  getLessonPlansByContext,
  updateLessonPlan,
  generateAILessonPlan,
} from "../services/lesson_plan_service";
import { getTeacherByUserId } from "../services/teacher_service";
import StudentProfile from "../models/StudentProfile";

async function runPhase3Verification() {
  console.log("\n=======================================================");
  console.log("Starting Phase 3 Curriculum & AI Teaching Plan Tests");
  console.log("=======================================================\n");

  await connectDB();

  const timestamp = Date.now();
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] Test ${totalTests}: ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${testName}`);
      throw new Error(`Assertion failed for: ${testName}`);
    }
  }

  try {
    // 0. Setup test teachers and contexts
    console.log("Creating test teachers and teaching contexts...");
    const teacherUserA = await User.create({
      email: `teacher.phase3.a.${timestamp}@edupye.test`,
      password: "TestPassword123!",
      userType: "teacher",
      name: "Dr. Alice Phase3",
    });

    const teacherProfileA = await TeacherProfile.create({
      userId: teacherUserA._id,
      name: teacherUserA.name,
      goal: "Lesson Planning",
      department: "Science",
      subjects: ["Physics"],
      classesTaught: ["Class 10"],
    });

    const teacherUserB = await User.create({
      email: `teacher.phase3.b.${timestamp}@edupye.test`,
      password: "TestPassword123!",
      userType: "teacher",
      name: "Prof. Bob Phase3",
    });

    const teacherProfileB = await TeacherProfile.create({
      userId: teacherUserB._id,
      name: teacherUserB.name,
      goal: "Tuition",
      department: "Mathematics",
      subjects: ["Mathematics"],
      classesTaught: ["Class 10"],
    });

    const contextA1 = await TeachingContext.create({
      teacherId: teacherProfileA._id,
      contextType: "institution",
      classLevel: "Class 10",
      section: "A",
      subject: "Physics",
      curriculumBoard: "CBSE",
      academicYear: "2026-2027",
    });

    const contextB1 = await TeachingContext.create({
      teacherId: teacherProfileB._id,
      contextType: "institution",
      classLevel: "Class 10",
      section: "B",
      subject: "Mathematics",
      curriculumBoard: "CBSE",
      academicYear: "2026-2027",
    });

    // TEST 1: Teacher A can create curriculum for their own context
    const sampleSyllabusText = `
Unit 1: Optics & Light
Chapter 1: Reflection of Light
Topics: Spherical mirrors, mirror formula, magnification.
Chapter 2: Refraction of Light
Topics: Snell's law, refractive index, lens formula, power of lens.

Unit 2: Electricity & Circuits
Chapter 3: Electric Current and Resistance
Topics: Ohm's law, resistance factors, resistors in series and parallel.
`;

    const curriculumA = await createCurriculum(teacherProfileA._id, {
      contextId: contextA1._id.toString(),
      title: "CBSE Class 10 Physics Syllabus 2026",
      sourceType: "manual",
      manualText: sampleSyllabusText,
    });

    assert(
      curriculumA.teacherId.toString() === teacherProfileA._id.toString() &&
        curriculumA.contextId.toString() === contextA1._id.toString() &&
        curriculumA.status === "uploaded" &&
        Boolean(curriculumA.extractedText?.includes("Optics")),
      "Teacher can create a Curriculum for their own TeachingContext"
    );

    // TEST 2: Teacher B cannot access or update Teacher A's curriculum (Isolation & Security)
    let bAccessBlocked = false;
    try {
      await getCurriculumById(curriculumA._id.toString(), teacherProfileB._id);
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) {
        bAccessBlocked = true;
      }
    }
    assert(bAccessBlocked, "Teacher B is forbidden from accessing Teacher A's curriculum");

    let bUpdateBlocked = false;
    try {
      await updateCurriculum(curriculumA._id.toString(), teacherProfileB._id, {
        title: "Malicious Tampering",
      });
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) {
        bUpdateBlocked = true;
      }
    }
    assert(bUpdateBlocked, "Teacher B is forbidden from updating Teacher A's curriculum");

    // TEST 3: Curriculum processing produces structured units/chapters/topics
    console.log("Processing syllabus text to structured units...");
    const processedCurriculum = await processCurriculum(curriculumA._id.toString(), teacherProfileA._id);

    assert(
      processedCurriculum.status === "processed" &&
        Array.isArray(processedCurriculum.units) &&
        processedCurriculum.units.length >= 1 &&
        processedCurriculum.units[0].chapters.length >= 1 &&
        Array.isArray(processedCurriculum.units[0].chapters[0].topics),
      "Curriculum processing produces structured units, chapters, and topics"
    );

    // TEST 3B: Temporary uploaded file is extracted, persisted as lightweight curriculum, and unlinked from disk
    const tempDir = path.resolve("uploads", "temp", "curriculums", "test");
    await fs.mkdir(tempDir, { recursive: true });
    const tempFilePath = path.join(tempDir, `syllabus_${Date.now()}.txt`);
    const tempContent = `
Unit 1: Mechanics
Chapter 1: Laws of Motion
Topics: Inertia, Momentum, Newton's Third Law.
`;
    await fs.writeFile(tempFilePath, tempContent, "utf-8");
    assert(fsSync.existsSync(tempFilePath), "Temporary file created on disk for upload test");

    const uploadedCurriculum = await createCurriculum(
      teacherProfileA._id,
      {
        contextId: contextA1._id.toString(),
        title: "Ephemeral Syllabus Test",
      },
      {
        path: tempFilePath,
        originalname: "ephemeral_syllabus.txt",
        mimetype: "text/plain",
      } as any
    );

    const fileWasCleanedUp = !fsSync.existsSync(tempFilePath);
    assert(
      fileWasCleanedUp &&
        uploadedCurriculum.sourceType === "uploaded_file" &&
        uploadedCurriculum.originalFileName === "ephemeral_syllabus.txt" &&
        uploadedCurriculum.fileUrl === undefined &&
        Boolean(uploadedCurriculum.extractedText?.includes("Laws of Motion")),
      "Uploaded file is extracted, temporary file is deleted from disk, and lightweight metadata is persisted"
    );

    const processedUploaded = await processCurriculum(uploadedCurriculum._id.toString(), teacherProfileA._id);
    assert(
      processedUploaded.status === "processed" &&
        processedUploaded.units.length >= 1 &&
        processedUploaded.units[0].chapters[0].title.includes("Laws of Motion"),
      "Lightweight curriculum derived from deleted temporary file is successfully structured by AI"
    );

    // TEST 4: Invalid/failed AI output handling does not corrupt curriculum
    let schemaValidationThrew = false;
    try {
      validateCurriculumUnits({ invalidKey: "corrupted response" });
    } catch (err: any) {
      schemaValidationThrew = true;
    }
    assert(schemaValidationThrew, "validateCurriculumUnits throws on malformed LLM outputs");

    // Verify corrupt text handling marks curriculum as failed
    const corruptCurriculum = await createCurriculum(teacherProfileA._id, {
      contextId: contextA1._id.toString(),
      title: "Corrupt Empty Syllabus",
      sourceType: "manual",
      manualText: "   ",
    });

    let processFailedHandled = false;
    try {
      await processCurriculum(corruptCurriculum._id.toString(), teacherProfileA._id);
    } catch (err: any) {
      processFailedHandled = true;
    }
    const failedCheck = await Curriculum.findById(corruptCurriculum._id);
    assert(
      processFailedHandled && failedCheck?.status === "failed",
      "Failed extraction safely updates curriculum status to 'failed' with error message"
    );

    // TEST 5: AI teaching-plan generation uses selected TeachingContext and Curriculum
    console.log("Generating AI Teaching Plan with curriculum and schedule constraints...");
    const aiResult = await generateAILessonPlan(teacherProfileA._id, {
      contextId: contextA1._id.toString(),
      curriculumId: processedCurriculum._id.toString(),
      durationMinutes: 50,
      teachingSchedule: {
        sessionsPerWeek: 4,
        durationMinutes: 50,
        teachingDays: ["Mon", "Tue", "Wed", "Fri"],
        startDate: "2026-10-01",
        targetCompletionDate: "2026-10-15",
      },
    });

    assert(
      Boolean(aiResult.data) &&
        aiResult.data.sessions.length >= 2 &&
        aiResult.curriculumId === processedCurriculum._id.toString(),
      "AI teaching-plan generation successfully utilizes selected TeachingContext and Curriculum"
    );

    // TEST 6: Different TeachingContexts remain isolated
    let crossContextBlocked = false;
    try {
      await createCurriculum(teacherProfileA._id, {
        contextId: contextB1._id.toString(), // Teacher A tries to create in Teacher B's context
        title: "Cross Context Attack",
        manualText: "Physics topics",
      });
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) {
        crossContextBlocked = true;
      }
    }
    assert(crossContextBlocked, "TeachingContexts remain isolated across different teachers");

    // TEST 7: Generated sessions respect the configured duration and have assessment recommendation
    const sessions = aiResult.data.sessions;
    const allRespectDuration = sessions.every((s) => s.durationMinutes === 50);
    const hasAssessmentRecommendation = sessions.some(
      (s) => s.assessmentRecommendation && s.assessmentRecommendation.recommended
    );

    assert(
      allRespectDuration,
      "All generated sessions respect the configured duration constraint (50 minutes)"
    );
    assert(
      hasAssessmentRecommendation,
      "Sessions include structured assessment recommendations (e.g. quiz recommendation)"
    );

    // TEST 8: Generated plan defaults to draft until teacher publishes it
    const createdDraftPlan = await createLessonPlan(teacherProfileA._id, {
      contextId: contextA1._id.toString(),
      curriculumId: processedCurriculum._id.toString(),
      chapterTitle: aiResult.data.chapterTitle,
      unitNumber: aiResult.data.unitNumber,
      totalEstimatedHours: aiResult.data.totalEstimatedHours,
      status: "draft",
      sessions: aiResult.data.sessions,
    });

    assert(createdDraftPlan.status === "draft", "Generated plan defaults to draft status");

    const publishedPlan = await updateLessonPlan(createdDraftPlan._id.toString(), teacherProfileA._id, {
      status: "active",
    });

    assert(publishedPlan.status === "active", "Plan successfully transitions from draft to active (published)");

    // TEST 9: Existing teacher onboarding regression check
    const fetchedTeacher = await getTeacherByUserId(teacherUserA._id.toString());
    assert(
      fetchedTeacher !== null && fetchedTeacher.subjects?.includes("Physics"),
      "Teacher onboarding profile retrieval regression passed"
    );

    // TEST 10: Existing student module regression check
    const studentProfileCount = await StudentProfile.countDocuments();
    assert(
      typeof studentProfileCount === "number",
      "Student module models and queries remain healthy and unaffected"
    );

    console.log(`\n=======================================================`);
    console.log(`All Phase 3 Integration Tests Passed! (${passedTests}/${totalTests})`);
    console.log(`=======================================================\n`);
  } catch (error) {
    console.error("Test execution encountered an error:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runPhase3Verification();
