import { Router } from "express";
import {
  authenticateUser,
  optionalAuthenticateUser,
  authenticateInstitutionMember,
  requireInstitutionAdmin,
  requireInstitutionManagement,
  requireInstitutionStaff,
  requireInstitutionPermission,
} from "../middlewares/auth_middleware";
import * as institutionCtrl from "../controllers/institution_controller";
import * as corporateCtrl from "../controllers/corporate_training_controller";

const router = Router();

// Invitation Lookup & Acceptance (Public/User scoped)
router.get("/invitation-info/:code", optionalAuthenticateUser, institutionCtrl.getInvitationInfo);
router.post("/join", authenticateUser, institutionCtrl.acceptInvitation);

// Institution Creation & Personal Membership List
router.post("/", authenticateUser, institutionCtrl.createInstitution);
router.get("/my", authenticateUser, institutionCtrl.getMyInstitutions);

// Institution Details & Administration
router.get("/:id", authenticateInstitutionMember(), institutionCtrl.getInstitution);
router.put("/:id", requireInstitutionAdmin, institutionCtrl.updateInstitution);
router.get("/:id/dashboard", requireInstitutionManagement, institutionCtrl.getDashboardMetrics);
router.get("/:id/corporate-dashboard", requireInstitutionManagement, corporateCtrl.getCompanyDashboard);

// Member / Employee Management
router.get("/:id/members", requireInstitutionStaff, institutionCtrl.getMembers);
router.get("/:id/members/:memberId", authenticateInstitutionMember(), institutionCtrl.getMember);
router.post("/:id/members", requireInstitutionPermission(["invite_members", "invite_employees"]), institutionCtrl.addMember);
router.put("/:id/members/:memberId", requireInstitutionPermission(["manage_members", "manage_employees"]), institutionCtrl.updateMember);
router.delete("/:id/members/:memberId", requireInstitutionPermission(["manage_members", "manage_employees"]), institutionCtrl.removeMember);

// Corporate Departments & Teams
router.get("/:id/departments", authenticateInstitutionMember(), corporateCtrl.getDepartments);
router.post("/:id/departments", requireInstitutionManagement, corporateCtrl.createDepartment);
router.put("/:id/departments/:departmentId", requireInstitutionManagement, corporateCtrl.updateDepartment);
router.delete("/:id/departments/:departmentId", requireInstitutionManagement, corporateCtrl.deleteDepartment);

// Corporate Training Programs
router.get("/:id/programs", authenticateInstitutionMember(), corporateCtrl.getTrainingPrograms);
router.get("/:id/programs/:programId", authenticateInstitutionMember(), corporateCtrl.getTrainingProgram);
router.post("/:id/programs", requireInstitutionPermission(["create_programs", "manage_programs"]), corporateCtrl.createTrainingProgram);
router.put("/:id/programs/:programId", requireInstitutionPermission(["create_programs", "manage_programs"]), corporateCtrl.updateTrainingProgram);
router.delete("/:id/programs/:programId", requireInstitutionAdmin, corporateCtrl.deleteTrainingProgram);
router.post("/:id/programs/:programId/assign", requireInstitutionPermission(["assign_training", "manage_programs"]), corporateCtrl.assignProgram);

// Employee Training Progress
router.get("/:id/employees/:userId/progress", authenticateInstitutionMember(), corporateCtrl.getEmployeeProgress);

export default router;
