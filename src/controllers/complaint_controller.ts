import { Request, Response } from "express";
import mongoose from "mongoose";
import TuitionComplaint from "../models/TuitionComplaint";
import TuitionProgram from "../models/TuitionProgram";
import User from "../models/User";

export const complaintController = {
  /**
   * POST /api/tuition/complaints
   * Submit an anonymous or non-anonymous complaint/grievance ticket
   */
  async submitComplaint(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?._id?.toString() || (req.user as any)?.userId?.toString();
      if (!userId) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
      }

      const {
        isAnonymous = false,
        category = "Other",
        subject,
        description,
        programId,
      } = req.body;

      if (!subject || !subject.trim()) {
        res.status(400).json({ success: false, message: "Subject is required." });
        return;
      }

      if (!description || !description.trim()) {
        res.status(400).json({ success: false, message: "Description is required." });
        return;
      }

      const user = await User.findById(userId);
      const userRole = (user?.role || (user as any)?.activeRole || "").toLowerCase();
      const reporterRole: "student" | "teacher" =
        userRole === "teacher" || userRole === "tuition_provider" || user?.teacherCode
          ? "teacher"
          : "student";

      let validProgramId: mongoose.Types.ObjectId | undefined = undefined;
      if (programId && mongoose.Types.ObjectId.isValid(programId)) {
        const prg = await TuitionProgram.findById(programId);
        if (prg) {
          validProgramId = prg._id;
        }
      }

      const ALLOWED_CATEGORIES = [
        "Academic / Class",
        "Conduct / Behavior",
        "Technical / SmartBoard",
        "Schedule / Billing",
        "Other",
      ];
      let safeCategory = category;
      let finalDescription = description.trim();
      if (!ALLOWED_CATEGORIES.includes(category)) {
        safeCategory = "Other";
        finalDescription = `[Category: ${category}] ${finalDescription}`;
      }

      const complaint = await TuitionComplaint.create({
        isAnonymous: Boolean(isAnonymous),
        reporterId: new mongoose.Types.ObjectId(userId),
        reporterRole,
        category: safeCategory,
        subject: subject.trim(),
        description: finalDescription,
        programId: validProgramId,
        status: "open",
        adminProgressNotes: [
          {
            message: "Ticket created and dispatched to EduPye Centralized Tuition Administration.",
            updatedBy: "System",
            updatedAt: new Date(),
          },
        ],
      });

      res.status(201).json({
        success: true,
        message: `Grievance ticket ${complaint.ticketCode} submitted successfully. You can track progress anytime.`,
        complaint: {
          id: complaint._id,
          ticketCode: complaint.ticketCode,
          isAnonymous: complaint.isAnonymous,
          category: complaint.category,
          subject: complaint.subject,
          description: complaint.description,
          status: complaint.status,
          adminProgressNotes: complaint.adminProgressNotes,
          createdAt: complaint.createdAt,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || "Failed to submit complaint." });
    }
  },

  /**
   * GET /api/tuition/complaints/mine
   * Fetch complaints submitted by the authenticated user
   */
  async getMyComplaints(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?._id?.toString() || (req.user as any)?.userId?.toString();
      if (!userId) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
      }

      const complaints = await TuitionComplaint.find({
        reporterId: new mongoose.Types.ObjectId(userId),
      })
        .populate("programId", "title code subject")
        .sort({ createdAt: -1 })
        .lean();

      res.status(200).json({
        success: true,
        count: complaints.length,
        complaints,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || "Failed to fetch user complaints." });
    }
  },
};

export default complaintController;
