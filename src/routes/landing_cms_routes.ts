import { Router } from "express";
import landingCmsController from "../controllers/landing_cms_controller";
import { authenticateUser } from "../middlewares/auth_middleware";

const router = Router();

// Public: GET /api/public/landing-content
router.get("/landing-content", landingCmsController.getPublicLandingContent);

// Admin-protected: PUT /api/admin/landing-content
router.put("/landing-content", authenticateUser, landingCmsController.updateAdminLandingContent);

// Admin-protected: POST /api/admin/landing-content/reset
router.post("/landing-content/reset", authenticateUser, landingCmsController.resetLandingContent);

export default router;
