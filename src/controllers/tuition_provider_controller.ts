import { Request, Response } from "express";
import * as providerService from "../services/tuition_provider_service";
import * as scheduleService from "../services/tuition_schedule_service";
import * as requestService from "../services/tuition_request_service";
import * as payoutService from "../services/tuition_payout_service";
import TuitionOffering from "../models/TuitionOffering";
import TuitionBatch from "../models/TuitionBatch";
import TuitionRequest from "../models/TuitionRequest";
import TuitionMaterial from "../models/TuitionMaterial";
import TuitionAssessment from "../models/TuitionAssessment";
import TuitionSession from "../models/TuitionSession";
import TuitionAttendance from "../models/TuitionAttendance";
import TuitionProviderProfile from "../models/TuitionProviderProfile";
import AcademyEnquiry from "../models/AcademyEnquiry";
import User from "../models/User";
import { hashPassword } from "../utils/password";

export const getMyProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const profile = await providerService.getTuitionProviderProfile(userId);
    res.status(200).json({ success: true, profile });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const submitOnboarding = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const profile = await providerService.submitTuitionProviderOnboarding(userId, req.body);
    res.status(200).json({
      success: true,
      message: "Tuition provider onboarding submitted successfully",
      profile,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const adminVerifyProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    const profileId = String(req.params.profileId);
    const { status, notes, tier } = req.body;
    const adminActor = {
      id: (req.user as any)?._id?.toString(),
      name: (req.user as any)?.name || (req.user as any)?.email || "Platform Admin",
      reason: notes || `Verification status updated to ${status}`,
    };
    const profile = await providerService.adminUpdateVerificationStatus(
      profileId,
      status,
      notes,
      tier,
      adminActor
    );

    if (status === "approved" && profile?.userId) {
      const providerUser = await User.findById(profile.userId);
      if (providerUser) {
        providerUser.issuePermanentTuitionCode();
        await providerUser.save();
      }
    }

    res.status(200).json({
      success: true,
      message: `Tuition provider status updated to ${status}`,
      profile,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const adminGetVerifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as any;
    const verifications = await providerService.getTuitionVerifications(status);
    res.status(200).json({ success: true, verifications });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const adminAssignTier = async (req: Request, res: Response): Promise<void> => {
  try {
    const profileId = String(req.params.profileId);
    const { tier, reason } = req.body;
    const adminActor = {
      id: (req.user as any)?._id?.toString(),
      name: (req.user as any)?.name || (req.user as any)?.email || "Platform Admin",
      reason: reason || `Manual tier assignment: ${tier}`,
    };
    const profile = await providerService.adminAssignTier(
      profileId,
      tier,
      adminActor
    );
    res.status(200).json({
      success: true,
      message: `Tier '${tier}' assigned successfully`,
      profile,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const adminRecalculateTier = async (req: Request, res: Response): Promise<void> => {
  try {
    const profileId = String(req.params.profileId);
    const adminActor = {
      id: (req.user as any)?._id?.toString(),
      name: (req.user as any)?.name || (req.user as any)?.email || "Platform Admin",
      reason: req.body.reason || "Manual admin recalculation trigger",
    };
    const profile = await providerService.adminRecalculateProviderTier(
      profileId,
      adminActor
    );
    res.status(200).json({
      success: true,
      message: "Provider tier and score recalculated successfully",
      profile,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getDashboardOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const overview = await providerService.getTuitionProviderDashboardOverview(userId);
    res.status(200).json({ success: true, overview });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getFinancials = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const financials = await providerService.getTuitionProviderFinancials(userId);
    res.status(200).json({ success: true, financials });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createOffering = async (req: Request, res: Response): Promise<void> => {
  res.status(403).json({
    success: false,
    code: "MARKETPLACE_RETIRED",
    message:
      "Independent offering creation is retired. EduPye centrally governs curricula and allocates 1:1 students directly to verified teachers.",
  });
};

export const getMyOfferings = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const offerings = await TuitionOffering.find({ providerId: userId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, offerings });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getOfferingDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const offeringId = String(req.params.id);
    const details = await scheduleService.getOfferingDetails(offeringId, userId);
    res.status(200).json({ success: true, ...details });
  } catch (error: any) {
    const status = error.message.includes("Unauthorized") ? 403 : 404;
    res.status(status).json({ success: false, message: error.message });
  }
};

export const updateOffering = async (req: Request, res: Response): Promise<void> => {
  res.status(403).json({
    success: false,
    code: "MARKETPLACE_RETIRED",
    message: "Modifying independent offerings is retired under the centralized tuition model.",
  });
};

export const deleteOffering = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const offeringId = String(req.params.id);
    const result = await scheduleService.deleteOffering(userId, offeringId);
    res.status(200).json(result);
  } catch (error: any) {
    const status = error.message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
};

export const createBatch = async (req: Request, res: Response): Promise<void> => {
  res.status(403).json({
    success: false,
    code: "MARKETPLACE_RETIRED",
    message:
      "Batch creation is retired. EduPye tuition operates strictly as individual 1:1 centrally allocated sessions.",
  });
};

export const getMyBatches = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const batches = await TuitionBatch.find({ providerId: userId })
      .populate("offeringId", "title subject classLevel maxCapacity feeAmount")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, batches });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getBatchDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const batchId = String(req.params.id);
    const batch = await scheduleService.getBatchDetails(batchId, userId);
    res.status(200).json({ success: true, batch });
  } catch (error: any) {
    const status = error.message.includes("Unauthorized") ? 403 : 404;
    res.status(status).json({ success: false, message: error.message });
  }
};

export const updateBatch = async (req: Request, res: Response): Promise<void> => {
  res.status(403).json({
    success: false,
    code: "MARKETPLACE_RETIRED",
    message: "Modifying batches is retired under the centralized tuition model.",
  });
};

export const getTeacherPayouts = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const ledger = await payoutService.getTeacherEarningsLedger(userId);
    res.status(200).json({ success: true, ...ledger });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const batchId = String(req.params.id);
    const result = await scheduleService.deleteBatch(userId, batchId);
    res.status(200).json(result);
  } catch (error: any) {
    const status = error.message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
};

export const getProviderRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const status = req.query.status as string;
    const filter: any = { providerId: userId };
    if (status) filter.status = status;

    const requests = await TuitionRequest.find(filter)
      .populate("studentId", "name email phone")
      .populate("offeringId", "title subject classLevel feeAmount currency")
      .populate("batchId", "title daysOfWeek startTime endTime")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, requests });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const respondToRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const requestId = String(req.params.requestId);
    const { action, notes } = req.body;

    if (action !== "accept" && action !== "reject") {
      res.status(400).json({ success: false, message: "Action must be 'accept' or 'reject'" });
      return;
    }

    const updated = await requestService.providerRespondToTuitionRequest(
      userId,
      requestId,
      action,
      notes
    );
    res.status(200).json({ success: true, request: updated });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getProviderSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const { start, end } = req.query;
    const startDate = start ? new Date(start as string) : undefined;
    const endDate = end ? new Date(end as string) : undefined;

    const schedule = await scheduleService.getProviderSchedule(userId, startDate, endDate);
    res.status(200).json({ success: true, schedule });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSessionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const sessionId = String(req.params.sessionId);
    const { status, meetingLink } = req.body;

    const session = await scheduleService.updateSessionStatus(
      userId,
      sessionId,
      status,
      meetingLink
    );
    res.status(200).json({ success: true, session });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const markAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const sessionId = String(req.params.sessionId);
    const { records } = req.body;

    const attendance = await scheduleService.recordAttendance(userId, sessionId, records);
    res.status(200).json({ success: true, attendance });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const createSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const session = await scheduleService.createSession(userId, req.body);
    res.status(201).json({ success: true, session });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const rescheduleSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const sessionId = String(req.params.sessionId);
    const { newDate, newStartTime, newEndTime, reason } = req.body;

    if (!newDate || !newStartTime || !newEndTime) {
      res.status(400).json({ success: false, message: "newDate, newStartTime, and newEndTime are required" });
      return;
    }

    const session = await scheduleService.rescheduleSession(
      userId,
      sessionId,
      new Date(newDate),
      newStartTime,
      newEndTime,
      reason || "Rescheduled by provider"
    );
    res.status(200).json({ success: true, session });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const cancelSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const sessionId = String(req.params.sessionId);
    const { reason } = req.body;

    const session = await scheduleService.cancelSession(userId, sessionId, reason || "Cancelled by provider");
    res.status(200).json({ success: true, session });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getSessionAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const sessionId = String(req.params.sessionId);

    const session = await TuitionSession.findById(sessionId);
    if (!session || session.providerId.toString() !== userId) {
      res.status(404).json({ success: false, message: "Session not found or unauthorized" });
      return;
    }

    const attendance = await TuitionAttendance.findOne({ sessionId: session._id }).populate(
      "records.studentId",
      "name email"
    );
    res.status(200).json({ success: true, attendance });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createMaterial = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const material = await TuitionMaterial.create({
      ...req.body,
      providerId: userId,
    });
    res.status(201).json({ success: true, material });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const createAssessment = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as any)?._id?.toString();
    const assessment = await TuitionAssessment.create({
      ...req.body,
      providerId: userId,
    });
    res.status(201).json({ success: true, assessment });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Public endpoint for prospective tuition tutors to submit an application.
 * Creates/links a unified User account (teacher role, pending approval) and TuitionProviderProfile.
 */
export const applyForTutor = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      fullName,
      email,
      phone,
      password,
      qualification,
      subjects,
      grades,
      experienceYears,
      bio,
      demoLink,
    } = req.body;

    const trimmedName = (fullName || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPhone = (phone || "").trim();
    const cleanPassword = (password || "").trim();

    if (!trimmedName) {
      res.status(400).json({ success: false, message: "Full Name is required." });
      return;
    }

    if (!cleanEmail || !cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      res.status(400).json({ success: false, message: "A valid email address is required." });
      return;
    }

    if (!cleanPhone || cleanPhone.length < 8) {
      res.status(400).json({ success: false, message: "A valid phone number with country code is required." });
      return;
    }

    if (!cleanPassword || cleanPassword.length < 6) {
      res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
      return;
    }

    // Check if user already exists
    let user = await User.findOne({ email: cleanEmail });
    if (user) {
      // If user already exists and has an approved or pending tutor application
      if (user.role === "teacher" || user.userType === "teacher" || user.tuitionApprovalStatus) {
        res.status(400).json({
          success: false,
          message: "An account with this email is already registered. Please log in or check your application status.",
        });
        return;
      }
      // Upgrade existing non-teacher user
      user.role = "teacher";
      user.userType = "teacher";
      if (!user.roles.includes("teacher")) {
        user.roles.push("teacher");
      }
      user.activeRole = "teacher";
      user.phone = cleanPhone;
      user.tuitionApprovalStatus = "pending";
      await user.save();
    } else {
      const hashedPassword = await hashPassword(cleanPassword);
      user = await User.create({
        email: cleanEmail,
        password: hashedPassword,
        passwordHash: hashedPassword,
        name: trimmedName,
        displayName: trimmedName,
        fullName: trimmedName,
        phone: cleanPhone,
        role: "teacher",
        userType: "teacher",
        roles: ["teacher"],
        activeRole: "teacher",
        tuitionApprovalStatus: "pending",
      });
    }

    // Parse subjects & grades into arrays
    const parsedSubjects = Array.isArray(subjects)
      ? subjects
      : typeof subjects === "string" && subjects.trim()
      ? subjects.split(",").map((s: string) => s.trim()).filter(Boolean)
      : ["General Tuition"];

    const parsedGrades = Array.isArray(grades)
      ? grades
      : typeof grades === "string" && grades.trim()
      ? grades.split(",").map((g: string) => g.trim()).filter(Boolean)
      : ["Class 11-12"];

    const qualificationsArray = Array.isArray(qualification)
      ? qualification
      : qualification && typeof qualification === "string"
      ? [qualification.trim()]
      : [];

    // Create or update TuitionProviderProfile
    const profile = await TuitionProviderProfile.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        fullName: trimmedName,
        contactPhone: cleanPhone,
        qualifications: qualificationsArray,
        subjects: parsedSubjects,
        classesTaught: parsedGrades,
        experienceYears: Number(experienceYears) || 0,
        bio: (bio || "").trim(),
        demoLink: (demoLink || "").trim(),
        verificationStatus: "pending",
        interviewStatus: "pending_interview",
        platformTier: "standard",
        calculatedTier: "standard",
        isActive: true,
      },
      { new: true, upsert: true }
    );

    res.status(201).json({
      success: true,
      message: "Tuition tutor application submitted successfully! Our team will review your application and schedule an interview.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
      profile: {
        id: profile._id,
        interviewStatus: profile.interviewStatus,
        subjects: profile.subjects,
        classesTaught: profile.classesTaught,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to submit tutor application." });
  }
};

/**
 * GET /api/tuition/demo-sessions
 * Protected endpoint for tuition teachers to view their assigned trial demo sessions
 */
export const getMyDemoSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const query: any = {
      $or: [
        { assignedTutorId: user._id },
        ...(user.teacherCode ? [{ assignedTutorCode: user.teacherCode }] : []),
      ],
      demoRoomId: { $exists: true, $ne: null },
    };

    const demoSessions = await AcademyEnquiry.find(query).sort({ demoScheduledAt: 1, createdAt: -1 });
    const frontendBase = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

    const formattedDemos = demoSessions.map((d: any) => ({
      _id: d._id,
      studentName: d.studentName,
      parentName: d.parentName,
      phone: d.phone,
      grade: d.grade,
      subject: d.demoSubject || d.subjects?.[0] || "General",
      demoRoomId: d.demoRoomId,
      demoScheduledAt: d.demoScheduledAt,
      demoStatus: d.demoStatus || "scheduled",
      teacherToken: d.teacherToken,
      studentToken: d.studentToken,
      teacherJoinUrl: `${frontendBase}/demo-room/${d.teacherToken}`,
      studentJoinUrl: `${frontendBase}/demo-room/${d.studentToken}`,
      notes: d.notes,
    }));

    res.status(200).json({ success: true, count: formattedDemos.length, demoSessions: formattedDemos });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to load demo sessions" });
  }
};
