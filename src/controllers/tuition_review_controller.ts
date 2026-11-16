import { Request, Response } from "express";
import * as reviewService from "../services/tuition_review_service";

export const createReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = (req.user as any)?._id?.toString();
    const review = await reviewService.createTuitionReview(studentId, req.body);
    res.status(201).json({
      success: true,
      message: "Tuition review submitted successfully",
      review,
    });
  } catch (error: any) {
    const statusCode = error.message.includes("Forbidden") ? 403 : 400;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

export const getProviderReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    const providerId = String(req.params.providerId);
    const reviews = await reviewService.getProviderReviews(providerId);
    res.status(200).json({ success: true, reviews });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
