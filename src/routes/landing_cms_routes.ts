import { Router, Request, Response, NextFunction } from "express";
import landingCmsController from "../controllers/landing_cms_controller";
import { authenticateUser } from "../middlewares/auth_middleware";
import { verifyAuth } from "../middlewares/admin_module_middleware";

const router = Router();

/**
 * Flexible admin authentication middleware:
 * Validates either standard Core session tokens or ERP Admin tokens.
 */
const authenticateAnyAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user) {
    next();
    return;
  }

  authenticateUser(req, res, (err) => {
    if (!err && req.user) {
      next();
      return;
    }
    verifyAuth(req, res, next);
  });
};

// Public & Admin GET: /api/public/landing-content, /api/admin/landing-content
router.get("/landing-content", landingCmsController.getPublicLandingContent);
router.get("/landing-page", landingCmsController.getPublicLandingContent);

// Admin-protected: PUT /api/admin/landing-content
router.put("/landing-content", authenticateAnyAdmin, landingCmsController.updateAdminLandingContent);
router.put("/landing-page", authenticateAnyAdmin, landingCmsController.updateAdminLandingContent);

// Admin-protected: POST /api/admin/landing-content/reset
router.post("/landing-content/reset", authenticateAnyAdmin, landingCmsController.resetLandingContent);

export default router;
