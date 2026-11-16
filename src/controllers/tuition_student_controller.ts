import { Request, Response } from "express";
import * as studentService from "../services/tuition_student_service";

export const getStudentOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const overview = await studentService.getTuitionStudentOverview(studentId);
    res.status(200).json({ success: true, overview });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyEnrollments = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const enrollments = await studentService.getStudentTuitionEnrollments(studentId);
    res.status(200).json({ success: true, enrollments });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const requests = await studentService.getStudentTuitionRequests(studentId);
    res.status(200).json({ success: true, requests });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyMaterials = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const { offeringId } = req.query;
    const materials = await studentService.getStudentTuitionMaterials(
      studentId,
      offeringId as string
    );
    res.status(200).json({ success: true, materials });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyAssessments = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const { offeringId } = req.query;
    const assessments = await studentService.getStudentTuitionAssessments(
      studentId,
      offeringId as string
    );
    res.status(200).json({ success: true, assessments });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const submitAssessment = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const assessmentId = String(req.params.assessmentId);
    const assessment = await studentService.submitStudentAssessment(
      studentId,
      assessmentId,
      req.body
    );
    res.status(200).json({ success: true, message: "Assessment submitted", assessment });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getMyPayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const transactions = await studentService.getStudentTuitionPayments(studentId);
    res.status(200).json({ success: true, transactions });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
