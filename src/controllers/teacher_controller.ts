import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  createTeacherProfile,
  getTeacherById,
  getTeacherByEmail,
  getTeacherByUserId,
  updateTeacherProfile,
  UpdateTeacherData,
  updateTeacherPassword,
} from "../services/teacher_service";

export const createTeacherController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const profile = await createTeacherProfile(req.body);
    res.status(201).json({
      success: true,
      message: "Teacher profile created successfully",
      data: profile,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create teacher profile";

    const statusCode = message.includes("already exists") ? 409 : 400;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const getTeacherController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid teacher profile ID",
      });
      return;
    }

    const profile = await getTeacherById(id);
    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch teacher profile";

    const statusCode = message === "Teacher profile not found" ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const getTeacherByEmailController = async (
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

    const profile = await getTeacherByEmail(email);
    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch teacher profile";

    const statusCode = message === "Teacher profile not found" || message === "User not found" ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const updateTeacherController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid teacher profile ID",
      });
      return;
    }

    const profile = await updateTeacherProfile(id, req.body as UpdateTeacherData);
    res.status(200).json({
      success: true,
      message: "Teacher profile updated successfully",
      data: profile,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update teacher profile";

    const statusCode = message === "Teacher profile not found" ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const getTeacherMeController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const userId =
      authHeader?.startsWith("Bearer ")
        ? authHeader.substring(7)
        : (req.query.userId as string);

    if (!userId || !mongoose.isValidObjectId(userId)) {
      res.status(401).json({
        success: false,
        message: "Valid authentication token or userId required",
      });
      return;
    }

    const profile = await getTeacherByUserId(userId);
    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch teacher profile";

    res.status(404).json({
      success: false,
      message,
    });
  }
};

export const updateTeacherPasswordController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid teacher profile ID",
      });
      return;
    }

    const { password } = req.body;
    if (!password || typeof password !== "string" || !password.trim()) {
      res.status(400).json({
        success: false,
        message: "Password is required",
      });
      return;
    }

    await updateTeacherPassword(id, password.trim());
    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update password";

    res.status(400).json({
      success: false,
      message,
    });
  }
};

