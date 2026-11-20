import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import User, { IUser } from "../models/User";
import {
  isSuperAdmin,
  isAdmin,
  isStaff,
  isTuitionOperationsAdmin,
  generateToken,
} from "../middlewares/admin_module_middleware";
import {
  registerUser,
  loginUser,
  getCurrentUser,
  updateUserRole,
  switchUserRole,
  activateUserRole,
  authenticateWithGoogle,
  authenticateMockGoogle,
  PREDEFINED_MOCK_GOOGLE_ACCOUNTS,
  formatUserResponse,
} from "../services/auth_service";
import { verifySessionToken } from "../utils/token";

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
    const { username, email, password, selectedRole } = req.body;
    const rawIdentifier = (username || email || req.body.userId || req.body.identifier || "").trim();
    const identifier = rawIdentifier.toLowerCase();

    // If identifier or selectedRole is provided and looks like an Admin/ERP login or unified login
    if (username || selectedRole || req.body.userId || req.body.identifier) {
      if (!identifier || !password) {
        res.status(400).json({
          success: false,
          message: "Both User ID/Username and Password are required.",
        });
        return;
      }

      const user = await User.findOne({
        $or: [
          { username: { $regex: new RegExp(`^${identifier}$`, "i") } },
          { email: identifier },
          { userId: { $regex: new RegExp(`^${identifier}$`, "i") } },
        ],
      });

      if (!user) {
        res.status(401).json({
          success: false,
          message: "Invalid User ID / Username or Password.",
        });
        return;
      }

      const userPasswordHash = user.passwordHash || user.password;
      if (!userPasswordHash) {
        res.status(401).json({
          success: false,
          message: "Account password has not been configured. Please contact an administrator.",
        });
        return;
      }

      const isPasswordMatch = await bcrypt.compare(password, userPasswordHash);
      if (!isPasswordMatch) {
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        await user.save();
        res.status(401).json({
          success: false,
          message: "Invalid User ID / Username or Password.",
        });
        return;
      }

      if (user.status === "Locked") {
        res.status(403).json({
          success: false,
          message: `Account is locked. ${user.lockoutReason || "Please contact security administration."}`,
        });
        return;
      }

      if (user.status === "Inactive") {
        res.status(403).json({
          success: false,
          message: "Account is deactivated. Please contact security administration.",
        });
        return;
      }

      const userEffectiveRole = user.adminRole || user.role || user.activeRole;

      if (selectedRole) {
        const normSelected = selectedRole.trim().toLowerCase();
        if (normSelected === "super admin" || normSelected.includes("super")) {
          if (!isSuperAdmin(userEffectiveRole)) {
            res.status(403).json({
              success: false,
              message: `Role mismatch: This account does not have Super Admin privileges.`,
            });
            return;
          }
        } else if (normSelected === "admin") {
          if (!isAdmin(userEffectiveRole) && !isSuperAdmin(userEffectiveRole)) {
            res.status(403).json({
              success: false,
              message: `Role mismatch: This account does not have Admin privileges.`,
            });
            return;
          }
        } else if (normSelected === "tuition operations admin" || normSelected.includes("tuition")) {
          if (!isTuitionOperationsAdmin(userEffectiveRole) && !isSuperAdmin(userEffectiveRole)) {
            res.status(403).json({
              success: false,
              message: `Role mismatch: This account does not have Tuition Operations Admin privileges.`,
            });
            return;
          }
        } else if (normSelected === "staff") {
          if (!isStaff(userEffectiveRole) && !isAdmin(userEffectiveRole) && !isSuperAdmin(userEffectiveRole)) {
            res.status(403).json({
              success: false,
              message: `Role mismatch: This account does not have Staff privileges.`,
            });
            return;
          }
        }
      }

      user.lastLogin = new Date();
      user.lastLoginIp = req.ip || (req.headers["x-forwarded-for"] as string) || "client";
      user.failedLoginAttempts = 0;
      await user.save();

      const token = generateToken(user);
      const authUser = {
        id: user.id || user._id,
        userId: user.userId || `USR-${(user._id as any).toString().slice(-6).toUpperCase()}`,
        username: user.username || user.email.split("@")[0],
        displayName: user.displayName || user.fullName || user.name || "User",
        email: user.email,
        role: user.adminRole || user.role || "Staff",
        adminRole: user.adminRole,
        allowedModules: user.allowedModules || (
          isSuperAdmin(userEffectiveRole) ? Array.from({ length: 33 }, (_, i) => i + 1) :
          isTuitionOperationsAdmin(userEffectiveRole) ? [1, 2, 3, 4, 5, 33] :
          isAdmin(userEffectiveRole) ? Array.from({ length: 33 }, (_, i) => i + 1) :
          [1, 2, 3, 4, 5]
        ),
        department: user.department || "Operations",
        status: user.status || "Active",
        avatarUrl: user.avatarUrl,
      };

      res.json({
        success: true,
        message: `${userEffectiveRole} authenticated successfully.`,
        token,
        user: authUser,
        data: {
          user: formatUserResponse(user),
          token,
        },
      });
      return;
    }

    // Default EduPye student/teacher/researcher authentication flow
    const result = await loginUser(req.body);
    res.status(200).json({
      success: true,
      message: "Login successful",
      token: result.token,
      user: result.user,
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

/**
 * Super Admin Login Endpoint
 * Route: POST /api/auth/super-admin/login
 */
export const loginSuperAdminController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const rawIdentifier = (req.body.username || req.body.email || req.body.userId || req.body.identifier || "").trim();
    const { password } = req.body;
    if (!rawIdentifier || !password) {
      res.status(400).json({
        success: false,
        message: "Both Super Admin ID/Username/Email and Password are required.",
      });
      return;
    }

    const cleanIdentifier = rawIdentifier.toLowerCase();
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${cleanIdentifier}$`, "i") } },
        { email: cleanIdentifier },
        { userId: { $regex: new RegExp(`^${cleanIdentifier}$`, "i") } },
      ],
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Invalid Super Admin ID/Username/Email or Password.",
      });
      return;
    }

    const userPasswordHash = user.passwordHash || user.password;
    if (!userPasswordHash) {
      res.status(401).json({
        success: false,
        message: "Account password has not been initialized. Please contact system administrator.",
      });
      return;
    }

    const isPasswordMatch = await bcrypt.compare(password, userPasswordHash);
    if (!isPasswordMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      await user.save();
      res.status(401).json({
        success: false,
        message: "Invalid Super Admin ID/Username/Email or Password.",
      });
      return;
    }

    if (user.status === "Locked") {
      res.status(403).json({
        success: false,
        message: `Account is locked. ${user.lockoutReason || "Please contact security administration."}`,
      });
      return;
    }

    if (user.status === "Inactive") {
      res.status(403).json({
        success: false,
        message: "Account is deactivated. Please contact security administration.",
      });
      return;
    }

    const userRole = user.adminRole || user.role;
    if (!isSuperAdmin(userRole)) {
      res.status(403).json({
        success: false,
        message: "Access Denied: Only authorized Super Administrators can log in through this portal.",
      });
      return;
    }

    user.lastLogin = new Date();
    user.lastLoginIp = req.ip || (req.headers["x-forwarded-for"] as string) || "client";
    user.failedLoginAttempts = 0;
    await user.save();

    const token = generateToken(user);
    res.json({
      success: true,
      message: "Super Admin authenticated successfully.",
      token,
      user: {
        id: user.id || user._id,
        userId: user.userId || `SA-${(user._id as any).toString().slice(-6).toUpperCase()}`,
        username: user.username,
        displayName: user.displayName || user.fullName || user.name || "Super Admin",
        email: user.email,
        role: "Super Admin",
        adminRole: "Super Admin",
        allowedModules: user.allowedModules || Array.from({ length: 33 }, (_, i) => i + 1),
        department: user.department || "Executive",
        status: user.status || "Active",
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err: any) {
    console.error("Super Admin Login Error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error during authentication.",
    });
  }
};

/**
 * Admin Login Endpoint
 * Route: POST /api/auth/admin/login
 */
export const loginAdminController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const rawIdentifier = (req.body.username || req.body.email || req.body.userId || req.body.identifier || "").trim();
    const { password } = req.body;
    if (!rawIdentifier || !password) {
      res.status(400).json({
        success: false,
        message: "Both Admin ID/Username/Email and Password are required.",
      });
      return;
    }

    const cleanIdentifier = rawIdentifier.toLowerCase();
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${cleanIdentifier}$`, "i") } },
        { email: cleanIdentifier },
        { userId: { $regex: new RegExp(`^${cleanIdentifier}$`, "i") } },
      ],
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Invalid Admin ID/Username/Email or Password.",
      });
      return;
    }

    const userPasswordHash = user.passwordHash || user.password;
    if (!userPasswordHash) {
      res.status(401).json({
        success: false,
        message: "Account password has not been configured. Please contact administrator.",
      });
      return;
    }

    const isPasswordMatch = await bcrypt.compare(password, userPasswordHash);
    if (!isPasswordMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      await user.save();
      res.status(401).json({
        success: false,
        message: "Invalid Admin ID/Username/Email or Password.",
      });
      return;
    }

    if (user.status === "Locked") {
      res.status(403).json({
        success: false,
        message: `Account is locked. ${user.lockoutReason || "Please contact administrator."}`,
      });
      return;
    }

    if (user.status === "Inactive") {
      res.status(403).json({
        success: false,
        message: "Account has been deactivated. Please contact administrator.",
      });
      return;
    }

    const userRole = user.adminRole || user.role;
    if (!isAdmin(userRole) && !isSuperAdmin(userRole)) {
      res.status(403).json({
        success: false,
        message: "Access Denied: Only authorized Administrators can log in through this portal.",
      });
      return;
    }

    user.lastLogin = new Date();
    user.lastLoginIp = req.ip || (req.headers["x-forwarded-for"] as string) || "client";
    user.failedLoginAttempts = 0;
    await user.save();

    const token = generateToken(user);
    res.json({
      success: true,
      message: "Admin authenticated successfully.",
      token,
      user: {
        id: user.id || user._id,
        userId: user.userId || `ADM-${(user._id as any).toString().slice(-6).toUpperCase()}`,
        username: user.username,
        displayName: user.displayName || user.fullName || user.name || "Administrator",
        email: user.email,
        role: "Admin",
        adminRole: user.adminRole || "Admin",
        allowedModules: user.allowedModules || Array.from({ length: 33 }, (_, i) => i + 1),
        department: user.department || "Administration",
        status: user.status || "Active",
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err: any) {
    console.error("Admin Login Error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error during authentication.",
    });
  }
};

/**
 * Tuition Operations Admin Login Endpoint
 * Route: POST /api/auth/tuition-admin/login
 */
export const loginTuitionAdminController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const rawIdentifier = (req.body.username || req.body.email || req.body.userId || req.body.identifier || "").trim();
    const { password } = req.body;
    if (!rawIdentifier || !password) {
      res.status(400).json({
        success: false,
        message: "Both Tuition Admin ID/Username/Email and Password are required.",
      });
      return;
    }

    const cleanIdentifier = rawIdentifier.toLowerCase();
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${cleanIdentifier}$`, "i") } },
        { email: cleanIdentifier },
        { userId: { $regex: new RegExp(`^${cleanIdentifier}$`, "i") } },
      ],
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Invalid Tuition Admin ID/Username/Email or Password.",
      });
      return;
    }

    const userPasswordHash = user.passwordHash || user.password;
    if (!userPasswordHash) {
      res.status(401).json({
        success: false,
        message: "Account password has not been configured.",
      });
      return;
    }

    const isPasswordMatch = await bcrypt.compare(password, userPasswordHash);
    if (!isPasswordMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      await user.save();
      res.status(401).json({
        success: false,
        message: "Invalid Tuition Admin ID/Username/Email or Password.",
      });
      return;
    }

    const userRole = user.adminRole || user.role;
    if (!isTuitionOperationsAdmin(userRole) && !isSuperAdmin(userRole)) {
      res.status(403).json({
        success: false,
        message: "Access Denied: Only Tuition Operations Administrators can log in through this portal.",
      });
      return;
    }

    user.lastLogin = new Date();
    user.lastLoginIp = req.ip || (req.headers["x-forwarded-for"] as string) || "client";
    user.failedLoginAttempts = 0;
    await user.save();

    const token = generateToken(user);
    res.json({
      success: true,
      message: "Tuition Operations Admin authenticated successfully.",
      token,
      user: {
        id: user.id || user._id,
        userId: user.userId || `TAD-${(user._id as any).toString().slice(-6).toUpperCase()}`,
        username: user.username,
        displayName: user.displayName || user.fullName || user.name || "Tuition Admin",
        email: user.email,
        role: "Tuition Operations Admin",
        adminRole: "Tuition Operations Admin",
        allowedModules: user.allowedModules || [1, 2, 3, 4, 5, 33],
        department: user.department || "Tuition Operations",
        status: user.status || "Active",
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err: any) {
    console.error("Tuition Admin Login Error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error during authentication.",
    });
  }
};

/**
 * Staff Login Endpoint
 * Route: POST /api/auth/staff/login
 */
export const loginStaffController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const rawIdentifier = (req.body.username || req.body.email || req.body.userId || req.body.identifier || "").trim();
    const { password } = req.body;
    if (!rawIdentifier || !password) {
      res.status(400).json({
        success: false,
        message: "Both Staff ID/Username/Email and Password are required.",
      });
      return;
    }

    const cleanIdentifier = rawIdentifier.toLowerCase();
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${cleanIdentifier}$`, "i") } },
        { email: cleanIdentifier },
        { userId: { $regex: new RegExp(`^${cleanIdentifier}$`, "i") } },
      ],
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Invalid Staff ID/Username/Email or Password.",
      });
      return;
    }

    const userPasswordHash = user.passwordHash || user.password;
    if (!userPasswordHash) {
      res.status(401).json({
        success: false,
        message: "Account password has not been configured. Please contact administrator.",
      });
      return;
    }

    const isPasswordMatch = await bcrypt.compare(password, userPasswordHash);
    if (!isPasswordMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      await user.save();
      res.status(401).json({
        success: false,
        message: "Invalid Staff ID/Username/Email or Password.",
      });
      return;
    }

    if (user.status === "Locked") {
      res.status(403).json({
        success: false,
        message: `Account is locked. ${user.lockoutReason || "Please contact administrator."}`,
      });
      return;
    }

    if (user.status === "Inactive") {
      res.status(403).json({
        success: false,
        message: "Account has been deactivated. Please contact administrator.",
      });
      return;
    }

    const userRole = user.adminRole || user.role;
    if (!isStaff(userRole) && !isAdmin(userRole) && !isSuperAdmin(userRole)) {
      res.status(403).json({
        success: false,
        message: "Access Denied: Only authorized Staff members can log in through this portal.",
      });
      return;
    }

    user.lastLogin = new Date();
    user.lastLoginIp = req.ip || (req.headers["x-forwarded-for"] as string) || "client";
    user.failedLoginAttempts = 0;
    await user.save();

    const token = generateToken(user);
    res.json({
      success: true,
      message: "Staff member authenticated successfully.",
      token,
      user: {
        id: user.id || user._id,
        userId: user.userId || `STF-${(user._id as any).toString().slice(-6).toUpperCase()}`,
        username: user.username,
        displayName: user.displayName || user.fullName || user.name || "Staff Member",
        email: user.email,
        role: "Staff",
        adminRole: user.adminRole || "Staff",
        allowedModules: user.allowedModules || [1, 2, 3, 4, 5],
        department: user.department || "Operations",
        status: user.status || "Active",
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err: any) {
    console.error("Staff Login Error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error during authentication.",
    });
  }
};

/**
 * Logout Endpoint
 * Route: POST /api/auth/logout
 */
export const logoutController = async (
  _req: Request,
  res: Response
): Promise<void> => {
  res.json({
    success: true,
    message: "Logged out successfully.",
  });
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
      user: result.user,
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

export const switchRoleController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : undefined;

    let userId = (req.user as any)?._id?.toString();
    if (!userId && token) {
      const decoded = verifySessionToken(token);
      userId = decoded?.userId;
    }
    if (!userId) {
      userId = req.body.userId;
    }

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required to switch role.",
      });
      return;
    }

    const { role } = req.body;
    if (!role) {
      res.status(400).json({
        success: false,
        message: "Target role is required.",
      });
      return;
    }

    const result = await switchUserRole({ userId, role });
    res.status(200).json({
      success: true,
      message: `Switched active role to ${role} successfully.`,
      data: result,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "Failed to switch role";
    const statusCode = message.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const activateRoleController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : undefined;

    let userId = (req.user as any)?._id?.toString();
    if (!userId && token) {
      const decoded = verifySessionToken(token);
      userId = decoded?.userId;
    }
    if (!userId) {
      userId = req.body.userId;
    }

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required to activate role.",
      });
      return;
    }

    const { role } = req.body;
    if (!role) {
      res.status(400).json({
        success: false,
        message: "Role to activate is required.",
      });
      return;
    }

    const result = await activateUserRole({ userId, role });
    res.status(200).json({
      success: true,
      message: `Role ${role} activated and selected successfully.`,
      data: result,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "Failed to activate role";
    const statusCode = message.includes("Privileged") ? 403 : 400;
    res.status(statusCode).json({
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

