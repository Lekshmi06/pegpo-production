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

// Member Management
router.get("/:id/members", requireInstitutionStaff, institutionCtrl.getMembers);
router.get("/:id/members/:memberId", authenticateInstitutionMember(), institutionCtrl.getMember);
router.post("/:id/members", requireInstitutionPermission("invite_members"), institutionCtrl.addMember);
router.put("/:id/members/:memberId", requireInstitutionPermission("manage_members"), institutionCtrl.updateMember);
router.delete("/:id/members/:memberId", requireInstitutionPermission("manage_members"), institutionCtrl.removeMember);

export default router;
