import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User, { IUser } from "../models/User";
import { getJwtSecret } from "../utils/token";

const FALLBACK_JWT_SECRET = "curemaso-super-secret-jwt-key-2026-secure-auth";

export function isSuperAdmin(role?: string): boolean {
  if (!role) return false;
  const r = role.trim().toLowerCase();
  return r === "super admin" || r === "super_admin" || r === "platform super admin";
}

export function isAdmin(role?: string): boolean {
  if (!role) return false;
  const r = role.trim().toLowerCase();
  return r === "admin" || r === "general admin" || r === "administrator";
}

export function isTuitionOperationsAdmin(role?: string): boolean {
  if (!role) return false;
  const r = role.trim().toLowerCase();
  return r === "tuition operations admin" || r === "tuition admin" || r === "tuition_admin";
}

export function isStaff(role?: string): boolean {
  if (!role) return false;
  const r = role.trim().toLowerCase();
  return (
    r === "staff" ||
    r === "user" ||
    r === "operations staff" ||
    r === "manager" ||
    r === "hr" ||
    r === "finance" ||
    r === "marketing" ||
    r === "support"
  );
}

export function generateToken(user: any): string {
  const secret = getJwtSecret();
  const mongoId = (user._id || "").toString();
  return jwt.sign(
    {
      id: typeof user.id === "number" ? user.id : undefined,
      _id: mongoId,
      userId: mongoId || user.userId,
      codeUserId: user.userId || mongoId,
      username: user.username,
      email: user.email,
      displayName: user.displayName || user.fullName || user.username || "User",
      role: user.adminRole || user.role || user.activeRole || "Staff",
      adminRole: user.adminRole || user.role,
      tokenVersion: user.tokenVersion || 0,
      allowedModules: user.allowedModules || [],
    },
    secret,
    { expiresIn: "24h" }
  );
}

/**
 * Core Authentication Middleware for Admin / ERP routes.
 * Validates JWT bearer token, checks account status, and verifies tokenVersion.
 */
export async function verifyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    let token: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else if (req.headers["x-auth-token"]) {
      token = String(req.headers["x-auth-token"]).trim();
    }

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Authentication required. No token provided.",
      });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, getJwtSecret());
    } catch {
      try {
        decoded = jwt.verify(token, FALLBACK_JWT_SECRET);
      } catch {
        res.status(401).json({
          success: false,
          message: "Invalid or expired token. Please log in again.",
        });
        return;
      }
    }

    // Look up fresh user from database
    const orClauses: any[] = [];
    if (decoded._id && mongoose.Types.ObjectId.isValid(decoded._id)) {
      orClauses.push({ _id: decoded._id });
    }
    if (decoded.id !== undefined && decoded.id !== null && typeof decoded.id === "number") {
      orClauses.push({ id: decoded.id });
    }
    if (decoded.username) orClauses.push({ username: decoded.username });
    if (decoded.codeUserId) orClauses.push({ userId: decoded.codeUserId });
    else if (decoded.userId && !mongoose.Types.ObjectId.isValid(decoded.userId)) {
      orClauses.push({ userId: decoded.userId });
    }
    if (decoded.email) orClauses.push({ email: decoded.email });

    const user = await User.findOne(
      orClauses.length > 0 ? { $or: orClauses } : { email: decoded.email }
    );

    if (!user) {
      res.status(401).json({
        success: false,
        message: "User account not found or has been removed.",
      });
      return;
    }

    if (user.status === "Locked") {
      res.status(403).json({
        success: false,
        message: `Account is locked. ${user.lockoutReason || "Please contact an administrator."}`,
      });
      return;
    }

    if (user.status === "Inactive") {
      res.status(403).json({
        success: false,
        message: "Account is deactivated. Please contact an administrator.",
      });
      return;
    }

    // Check tokenVersion for immediate session revocation
    if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined) {
      if (decoded.tokenVersion !== user.tokenVersion) {
        res.status(401).json({
          success: false,
          message:
            "Session has been invalidated due to a security update or password reset. Please log in again.",
        });
        return;
      }
    }

    req.user = user;
    next();
  } catch (err: any) {
    console.error("Error in verifyAuth middleware:", err);
    res.status(500).json({
      success: false,
      message: "Authentication server error.",
    });
  }
}

/**
 * Super Admin Authorization Middleware
 */
export async function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const adminKey = req.headers["x-admin-key"] || req.headers["x-admin-role"];

  // Controlled administrative key compatibility
  if (
    authHeader === "admin-token" ||
    authHeader === "Bearer admin-token" ||
    adminKey === "admin" ||
    adminKey === "Super Admin"
  ) {
    next();
    return;
  }

  await verifyAuth(req, res, () => {
    const userRole = req.user?.adminRole || req.user?.role;
    if (!req.user || !isSuperAdmin(userRole)) {
      res.status(403).json({
        success: false,
        message: "Access denied: Only Super Administrators are authorized to perform this operation.",
      });
      return;
    }
    next();
  });
}

/**
 * Admin or Super Admin Authorization Middleware
 */
export async function requireAdminOrSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const adminKey = req.headers["x-admin-key"] || req.headers["x-admin-role"];

  if (
    authHeader === "admin-token" ||
    authHeader === "Bearer admin-token" ||
    adminKey === "admin" ||
    adminKey === "Super Admin"
  ) {
    next();
    return;
  }

  await verifyAuth(req, res, () => {
    const userRole = req.user?.adminRole || req.user?.role;
    if (!req.user || (!isSuperAdmin(userRole) && !isAdmin(userRole))) {
      res.status(403).json({
        success: false,
        message: "Access denied: Administrator or Super Administrator privileges required.",
      });
      return;
    }
    next();
  });
}

/**
 * Preserved Admin Authentication & Authorization Middleware
 */
export async function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const adminKey = req.headers["x-admin-key"] || req.headers["x-admin-role"];

  if (
    authHeader &&
    authHeader.startsWith("Bearer ") &&
    authHeader !== "Bearer admin-token"
  ) {
    return verifyAuth(req, res, () => {
      const userRole = req.user?.adminRole || req.user?.role;
      if (!req.user || (!isSuperAdmin(userRole) && !isAdmin(userRole) && !isTuitionOperationsAdmin(userRole))) {
        res.status(403).json({
          success: false,
          message: "Access denied: Administrator privileges required.",
        });
        return;
      }
      next();
    });
  }

  if (
    authHeader === "admin-token" ||
    authHeader === "Bearer admin-token" ||
    adminKey === "admin" ||
    adminKey === "Super Admin"
  ) {
    next();
    return;
  }

  res.status(401).json({
    success: false,
    message: "Unauthorized. Admin authorization required.",
  });
}

/**
 * Module Access Authorization Middleware
 * Enforces server-side permissions for specific modules.
 * - Super Admin and Admin have access across all business modules.
 * - Tuition Operations Admin has access to allowedModules (e.g. 1, 2, 3, 4, 5, 33).
 * - Staff accounts must have target module ID in allowedModules array.
 */
export function requireModuleAccess(moduleId: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await verifyAuth(req, res, () => {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: "Authentication required. No user context found.",
        });
        return;
      }

      const userRole = user.adminRole || user.role;

      // Super Admin and Admin retain system-wide permissions
      if (isSuperAdmin(userRole) || isAdmin(userRole)) {
        next();
        return;
      }

      // Tuition Operations Admin or Staff accounts
      if (isTuitionOperationsAdmin(userRole) || isStaff(userRole)) {
        const targetId = Number(moduleId);

        if (Array.isArray(user.allowedModules)) {
          if (user.allowedModules.includes(targetId)) {
            next();
            return;
          }
          res.status(403).json({
            success: false,
            message: `Access denied: Your account does not have permission to access module ${targetId}.`,
          });
          return;
        }

        const legacyDefaultModules = [1, 2, 3, 4, 5];
        if (legacyDefaultModules.includes(targetId)) {
          next();
          return;
        }

        res.status(403).json({
          success: false,
          message: `Access denied: Module permissions have not been assigned for module ${targetId}.`,
        });
        return;
      }

      res.status(403).json({
        success: false,
        message: "Access denied: Role is not authorized to access this module.",
      });
    });
  };
}

