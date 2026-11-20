import { Request, Response } from "express";
import * as liveClassService from "../services/live_class_service";
import { getWebRTCConfiguration } from "../config/webrtc_config";

/**
 * POST /api/live-classes
 * Creates and starts a new live classroom session.
 */
export async function createLiveClass(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const session = await liveClassService.createLiveSession(userId, req.body);
    const rtcConfig = getWebRTCConfiguration();

    res.status(201).json({
      success: true,
      session,
      rtcConfig,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || "Failed to create live class" });
  }
}

/**
 * GET /api/live-classes/:sessionId
 * Retrieves live class details and ICE server config.
 */
export async function getLiveClassDetails(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const sessionId = String(req.params.sessionId);
    const access = await liveClassService.verifySessionAccess(sessionId, userId, true);
    if (!access.authorized || (!access.session && !access.isWaiting)) {
      res.status(403).json({ success: false, error: access.error || "Access denied" });
      return;
    }

    const rtcConfig = getWebRTCConfiguration();

    if (access.isWaiting) {
      res.status(200).json({
        success: true,
        isWaiting: true,
        message: "Waiting for instructor to start session",
        rtcConfig,
      });
      return;
    }

    res.json({
      success: true,
      session: access.session,
      rtcConfig,
    });
  } catch (err: any) {
    res.status(403).json({ success: false, error: err.message || "Access denied" });
  }
}

/**
 * POST /api/live-classes/:sessionId/end
 * Terminates a live classroom session (Host only).
 */
export async function endLiveClass(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const sessionId = String(req.params.sessionId);
    const session = await liveClassService.endLiveSession(sessionId, userId);

    res.json({
      success: true,
      message: "Live class ended successfully",
      session,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || "Failed to end class" });
  }
}

/**
 * GET /api/live-classes/config/ice
 * Public/authenticated endpoint to fetch ICE servers (STUN/TURN).
 */
export async function getIceConfig(req: Request, res: Response): Promise<void> {
  try {
    const rtcConfig = getWebRTCConfiguration();
    res.json({
      success: true,
      rtcConfig,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Failed to retrieve ICE config" });
  }
}
