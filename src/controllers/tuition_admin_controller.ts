import { Request, Response } from "express";
import TuitionRequest from "../models/TuitionRequest";
import * as centralizedService from "../services/tuition_centralized_service";
import * as pricingService from "../services/tuition_pricing_service";
import * as payoutService from "../services/tuition_payout_service";
import * as complianceService from "../services/tuition_compliance_service";

// ==========================================
// 1. TUITION REQUESTS & TEACHER ALLOCATION
// ==========================================

export const getAdminTuitionRequests = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { status, subject, curriculum, requestType } = req.query;
    const filter: any = {};
    if (status) filter.status = status;
    if (subject) filter.subject = new RegExp(String(subject), "i");
    if (curriculum) filter.curriculum = curriculum;
    if (requestType) filter.requestType = requestType;

    const requests = await TuitionRequest.find(filter)
      .populate("studentId", "name email")
      .populate("selectedTeacherId", "name email")
      .populate("preferredTeacherId", "name email")
      .populate("trialSessions.teacherId", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: requests.length, requests });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const adminAssignTrials = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const adminUserId = (req.user as any)?._id?.toString() || "admin";
    const requestId = String(req.params.requestId);
    const { allocations, adminNotes } = req.body;

    if (!allocations || !Array.isArray(allocations)) {
      res.status(400).json({
        success: false,
        message: "allocations array with 3 distinct teachers is required",
      });
      return;
    }

    const updatedRequest = await centralizedService.adminAssignTrialTeachers(
      adminUserId,
      requestId,
      allocations,
      adminNotes
    );

    res.status(200).json({
      success: true,
      message: "Three trial teachers successfully allocated. 30-minute sessions scheduled.",
      request: updatedRequest,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const adminFinalizeTeacher = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const adminUserId = (req.user as any)?._id?.toString() || "admin";
    const requestId = String(req.params.requestId);
    const { teacherId, adminNotes } = req.body;

    if (!teacherId) {
      res.status(400).json({ success: false, message: "teacherId is required" });
      return;
    }

    const updatedRequest = await centralizedService.adminFinalizeRegularTeacher(
      adminUserId,
      requestId,
      teacherId,
      adminNotes
    );

    res.status(200).json({
      success: true,
      message: "Permanent 1:1 teacher successfully confirmed. Ready for student payment.",
      request: updatedRequest,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ==========================================
// 2. CENTRALIZED PRICING MATRIX
// ==========================================

export const getPricingRules = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const rules = await pricingService.listAllPricingRules();
    res.status(200).json({ success: true, count: rules.length, rules });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createPricingRule = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const adminUserId = (req.user as any)?._id?.toString();
    const rule = await pricingService.createPricingRule(req.body, adminUserId);
    res.status(201).json({
      success: true,
      message: "Centralized pricing rule created successfully",
      rule,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const updatePricingRule = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const pricingId = String(req.params.pricingId);
    const updated = await pricingService.updatePricingRule(pricingId, req.body);
    if (!updated) {
      res.status(404).json({ success: false, message: "Pricing rule not found" });
      return;
    }
    res.status(200).json({
      success: true,
      message: "Pricing rule updated successfully",
      rule: updated,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ==========================================
// 3. TEACHER PAYOUT RECONCILIATION
// ==========================================

export const getPayouts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { teacherId, status, isTrial } = req.query;
    const payouts = await payoutService.listTeacherPayouts({
      teacherId: teacherId ? String(teacherId) : undefined,
      status: status as any,
      isTrial: isTrial !== undefined ? isTrial === "true" : undefined,
    });

    res.status(200).json({ success: true, count: payouts.length, payouts });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const approvePayout = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const adminUserId = (req.user as any)?._id?.toString() || "admin";
    const payoutId = String(req.params.payoutId);
    const { adminNotes } = req.body;

    const payout = await payoutService.adminApprovePayout(
      adminUserId,
      payoutId,
      adminNotes
    );

    res.status(200).json({
      success: true,
      message: "Teacher payout approved successfully",
      payout,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const disbursePayout = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const adminUserId = (req.user as any)?._id?.toString() || "admin";
    const payoutId = String(req.params.payoutId);
    const { paymentReference, adminNotes } = req.body;

    if (!paymentReference) {
      res.status(400).json({
        success: false,
        message: "paymentReference (UTR or check number) is required",
      });
      return;
    }

    const payout = await payoutService.adminDisbursePayout(
      adminUserId,
      payoutId,
      paymentReference,
      adminNotes
    );

    res.status(200).json({
      success: true,
      message: "Payout marked as disbursed and teacher ledger updated",
      payout,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ==========================================
// 4. COMPLIANCE RECORDINGS & RETENTION
// ==========================================

export const getRecordingsVault = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { teacherId, studentId, sessionId, status } = req.query;
    const recordings = await complianceService.getAdminRecordings({
      teacherId: teacherId ? String(teacherId) : undefined,
      studentId: studentId ? String(studentId) : undefined,
      sessionId: sessionId ? String(sessionId) : undefined,
      status: status ? String(status) : undefined,
    });

    res.status(200).json({ success: true, count: recordings.length, recordings });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getRecordingDetails = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const recordingId = String(req.params.recordingId);
    const recording = await complianceService.getAdminRecordingById(recordingId);
    if (!recording) {
      res.status(404).json({ success: false, message: "Recording not found" });
      return;
    }
    res.status(200).json({ success: true, recording });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSessionChatLogs = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const sessionId = String(req.params.sessionId);
    const chats = await complianceService.getSessionChatAuditLogs(sessionId);
    res.status(200).json({ success: true, count: chats.length, chats });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const runRetentionPurge = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const results = await complianceService.purgeExpiredComplianceArtifacts();
    res.status(200).json({
      success: true,
      message: "Retention purge cycle executed",
      results,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

