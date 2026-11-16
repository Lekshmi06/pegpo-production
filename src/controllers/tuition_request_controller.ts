import { Request, Response } from "express";
import * as requestService from "../services/tuition_request_service";
import * as centralizedService from "../services/tuition_centralized_service";

/**
 * Student: Check trial class eligibility for a given subject.
 */
export const checkTrialEligibility = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const subject = String(req.query.subject || "");
    if (!subject) {
      res.status(400).json({ success: false, message: "subject query parameter is required" });
      return;
    }
    const result = await centralizedService.checkStudentTrialEligibility(studentId, subject);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Student: Submit tuition request.
 * Handles both centralized 1:1 request format (subject, classLevel, curriculum, goals)
 * and legacy offering-based request format.
 */
export const createTuitionRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();

    // Centralized 1:1 tuition request path
    if (req.body.subject && (req.body.classLevel || !req.body.offeringId)) {
      const request = await centralizedService.submitCentralizedTuitionRequest(
        studentId,
        req.body
      );
      res.status(201).json({
        success: true,
        message: request.isTrialEligible
          ? "Tuition request submitted. You have been enrolled for three 30-minute trial sessions."
          : "Tuition request submitted successfully for teacher allocation.",
        request,
      });
      return;
    }

    // Legacy fallback path if offeringId is provided
    const request = await requestService.createTuitionRequest(studentId, req.body);
    res.status(201).json({
      success: true,
      message: "Tuition request submitted successfully",
      request,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Student: Submit feedback and rating (1-5) for a completed trial session.
 */
export const submitTrialFeedback = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const requestId = String(req.params.requestId);
    const { trialIndex, rating, feedback } = req.body;

    if (!trialIndex || !rating || !feedback) {
      res.status(400).json({
        success: false,
        message: "trialIndex (1, 2, or 3), rating (1-5), and feedback are required",
      });
      return;
    }

    const updatedRequest = await centralizedService.submitTrialFeedback(
      studentId,
      requestId,
      Number(trialIndex),
      Number(rating),
      String(feedback)
    );

    res.status(200).json({
      success: true,
      message: "Trial session feedback submitted successfully",
      request: updatedRequest,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Student: Select preferred teacher from the 3 trial teachers.
 */
export const selectPreferredTeacher = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const requestId = String(req.params.requestId);
    const { preferredTeacherId, notes } = req.body;

    if (!preferredTeacherId) {
      res.status(400).json({
        success: false,
        message: "preferredTeacherId is required",
      });
      return;
    }

    const updatedRequest = await centralizedService.selectPreferredTeacher(
      studentId,
      requestId,
      preferredTeacherId,
      notes
    );

    res.status(200).json({
      success: true,
      message: "Preferred teacher selected. Admin will confirm your permanent teacher allocation.",
      request: updatedRequest,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Student: Complete payment and activate 1:1 tuition enrollment.
 */
export const settleTuitionPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const { requestId, gatewayTransactionId, hoursPurchased, amountPaid, signature } = req.body;

    if (!requestId || !gatewayTransactionId) {
      res.status(400).json({
        success: false,
        message: "requestId and gatewayTransactionId are required",
      });
      return;
    }

    // Try centralized 1:1 enrollment settlement first
    try {
      const result = await centralizedService.activateRegular1to1Enrollment(
        studentId,
        requestId,
        {
          gatewayTransactionId,
          hoursPurchased: hoursPurchased || 10,
          amountPaid,
        }
      );
      res.status(200).json({
        success: true,
        message: "Tuition payment confirmed. 1:1 Enrolment is now active.",
        ...result,
      });
      return;
    } catch (centralErr: any) {
      // If error is about missing signature or legacy request, fall back to legacy verifier
      if (!signature) {
        throw centralErr;
      }
    }

    const legacyResult = await requestService.studentVerifyAndSettleTuitionPayment(
      studentId,
      {
        requestId,
        gatewayTransactionId,
        signature,
      }
    );

    res.status(200).json({
      success: true,
      message: "Tuition payment confirmed. Enrolment is now active.",
      ...legacyResult,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const cancelTuitionRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const requestId = String(req.params.requestId);
    const { reason } = req.body;

    const request = await requestService.cancelTuitionRequest(studentId, requestId, reason);
    res.status(200).json({
      success: true,
      message: "Tuition request cancelled successfully",
      request,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const cancelTuitionEnrollment = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const enrollmentId = String(req.params.enrollmentId);
    const { reason } = req.body;

    const enrollment = await requestService.cancelTuitionEnrollment(studentId, enrollmentId, reason);
    res.status(200).json({
      success: true,
      message: "Tuition enrolment cancelled and seat capacity safely released",
      enrollment,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};
