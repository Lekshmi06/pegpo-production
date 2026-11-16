import { Router } from "express";
import {
  registerController,
  loginController,
  meController,
  selectRoleController,
  switchRoleController,
  activateRoleController,
  googleAuthController,
  mockGoogleAuthController,
  getMockAccountsController,
} from "../controllers/auth_controller";
import { authenticateUser } from "../middlewares/auth_middleware";

const router = Router();

router.post("/register", registerController);
router.post("/login", loginController);
router.post("/google", googleAuthController);
router.post("/mock-google", mockGoogleAuthController);
router.get("/mock-accounts", getMockAccountsController);
router.get("/me", meController);
router.post("/select-role", selectRoleController);
router.post("/switch-role", authenticateUser, switchRoleController);
router.post("/activate-role", authenticateUser, activateRoleController);

export default router;
