import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import TeacherProfile from "../models/TeacherProfile";
import { registerUser, loginUser, getCurrentUser } from "../services/auth_service";
import {
  createTeacherProfile,
  getTeacherById,
  getTeacherByEmail,
  updateTeacherProfile,
} from "../services/teacher_service";

async function runVerification() {
  console.log("=== STARTING TEACHER REGISTRATION & ONBOARDING VERIFICATION ===");
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log("Connected to MongoDB.");

  const testTeacherEmail = `teacher_test_${Date.now()}@edupye.com`;
  const testStudentEmail = `student_test_${Date.now()}@edupye.com`;

  try {
    // -------------------------------------------------------------
    // TEST 1: Register as Teacher
    // -------------------------------------------------------------
    console.log("\n[TEST 1] Registering a new Teacher user...");
    const teacherRegResult = await registerUser({
      email: testTeacherEmail,
      password: "Password123!",
      name: "Prof. Sarah Jenkins",
      userType: "teacher",
    });

    console.log("Teacher registered successfully. User ID:", teacherRegResult.user._id);

    // Verify TeacherProfile was created
    const teacherProfileInDb = await TeacherProfile.findOne({
      userId: teacherRegResult.user._id,
    });
    if (!teacherProfileInDb) {
      throw new Error("FAILED: TeacherProfile was NOT created for teacher registration!");
    }
    console.log("✓ Verified TeacherProfile created in database:", teacherProfileInDb._id.toString());

    // Verify StudentProfile was NOT created
    const accidentalStudentProfile = await StudentProfile.findOne({
      userId: teacherRegResult.user._id,
    });
    if (accidentalStudentProfile) {
      throw new Error("FAILED: Accidental StudentProfile was created for a Teacher!");
    }
    console.log("✓ Verified NO StudentProfile was created for Teacher.");

    // -------------------------------------------------------------
    // TEST 2: Register as Student
    // -------------------------------------------------------------
    console.log("\n[TEST 2] Registering a new Student user...");
    const studentRegResult = await registerUser({
      email: testStudentEmail,
      password: "Password123!",
      name: "Alex Johnson",
      userType: "student",
    });

    console.log("Student registered successfully. User ID:", studentRegResult.user._id);

    // Verify StudentProfile was created
    const studentProfileInDb = await StudentProfile.findOne({
      userId: studentRegResult.user._id,
    });
    if (!studentProfileInDb) {
      throw new Error("FAILED: StudentProfile was NOT created for student registration!");
    }
    console.log("✓ Verified StudentProfile created in database:", studentProfileInDb._id.toString());

    // Verify TeacherProfile was NOT created
    const accidentalTeacherProfile = await TeacherProfile.findOne({
      userId: studentRegResult.user._id,
    });
    if (accidentalTeacherProfile) {
      throw new Error("FAILED: Accidental TeacherProfile was created for a Student!");
    }
    console.log("✓ Verified NO TeacherProfile was created for Student.");

    // -------------------------------------------------------------
    // TEST 3: Teacher Onboarding / Profile Update
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Updating Teacher Profile (Simulating Onboarding)...");
    const updatedTeacher = await updateTeacherProfile(teacherProfileInDb._id.toString(), {
      teacherType: "institution",
      institution: "Delhi Public School R.K. Puram",
      department: "Science",
      designation: "Head of Department (Physics)",
      subjects: ["Physics", "Applied Mechanics"],
      classesTaught: ["Class 11", "Class 12"],
      boards: ["CBSE", "Cambridge (IGCSE)"],
      experienceYears: 12,
      goal: "Lesson Planning",
      preferences: {
        activeDepartment: "Science",
        activeSubject: "Physics",
      },
    });

    if (
      updatedTeacher.institution !== "Delhi Public School R.K. Puram" ||
      !updatedTeacher.subjects.includes("Applied Mechanics") ||
      updatedTeacher.experienceYears !== 12
    ) {
      throw new Error("FAILED: Teacher Profile was not updated accurately!");
    }
    console.log("✓ Teacher profile updated successfully with teaching details, classes, and boards.");

    // -------------------------------------------------------------
    // TEST 4: Teacher Login Flow
    // -------------------------------------------------------------
    console.log("\n[TEST 4] Testing Teacher Login Flow...");
    const teacherLogin = await loginUser({
      email: testTeacherEmail,
      password: "Password123!",
    });

    if (teacherLogin.user.userType !== "teacher") {
      throw new Error(`FAILED: Expected userType 'teacher', got '${teacherLogin.user.userType}'`);
    }
    if (!teacherLogin.teacherProfile) {
      throw new Error("FAILED: Teacher Login did not return teacherProfile!");
    }
    if (teacherLogin.studentProfile) {
      throw new Error("FAILED: Teacher Login returned studentProfile!");
    }
    console.log("✓ Teacher Login successful: returns teacherProfile & role='teacher'.");

    // -------------------------------------------------------------
    // TEST 5: Student Login Flow
    // -------------------------------------------------------------
    console.log("\n[TEST 5] Testing Student Login Flow...");
    const studentLogin = await loginUser({
      email: testStudentEmail,
      password: "Password123!",
    });

    if (studentLogin.user.userType !== "student") {
      throw new Error(`FAILED: Expected userType 'student', got '${studentLogin.user.userType}'`);
    }
    if (!studentLogin.studentProfile) {
      throw new Error("FAILED: Student Login did not return studentProfile!");
    }
    if (studentLogin.teacherProfile) {
      throw new Error("FAILED: Student Login returned teacherProfile!");
    }
    console.log("✓ Student Login successful: returns studentProfile & role='student'.");

    // -------------------------------------------------------------
    // TEST 6: Tuition Teacher Type Support
    // -------------------------------------------------------------
    console.log("\n[TEST 6] Testing Tuition Teacher Mode...");
    const tuitionTeacher = await updateTeacherProfile(teacherProfileInDb._id.toString(), {
      teacherType: "tuition",
      tuitionCentre: "Apex IIT-JEE Coaching Academy",
      subjects: ["Advanced Physics", "Maths Olympiad"],
    });

    if (tuitionTeacher.teacherType !== "tuition" || tuitionTeacher.tuitionCentre !== "Apex IIT-JEE Coaching Academy") {
      throw new Error("FAILED: Tuition teacher type update failed!");
    }
    console.log("✓ Tuition Teacher mode successfully supported & updated.");

    console.log("\n=======================================================");
    console.log(" ALL 6 TEACHER & STUDENT AUTH / PROFILE TESTS PASSED! ");
    console.log("=======================================================\n");
  } finally {
    // Cleanup test records
    await User.deleteMany({ email: { $in: [testTeacherEmail, testStudentEmail] } });
    await TeacherProfile.deleteMany({ name: { $in: ["Prof. Sarah Jenkins", "Alex Johnson"] } });
    await StudentProfile.deleteMany({ name: { $in: ["Prof. Sarah Jenkins", "Alex Johnson"] } });
    await mongoose.disconnect();
    console.log("Cleaned up test data and disconnected from MongoDB.");
  }
}

runVerification().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
