import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db";
import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import TeacherProfile from "../models/TeacherProfile";
import TeachingContext from "../models/TeachingContext";
import ClassSection from "../models/ClassSection";
import StudentMembership from "../models/StudentMembership";
import ClassInvitation from "../models/ClassInvitation";
import * as classSectionService from "../services/class_section_service";
import * as studentService from "../services/student_service";

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
  console.log(`${icon} Scenario ${step}: ${description}${details ? ` -> ${details}` : ""}`);
}

async function runEnrollmentUXVerification() {
  console.log("\n=======================================================");
  console.log("STARTING STUDENT ENROLLMENT UX & EMAIL LOOKUP VERIFICATION");
  console.log("=======================================================\n");

  await connectDB();
  console.log("MongoDB connected successfully");

  const cleanupTasks: Array<() => Promise<void>> = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Test Fixtures: Teacher, Class 7-A, Existing Student
    // -------------------------------------------------------------------------
    const teacherUser = await User.create({
      name: "Mrs. Sharma",
      email: `sharma.teacher.${Date.now()}@edupye.com`,
      userType: "teacher",
    });
    const teacherProfile = await TeacherProfile.create({
      userId: teacherUser._id,
      name: "Mrs. Sharma",
      teacherType: "institution",
    });

    const class7A = await ClassSection.create({
      name: "Class 7 - A",
      classLevel: "Class 7",
      section: "A",
      board: "CBSE",
      academicYear: "2026-2027",
      type: "institution",
    });

    const context7A = await TeachingContext.create({
      teacherId: teacherProfile._id,
      contextType: "institution",
      subject: "Science",
      curriculumBoard: "CBSE",
      classLevel: "Class 7",
      section: "A",
      academicYear: "2026-2027",
      classSectionId: class7A._id,
    });

    const studentUser = await User.create({
      name: "Rahul Verma",
      email: `rahul.verma.${Date.now()}@edupye.com`,
      userType: "student",
    });
    const studentProfile = await StudentProfile.create({
      userId: studentUser._id,
      name: "Rahul Verma",
      studentType: "external",
      education: {
        level: "school",
        classLevel: "Class 7",
        board: "CBSE",
      },
      schoolDetails: {
        schoolName: "Delhi Public School",
        classLevel: "Class 7",
        board: "CBSE",
      },
    });

    const teacherUserId = teacherUser._id;
    const teacherProfileId = teacherProfile._id;
    const class7AId = class7A._id;
    const context7AId = context7A._id;
    const studentUserId = studentUser._id;
    const studentProfileId = studentProfile._id;
    const studentEmail = studentUser.email;

    cleanupTasks.push(async () => {
      await ClassInvitation.deleteMany({ classSectionId: class7AId });
      await StudentMembership.deleteMany({ classSectionId: class7AId });
      await StudentProfile.findByIdAndDelete(studentProfileId);
      await User.findByIdAndDelete(studentUserId);
      await TeachingContext.findByIdAndDelete(context7AId);
      await ClassSection.findByIdAndDelete(class7AId);
      await TeacherProfile.findByIdAndDelete(teacherProfileId);
      await User.findByIdAndDelete(teacherUserId);
    });

    // -------------------------------------------------------------------------
    // Scenario 1 & 2: Search existing student by email & display details
    // -------------------------------------------------------------------------
    const foundStudent = await studentService.getStudentByEmail(studentEmail);
    const populatedUser = foundStudent.userId as any;
    const searchMatches =
      foundStudent &&
      foundStudent.name === "Rahul Verma" &&
      populatedUser?.email === studentEmail &&
      foundStudent.studentType === "external";

    record(
      1,
      "Search existing student by email",
      Boolean(searchMatches),
      `Found Profile ID: ${foundStudent?._id}, Email: ${populatedUser?.email}`
    );

    record(
      2,
      "Existing student details are displayed correctly without ObjectId knowledge",
      Boolean(foundStudent?.name && populatedUser?.email),
      `Name: ${foundStudent?.name}, Type: ${foundStudent?.studentType}, Board: ${foundStudent?.schoolDetails?.board}`
    );

    // -------------------------------------------------------------------------
    // Scenario 3 & 4: Enroll existing student by email (no ObjectId required)
    // -------------------------------------------------------------------------
    const membership = await classSectionService.enrollStudentInClass({
      email: studentEmail,
      classSectionId: class7A._id,
      rollNumber: "101",
      academicYear: "2026-2027",
    });

    const membershipInDb = await StudentMembership.findById(membership._id);
    const enrollmentSuccess =
      membershipInDb &&
      membershipInDb.studentProfileId.toString() === studentProfile._id.toString() &&
      membershipInDb.classSectionId.toString() === class7A._id.toString() &&
      membershipInDb.rollNumber === "101" &&
      membershipInDb.isActive === true;

    record(
      3,
      "Enroll existing student using email",
      Boolean(enrollmentSuccess),
      `Membership ID: ${membership._id}`
    );

    record(
      4,
      "StudentMembership is created with authoritative relationship",
      Boolean(membershipInDb?.isActive),
      `Roll No: ${membershipInDb?.rollNumber}, Active: ${membershipInDb?.isActive}`
    );

    // -------------------------------------------------------------------------
    // Scenario 5: Student appears in class roster
    // -------------------------------------------------------------------------
    const roster = await classSectionService.getStudentsInClassSection(class7A._id);
    const inRoster = roster.some((s) => s.email === studentEmail && s.rollNumber === "101");

    record(
      5,
      "Student appears in class roster with email and roll number",
      Boolean(inRoster),
      `Roster Count: ${roster.length}, First Student: ${roster[0]?.name} (${roster[0]?.email})`
    );

    // -------------------------------------------------------------------------
    // Scenario 6: Student count updates in teacher's classes view
    // -------------------------------------------------------------------------
    const teacherClasses = await classSectionService.getTeacherClassesWithStudentCount(teacherProfile._id);
    const class7AGroup = teacherClasses.find((c) => c.classSectionId.toString() === class7A._id.toString());
    const countIs1 = class7AGroup?.studentCount === 1;

    record(
      6,
      "Student count updates in teacher's classes view",
      Boolean(countIs1),
      `Group: ${class7AGroup?.name}, Student Count: ${class7AGroup?.studentCount}`
    );

    // -------------------------------------------------------------------------
    // Scenario 7: Duplicate enrollment is prevented with clear error
    // -------------------------------------------------------------------------
    let duplicatePrevented = false;
    let duplicateErrorMessage = "";

    try {
      await classSectionService.enrollStudentInClass({
        email: studentEmail,
        classSectionId: class7A._id,
        rollNumber: "101",
      });
    } catch (err: any) {
      duplicatePrevented = true;
      duplicateErrorMessage = err.message;
    }

    record(
      7,
      "Duplicate enrollment is prevented and returns clean error message",
      Boolean(duplicatePrevented && duplicateErrorMessage.includes("already enrolled in Class 7 - A")),
      `Error caught: "${duplicateErrorMessage}"`
    );

    // Verify membership count is still exactly 1
    const totalMemberships = await StudentMembership.countDocuments({
      classSectionId: class7A._id,
      isActive: true,
    });
    record(
      7.1,
      "Zero duplicate StudentMembership records created",
      totalMemberships === 1,
      `Total active memberships: ${totalMemberships}`
    );

    // -------------------------------------------------------------------------
    // Scenario 8: Invalid email is handled
    // -------------------------------------------------------------------------
    let invalidEmailBlocked = false;
    try {
      await classSectionService.enrollStudentInClass({
        email: "not-an-email",
        classSectionId: class7A._id,
      });
    } catch (err: any) {
      invalidEmailBlocked = true;
    }

    record(
      8,
      "Invalid / non-existent email is rejected during enrollment",
      invalidEmailBlocked,
      "Threw error as expected"
    );

    // -------------------------------------------------------------------------
    // Scenario 9: Non-existent student handled cleanly
    // -------------------------------------------------------------------------
    const nonExistentEmail = "ghost.student.999@edupye.com";
    let notFoundHandled = false;
    try {
      await studentService.getStudentByEmail(nonExistentEmail);
    } catch (err: any) {
      if (err.message === "Student not found") {
        notFoundHandled = true;
      }
    }

    record(
      9,
      "Non-existent student lookup handled cleanly with 404 message",
      notFoundHandled,
      `Correctly identified absence of ${nonExistentEmail}`
    );

    // -------------------------------------------------------------------------
    // Scenario 10: Clean invitation / pre-enrollment without fake User / StudentProfile
    // -------------------------------------------------------------------------
    const userCountBefore = await User.countDocuments();
    const profileCountBefore = await StudentProfile.countDocuments();

    const invite = await classSectionService.inviteStudentToClass({
      classSectionId: class7A._id,
      email: nonExistentEmail,
      name: "Priya Sharma",
      rollNumber: "102",
      invitedBy: teacherProfile._id,
    });

    const userCountAfter = await User.countDocuments();
    const profileCountAfter = await StudentProfile.countDocuments();

    const inviteSuccess =
      invite &&
      invite.email === nonExistentEmail &&
      invite.status === "pending" &&
      userCountBefore === userCountAfter &&
      profileCountBefore === profileCountAfter;

    record(
      10,
      "Invitation flow creates clean pending invitation without creating fake User or StudentProfile",
      Boolean(inviteSuccess),
      `Invite ID: ${invite._id}, Users before/after: ${userCountBefore}/${userCountAfter}, Profiles before/after: ${profileCountBefore}/${profileCountAfter}`
    );

    // -------------------------------------------------------------------------
    // Scenario 11: Existing StudentProfile is never duplicated
    // -------------------------------------------------------------------------
    const studentProfilesForRahul = await StudentProfile.countDocuments({
      userId: studentUserId,
    });

    record(
      11,
      "Existing StudentProfile is never duplicated for the same user",
      studentProfilesForRahul === 1,
      `Profiles for Rahul: ${studentProfilesForRahul}`
    );

    // -------------------------------------------------------------------------
    // Scenario 12: Existing Student Module continues to work
    // -------------------------------------------------------------------------
    const studentProfileDoc = await StudentProfile.findById(studentProfileId);
    const studentWorks =
      studentProfileDoc &&
      studentProfileDoc.studentType === "institution" &&
      studentProfileDoc.classSectionId?.toString() === class7A._id.toString();

    record(
      12,
      "Existing Student Module continues to work with updated profile context",
      Boolean(studentWorks),
      `Student Type: ${studentProfileDoc?.studentType}, ClassSection: ${studentProfileDoc?.classSectionId}`
    );

    // -------------------------------------------------------------------------
    // Scenario 13: Existing Teacher Classes functionality continues to work
    // -------------------------------------------------------------------------
    const teacherClassesFinal = await classSectionService.getTeacherClassesWithStudentCount(teacherProfile._id);
    const teacherClassesWork = teacherClassesFinal.length === 1 && teacherClassesFinal[0].studentCount === 1;

    record(
      13,
      "Existing Teacher Classes functionality continues to work flawlessly",
      teacherClassesWork,
      `Teacher classes verified: ${teacherClassesFinal.length}`
    );

  } catch (err: any) {
    console.error("Enrollment UX verification failed with unhandled error:", err);
  } finally {
    console.log("\nCleaning up test fixtures...");
    for (const cleanup of cleanupTasks) {
      try {
        await cleanup();
      } catch (e) {
        // ignore
      }
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  console.log("\n=======================================================");
  console.log(`ENROLLMENT UX VERIFICATION: ${passedCount} / ${totalCount} PASSED`);
  console.log("=======================================================\n");

  if (passedCount === totalCount && totalCount > 0) {
    console.log("ALL ENROLLMENT UX TEST SCENARIOS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    console.error("SOME ENROLLMENT UX TESTS FAILED!\n");
    process.exit(1);
  }
}

runEnrollmentUXVerification();
