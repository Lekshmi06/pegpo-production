import "dotenv/config";
import mongoose from "mongoose";
import WebSocket from "ws";
import http from "http";
import app, { httpServer } from "./server";
import connectDB from "./config/db";
import User from "./models/User";
import TuitionProgram from "./models/TuitionProgram";
import LiveClassSession from "./models/LiveClassSession";
import TuitionLiveAssessment from "./models/TuitionLiveAssessment";
import TuitionHomework from "./models/TuitionHomework";
import TuitionComplaint from "./models/TuitionComplaint";
import LandingPageContent from "./models/LandingPageContent";
import CombinedStudyMessage from "./models/CombinedStudyMessage";
import TeacherPayout from "./models/TeacherPayout";
import { generateSessionToken } from "./utils/token";

interface TestReportItem {
  id: string;
  flow: string;
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const report: TestReportItem[] = [];

function recordTest(flow: string, id: string, name: string, passed: boolean, details?: any, error?: string) {
  report.push({ flow, id, name, passed, details, error });
  const icon = passed ? "✓" : "✗";
  console.log(`${icon} [${flow}] ${name}${error ? ` -> ERROR: ${error}` : ""}`);
}

async function runDiagnosticSuite() {
  console.log("\n========================================================");
  console.log("STARTING FULL SYSTEM END-TO-END DIAGNOSTIC TEST SUITE");
  console.log("========================================================\n");

  await connectDB();

  const PORT = 5056;
  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, () => {
      console.log(`[Diagnostic Server] Running on http://localhost:${PORT}`);
      resolve();
    });
  });

  const BASE_URL = `http://localhost:${PORT}`;

  try {
    // ========================================================
    // FLOW 1: AUTHENTICATION & ROLE ACCESS
    // ========================================================
    console.log("\n--- EXECUTING FLOW 1: AUTHENTICATION & ROLE ACCESS ---");

    const uniqueTimestamp = Date.now();
    const studentEmail = `diag_student_${uniqueTimestamp}@edupye.test`;
    const teacherEmail = `diag_teacher_${uniqueTimestamp}@edupye.test`;
    const testPassword = "Password123!";

    // 1.1 Student Registration
    let studentRegRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: studentEmail,
        password: testPassword,
        name: "Diagnostic Student",
        userType: "student",
      }),
    });
    let studentRegData = await studentRegRes.json();
    const studentUser = studentRegData?.data?.user;
    const studentToken = studentRegData?.data?.token;

    recordTest(
      "Flow 1",
      "AUTH-01",
      "Student Registration & JWT Generation",
      studentRegRes.status === 201 && !!studentToken && studentUser?.activeRole === "student",
      { status: studentRegRes.status, userId: studentUser?._id, role: studentUser?.activeRole },
      studentRegRes.status !== 201 ? studentRegData?.message : undefined
    );

    // 1.2 Teacher Registration
    let teacherRegRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: teacherEmail,
        password: testPassword,
        name: "Diagnostic Teacher",
        userType: "teacher",
      }),
    });
    let teacherRegData = await teacherRegRes.json();
    const teacherUser = teacherRegData?.data?.user;
    const teacherToken = teacherRegData?.data?.token;

    recordTest(
      "Flow 1",
      "AUTH-02",
      "Teacher Registration & JWT Generation",
      teacherRegRes.status === 201 && !!teacherToken && teacherUser?.activeRole === "teacher",
      { status: teacherRegRes.status, userId: teacherUser?._id, role: teacherUser?.activeRole },
      teacherRegRes.status !== 201 ? teacherRegData?.message : undefined
    );

    // 1.3 Student Login
    let studentLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: studentEmail,
        password: testPassword,
      }),
    });
    let studentLoginData = await studentLoginRes.json();
    recordTest(
      "Flow 1",
      "AUTH-03",
      "Student Standard Login (/api/auth/login)",
      studentLoginRes.status === 200 && !!studentLoginData?.token,
      { status: studentLoginRes.status, email: studentLoginData?.user?.email },
      studentLoginRes.status !== 200 ? studentLoginData?.message : undefined
    );

    // 1.4 Check /api/auth/me Session Persistence
    let studentMeRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    let studentMeData = await studentMeRes.json();
    recordTest(
      "Flow 1",
      "AUTH-04",
      "Session Persistence Check via GET /api/auth/me",
      studentMeRes.status === 200 && studentMeData?.user?.email === studentEmail,
      { status: studentMeRes.status, email: studentMeData?.user?.email },
      studentMeRes.status !== 200 ? studentMeData?.message : undefined
    );

    // 1.5 Admin ERP Login Tabs Check (Super Admin, Tuition Admin, Admin, Staff)
    const adminRolesToTest = [
      {
        tab: "Super Admin",
        username: "superadmin@edupye.com",
        endpoint: "/api/auth/super-admin/login",
        roleClaim: "Super Admin",
      },
      {
        tab: "Tuition Admin",
        username: "tuitionadmin@edupye.com",
        endpoint: "/api/auth/tuition-admin/login",
        roleClaim: "Tuition Operations Admin",
      },
      {
        tab: "Admin",
        username: "admin@edupye.com",
        endpoint: "/api/auth/admin/login",
        roleClaim: "Admin",
      },
      {
        tab: "Staff",
        username: "staff@edupye.com",
        endpoint: "/api/auth/staff/login",
        roleClaim: "Staff",
      },
    ];

    let superAdminToken = "";
    let tuitionAdminToken = "";

    for (const adminTab of adminRolesToTest) {
      let loginRes = await fetch(`${BASE_URL}${adminTab.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: adminTab.username,
          password: "Password123!",
        }),
      });
      let loginData = await loginRes.json();

      if (adminTab.tab === "Super Admin" && loginData.token) superAdminToken = loginData.token;
      if (adminTab.tab === "Tuition Admin" && loginData.token) tuitionAdminToken = loginData.token;

      recordTest(
        "Flow 1",
        `AUTH-ADMIN-${adminTab.tab.toUpperCase().replace(/\s+/g, "_")}`,
        `Admin ERP Tab: ${adminTab.tab} Login (${adminTab.endpoint})`,
        loginRes.status === 200 && !!loginData.token,
        { status: loginRes.status, role: loginData?.user?.role, username: loginData?.user?.username },
        loginRes.status !== 200 ? loginData?.message : undefined
      );

      // Verify session persistence on /api/auth/me with Admin token
      if (loginData.token) {
        let meRes = await fetch(`${BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${loginData.token}` },
        });
        let meData = await meRes.json();
        recordTest(
          "Flow 1",
          `AUTH-ME-${adminTab.tab.toUpperCase().replace(/\s+/g, "_")}`,
          `Admin ERP Tab: ${adminTab.tab} Session Hydration (/api/auth/me)`,
          meRes.status === 200 && !!meData?.user,
          { status: meRes.status, username: meData?.user?.username, role: meData?.user?.role },
          meRes.status !== 200 ? meData?.message : undefined
        );
      }
    }

    // ========================================================
    // FLOW 2: ADMIN-GATED TUITION APPROVAL & MODULE 33
    // ========================================================
    console.log("\n--- EXECUTING FLOW 2: ADMIN-GATED TUITION APPROVAL & MODULE 33 ---");

    // 2.1 Verify AUTO_APPROVE_TUITION_DEV check
    const isAutoApproveDisabled = process.env.AUTO_APPROVE_TUITION_DEV !== "true";
    const studentHasNoCodeInitially = !studentUser?.studentCode;
    const teacherHasNoCodeInitially = !teacherUser?.teacherCode;
    recordTest(
      "Flow 2",
      "TUITION-GATE-01",
      "Auto-Approve Disabled Check (No Unilateral TCH/STU Code on Registration)",
      isAutoApproveDisabled && studentHasNoCodeInitially && teacherHasNoCodeInitially,
      {
        AUTO_APPROVE_TUITION_DEV: process.env.AUTO_APPROVE_TUITION_DEV,
        studentCode: studentUser?.studentCode || null,
        teacherCode: teacherUser?.teacherCode || null,
        studentApprovalStatus: studentUser?.tuitionApprovalStatus,
      },
      !isAutoApproveDisabled ? "AUTO_APPROVE_TUITION_DEV is true in environment" : undefined
    );

    // 2.2 Teacher Verification in Admin Module 33
    const adminHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${superAdminToken || tuitionAdminToken}`,
    };

    let verifyTeacherRes = await fetch(`${BASE_URL}/api/admin/tuition/teachers/${teacherUser._id}/verify`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({
        status: "approved",
        notes: "Approved by diagnostic test",
      }),
    });
    let verifyTeacherData = await verifyTeacherRes.json();
    const issuedTeacherCode = verifyTeacherData?.teacherCode;

    recordTest(
      "Flow 2",
      "MODULE33-TEACHER-VERIFY",
      "Module 33: Verify Teacher & Issue Permanent TCH-XXXXXX Code",
      verifyTeacherRes.status === 200 &&
        typeof issuedTeacherCode === "string" &&
        issuedTeacherCode.startsWith("TCH-"),
      { status: verifyTeacherRes.status, teacherCode: issuedTeacherCode },
      verifyTeacherRes.status !== 200 ? verifyTeacherData?.message : undefined
    );

    // 2.3 Student Approval in Admin Module 33
    let approveStudentRes = await fetch(`${BASE_URL}/api/admin/tuition/students/${studentUser._id}/approve`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({
        status: "approved",
      }),
    });
    let approveStudentData = await approveStudentRes.json();
    const issuedStudentCode = approveStudentData?.studentCode;

    recordTest(
      "Flow 2",
      "MODULE33-STUDENT-APPROVE",
      "Module 33: Approve Student & Issue Permanent STU-XXXXXX Code",
      approveStudentRes.status === 200 &&
        typeof issuedStudentCode === "string" &&
        issuedStudentCode.startsWith("STU-"),
      { status: approveStudentRes.status, studentCode: issuedStudentCode },
      approveStudentRes.status !== 200 ? approveStudentData?.message : undefined
    );

    // 2.4 Create Tuition Program in Admin Module 33 & Pair Teacher and Student
    let createProgRes = await fetch(`${BASE_URL}/api/admin/tuition/programs`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        title: "Diagnostic Physics Cohort 2026",
        subject: "Physics",
        grade: "Class 12",
        description: "Automated end-to-end diagnostic tuition program",
        teacherIds: [teacherUser._id],
        enrolledStudentIds: [studentUser._id],
        maxCapacity: 25,
      }),
    });
    let createProgData = await createProgRes.json();
    const createdProgram = createProgData?.program;

    recordTest(
      "Flow 2",
      "MODULE33-PROGRAM-CREATE",
      "Module 33: Create Program & Pair Teacher and Student Rosters",
      createProgRes.status === 201 &&
        !!createdProgram?._id &&
        createdProgram?.teacherIds?.some((t: any) => (t._id || t).toString() === teacherUser._id.toString()),
      {
        status: createProgRes.status,
        programId: createdProgram?._id,
        code: createdProgram?.code,
        teachers: createdProgram?.teacherIds?.length,
        students: createdProgram?.enrolledStudentIds?.length,
      },
      createProgRes.status !== 201 ? createProgData?.message : undefined
    );

    // 2.5 Revoke Access Controls
    let revokeRes = await fetch(`${BASE_URL}/api/admin/tuition/users/${studentUser._id}/revoke`, {
      method: "PATCH",
      headers: adminHeaders,
    });
    let revokeData = await revokeRes.json();

    // Verify student was pulled from program roster
    const progAfterRevoke = await TuitionProgram.findById(createdProgram._id);
    const isStudentPulled = !progAfterRevoke?.enrolledStudentIds?.some(
      (id: any) => id.toString() === studentUser._id.toString()
    );

    recordTest(
      "Flow 2",
      "MODULE33-REVOKE-ACCESS",
      "Module 33: Revoke Access & Immediate Removal from Active Rosters",
      revokeRes.status === 200 && isStudentPulled,
      { status: revokeRes.status, isStudentPulled },
      revokeRes.status !== 200 ? revokeData?.message : undefined
    );

    // 2.6 Restore Access Controls
    let restoreRes = await fetch(`${BASE_URL}/api/admin/tuition/users/${studentUser._id}/restore`, {
      method: "PATCH",
      headers: adminHeaders,
    });
    let restoreData = await restoreRes.json();
    const restoredUser = await User.findById(studentUser._id);

    // Re-enroll student back into program for subsequent tests
    await TuitionProgram.findByIdAndUpdate(createdProgram._id, {
      $addToSet: { enrolledStudentIds: studentUser._id },
    });

    recordTest(
      "Flow 2",
      "MODULE33-RESTORE-ACCESS",
      "Module 33: Restore Access & Verify Approval Status",
      restoreRes.status === 200 && restoredUser?.tuitionApprovalStatus === "approved",
      { status: restoreRes.status, approvalStatus: restoredUser?.tuitionApprovalStatus },
      restoreRes.status !== 200 ? restoreData?.message : undefined
    );

    // 2.7 Complaints & Grievances in Module 33
    // Submit an anonymous complaint first as student
    let complaintRes = await fetch(`${BASE_URL}/api/tuition/complaints`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        programId: createdProgram._id,
        category: "Technical / SmartBoard",
        subject: "Echo during live class derivation",
        description: "Microphone feedback observed when teacher was drawing on Smartboard.",
        isAnonymous: true,
      }),
    });
    let complaintData = await complaintRes.json();
    const submittedTicketCode = complaintData?.complaint?.ticketCode || complaintData?.ticketCode;

    // Fetch complaints in Module 33 as Admin
    let getComplaintsRes = await fetch(`${BASE_URL}/api/admin/tuition/complaints`, {
      headers: adminHeaders,
    });
    let getComplaintsData = await getComplaintsRes.json();
    const matchedComplaint = (getComplaintsData?.complaints || []).find(
      (c: any) => c.ticketCode === submittedTicketCode
    );

    recordTest(
      "Flow 2",
      "MODULE33-COMPLAINTS-ANON-MASK",
      "Module 33: Complaints Tab & Strict Anonymous Identity Masking",
      getComplaintsRes.status === 200 &&
        matchedComplaint?.isAnonymous === true &&
        matchedComplaint?.reporter?.name === "Anonymous User" &&
        !matchedComplaint?.reporterId,
      {
        status: getComplaintsRes.status,
        ticketCode: submittedTicketCode,
        reporterName: matchedComplaint?.reporter?.name,
        isMasked: !matchedComplaint?.reporterId,
      },
      !matchedComplaint ? "Complaint ticket not found in admin list" : undefined
    );

    // Update complaint status & progress notes in Module 33
    if (matchedComplaint) {
      let updateComplaintRes = await fetch(`${BASE_URL}/api/admin/tuition/complaints/${matchedComplaint._id}`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({
          status: "in_review",
          adminProgressNotes: "Hardware audio filter check initiated by Admin team.",
        }),
      });
      let updateComplaintData = await updateComplaintRes.json();

      recordTest(
        "Flow 2",
        "MODULE33-COMPLAINTS-PROGRESS",
        "Module 33: Update Complaint Status & Append Progress Note",
        updateComplaintRes.status === 200 &&
          updateComplaintData?.complaint?.status === "in_review" &&
          updateComplaintData?.complaint?.adminProgressNotes?.length > 0,
        {
          status: updateComplaintRes.status,
          complaintStatus: updateComplaintData?.complaint?.status,
          notesCount: updateComplaintData?.complaint?.adminProgressNotes?.length,
        },
        updateComplaintRes.status !== 200 ? updateComplaintData?.message : undefined
      );
    }

    // ========================================================
    // FLOW 3: LANDING PAGE CMS
    // ========================================================
    console.log("\n--- EXECUTING FLOW 3: LANDING PAGE CMS ---");

    // 3.1 Public Landing Content Fetch
    let publicCmsRes = await fetch(`${BASE_URL}/api/public/landing-content`);
    let publicCmsData = await publicCmsRes.json();
    const publicContent = publicCmsData?.data || publicCmsData?.content;
    recordTest(
      "Flow 3",
      "CMS-PUBLIC-GET",
      "Public Landing Page CMS Fetch (GET /api/public/landing-content)",
      publicCmsRes.status === 200 && publicCmsData?.success === true && !!publicContent?.hero,
      { status: publicCmsRes.status, title: publicContent?.hero?.title },
      publicCmsRes.status !== 200 ? publicCmsData?.message : undefined
    );

    // 3.2 Admin CMS Fetch
    let adminCmsGetRes = await fetch(`${BASE_URL}/api/admin/landing-content`, {
      headers: adminHeaders,
    });
    let adminCmsGetData = await adminCmsGetRes.json();
    const adminContent = adminCmsGetData?.data || adminCmsGetData?.content;
    recordTest(
      "Flow 3",
      "CMS-ADMIN-GET",
      "Admin Studio CMS Fetch (GET /api/admin/landing-content)",
      adminCmsGetRes.status === 200 && adminCmsGetData?.success === true,
      { status: adminCmsGetRes.status },
      adminCmsGetRes.status !== 200 ? adminCmsGetData?.message : undefined
    );

    // 3.3 Admin CMS Update (Save Content)
    const updatedHeroTitle = `Next-Gen AI Classroom Platform [Build ${uniqueTimestamp}]`;
    let updateCmsRes = await fetch(`${BASE_URL}/api/admin/landing-content`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({
        ...adminContent,
        hero: {
          ...adminContent?.hero,
          title: updatedHeroTitle,
        },
      }),
    });
    let updateCmsData = await updateCmsRes.json();
    const savedContent = updateCmsData?.data || updateCmsData?.content;
    recordTest(
      "Flow 3",
      "CMS-ADMIN-SAVE",
      "Admin Studio Save Content (PUT /api/admin/landing-content)",
      updateCmsRes.status === 200 && savedContent?.hero?.title === updatedHeroTitle,
      { status: updateCmsRes.status, savedTitle: savedContent?.hero?.title },
      updateCmsRes.status !== 200 ? updateCmsData?.message : undefined
    );

    // 3.4 Public Re-Fetch Verifying Dynamic Render
    let verifyPublicCmsRes = await fetch(`${BASE_URL}/api/public/landing-content`);
    let verifyPublicCmsData = await verifyPublicCmsRes.json();
    const verifiedPublicContent = verifyPublicCmsData?.data || verifyPublicCmsData?.content;
    recordTest(
      "Flow 3",
      "CMS-PUBLIC-VERIFY",
      "Public Landing Page Reflects Dynamic CMS Changes",
      verifyPublicCmsRes.status === 200 && verifiedPublicContent?.hero?.title === updatedHeroTitle,
      { status: verifyPublicCmsRes.status, publicHeroTitle: verifiedPublicContent?.hero?.title },
      verifiedPublicContent?.hero?.title !== updatedHeroTitle ? "Public title was not updated" : undefined
    );

    // 3.5 Reset to Defaults
    let resetCmsRes = await fetch(`${BASE_URL}/api/admin/landing-content/reset`, {
      method: "POST",
      headers: adminHeaders,
    });
    let resetCmsData = await resetCmsRes.json();
    const resetContent = resetCmsData?.data || resetCmsData?.content;
    recordTest(
      "Flow 3",
      "CMS-ADMIN-RESET",
      "Admin Studio Reset to Defaults (POST /api/admin/landing-content/reset)",
      resetCmsRes.status === 200 && resetCmsData?.success === true,
      { status: resetCmsRes.status, title: resetContent?.hero?.title },
      resetCmsRes.status !== 200 ? resetCmsData?.message : undefined
    );

    // ========================================================
    // FLOW 4: TUITION MODE DIRECTORY, CALENDAR & WORKSPACE
    // ========================================================
    console.log("\n--- EXECUTING FLOW 4: TUITION MODE DIRECTORY & WORKSPACE ---");

    const studentAuthHeader = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${studentToken}`,
    };
    const teacherAuthHeader = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${teacherToken}`,
    };

    // 4.1 Tuition Directory Fetch
    let tuitionProgsRes = await fetch(`${BASE_URL}/api/tuition/programs`, {
      headers: studentAuthHeader,
    });
    let tuitionProgsData = await tuitionProgsRes.json();
    recordTest(
      "Flow 4",
      "TUITION-DIR-GET",
      "Tuition Programs Directory Fetch (/api/tuition/programs)",
      tuitionProgsRes.status === 200 && (tuitionProgsData.myPrograms?.length > 0 || tuitionProgsData.programs?.length > 0),
      {
        status: tuitionProgsRes.status,
        myProgramsCount: tuitionProgsData.myPrograms?.length,
        catalogCount: tuitionProgsData.catalogPrograms?.length,
      },
      tuitionProgsRes.status !== 200 ? tuitionProgsData.message : undefined
    );

    // 4.2 Request Batch Enrollment
    let enrollReqRes = await fetch(`${BASE_URL}/api/tuition/programs/${createdProgram._id}/request-enrollment`, {
      method: "POST",
      headers: studentAuthHeader,
      body: JSON.stringify({
        notes: "Interested in the advanced kinematics unit.",
      }),
    });
    let enrollReqData = await enrollReqRes.json();
    recordTest(
      "Flow 4",
      "TUITION-ENROLL-REQUEST",
      "Request Batch Enrollment Flow (/api/tuition/programs/:id/request-enrollment)",
      enrollReqRes.status === 200 || enrollReqRes.status === 201,
      { status: enrollReqRes.status, message: enrollReqData?.message },
      enrollReqRes.status >= 400 ? enrollReqData?.message : undefined
    );

    // 4.3 Program Roster
    let rosterRes = await fetch(`${BASE_URL}/api/tuition/programs/${createdProgram._id}/roster`, {
      headers: studentAuthHeader,
    });
    let rosterData = await rosterRes.json();
    recordTest(
      "Flow 4",
      "TUITION-ROSTER-GET",
      "Program Roster Fetch (/api/tuition/programs/:id/roster)",
      rosterRes.status === 200 && rosterData?.success === true && rosterData?.teachers?.length > 0,
      {
        status: rosterRes.status,
        teachers: rosterData?.teachers?.length,
        students: rosterData?.students?.length,
        userRole: rosterData?.userRole,
      },
      rosterRes.status !== 200 ? rosterData?.message : undefined
    );

    // 4.4 Combined Study: Post Message & Retrieve
    let postMsgRes = await fetch(`${BASE_URL}/api/tuition/programs/${createdProgram._id}/combined-study`, {
      method: "POST",
      headers: studentAuthHeader,
      body: JSON.stringify({
        content: "Hello everyone, where can I find the formula sheet for Chapter 3?",
      }),
    });
    let postMsgData = await postMsgRes.json();

    let getMsgsRes = await fetch(`${BASE_URL}/api/tuition/programs/${createdProgram._id}/combined-study`, {
      headers: studentAuthHeader,
    });
    let getMsgsData = await getMsgsRes.json();

    recordTest(
      "Flow 4",
      "TUITION-COMBINED-STUDY",
      "Combined Study: Post Message & Fetch Feed with 1-Year Retention",
      postMsgRes.status === 201 && getMsgsRes.status === 200 && getMsgsData.messages?.length > 0,
      {
        postStatus: postMsgRes.status,
        getStatus: getMsgsRes.status,
        messagesCount: getMsgsData?.messages?.length,
      },
      postMsgRes.status !== 201 ? postMsgData?.message : undefined
    );

    // 4.5 Homework & Assignments (Post + Submit + Grade)
    let postHwRes = await fetch(`${BASE_URL}/api/tuition/programs/${createdProgram._id}/homework`, {
      method: "POST",
      headers: teacherAuthHeader,
      body: JSON.stringify({
        title: "Projectile Motion Numerical Set 1",
        description: "Solve problems 1 through 5 from the handout. Show all intermediate steps.",
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        totalPoints: 50,
      }),
    });
    let postHwData = await postHwRes.json();
    const createdHomework = postHwData?.homework;

    recordTest(
      "Flow 4",
      "TUITION-HOMEWORK-CREATE",
      "Batch Homework: Teacher Posts Assignment",
      postHwRes.status === 201 && !!createdHomework?._id,
      { status: postHwRes.status, homeworkId: createdHomework?._id, points: createdHomework?.totalPoints },
      postHwRes.status !== 201 ? postHwData?.message : undefined
    );

    if (createdHomework) {
      // Student submits homework
      let submitHwRes = await fetch(`${BASE_URL}/api/tuition/homework/${createdHomework._id}/submit`, {
        method: "POST",
        headers: studentAuthHeader,
        body: JSON.stringify({
          content: "Final range calculated is 142.5 meters at 45 degrees launch angle.",
        }),
      });
      let submitHwData = await submitHwRes.json();

      recordTest(
        "Flow 4",
        "TUITION-HOMEWORK-SUBMIT",
        "Batch Homework: Student Submits Solution",
        submitHwRes.status === 200 && submitHwData?.success === true,
        { status: submitHwRes.status },
        submitHwRes.status !== 200 ? submitHwData?.message : undefined
      );

      // Teacher grades submission
      let gradeHwRes = await fetch(
        `${BASE_URL}/api/tuition/homework/${createdHomework._id}/submissions/${studentUser._id}/grade`,
        {
          method: "PATCH",
          headers: teacherAuthHeader,
          body: JSON.stringify({
            grade: 48,
            feedback: "Excellent precision on trigonometric resolution. Minus 2 points for missing unit on step 3.",
          }),
        }
      );
      let gradeHwData = await gradeHwRes.json();

      recordTest(
        "Flow 4",
        "TUITION-HOMEWORK-GRADE",
        "Batch Homework: Teacher Grades Submission with Feedback",
        gradeHwRes.status === 200 && gradeHwData?.success === true,
        { status: gradeHwRes.status },
        gradeHwRes.status !== 200 ? gradeHwData?.message : undefined
      );
    }

    // 4.6 Past Classes & 1-Year Recordings Tab
    let recordingsRes = await fetch(`${BASE_URL}/api/tuition/programs/${createdProgram._id}/recordings`, {
      headers: studentAuthHeader,
    });
    let recordingsData = await recordingsRes.json();
    recordTest(
      "Flow 4",
      "TUITION-RECORDINGS-GET",
      "Past Classes & 1-Year Recordings Tab (/api/tuition/programs/:id/recordings)",
      recordingsRes.status === 200 && Array.isArray(recordingsData?.recordings),
      { status: recordingsRes.status, count: recordingsData?.recordings?.length },
      recordingsRes.status !== 200 ? recordingsData?.message : undefined
    );

    // 4.7 Teacher Tuition Earnings (/api/tuition/teacher/payouts)
    let earningsRes = await fetch(`${BASE_URL}/api/tuition/teacher/payouts`, {
      headers: teacherAuthHeader,
    });
    let earningsData = await earningsRes.json();
    recordTest(
      "Flow 4",
      "TUITION-EARNINGS-GET",
      "Teacher Tuition Earnings View (/api/tuition/teacher/payouts)",
      earningsRes.status === 200 && earningsData?.success === true && Array.isArray(earningsData?.payouts),
      {
        status: earningsRes.status,
        totalEarned: earningsData?.totalEarned,
        pendingAmount: earningsData?.pendingAmount,
        payoutsCount: earningsData?.payouts?.length,
      },
      earningsRes.status !== 200 ? earningsData?.message : undefined
    );

    // ========================================================
    // FLOW 5: LIVE CLASSROOM, CHAT, SMARTBOARD & IN-MEETING QUIZZES
    // ========================================================
    console.log("\n--- EXECUTING FLOW 5: LIVE CLASSROOM & IN-MEETING REAL-TIME SUITE ---");

    // 5.1 Student Early Join Waiting Room Check
    const uniqueSessionTitle = `Physics Special Live ${uniqueTimestamp}`;
    let unstartedSessionRes = await fetch(`${BASE_URL}/api/live-classes/${createdProgram._id}`, {
      headers: studentAuthHeader,
    });
    let unstartedSessionData = await unstartedSessionRes.json();
    recordTest(
      "Flow 5",
      "CLASSROOM-WAITING-ROOM",
      "Student Early Join Waiting Room Signal (isWaiting = true)",
      unstartedSessionData?.isWaiting === true,
      { status: unstartedSessionRes.status, isWaiting: unstartedSessionData?.isWaiting },
      unstartedSessionData?.isWaiting !== true
        ? "Expected waiting room signal isWaiting: true"
        : undefined
    );

    // 5.2 Teacher Starts Live Session
    let createLiveRes = await fetch(`${BASE_URL}/api/live-classes`, {
      method: "POST",
      headers: teacherAuthHeader,
      body: JSON.stringify({
        title: uniqueSessionTitle,
        sessionType: "tuition",
        tuitionSessionId: createdProgram._id,
        batchId: createdProgram._id,
        authorizedStudentIds: [studentUser._id],
      }),
    });
    let createLiveData = await createLiveRes.json();
    const activeLiveSession = createLiveData?.session;
    const canonicalLiveSessionId = activeLiveSession?._id?.toString();

    recordTest(
      "Flow 5",
      "CLASSROOM-START-SESSION",
      "Teacher Initializes & Launches Live Classroom Session",
      createLiveRes.status === 201 && !!canonicalLiveSessionId,
      { status: createLiveRes.status, sessionId: canonicalLiveSessionId },
      createLiveRes.status !== 201 ? createLiveData?.message : undefined
    );

    // 5.3 WebSocket Real-time Handshake: Teacher joins with Program Code, Student joins with Session ID
    let wsTeacher: WebSocket | null = null;
    let wsStudent: WebSocket | null = null;

    try {
      wsTeacher = new WebSocket(
        `ws://localhost:${PORT}/ws/classroom?token=${teacherToken}&sessionId=${createdProgram.code}`
      );

      let teacherCanonicalId = "";
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Teacher WS connect timeout")), 5000);
        wsTeacher!.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "room-state") {
            teacherCanonicalId = msg.sessionId;
            clearTimeout(timeout);
            resolve();
          }
        });
        wsTeacher!.on("error", reject);
      });

      wsStudent = new WebSocket(
        `ws://localhost:${PORT}/ws/classroom?token=${studentToken}&sessionId=${canonicalLiveSessionId}`
      );

      let studentJoinedSameRoom = false;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Student WS connect timeout")), 5000);
        wsStudent!.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "room-state") {
            studentJoinedSameRoom = msg.sessionId === teacherCanonicalId;
            clearTimeout(timeout);
            resolve();
          }
        });
        wsStudent!.on("error", reject);
      });

      recordTest(
        "Flow 5",
        "CLASSROOM-WS-CANONICAL-MATCH",
        "Teacher (Program Code) & Student (Session ID) Converge on Canonical Room",
        teacherCanonicalId === canonicalLiveSessionId && studentJoinedSameRoom,
        { teacherCanonicalId, canonicalLiveSessionId, studentJoinedSameRoom }
      );

      // 5.4 Real-time Chat Exchange
      const chatReceivePromise = new Promise<any>((resolve) => {
        wsStudent!.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "chat-message" && msg.text.includes("Diagnostic Test Message")) {
            resolve(msg);
          }
        });
      });

      wsTeacher.send(
        JSON.stringify({
          type: "chat-message",
          text: "Diagnostic Test Message: Welcome to the live derivation session.",
        })
      );

      const receivedChat = await chatReceivePromise;
      recordTest(
        "Flow 5",
        "CLASSROOM-CHAT-EXCHANGE",
        "Real-Time Chat Broadcast & Role Attribution (host)",
        receivedChat?.senderRole === "host" && receivedChat?.text?.includes("Diagnostic Test Message"),
        { text: receivedChat?.text, senderRole: receivedChat?.senderRole, senderName: receivedChat?.senderName }
      );

      // Verify MongoDB persistence of chat message (allow async MongoDB write over network)
      let sessionInDb = await LiveClassSession.findById(canonicalLiveSessionId);
      for (let attempt = 0; attempt < 5 && (!sessionInDb?.chatMessages || sessionInDb.chatMessages.length === 0); attempt++) {
        await new Promise((r) => setTimeout(r, 400));
        sessionInDb = await LiveClassSession.findById(canonicalLiveSessionId);
      }
      const isChatPersisted = sessionInDb?.chatMessages?.some((m: any) =>
        m.text.includes("Diagnostic Test Message")
      );
      recordTest(
        "Flow 5",
        "CLASSROOM-CHAT-COMPLIANCE-DB",
        "Chat Persisted in MongoDB for 1-Year Compliance",
        !!isChatPersisted,
        { chatMessagesCount: sessionInDb?.chatMessages?.length }
      );

      // 5.5 SmartBoard Stroke Synchronization
      const drawPromise = new Promise<any>((resolve) => {
        wsStudent!.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "whiteboard:draw" || msg.type === "whiteboard-draw") {
            resolve(msg);
          }
        });
      });

      const strokeElement = {
        id: "stroke-diag-1",
        type: "pen",
        points: [{ x: 10, y: 20 }, { x: 30, y: 50 }],
        color: "#8B5CF6",
        strokeWidth: 3,
      };

      wsTeacher.send(
        JSON.stringify({
          type: "whiteboard:draw",
          element: strokeElement,
        })
      );

      const receivedDraw = await drawPromise;
      recordTest(
        "Flow 5",
        "CLASSROOM-SMARTBOARD-SYNC",
        "SmartBoard Real-Time Stroke Synchronization (whiteboard:draw)",
        receivedDraw?.element?.id === strokeElement.id,
        { receivedElementId: receivedDraw?.element?.id }
      );

      // 5.6 In-Meeting Assessment Publishing & Answer Key Sanitization
      const quizPublishPromise = new Promise<any>((resolve) => {
        wsStudent!.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "assessment:published") {
            resolve(msg.assessment);
          }
        });
      });

      wsTeacher.send(
        JSON.stringify({
          type: "assessment:publish",
          assessment: {
            title: "Rotational Dynamics Quiz",
            instructions: "Select the correct moment of inertia expression",
            timeLimitMinutes: 5,
            totalPoints: 10,
            questions: [
              {
                id: "q_rot_1",
                question: "Moment of inertia of a solid cylinder of radius R and mass M about its axis is:",
                options: ["1/2 MR²", "MR²", "2/5 MR²", "2/3 MR²"],
                correctOptionIndex: 0,
                points: 10,
              },
            ],
          },
        })
      );

      const receivedQuiz = await quizPublishPromise;
      const isAnswerSanitized = receivedQuiz?.questions?.[0]?.correctOptionIndex === undefined;

      recordTest(
        "Flow 5",
        "CLASSROOM-QUIZ-PUBLISH-SANITIZE",
        "In-Meeting Quiz Published & Answers Sanitized for Student",
        !!receivedQuiz?._id && isAnswerSanitized,
        {
          quizId: receivedQuiz?._id,
          title: receivedQuiz?.title,
          isAnswerSanitized,
        }
      );

      // 5.7 Student Answer Submission & Instant Auto-Grading
      const gradedPromise = new Promise<any>((resolve) => {
        wsStudent!.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "assessment:graded") {
            resolve(msg.submission);
          }
        });
      });

      const leaderboardPromise = new Promise<any>((resolve) => {
        wsTeacher!.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "assessment:results") {
            resolve(msg);
          }
        });
      });

      wsStudent.send(
        JSON.stringify({
          type: "assessment:submit",
          assessmentId: receivedQuiz._id,
          answers: [{ questionId: "q_rot_1", selectedOptionIndex: 0 }],
        })
      );

      const gradedResult = await gradedPromise;
      const leaderboardResult = await leaderboardPromise;

      recordTest(
        "Flow 5",
        "CLASSROOM-QUIZ-AUTOGRADE",
        "Student In-Meeting Quiz Auto-Grading (100% Score)",
        gradedResult?.score === 10 && gradedResult?.percentage === 100,
        { score: gradedResult?.score, totalPossible: gradedResult?.totalPossible, percentage: gradedResult?.percentage }
      );

      recordTest(
        "Flow 5",
        "CLASSROOM-QUIZ-LEADERBOARD",
        "Teacher Receives Live Leaderboard Update via WebSocket",
        leaderboardResult?.totalSubmissions >= 1,
        { totalSubmissions: leaderboardResult?.totalSubmissions }
      );

      // 5.8 Teacher Ends Session & Post-Class Attendance Logging
      let endSessionRes = await fetch(`${BASE_URL}/api/live-classes/${canonicalLiveSessionId}/end`, {
        method: "POST",
        headers: teacherAuthHeader,
      });
      let endSessionData = await endSessionRes.json();
      const endedLiveSession = await LiveClassSession.findById(canonicalLiveSessionId);

      recordTest(
        "Flow 5",
        "CLASSROOM-END-ATTENDANCE",
        "End Session & Persist Post-Class Attendance / Duration Logs",
        endSessionRes.status === 200 &&
          endedLiveSession?.status === "ended" &&
          Array.isArray(endedLiveSession?.attendanceLogs),
        {
          status: endSessionRes.status,
          sessionStatus: endedLiveSession?.status,
          attendanceLogsCount: endedLiveSession?.attendanceLogs?.length,
          totalDurationMinutes: endedLiveSession?.totalDurationMinutes,
        },
        endSessionRes.status !== 200 ? endSessionData?.message : undefined
      );
    } finally {
      try { wsTeacher?.terminate(); } catch {}
      try { wsStudent?.terminate(); } catch {}
    }

  } catch (err: any) {
    console.error("FATAL SUITE EXECUTION ERROR:", err);
  } finally {
    await new Promise<void>((res) => httpServer.close(() => res()));
    await mongoose.disconnect();
  }

  // Print Summary
  console.log("\n========================================================");
  console.log("DIAGNOSTIC TEST SUITE EXECUTION COMPLETED");
  console.log("========================================================");
  const total = report.length;
  const passed = report.filter((r) => r.passed).length;
  const failed = report.filter((r) => !r.passed).length;
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${failed}`);

  if (failed > 0) {
    console.log("\nFAILED TESTS SUMMARY:");
    report.filter((r) => !r.passed).forEach((f) => {
      console.log(`- [${f.flow}] ${f.id}: ${f.name} => ${f.error || JSON.stringify(f.details)}`);
    });
  }
}

runDiagnosticSuite().catch((err) => {
  console.error("Runner crash:", err);
  process.exit(1);
});
