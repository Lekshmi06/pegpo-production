import { Router } from "express";
import adminEdupyeController from "../controllers/admin_edupye_controller";
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

export default router;
