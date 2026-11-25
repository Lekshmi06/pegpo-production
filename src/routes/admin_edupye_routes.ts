import { Router } from "express";
import adminEdupyeController from "../controllers/admin_edupye_controller";
import academyController from "../controllers/academy_controller";
import contentController from "../controllers/content_controller";
import { authenticateUser, requireTuitionPlatformAdmin } from "../middlewares/auth_middleware";

const router = Router();

// Platform Overview Analytics (Dashboard / Module 1)
router.get("/edupye-analytics", adminEdupyeController.getEdupyeAnalytics);

// EduPye Financials, Sales & Revenue (Accounting / Module 3)
router.get("/edupye-accounts", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.getEdupyeAccounts);

// CMS Content Management (Module 5 / CMS)
router.put("/content/:key", authenticateUser, requireTuitionPlatformAdmin, contentController.updateContentByKey);

// Module 33: Tuition Operations Hub - Teachers
router.get("/tuition/teachers", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.getTuitionTeachers);
router.patch("/tuition/teachers/:id/verify", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.verifyTeacher);
router.patch("/tuition/teachers/:id/interview", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.scheduleTeacherInterview);
router.patch("/tuition/teachers/:id/accept", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.acceptTeacher);
router.patch("/tuition/teachers/:id/reject", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.rejectTeacher);

// Module 33: Tuition Operations Hub - Students
router.get("/tuition/students", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.getTuitionStudents);
router.post("/tuition/students", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.createTuitionStudent);
router.patch("/tuition/students/:id/approve", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.approveStudent);

// Module 33: User Access Controls (Revoke, Restore, Delete)
router.patch("/tuition/users/:id/revoke", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.revokeTuitionUser);
router.patch("/tuition/users/:id/restore", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.restoreTuitionUser);
router.delete("/tuition/users/:id", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.deleteTuitionUser);

// Module 33: Tuition Programs & Student-Teacher Pairing
router.get("/tuition/programs", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.getPrograms);
router.post("/tuition/programs", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.createProgram);
router.put("/tuition/programs/:id", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.updateProgram);
router.delete("/tuition/programs/:id", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.deleteProgram);
router.post("/tuition/programs/:id/teachers", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.assignTeachersToProgram);
router.delete("/tuition/programs/:id/teachers/:teacherId", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.removeTeacherFromProgram);
router.post("/tuition/programs/:id/students", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.enrollStudentsInProgram);
router.delete("/tuition/programs/:id/students/:studentId", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.removeStudentFromProgram);
router.put("/tuition/programs/:id/roster", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.updateProgramRoster);

// Module 33: Teacher Payouts
router.get("/tuition/payouts", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.getPayouts);
router.post("/tuition/payouts/:id/approve", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.approvePayout);

// Module 33: Compliance Vault (Recordings & Chat Archive)
router.get("/tuition/recordings", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.getComplianceVault);

// Module 33: Complaints & Grievance Tickets
router.get("/tuition/complaints", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.getComplaints);
router.patch("/tuition/complaints/:id", authenticateUser, requireTuitionPlatformAdmin, adminEdupyeController.updateComplaint);

// ========================================================
// EduPye Academy: Tuition Fees, Attendance & Dashboard KPIs
// ========================================================
router.get("/academy/fees/structures", authenticateUser, requireTuitionPlatformAdmin, academyController.getFeeStructures);
router.post("/academy/fees/structures", authenticateUser, requireTuitionPlatformAdmin, academyController.createFeeStructure);
router.get("/academy/fees/payments", authenticateUser, requireTuitionPlatformAdmin, academyController.getFeePayments);
router.post("/academy/fees/payments", authenticateUser, requireTuitionPlatformAdmin, academyController.collectFeePayment);
router.post("/academy/fees/collect", authenticateUser, requireTuitionPlatformAdmin, academyController.collectFeePayment);
router.get("/academy/fees/defaulters", authenticateUser, requireTuitionPlatformAdmin, academyController.getFeeDefaulters);
router.get("/academy/dashboard-kpis", authenticateUser, requireTuitionPlatformAdmin, academyController.getDashboardKpis);

// EduPye Academy: Attendance (1-on-1 Personal Tuition & 1-to-N Group Batches)
router.get("/academy/attendance", authenticateUser, requireTuitionPlatformAdmin, academyController.getAttendance);
router.post("/academy/attendance", authenticateUser, requireTuitionPlatformAdmin, academyController.saveAttendance);
router.get("/academy/attendance/report", authenticateUser, requireTuitionPlatformAdmin, academyController.getAttendanceReport);

// EduPye Academy: Assessments, Marks & Student Progress
router.get("/academy/exams/student-progress", authenticateUser, requireTuitionPlatformAdmin, academyController.getStudentProgress);
router.get("/academy/exams", authenticateUser, requireTuitionPlatformAdmin, academyController.getExams);
router.post("/academy/exams", authenticateUser, requireTuitionPlatformAdmin, academyController.createExam);
router.post("/academy/exams/:id/marks", authenticateUser, requireTuitionPlatformAdmin, academyController.saveExamMarks);

// EduPye Academy: Tutor Payroll (Session-based & Retainer)
router.get("/academy/payroll/calculate", authenticateUser, requireTuitionPlatformAdmin, academyController.calculatePayrollForMonth);
router.get("/academy/payroll", authenticateUser, requireTuitionPlatformAdmin, academyController.getPayouts);
router.post("/academy/payroll", authenticateUser, requireTuitionPlatformAdmin, academyController.saveTutorPayout);
router.patch("/academy/payroll/:id/pay", authenticateUser, requireTuitionPlatformAdmin, academyController.payTutorPayout);

// EduPye Academy: Center Expenses & Finance Summary (P&L)
router.get("/academy/expenses", authenticateUser, requireTuitionPlatformAdmin, academyController.getExpenses);
router.post("/academy/expenses", authenticateUser, requireTuitionPlatformAdmin, academyController.createExpense);
router.get("/academy/finance/summary", authenticateUser, requireTuitionPlatformAdmin, academyController.getFinanceSummary);

// EduPye Academy: Batch & Center Notices
router.get("/academy/notices", authenticateUser, requireTuitionPlatformAdmin, academyController.getNotices);
router.post("/academy/notices", authenticateUser, requireTuitionPlatformAdmin, academyController.createNotice);
router.delete("/academy/notices/:id", authenticateUser, requireTuitionPlatformAdmin, academyController.deleteNotice);

// EduPye Academy: Admission Enquiries / Leads
router.get("/academy/enquiries", authenticateUser, requireTuitionPlatformAdmin, academyController.getEnquiries);
router.post("/academy/enquiries", authenticateUser, requireTuitionPlatformAdmin, academyController.createEnquiry);
router.patch("/academy/enquiries/:id/status", authenticateUser, requireTuitionPlatformAdmin, academyController.updateEnquiryStatus);

export default router;
