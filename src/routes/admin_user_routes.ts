import { Router } from "express";
import adminUserController from "../controllers/admin_user_controller";
import { requireAdminOrSuperAdmin } from "../middlewares/admin_module_middleware";

const router = Router();

router.get("/", requireAdminOrSuperAdmin, adminUserController.getUsers);
router.get("/stats", requireAdminOrSuperAdmin, adminUserController.getUserStats);
router.post("/", requireAdminOrSuperAdmin, adminUserController.createUser);
router.put("/:id", requireAdminOrSuperAdmin, adminUserController.updateUser);
router.post("/:id/reset-password", requireAdminOrSuperAdmin, adminUserController.resetPassword);
router.patch("/:id/status", requireAdminOrSuperAdmin, adminUserController.toggleStatus);
router.delete("/:id", requireAdminOrSuperAdmin, adminUserController.deleteUser);

export default router;

