import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db";
import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import TeacherProfile from "../models/TeacherProfile";
import TeachingContext from "../models/TeachingContext";
import ClassSection from "../models/ClassSection";
import StudentMembership from "../models/StudentMembership";
import StudentRecognition from "../models/StudentRecognition";
import {
  awardStudentRecognition,
  getStudentRecognitions,
  getClassSectionRecognitions,
  deleteStudentRecognition,
  doesTeacherTeachStudent,
} from "../services/student_recognition_service";
import { getAllStickers, getStickerById } from "../config/stickers";

interface ScenarioResult {
  step: number;
  description: string;
  passed: boolean;
  details?: string;
}

const results: ScenarioResult[] = [];

function record(step: number, description: string, passed: boolean, details?: string) {
  results.push({ step, description, passed, details });
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} Step ${step}: ${description}${details ? ` -> ${details}` : ""}`);
}

async function runRecognitionVerification() {
  console.log("\n=======================================================");
  console.log("STARTING STUDENT RECOGNITION / STICKERS VERIFICATION");
  console.log("=======================================================\n");

  await connectDB();
  console.log("MongoDB connected successfully");

  const cleanupTasks: Array<() => Promise<void>> = [];

  try {
    // -------------------------------------------------------------------------
    // 1. Sticker Catalog Verification
    // -------------------------------------------------------------------------
    const catalog = getAllStickers();
    const hardWorkingDef = getStickerById("hard-working");
    record(
      1,
      "Centralized sticker catalog contains all predefined stickers",
      catalog.length >= 10 && Boolean(hardWorkingDef?.title === "Hard Working"),
      `Found ${catalog.length} stickers, including "Hard Working" (${hardWorkingDef?.icon})`
    );

    // -------------------------------------------------------------------------
    // Setup Test Data: Teacher A (10-A), Teacher B (10-B), Student 1 (10-A), Student 2 (10-B)
    // -------------------------------------------------------------------------
    const timestamp = Date.now();

    // Teacher A
    const userTeacherA = await User.create({
      name: "Teacher Alpha",
      email: `teacher.a.${timestamp}@edupye.com`,
      userType: "teacher",
    });
    const profileTeacherA = await TeacherProfile.create({
      userId: userTeacherA._id,
      name: "Teacher Alpha",
      teacherType: "institution",
    });

    // Teacher B
    const userTeacherB = await User.create({
      name: "Teacher Beta",
      email: `teacher.b.${timestamp}@edupye.com`,
      userType: "teacher",
    });
    const profileTeacherB = await TeacherProfile.create({
      userId: userTeacherB._id,
      name: "Teacher Beta",
      teacherType: "institution",
    });

    // Class 10-A and 10-B
    const class10A = await ClassSection.create({
      name: "Class 10 - A",
      classLevel: "Class 10",
      section: "A",
      board: "CBSE",
      academicYear: "2026-2027",
      type: "institution",
    });

    const class10B = await ClassSection.create({
      name: "Class 10 - B",
      classLevel: "Class 10",
      section: "B",
      board: "CBSE",
      academicYear: "2026-2027",
      type: "institution",
    });

    // TeachingContexts
    const contextA = await TeachingContext.create({
      teacherId: profileTeacherA._id,
      classSectionId: class10A._id,
      classLevel: "Class 10",
      section: "A",
      subject: "Science",
      curriculumBoard: "CBSE",
      academicYear: "2026-2027",
      contextType: "institution",
    });

    const contextB = await TeachingContext.create({
      teacherId: profileTeacherB._id,
      classSectionId: class10B._id,
      classLevel: "Class 10",
      section: "B",
      subject: "Mathematics",
      curriculumBoard: "CBSE",
      academicYear: "2026-2027",
      contextType: "institution",
    });

    // Student 1 (Enrolled in 10-A)
    const userStudent1 = await User.create({
      name: "Alice Smith",
      email: `alice.${timestamp}@student.com`,
      userType: "student",
    });
    const profileStudent1 = await StudentProfile.create({
      userId: userStudent1._id,
      name: "Alice Smith",
      classSectionId: class10A._id,
    });
    const membership1 = await StudentMembership.create({
      studentProfileId: profileStudent1._id,
      classSectionId: class10A._id,
      rollNumber: "101",
      academicYear: "2026-2027",
      isActive: true,
    });

    // Student 2 (Enrolled in 10-B)
    const userStudent2 = await User.create({
      name: "Bob Jones",
      email: `bob.${timestamp}@student.com`,
      userType: "student",
    });
    const profileStudent2 = await StudentProfile.create({
      userId: userStudent2._id,
      name: "Bob Jones",
      classSectionId: class10B._id,
    });
    const membership2 = await StudentMembership.create({
      studentProfileId: profileStudent2._id,
      classSectionId: class10B._id,
      rollNumber: "201",
      academicYear: "2026-2027",
      isActive: true,
    });

    cleanupTasks.push(async () => {
      await User.deleteMany({ _id: { $in: [userTeacherA._id, userTeacherB._id, userStudent1._id, userStudent2._id] } });
      await TeacherProfile.deleteMany({ _id: { $in: [profileTeacherA._id, profileTeacherB._id] } });
      await StudentProfile.deleteMany({ _id: { $in: [profileStudent1._id, profileStudent2._id] } });
      await ClassSection.deleteMany({ _id: { $in: [class10A._id, class10B._id] } });
      await TeachingContext.deleteMany({ _id: { $in: [contextA._id, contextB._id] } });
      await StudentMembership.deleteMany({ _id: { $in: [membership1._id, membership2._id] } });
      await StudentRecognition.deleteMany({
        $or: [
          { studentId: { $in: [profileStudent1._id, profileStudent2._id] } },
          { teacherId: { $in: [profileTeacherA._id, profileTeacherB._id] } },
        ],
      });
    });

    // -------------------------------------------------------------------------
    // 2. Award Recognition: Authorized Teacher A -> Student 1 in 10-A
    // -------------------------------------------------------------------------
    const rec1 = await awardStudentRecognition({
      teacherProfileId: profileTeacherA._id,
      studentProfileId: profileStudent1._id,
      classSectionId: class10A._id,
      stickerId: "hard-working",
      description: "Always completes science projects with excellence!",
    });

    record(
      2,
      "Teacher A awards 'Hard Working' sticker to enrolled Student 1",
      Boolean(rec1._id && rec1.title === "Hard Working" && rec1.icon === "⭐"),
      `Recognition ID: ${rec1._id}, icon: ${rec1.icon}, teacher: ${(rec1.teacherId as any).name}`
    );

    // -------------------------------------------------------------------------
    // 3. Award Recognition: Second sticker to same student (Duplicate policy test)
    // -------------------------------------------------------------------------
    const rec2 = await awardStudentRecognition({
      teacherProfileId: profileTeacherA._id,
      studentProfileId: profileStudent1._id,
      classSectionId: class10A._id,
      stickerId: "great-participation",
      description: "Active discussion in lab session.",
    });

    record(
      3,
      "Teacher A awards second recognition ('Great Participation') to Student 1",
      Boolean(rec2._id && rec2.title === "Great Participation"),
      `Recognition ID: ${rec2._id}`
    );

    // -------------------------------------------------------------------------
    // 4. Class Isolation: Teacher A attempts to award sticker to 10-B student in 10-B
    // -------------------------------------------------------------------------
    let crossClassBlocked = false;
    try {
      await awardStudentRecognition({
        teacherProfileId: profileTeacherA._id,
        studentProfileId: profileStudent2._id,
        classSectionId: class10B._id, // Teacher A does NOT teach 10-B!
        stickerId: "helpful",
      });
    } catch (err: any) {
      crossClassBlocked = err.message.includes("Unauthorized");
    }

    record(
      4,
      "Teacher A blocked from awarding sticker to Student 2 in Class 10-B (Unassigned Class)",
      crossClassBlocked,
      "Strictly prevented unauthorized cross-teacher class access"
    );

    // -------------------------------------------------------------------------
    // 5. Enrollment Isolation: Teacher A attempts to award sticker to Student 2 via 10-A
    // -------------------------------------------------------------------------
    let unenrolledBlocked = false;
    try {
      await awardStudentRecognition({
        teacherProfileId: profileTeacherA._id,
        studentProfileId: profileStudent2._id, // Bob is NOT in 10-A!
        classSectionId: class10A._id,
        stickerId: "helpful",
      });
    } catch (err: any) {
      unenrolledBlocked = err.message.includes("not enrolled");
    }

    record(
      5,
      "Teacher A blocked from awarding sticker to Student 2 in 10-A (Not Enrolled)",
      unenrolledBlocked,
      "Strictly validated student membership in class section"
    );

    // -------------------------------------------------------------------------
    // 6. View Class Recognitions: Teacher A views 10-A recognitions
    // -------------------------------------------------------------------------
    const class10ARecs = await getClassSectionRecognitions(class10A._id, profileTeacherA._id);
    record(
      6,
      "Teacher A retrieves all recognitions for assigned Class 10-A",
      class10ARecs.length === 2,
      `Retrieved ${class10ARecs.length} recognitions in Class 10-A`
    );

    // -------------------------------------------------------------------------
    // 7. Isolation: Teacher A blocked from viewing 10-B recognitions
    // -------------------------------------------------------------------------
    let class10BViewBlocked = false;
    try {
      await getClassSectionRecognitions(class10B._id, profileTeacherA._id);
    } catch (err: any) {
      class10BViewBlocked = err.message.includes("Unauthorized");
    }

    record(
      7,
      "Teacher A blocked from retrieving recognitions for Class 10-B",
      class10BViewBlocked,
      "Strictly enforced classSection authorization"
    );

    // -------------------------------------------------------------------------
    // 8. Student Recognitions: Student 1 views their earned recognitions
    // -------------------------------------------------------------------------
    const student1Recs = await getStudentRecognitions(profileStudent1._id);
    record(
      8,
      "Student 1 can retrieve all their earned stickers with teacher details",
      student1Recs.length === 2 && Boolean((student1Recs[0].teacherId as any).name === "Teacher Alpha"),
      `Found ${student1Recs.length} stickers awarded by ${(student1Recs[0].teacherId as any).name}`
    );

    // -------------------------------------------------------------------------
    // 9. Teacher/Student Association Check
    // -------------------------------------------------------------------------
    const teacherATeachesStudent1 = await doesTeacherTeachStudent(profileTeacherA._id, profileStudent1._id);
    const teacherBTeachesStudent1 = await doesTeacherTeachStudent(profileTeacherB._id, profileStudent1._id);
    record(
      9,
      "doesTeacherTeachStudent correctly verifies assigned teacher-student relationships",
      teacherATeachesStudent1 === true && teacherBTeachesStudent1 === false,
      "Teacher A teaches Student 1 (true); Teacher B teaches Student 1 (false)"
    );

    // -------------------------------------------------------------------------
    // 10. Delete Recognition: Teacher A revokes one incorrectly awarded sticker
    // -------------------------------------------------------------------------
    await deleteStudentRecognition(rec2._id, profileTeacherA._id);
    const updatedStudent1Recs = await getStudentRecognitions(profileStudent1._id);
    record(
      10,
      "Teacher A successfully revokes an awarded recognition",
      updatedStudent1Recs.length === 1 && updatedStudent1Recs[0]._id.toString() === rec1._id.toString(),
      `Remaining stickers: ${updatedStudent1Recs.length}`
    );

    // -------------------------------------------------------------------------
    // 11. Delete Authorization: Teacher B cannot delete Teacher A's sticker
    // -------------------------------------------------------------------------
    let unauthorizedDeleteBlocked = false;
    try {
      await deleteStudentRecognition(rec1._id, profileTeacherB._id);
    } catch (err: any) {
      unauthorizedDeleteBlocked = err.message.includes("Unauthorized");
    }
    record(
      11,
      "Teacher B blocked from deleting Teacher A's awarded recognition",
      unauthorizedDeleteBlocked,
      "Revocation authorized only for awarding/assigned teacher"
    );

    console.log("\n=======================================================");
    const allPassed = results.every((r) => r.passed);
    console.log(`ALL VERIFICATION TESTS COMPLETED: ${allPassed ? "ALL 11 PASSED ✅" : "SOME FAILED ❌"}`);
    console.log("=======================================================\n");

    if (!allPassed) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Verification failed with exception:", error);
    process.exit(1);
  } finally {
    console.log("Cleaning up test documents...");
    for (const task of cleanupTasks) {
      try {
        await task();
      } catch (e) {
        console.warn("Cleanup warning:", e);
      }
    }
    await mongoose.disconnect();
    console.log("MongoDB disconnected cleanly.");
  }
}

runRecognitionVerification();
