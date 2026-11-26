import { Request, Response } from "express";
import mongoose from "mongoose";
import * as liveClassService from "../services/live_class_service";
import { getWebRTCConfiguration } from "../config/webrtc_config";
import AcademyEnquiry from "../models/AcademyEnquiry";
import LiveClassSession from "../models/LiveClassSession";
import { generateSessionToken } from "../utils/token";

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
 * GET /api/live-classes/demo/verify/:token
 * Public endpoint to validate studentToken or teacherToken and return room and guest session details.
 */
export async function verifyDemoToken(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) {
      res.status(400).json({ success: false, valid: false, message: "Demo token is required" });
      return;
    }

    const enquiry = await AcademyEnquiry.findOne({
      $or: [{ studentToken: token }, { teacherToken: token }],
    });

    if (!enquiry) {
      res.status(404).json({
        success: false,
        valid: false,
        message: "Invalid or expired demo session token. Please verify your token or contact support.",
      });
      return;
    }

    const isTeacher = enquiry.teacherToken === token;
    const role: "teacher" | "student" = isTeacher ? "teacher" : "student";
    const participantName = isTeacher
      ? (enquiry.assignedTutorName || "Demo Tutor")
      : (enquiry.studentName || "Prospective Student");

    // Auto-provision or find LiveClassSession for this demo room
    let liveSession = await LiveClassSession.findOne({
      $or: [{ title: enquiry.demoRoomId }, { tuitionSessionId: enquiry._id }],
    });

    const tutorObjectId = enquiry.assignedTutorId || new mongoose.Types.ObjectId();
    const guestUserId = isTeacher ? tutorObjectId : new mongoose.Types.ObjectId();

    if (!liveSession) {
      liveSession = await LiveClassSession.create({
        title: enquiry.demoRoomId,
        hostId: tutorObjectId,
        hostRole: "teacher",
        status: "live",
        sessionType: "smartboard_ad_hoc",
        tuitionSessionId: enquiry._id,
        authorizedStudentIds: [],
        activeParticipants: [],
        settings: { allowMicrophone: true, allowCamera: true, allowScreenShare: true, allowChat: true },
        startedAt: new Date(),
      });
    }

    // Generate signed session token for WebSocket authentication and seamless NativeLiveClassroom mounting
    const guestUserPayload = {
      _id: guestUserId,
      userId: guestUserId.toString(),
      name: participantName,
      email: isTeacher ? "tutor@edupye.demo" : (enquiry.email || "guest.student@edupye.demo"),
      role,
      activeRole: role,
      userType: role,
      teacherCode: isTeacher ? enquiry.assignedTutorCode : undefined,
      studentCode: !isTeacher ? "STU-DEMO" : undefined,
      isDemoGuest: true,
    };
    const sessionAuthToken = generateSessionToken(guestUserPayload as any);

    res.status(200).json({
      success: true,
      valid: true,
      role,
      demoRoomId: enquiry.demoRoomId,
      participantName,
      tutorName: enquiry.assignedTutorName || "Assigned Tutor",
      tutorCode: enquiry.assignedTutorCode || "TCH-DEMO",
      studentName: enquiry.studentName,
      parentName: enquiry.parentName,
      phone: enquiry.phone,
      subject: enquiry.demoSubject || enquiry.subjects?.[0] || "General Tuition",
      demoScheduledAt: enquiry.demoScheduledAt || enquiry.createdAt,
      demoStatus: enquiry.demoStatus || "scheduled",
      token,
      authToken: sessionAuthToken,
      sessionId: liveSession._id.toString(),
      enquiryId: enquiry._id,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, valid: false, message: err.message || "Failed to verify demo token" });
  }
}

/**
 * GET /api/live-classes/:sessionId
 * Retrieves live class details and ICE server config.
 */
export async function getLiveClassDetails(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = String(req.params.sessionId);
    let userId = req.user?._id?.toString();

    // Check if demo room - allow direct guest loading
    if (sessionId.startsWith("demo-")) {
      const enquiry = await AcademyEnquiry.findOne({ demoRoomId: sessionId });
      if (enquiry) {
        let liveSession = await LiveClassSession.findOne({
          $or: [{ title: sessionId }, { tuitionSessionId: enquiry._id }],
        });

        if (!liveSession) {
          liveSession = await LiveClassSession.create({
            title: sessionId,
            hostId: enquiry.assignedTutorId || new mongoose.Types.ObjectId(),
            hostRole: "teacher",
            status: "live",
            sessionType: "smartboard_ad_hoc",
            tuitionSessionId: enquiry._id,
            authorizedStudentIds: [],
            activeParticipants: [],
            settings: { allowMicrophone: true, allowCamera: true, allowScreenShare: true, allowChat: true },
            startedAt: new Date(),
          });
        }

        const rtcConfig = getWebRTCConfiguration();
        res.json({
          success: true,
          session: liveSession,
          rtcConfig,
          isDemo: true,
          enquiryDetails: {
            studentName: enquiry.studentName,
            tutorName: enquiry.assignedTutorName,
            subject: enquiry.demoSubject,
            scheduledAt: enquiry.demoScheduledAt,
          },
        });
        return;
      }
    }

    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

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
