import { Router } from "express";
import { authenticateUser } from "../middlewares/auth_middleware";
import * as liveClassCtrl from "../controllers/live_class_controller";

const router = Router();

// Retrieve ICE servers (STUN/TURN)
router.get("/config/ice", liveClassCtrl.getIceConfig);

// Create / Start live class (Teacher, Tuition Provider, Institution)
router.post("/", authenticateUser, liveClassCtrl.createLiveClass);

// Get live class session details and verify authorization
router.get("/:sessionId", authenticateUser, liveClassCtrl.getLiveClassDetails);
router.get("/details/:sessionId", authenticateUser, liveClassCtrl.getLiveClassDetails);

// Terminate live class (Host only)
router.post("/:sessionId/end", authenticateUser, liveClassCtrl.endLiveClass);

export default router;

