import { Router } from "express";
import adminPlatformController from "../controllers/admin_platform_controller";
import { requireAdminAuth } from "../middlewares/admin_module_middleware";

const router = Router();

// Aggregated Platform Stats
router.get("/stats", requireAdminAuth, adminPlatformController.getPlatformStats);

// Candidates
router.get("/candidates", requireAdminAuth, adminPlatformController.getCandidates);
router.get("/candidates/stats", requireAdminAuth, adminPlatformController.getCandidateStats);
router.patch("/candidates/:id/status", requireAdminAuth, adminPlatformController.updateCandidateStatus);
router.put("/candidates/:id", requireAdminAuth, adminPlatformController.updateCandidateStatus);
router.delete("/candidates/:id", requireAdminAuth, adminPlatformController.deleteCandidate);

// Startups
router.get("/startups", requireAdminAuth, adminPlatformController.getStartups);
router.get("/startups/stats", requireAdminAuth, adminPlatformController.getStartupStats);
router.patch("/startups/:id/status", requireAdminAuth, adminPlatformController.updateStartupStatus);
router.put("/startups/:id", requireAdminAuth, adminPlatformController.updateStartupStatus);
router.delete("/startups/:id", requireAdminAuth, adminPlatformController.deleteStartup);

// Companies
router.get("/companies", requireAdminAuth, adminPlatformController.getCompanies);
router.get("/companies/stats", requireAdminAuth, adminPlatformController.getCompanyStats);
router.patch("/companies/:id/status", requireAdminAuth, adminPlatformController.updateCompanyStatus);
router.put("/companies/:id", requireAdminAuth, adminPlatformController.updateCompanyStatus);
router.delete("/companies/:id", requireAdminAuth, adminPlatformController.deleteCompany);

// Institutions
router.get("/institutions", requireAdminAuth, adminPlatformController.getInstitutions);
router.get("/institutions/stats", requireAdminAuth, adminPlatformController.getInstitutionStats);
router.patch("/institutions/:id/status", requireAdminAuth, adminPlatformController.updateInstitutionStatus);
router.put("/institutions/:id", requireAdminAuth, adminPlatformController.updateInstitutionStatus);
router.delete("/institutions/:id", requireAdminAuth, adminPlatformController.deleteInstitution);

export default router;

