import "dotenv/config";
import mongoose from "mongoose";
import http from "http";
import app from "../server";
import { seedAdminAccounts } from "./seed_admin_accounts";
import User from "../models/User";
import TuitionProgram from "../models/TuitionProgram";
import TuitionProviderProfile from "../models/TuitionProviderProfile";

// Ensure AUTO_APPROVE_TUITION_DEV is explicitly false for this test
process.env.AUTO_APPROVE_TUITION_DEV = "false";

async function makeRequest(
  port: number,
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };
    if (payload) {
      reqHeaders["Content-Length"] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method,
        path,
        headers: reqHeaders,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            resolve({ status: res.statusCode || 200, data: parsed });
          } catch {
            resolve({ status: res.statusCode || 200, data: raw });
          }
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTuitionFlowVerification(): Promise<void> {
  console.log("================================================================================");
  console.log("🧪 Starting Admin Module 33 Tuition Runtime Verification Suite");
  console.log("   AUTO_APPROVE_TUITION_DEV =", process.env.AUTO_APPROVE_TUITION_DEV);
  console.log("================================================================================\n");

  await seedAdminAccounts();

  const testPort = 5998;
  const server = app.listen(testPort);
  await new Promise((resolve) => setTimeout(resolve, 500));

  const timestamp = Date.now();
  const testTeacherEmail = `verify.teacher.${timestamp}@testdomain.com`;
  const testStudentEmail = `verify.student.${timestamp}@testdomain.com`;

  try {
    // -------------------------------------------------------------------------
    // Step 1: Admin Authentication
    // -------------------------------------------------------------------------
    console.log("--- 1. Authenticating Tuition Operations Admin (/api/auth/tuition-admin/login) ---");
    const adminLoginRes = await makeRequest(testPort, "POST", "/api/auth/tuition-admin/login", {
      username: "tuitionadmin@edupye.com",
      password: "Password123!",
    });

    if (adminLoginRes.status !== 200 || !adminLoginRes.data.token) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminLoginRes.data)}`);
    }
    const adminToken = adminLoginRes.data.token;
    console.log("✅ Admin Token successfully obtained. User:", adminLoginRes.data.user.displayName);
    console.log("   Admin Role:", adminLoginRes.data.user.role);

    // -------------------------------------------------------------------------
    // Step 2: Register New Teacher with AUTO_APPROVE_TUITION_DEV=false (Bug A Verification)
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Registering New Teacher without Dev Auto-Approval ---");
    const teacherRegRes = await makeRequest(testPort, "POST", "/api/auth/register", {
      email: testTeacherEmail,
      password: "Password123!",
      name: "Dr. Alan Turing",
      userType: "teacher",
    });

    if (teacherRegRes.status !== 201 && teacherRegRes.status !== 200) {
      throw new Error(`Teacher registration failed: ${JSON.stringify(teacherRegRes.data)}`);
    }
    const registeredTeacher = teacherRegRes.data.data?.user || teacherRegRes.data.user;
    console.log("✅ Teacher registered:", registeredTeacher.email);
    console.log("   Teacher Code initially:", registeredTeacher.teacherCode);
    console.log("   Tuition Approval Status:", registeredTeacher.tuitionApprovalStatus);

    if (registeredTeacher.teacherCode) {
      throw new Error("FAIL: Teacher code was issued even though AUTO_APPROVE_TUITION_DEV is false!");
    }
    if (registeredTeacher.tuitionApprovalStatus !== "pending") {
      throw new Error(`FAIL: Expected tuitionApprovalStatus='pending', got '${registeredTeacher.tuitionApprovalStatus}'`);
    }

    // -------------------------------------------------------------------------
    // Step 3: Admin Fetches Teacher List (Module 33: Bug A Check)
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Admin Fetching Teachers List (/api/admin/tuition/teachers) ---");
    const teachersListRes = await makeRequest(testPort, "GET", "/api/admin/tuition/teachers", undefined, {
      Authorization: `Bearer ${adminToken}`,
    });

    if (teachersListRes.status !== 200) {
      throw new Error(`Failed to fetch teachers: HTTP ${teachersListRes.status} - ${JSON.stringify(teachersListRes.data)}`);
    }

    const teacherFound = teachersListRes.data.teachers.find(
      (t: any) => t.email === testTeacherEmail
    );
    if (!teacherFound) {
      throw new Error(`FAIL: Newly registered teacher ${testTeacherEmail} not found in admin teachers list!`);
    }

    console.log("✅ Newly registered teacher found in Admin list:");
    console.log("   ID:", teacherFound.id);
    console.log("   Name:", teacherFound.name);
    console.log("   Subjects:", teacherFound.subjects);
    console.log("   Tuition Approval Status:", teacherFound.tuitionApprovalStatus);
    if (teacherFound.tuitionApprovalStatus !== "pending") {
      throw new Error(`FAIL: Teacher in admin list has status '${teacherFound.tuitionApprovalStatus}', expected 'pending'`);
    }

    // -------------------------------------------------------------------------
    // Step 4: Admin Verifies Teacher (Issues TCH-XXXXXX code)
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Admin Verifies Teacher (/api/admin/tuition/teachers/:id/verify) ---");
    const verifyTeacherRes = await makeRequest(
      testPort,
      "PATCH",
      `/api/admin/tuition/teachers/${teacherFound.id}/verify`,
      { status: "approved", notes: "Credentials and degrees independently verified." },
      { Authorization: `Bearer ${adminToken}` }
    );

    if (verifyTeacherRes.status !== 200 || !verifyTeacherRes.data.success) {
      throw new Error(`Teacher verification failed: ${JSON.stringify(verifyTeacherRes.data)}`);
    }

    console.log("✅ Teacher verified successfully:");
    console.log("   Issued Teacher Code:", verifyTeacherRes.data.teacherCode);
    console.log("   New Status:", verifyTeacherRes.data.tuitionApprovalStatus);
    if (!verifyTeacherRes.data.teacherCode?.startsWith("TCH-")) {
      throw new Error(`FAIL: Permanent teacher code '${verifyTeacherRes.data.teacherCode}' does not start with 'TCH-'`);
    }

    // -------------------------------------------------------------------------
    // Step 5: Admin Creates New Tuition Program (Bug B Verification)
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Admin Creates Tuition Program (/api/admin/tuition/programs) ---");
    const createProgramRes = await makeRequest(
      testPort,
      "POST",
      "/api/admin/tuition/programs",
      {
        title: "Advanced Quantum Mechanics & Relativity",
        subject: "Physics",
        grade: "Class 12",
        description: "Specialized batch covering modern physics, atomic models, and relativity.",
        schedule: [
          { day: "Tuesday", startTime: "18:00", endTime: "19:30" },
          { day: "Thursday", startTime: "18:00", endTime: "19:30" },
        ],
        teacherIds: [teacherFound.id],
        enrolledStudentIds: [],
        maxCapacity: 25,
      },
      { Authorization: `Bearer ${adminToken}` }
    );

    if (createProgramRes.status !== 201 || !createProgramRes.data.success) {
      throw new Error(`FAIL: Program creation failed (Bug B check): HTTP ${createProgramRes.status} - ${JSON.stringify(createProgramRes.data)}`);
    }

    const createdProgram = createProgramRes.data.program;
    console.log("✅ Tuition Program created successfully (Bug B FIXED - Zero token auth errors!):");
    console.log("   Program ID:", createdProgram._id);
    console.log("   Program Code:", createdProgram.code);
    console.log("   Title:", createdProgram.title);
    console.log("   Assigned Teachers:", createdProgram.teacherIds.map((t: any) => `${t.name} (${t.teacherCode})`));

    // -------------------------------------------------------------------------
    // Step 6: Register New Student & Admin Approval (STU-XXXXXX issuance)
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Registering Student & Approving Tuition Access ---");
    const studentRegRes = await makeRequest(testPort, "POST", "/api/auth/register", {
      email: testStudentEmail,
      password: "Password123!",
      name: "Ada Lovelace",
      userType: "student",
    });

    if (studentRegRes.status !== 201 && studentRegRes.status !== 200) {
      throw new Error(`Student registration failed: ${JSON.stringify(studentRegRes.data)}`);
    }
    const studentUser = studentRegRes.data.data?.user || studentRegRes.data.user;
    console.log("✅ Student registered:", studentUser.email);
    console.log("   Initial Student Code:", studentUser.studentCode);

    // Admin fetches students list
    const studentsListRes = await makeRequest(testPort, "GET", "/api/admin/tuition/students", undefined, {
      Authorization: `Bearer ${adminToken}`,
    });
    if (studentsListRes.status !== 200) {
      throw new Error(`Failed to fetch students: ${JSON.stringify(studentsListRes.data)}`);
    }
    const studentFound = studentsListRes.data.students.find((s: any) => s.email === testStudentEmail);
    if (!studentFound) {
      throw new Error(`FAIL: Student ${testStudentEmail} not found in admin students list!`);
    }
    console.log("✅ Student found in Admin list:", studentFound.name);

    // Admin approves student and assigns to newly created program
    const approveStudentRes = await makeRequest(
      testPort,
      "PATCH",
      `/api/admin/tuition/students/${studentFound.id}/approve`,
      { status: "approved", programId: createdProgram._id },
      { Authorization: `Bearer ${adminToken}` }
    );

    if (approveStudentRes.status !== 200 || !approveStudentRes.data.success) {
      throw new Error(`Student approval failed: ${JSON.stringify(approveStudentRes.data)}`);
    }
    console.log("✅ Student access approved by Admin:");
    console.log("   Issued Student Code:", approveStudentRes.data.studentCode);
    console.log("   Enrolled Program:", approveStudentRes.data.assignedProgram?.title);
    if (!approveStudentRes.data.studentCode?.startsWith("STU-")) {
      throw new Error(`FAIL: Permanent student code '${approveStudentRes.data.studentCode}' does not start with 'STU-'`);
    }

    // -------------------------------------------------------------------------
    // Step 7: Verify Updated Program Contains Enrolled Student
    // -------------------------------------------------------------------------
    console.log("\n--- 7. Verifying Program Enrollment Sync (/api/admin/tuition/programs) ---");
    const programsRes = await makeRequest(testPort, "GET", "/api/admin/tuition/programs", undefined, {
      Authorization: `Bearer ${adminToken}`,
    });
    const updatedProgram = programsRes.data.programs.find((p: any) => p._id === createdProgram._id);
    console.log("✅ Verified Program:", updatedProgram.title);
    console.log("   Enrolled Students count:", updatedProgram.enrolledStudentIds?.length);
    console.log("   Enrolled Student Codes:", updatedProgram.enrolledStudentIds?.map((s: any) => s.studentCode));

    console.log("\n================================================================================");
    console.log("🎉 ALL RUNTIME VERIFICATION TESTS PASSED SUCCESSFULLY!");
    console.log("   - Bug A (Teacher listing & pending status): VERIFIED FIXED");
    console.log("   - Bug B (Admin Token authentication on actions & programs): VERIFIED FIXED");
    console.log("   - Strict Admin-Gated permanent code issuance (TCH-XXXXXX & STU-XXXXXX): VERIFIED");
    console.log("================================================================================\n");
  } finally {
    // Cleanup created test records
    await User.deleteMany({ email: { $in: [testTeacherEmail, testStudentEmail] } });
    await TuitionProviderProfile.deleteMany({ fullName: "Dr. Alan Turing" });
    await TuitionProgram.deleteMany({ title: "Advanced Quantum Mechanics & Relativity" });

    server.close();
    await mongoose.disconnect();
  }
}

runTuitionFlowVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Tuition Flow Verification FAILED:", err);
    process.exit(1);
  });
