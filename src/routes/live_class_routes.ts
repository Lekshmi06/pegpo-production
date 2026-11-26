import { Router } from "express";
import { authenticateUser, optionalAuthenticateUser } from "../middlewares/auth_middleware";
import * as liveClassCtrl from "../controllers/live_class_controller";

const router = Router();

// Retrieve ICE servers (STUN/TURN)
router.get("/config/ice", liveClassCtrl.getIceConfig);

// Verify Demo Trial Session Token (Public / No-auth required)
router.get("/demo/verify/:token", liveClassCtrl.verifyDemoToken);

// Create / Start live class (Teacher, Tuition Provider, Institution)
router.post("/", authenticateUser, liveClassCtrl.createLiveClass);

// Get live class session details and verify authorization (optional auth allows public demo rooms)
router.get("/:sessionId", optionalAuthenticateUser, liveClassCtrl.getLiveClassDetails);
router.get("/details/:sessionId", optionalAuthenticateUser, liveClassCtrl.getLiveClassDetails);

// Terminate live class (Host only)
router.post("/:sessionId/end", authenticateUser, liveClassCtrl.endLiveClass);

export default router;

