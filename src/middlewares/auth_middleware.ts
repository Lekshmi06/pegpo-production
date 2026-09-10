import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import User, { IUser } from "../models/User";
import StudentProfile, { IStudentProfile } from "../models/StudentProfile";

// Augment Express Request interface with authenticated student data
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      studentProfile?: IStudentProfile;
    }
  }
}

/**
 * Resolves the authenticated User and their linked StudentProfile.
 * Supports:
 * - Authorization: Bearer <userId>
 * - x-user-id header
 * - x-student-profile-id header
 * - userId or studentProfileId query parameters
 */
export const authenticateStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : undefined;

    const rawUserId =
      bearerToken ||
      (req.headers["x-user-id"] as string) ||
      (req.query.userId as string);

    const rawProfileId =
      (req.headers["x-student-profile-id"] as string) ||
      (req.query.studentProfileId as string);

    const credentialsProvided = Boolean(rawUserId || rawProfileId);

    let user: IUser | null = null;
    let studentProfile: IStudentProfile | null = null;

    // 1. Resolve by StudentProfile ID if provided
    if (rawProfileId) {
      if (mongoose.Types.ObjectId.isValid(rawProfileId)) {
        studentProfile = await StudentProfile.findById(rawProfileId);
        if (studentProfile) {
          user = await User.findById(studentProfile.userId);
        }
      }
      // If a specific profile ID was provided by client but not found in DB
      if (!studentProfile && credentialsProvided) {
        res.status(401).json({
          success: false,
          message: "Invalid student profile ID or profile not found.",
        });
        return;
      }
    }

    // 2. Resolve by User ID if not resolved yet
    if (!user && rawUserId) {
      if (mongoose.Types.ObjectId.isValid(rawUserId)) {
        user = await User.findById(rawUserId);
        if (user) {
          studentProfile = await StudentProfile.findOne({ userId: user._id });
        }
      }
      // If a specific user ID/token was provided by client but not found in DB
      if (!user && credentialsProvided) {
        res.status(401).json({
          success: false,
          message: "Invalid authentication token or user not found.",
        });
        return;
      }
    }

    // 3. Fallback: if user exists but profile missing, create/attach default profile
    if (user && !studentProfile) {
      const resolvedName =
        user.name ||
        user.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      studentProfile = await StudentProfile.create({
        userId: user._id,
        name: resolvedName,
        goal: "School Curriculum Mastery",
        learningPath: "school",
        education: {
          level: "school",
          institution: "School",
          board: "CBSE",
          classLevel: "Class 10",
        },
        schoolDetails: {
          schoolName: "School",
          board: "CBSE",
          classLevel: "Class 10",
          studyMode: "full_syllabus",
          selectedSubject: "Science",
        },
      });
    }

    // 4. If credentials were provided but could not be validated
    if (credentialsProvided && (!user || !studentProfile)) {
      res.status(401).json({
        success: false,
        message: "Invalid student credentials.",
      });
      return;
    }

    // 5. If NO credentials were provided at all:
    if (!user || !studentProfile) {
      if (process.env.NODE_ENV !== "production") {
        const devStudent = await StudentProfile.findOne();
        if (devStudent) {
          const devUser = await User.findById(devStudent.userId);
          if (devUser) {
            req.user = devUser;
            req.studentProfile = devStudent;
            next();
            return;
          }
        }
      }

      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a student.",
      });
      return;
    }

    req.user = user;
    req.studentProfile = studentProfile;
    next();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentication error";
    res.status(500).json({
      success: false,
      message,
    });
  }
};

/**
 * Optional authentication: attaches user & studentProfile if available, but allows guest request to proceed.
 */
export const optionalAuthenticateStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : undefined;

    const rawUserId =
      bearerToken ||
      (req.headers["x-user-id"] as string) ||
      (req.query.userId as string);

    const rawProfileId =
      (req.headers["x-student-profile-id"] as string) ||
      (req.query.studentProfileId as string);

    if (rawProfileId && mongoose.Types.ObjectId.isValid(rawProfileId)) {
      const profile = await StudentProfile.findById(rawProfileId);
      if (profile) {
        req.studentProfile = profile;
        const u = await User.findById(profile.userId);
        if (u) req.user = u;
      }
    } else if (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId)) {
      const u = await User.findById(rawUserId);
      if (u) {
        req.user = u;
        const profile = await StudentProfile.findOne({ userId: u._id });
        if (profile) req.studentProfile = profile;
      }
    }
  } catch {
    // Proceed without auth
  }
  next();
};
