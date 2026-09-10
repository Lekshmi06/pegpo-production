import { Request, Response } from "express";
import {
  registerUser,
  loginUser,
  getCurrentUser,
} from "../services/auth_service";

export const registerController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const result = await registerUser(req.body);
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to register user";

    const statusCode = message.includes("already exists") ? 409 : 400;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const loginController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const result = await loginUser(req.body);
    res.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to login";

    const statusCode = message.includes("Invalid") ? 401 : 400;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const meController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token =
      authHeader?.startsWith("Bearer ")
        ? authHeader.substring(7)
        : (req.query.userId as string);

    if (!token) {
      res.status(401).json({
        success: false,
        message: "No authentication token or user ID provided",
      });
      return;
    }

    const result = await getCurrentUser(token);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get user profile";

    res.status(404).json({
      success: false,
      message,
    });
  }
};
