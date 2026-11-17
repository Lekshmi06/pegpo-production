import { Router } from "express";
import {
  authenticateUser,
  authenticateTuitionProvider,
  requireTuitionPlatformAdmin,
} from "../middlewares/auth_middleware";
import * as marketplaceController from "../controllers/tuition_marketplace_controller";
import * as providerController from "../controllers/tuition_provider_controller";
import * as requestController from "../controllers/tuition_request_controller";
import * as studentController from "../controllers/tuition_student_controller";
import * as reviewController from "../controllers/tuition_review_controller";
import * as adminController from "../controllers/tuition_admin_controller";
import * as programController from "../controllers/tuition_program_controller";
import { combinedStudyUpload } from "../config/combined_study_upload";
import { getStudentSchedule } from "../services/tuition_schedule_service";

const router = Router();

// ==========================================
// 0. TUITION AUTH & CODE-LOGIN (PUBLIC)
// ==========================================
router.post("/auth/code-login", programController.codeLogin);

// ==========================================
// 1. PUBLIC MARKETPLACE & REVIEWS (DEPRECATED)
// ==========================================
router.get("/marketplace", marketplaceController.searchProviders);
router.get("/marketplace/offerings", marketplaceController.searchOfferings);
router.get("/marketplace/offerings/:id", marketplaceController.getOfferingPublicDetails);
router.get("/marketplace/providers/:id", marketplaceController.getProviderPublicProfile);
router.get("/reviews/provider/:providerId", reviewController.getProviderReviews);

// ==========================================
// 2. TUITION ONBOARDING (ANY LOGGED IN USER)
// ==========================================
router.get("/provider/me", authenticateUser, providerController.getMyProfile);
router.post("/provider/onboarding", authenticateUser, providerController.submitOnboarding);

// ==========================================
// 3. STUDENT WORKFLOW & PORTAL (AUTHENTICATED)
// ==========================================
router.get("/requests/eligibility", authenticateUser, requestController.checkTrialEligibility);
router.post("/requests/program-access", authenticateUser, programController.requestProgramAccess);
router.post("/requests", authenticateUser, requestController.createTuitionRequest);
router.post("/requests/:requestId/trial-feedback", authenticateUser, requestController.submitTrialFeedback);
router.post("/requests/:requestId/select-teacher", authenticateUser, requestController.selectPreferredTeacher);
router.patch("/requests/:requestId/cancel", authenticateUser, requestController.cancelTuitionRequest);
router.post("/payments/verify", authenticateUser, requestController.settleTuitionPayment);
router.patch("/enrollments/:enrollmentId/cancel", authenticateUser, requestController.cancelTuitionEnrollment);
router.get("/student/overview", authenticateUser, studentController.getStudentOverview);
router.get("/student/enrollments", authenticateUser, studentController.getMyEnrollments);
router.get("/student/requests", authenticateUser, studentController.getMyRequests);
router.get("/student/schedule", authenticateUser, async (req, res) => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const { start, end } = req.query;
    const sessions = await getStudentSchedule(
      studentId,
      start ? new Date(start as string) : undefined,
      end ? new Date(end as string) : undefined
    );
    res.status(200).json({ success: true, sessions });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.get("/student/materials", authenticateUser, studentController.getMyMaterials);
router.get("/student/assessments", authenticateUser, studentController.getMyAssessments);
router.post("/student/assessments/:assessmentId/submit", authenticateUser, studentController.submitAssessment);
router.get("/student/payments", authenticateUser, studentController.getMyPayments);
router.post("/reviews", authenticateUser, reviewController.createReview);

// ==========================================
// 4. VERIFIED TUITION PROVIDER STUDIO
// ==========================================
router.get("/provider/overview", authenticateTuitionProvider, providerController.getDashboardOverview);
router.get("/provider/financials", authenticateTuitionProvider, providerController.getFinancials);
router.get("/provider/payouts", authenticateTuitionProvider, providerController.getTeacherPayouts);
router.post("/provider/offerings", authenticateTuitionProvider, providerController.createOffering);
router.get("/provider/offerings", authenticateTuitionProvider, providerController.getMyOfferings);
router.get("/provider/offerings/:id", authenticateTuitionProvider, providerController.getOfferingDetails);
router.put("/provider/offerings/:id", authenticateTuitionProvider, providerController.updateOffering);
router.delete("/provider/offerings/:id", authenticateTuitionProvider, providerController.deleteOffering);
router.post("/provider/batches", authenticateTuitionProvider, providerController.createBatch);
router.get("/provider/batches", authenticateTuitionProvider, providerController.getMyBatches);
router.get("/provider/batches/:id", authenticateTuitionProvider, providerController.getBatchDetails);
router.put("/provider/batches/:id", authenticateTuitionProvider, providerController.updateBatch);
router.delete("/provider/batches/:id", authenticateTuitionProvider, providerController.deleteBatch);
router.get("/provider/requests", authenticateTuitionProvider, providerController.getProviderRequests);
router.patch("/provider/requests/:requestId/respond", authenticateTuitionProvider, providerController.respondToRequest);
router.get("/provider/schedule", authenticateTuitionProvider, providerController.getProviderSchedule);
router.post("/provider/sessions", authenticateTuitionProvider, providerController.createSession);
router.patch("/provider/sessions/:sessionId/status", authenticateTuitionProvider, providerController.updateSessionStatus);
router.patch("/provider/sessions/:sessionId/reschedule", authenticateTuitionProvider, providerController.rescheduleSession);
router.patch("/provider/sessions/:sessionId/cancel", authenticateTuitionProvider, providerController.cancelSession);
router.get("/provider/sessions/:sessionId/attendance", authenticateTuitionProvider, providerController.getSessionAttendance);
router.post("/provider/sessions/:sessionId/attendance", authenticateTuitionProvider, providerController.markAttendance);
router.post("/provider/materials", authenticateTuitionProvider, providerController.createMaterial);
router.post("/provider/assessments", authenticateTuitionProvider, providerController.createAssessment);

// ==========================================
// 5. ADMIN / VERIFICATION, ALLOCATIONS, PRICING, PAYOUTS & RECORDINGS
// ==========================================
router.get("/admin/verifications", authenticateUser, requireTuitionPlatformAdmin, providerController.adminGetVerifications);
router.patch("/admin/providers/:profileId/verification", authenticateUser, requireTuitionPlatformAdmin, providerController.adminVerifyProvider);
router.patch("/admin/providers/:profileId/tier", authenticateUser, requireTuitionPlatformAdmin, providerController.adminAssignTier);
router.post("/admin/providers/:profileId/recalculate-tier", authenticateUser, requireTuitionPlatformAdmin, providerController.adminRecalculateTier);

// Centralized Tuition Admin Controls
router.get("/admin/requests", authenticateUser, requireTuitionPlatformAdmin, adminController.getAdminTuitionRequests);
router.post("/admin/requests/:requestId/assign-trials", authenticateUser, requireTuitionPlatformAdmin, adminController.adminAssignTrials);
router.post("/admin/requests/:requestId/finalize-teacher", authenticateUser, requireTuitionPlatformAdmin, adminController.adminFinalizeTeacher);
router.post("/admin/requests/:requestId/approve-program-access", authenticateUser, requireTuitionPlatformAdmin, programController.approveProgramAccess);
router.get("/admin/pricing", authenticateUser, requireTuitionPlatformAdmin, adminController.getPricingRules);
router.post("/admin/pricing", authenticateUser, requireTuitionPlatformAdmin, adminController.createPricingRule);
router.put("/admin/pricing/:pricingId", authenticateUser, requireTuitionPlatformAdmin, adminController.updatePricingRule);
router.get("/admin/payouts", authenticateUser, requireTuitionPlatformAdmin, adminController.getPayouts);
router.post("/admin/payouts/:payoutId/approve", authenticateUser, requireTuitionPlatformAdmin, adminController.approvePayout);
router.post("/admin/payouts/:payoutId/disburse", authenticateUser, requireTuitionPlatformAdmin, adminController.disbursePayout);
router.get("/admin/recordings", authenticateUser, requireTuitionPlatformAdmin, adminController.getRecordingsVault);
router.get("/admin/recordings/:recordingId", authenticateUser, requireTuitionPlatformAdmin, adminController.getRecordingDetails);
router.get("/admin/sessions/:sessionId/chat-audit", authenticateUser, requireTuitionPlatformAdmin, adminController.getSessionChatLogs);
router.post("/admin/retention/purge", authenticateUser, requireTuitionPlatformAdmin, adminController.runRetentionPurge);

// ==========================================
// 6. TUITION PROGRAMS & ROSTERS
// ==========================================
router.get("/programs", authenticateUser, programController.getTuitionPrograms);
router.post("/programs", authenticateUser, programController.createTuitionProgram);
router.get("/programs/:programId/roster", authenticateUser, programController.getProgramRoster);
router.get("/teacher/enrolled-students", authenticateUser, programController.getTeacherEnrolledStudents);

// ==========================================
// 7. COMBINED STUDY (CHAT + MEDIA WITH 1-YEAR RETENTION)
// ==========================================
router.get("/programs/:programId/combined-study", authenticateUser, programController.getCombinedStudyMessages);
router.post(
  "/programs/:programId/combined-study",
  authenticateUser,
  combinedStudyUpload.single("file"),
  programController.postCombinedStudyMessage
);

export default router;
