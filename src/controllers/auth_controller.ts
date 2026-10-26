import { Request, Response } from "express";
import {
  registerUser,
  loginUser,
  getCurrentUser,
  updateUserRole,
  authenticateWithGoogle,
  authenticateMockGoogle,
  PREDEFINED_MOCK_GOOGLE_ACCOUNTS,
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
  } catch (error: any) {
    let message =
      error instanceof Error ? error.message : "Failed to register user";

    const isDuplicate =
      error?.code === 11000 ||
      (error?.name === "MongoServerError" && error?.code === 11000) ||
      message.includes("already has an account") ||
      message.includes("already in use") ||
      message.includes("already exists");

    if (isDuplicate) {
      message = "This email ID already has an account or is already in use. Please log in instead.";
    }

    const statusCode = isDuplicate ? 409 : 400;
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

export const selectRoleController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : undefined;

    const userId = token || req.body.userId || (req.query.userId as string);
    const email = req.body.email || (req.query.email as string);
    const role = req.body.role;

    if (!role) {
      res.status(400).json({
        success: false,
        message: "Role is required",
      });
      return;
    }

    if (!userId && !email) {
      res.status(401).json({
        success: false,
        message: "Authentication token, user ID, or email is required",
      });
      return;
    }

    const result = await updateUserRole({ userId, email, role });
    res.status(200).json({
      success: true,
      message: "Role updated successfully",
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update role";
    res.status(400).json({
      success: false,
      message,
    });
  }
};

export const googleAuthController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { credential, idToken, userType } = req.body;
    const token = credential || idToken;

    if (!token) {
      res.status(400).json({
        success: false,
        message: "Google credential (ID token) is required",
      });
      return;
    }

    const result = await authenticateWithGoogle({ credential: token, userType });
    res.status(200).json({
      success: true,
      message: result.isNewUser
        ? "Account created successfully with Google"
        : "Signed in successfully with Google",
      data: result,
    });
  } catch (error: any) {
    const message =
      error instanceof Error ? error.message : "Google authentication failed";

    const statusCode =
      message.includes("not verified") ||
      message.includes("Invalid") ||
      message.includes("expired") ||
      message.includes("audience mismatch") ||
      message.includes("issuer")
        ? 401
        : 400;

    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const mockGoogleAuthController = async (
  req: Request,
  res: Response
): Promise<void> => {
  // Production safeguard: Strictly forbidden in production, requires ENABLE_MOCK_GOOGLE_AUTH="true"
  const isProduction = process.env.NODE_ENV === "production";
  const isMockEnabled = process.env.ENABLE_MOCK_GOOGLE_AUTH === "true";

  if (isProduction || !isMockEnabled) {
    res.status(403).json({
      success: false,
      message: "Mock Google authentication is disabled in this environment.",
    });
    return;
  }

  try {
    const { accountId, email, name, userType, isNewUserTest } = req.body;
    const result = await authenticateMockGoogle({
      accountId,
      email,
      name,
      userType,
      isNewUserTest,
    });

    res.status(200).json({
      success: true,
      message: result.isNewUser
        ? "Simulated account created successfully"
        : "Simulated sign-in successful",
      data: result,
    });
  } catch (error: any) {
    const message =
      error instanceof Error ? error.message : "Mock Google authentication failed";
    res.status(400).json({
      success: false,
      message,
    });
  }
};

export const getMockAccountsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const isProduction = process.env.NODE_ENV === "production";
  const isMockEnabled = process.env.ENABLE_MOCK_GOOGLE_AUTH === "true";

  if (isProduction || !isMockEnabled) {
    res.status(403).json({
      success: false,
      message: "Mock Google authentication is disabled in this environment.",
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: PREDEFINED_MOCK_GOOGLE_ACCOUNTS,
  });
};

