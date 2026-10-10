import { Router } from "express";
import {
  registerController,
  loginController,
  meController,
  selectRoleController,
} from "../controllers/auth_controller";

const router = Router();

router.post("/register", registerController);
router.post("/login", loginController);
router.get("/me", meController);
router.post("/select-role", selectRoleController);

export default router;
