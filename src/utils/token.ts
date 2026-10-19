import jwt from "jsonwebtoken";
import mongoose from "mongoose";

export interface TokenPayload {
  userId: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FATAL: JWT_SECRET or AUTH_SECRET must be set in production mode.");
    }
    return "edupye_core_jwt_secret_key_2026_default_dev";
  }
  return secret;
}

const DEFAULT_EXPIRY = "7d"; // 7 days

/**
 * Signs a cryptographic JWT session token containing user claims.
 */
export function generateSessionToken(
  user: { _id: string | mongoose.Types.ObjectId; email?: string; userType?: string },
  expiresIn = DEFAULT_EXPIRY
): string {
  const secret = getJwtSecret();
  const payload: TokenPayload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.userType,
  };

  const options: jwt.SignOptions = {
    expiresIn: expiresIn as any,
    algorithm: "HS256",
  };

  return jwt.sign(payload as object, secret, options);
}

/**
 * Verifies a session token.
 * Validates cryptographic signature and expiration.
 * Supports legacy raw ObjectId tokens during safe migration window.
 */
export function verifySessionToken(token: string): TokenPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }

  const trimmed = token.trim();

  // 1. Standard signed JWT verification (3 dot-separated parts)
  if (trimmed.split(".").length === 3) {
    try {
      const secret = getJwtSecret();
      const decoded = jwt.verify(trimmed, secret) as TokenPayload;
      if (decoded && decoded.userId) {
        return decoded;
      }
    } catch {
      // Signature mismatch, malformed, or expired
      return null;
    }
  }

  // 2. Safe Migration Strategy:
  // If token is a legacy raw 24-character hexadecimal MongoDB ObjectId,
  // allow resolution during migration window, while issuing signed tokens for all new sessions.
  if (mongoose.Types.ObjectId.isValid(trimmed) && trimmed.length === 24) {
    return {
      userId: trimmed,
    };
  }

  return null;
}
