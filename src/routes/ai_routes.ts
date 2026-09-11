import { Router } from "express";
import { handleAIChatController } from "../controllers/ai_controller";
import { optionalAuthenticateStudent } from "../middlewares/auth_middleware";

const router = Router();

// AI Chat Assistant endpoint (supports optional authenticated student profile)
router.post("/chat", optionalAuthenticateStudent, handleAIChatController);

export default router;
