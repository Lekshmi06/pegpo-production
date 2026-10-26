import { Router } from "express";
import {
  registerController,
  loginController,
  meController,
  selectRoleController,
  googleAuthController,
  mockGoogleAuthController,
  getMockAccountsController,
} from "../controllers/auth_controller";

const router = Router();

router.post("/register", registerController);
router.post("/login", loginController);
router.post("/google", googleAuthController);
router.post("/mock-google", mockGoogleAuthController);
router.get("/mock-accounts", getMockAccountsController);
router.get("/me", meController);
router.post("/select-role", selectRoleController);

export default router;
