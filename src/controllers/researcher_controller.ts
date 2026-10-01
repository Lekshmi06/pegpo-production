import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  createResearcherProfile,
  getResearcherById,
  getResearcherByEmail,
  getResearcherByUserId,
  updateResearcherProfile,
  updateResearcherStep,
  completeResearcherOnboarding,
} from "../services/researcher_service";

export const createResearcherController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const profile = await createResearcherProfile(req.body);
    res.status(201).json({
      success: true,
      message: "Researcher profile created successfully",
      data: profile,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create researcher profile";
    const statusCode = message.includes("already exists") ? 409 : 400;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const getResearcherController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid researcher profile ID",
      });
      return;
    }

    const profile = await getResearcherById(id);
    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch researcher profile";
    const statusCode = message === "Researcher profile not found" ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const getResearcherByEmailController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const email = Array.isArray(req.params.email)
      ? req.params.email[0]
      : req.params.email;

    if (!email) {
      res.status(400).json({
        success: false,
        message: "Email parameter is required",
      });
      return;
    }

    const profile = await getResearcherByEmail(email);
    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch researcher profile";
    const statusCode = message === "User not found" ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const getResearcherMeController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const bearerUserId = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : undefined;

    const userId =
      bearerUserId ||
      (req.headers["x-user-id"] as string) ||
      (req.query.userId as string);

    const profileId =
      (req.headers["x-researcher-profile-id"] as string) ||
      (req.query.profileId as string);

    const email =
      (req.headers["x-user-email"] as string) ||
      (req.query.email as string);

    if (profileId && mongoose.isValidObjectId(profileId)) {
      const profile = await getResearcherById(profileId);
      res.status(200).json({
        success: true,
        data: profile,
      });
      return;
    }

    if (userId && mongoose.isValidObjectId(userId)) {
      let profile = await getResearcherByUserId(userId);
      if (!profile) {
        profile = await createResearcherProfile({ userId });
      }
      res.status(200).json({
        success: true,
        data: profile,
      });
      return;
    }

    if (email) {
      const profile = await getResearcherByEmail(email);
      res.status(200).json({
        success: true,
        data: profile,
      });
      return;
    }

    res.status(401).json({
      success: false,
      message: "No valid user ID, email, or researcher profile ID provided",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch researcher profile";
    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const updateResearcherController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid researcher profile ID",
      });
      return;
    }

    const updated = await updateResearcherProfile(id, req.body);
    res.status(200).json({
      success: true,
      message: "Researcher profile updated successfully",
      data: updated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update researcher profile";
    const statusCode = message === "Researcher profile not found" ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const updateResearcherStepController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const bearerUserId = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : undefined;

    const email =
      (req.body.email as string) ||
      (req.body.data?.email as string) ||
      (req.body.data?.contact?.email as string) ||
      (req.headers["x-user-email"] as string) ||
      (req.query.email as string);

    const userId =
      req.body.userId ||
      bearerUserId ||
      (req.headers["x-user-id"] as string) ||
      (req.query.userId as string);

    const profileId =
      req.body.profileId ||
      (req.headers["x-researcher-profile-id"] as string) ||
      (req.query.profileId as string);

    const step = Number(req.body.step) || 1;
    const stepData = req.body.data || req.body;

    const updated = await updateResearcherStep(
      { profileId, userId, email },
      step,
      stepData
    );

    res.status(200).json({
      success: true,
      message: `Step ${step} progress saved successfully`,
      data: updated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save step progress";
    res.status(400).json({
      success: false,
      message,
    });
  }
};

export const completeResearcherOnboardingController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const bearerUserId = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : undefined;

    const email =
      (req.body.email as string) ||
      (req.headers["x-user-email"] as string) ||
      (req.query.email as string);

    const userId =
      req.body.userId ||
      bearerUserId ||
      (req.headers["x-user-id"] as string) ||
      (req.query.userId as string);

    const profileId =
      req.body.profileId ||
      (req.headers["x-researcher-profile-id"] as string) ||
      (req.query.profileId as string);

    const updated = await completeResearcherOnboarding({ profileId, userId, email });

    res.status(200).json({
      success: true,
      message: "Researcher onboarding completed successfully",
      data: updated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to complete onboarding";
    res.status(400).json({
      success: false,
      message,
    });
  }
};
