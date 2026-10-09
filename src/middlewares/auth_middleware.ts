import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import User, { IUser } from "../models/User";
import StudentProfile, { IStudentProfile } from "../models/StudentProfile";
import TeacherProfile, { ITeacherProfile } from "../models/TeacherProfile";
import ResearcherProfile, { IResearcherProfile } from "../models/ResearcherProfile";

import Institution, { IInstitution } from "../models/Institution";
import InstitutionMembership, {
  IInstitutionMembership,
  InstitutionRole,
} from "../models/InstitutionMembership";

// Augment Express Request interface with authenticated student/teacher/researcher/institution data
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      studentProfile?: IStudentProfile;
      teacherProfile?: ITeacherProfile;
      researcherProfile?: IResearcherProfile;
      institution?: IInstitution;
      institutionMembership?: IInstitutionMembership;
      institutionId?: string;
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

/**
 * Resolves the authenticated User and their linked TeacherProfile.
 * Strictly checks that the resolved profile is owned by the user.
 */
export const authenticateTeacher = async (
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
      (req.headers["x-teacher-profile-id"] as string) ||
      (req.query.teacherProfileId as string);

    const credentialsProvided = Boolean(rawUserId || rawProfileId);

    let user: IUser | null = null;
    let teacherProfile: ITeacherProfile | null = null;

    // 1. Resolve by TeacherProfile ID if provided
    if (rawProfileId && mongoose.Types.ObjectId.isValid(rawProfileId)) {
      teacherProfile = await TeacherProfile.findById(rawProfileId);
      if (teacherProfile) {
        user = await User.findById(teacherProfile.userId);
      }
      if (!teacherProfile && credentialsProvided) {
        res.status(401).json({
          success: false,
          message: "Invalid teacher profile ID or profile not found.",
        });
        return;
      }
    }

    // 2. Resolve by User ID if not resolved yet
    if (!user && rawUserId && mongoose.Types.ObjectId.isValid(rawUserId)) {
      user = await User.findById(rawUserId);
      if (user) {
        teacherProfile = await TeacherProfile.findOne({ userId: user._id });
      }
      if (!user && credentialsProvided) {
        res.status(401).json({
          success: false,
          message: "Invalid authentication token or user not found.",
        });
        return;
      }
    }

    // 3. Fallback: if user exists as teacher but profile missing, create/attach default profile
    if (user && !teacherProfile && user.userType === "teacher") {
      const resolvedName =
        user.name ||
        user.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      teacherProfile = await TeacherProfile.create({
        userId: user._id,
        name: resolvedName,
        teacherType: "institution",
        goal: "Lesson Planning",
      });
    }

    // 4. Validate credentials
    if (credentialsProvided && (!user || !teacherProfile)) {
      res.status(401).json({
        success: false,
        message: "Invalid teacher credentials.",
      });
      return;
    }

    // 5. If no credentials provided, in development fallback to first teacher profile
    if (!user || !teacherProfile) {
      if (process.env.NODE_ENV !== "production") {
        const devTeacher = await TeacherProfile.findOne();
        if (devTeacher) {
          const devUser = await User.findById(devTeacher.userId);
          if (devUser) {
            req.user = devUser;
            req.teacherProfile = devTeacher;
            next();
            return;
          }
        }
      }

      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a teacher.",
      });
      return;
    }

    req.user = user;
    req.teacherProfile = teacherProfile;
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
 * Resolves the authenticated User and their linked ResearcherProfile.
 * Supports:
 * - Authorization: Bearer <userId>
 * - x-user-id header
 * - x-researcher-profile-id header
 * - userId or researcherProfileId query parameters
 */
export const authenticateResearcher = async (
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
      (req.headers["x-researcher-profile-id"] as string) ||
      (req.query.researcherProfileId as string);

    const rawEmail = (req.headers["x-user-email"] as string)?.trim().toLowerCase() ||
      (req.query.email as string)?.trim().toLowerCase();

    const credentialsProvided = Boolean(rawUserId || rawProfileId || rawEmail);

    let user: IUser | null = null;
    let researcherProfile: IResearcherProfile | null = null;

    // 1. Resolve by ResearcherProfile ID if provided
    if (rawProfileId && mongoose.Types.ObjectId.isValid(rawProfileId)) {
      researcherProfile = await ResearcherProfile.findById(rawProfileId);
      if (researcherProfile) {
        user = await User.findById(researcherProfile.userId);
      }
      if (!researcherProfile && credentialsProvided && !rawUserId && !rawEmail) {
        res.status(401).json({
          success: false,
          message: "Invalid researcher profile ID or profile not found.",
        });
        return;
      }
    }

    // 2. Resolve by User ID if not resolved yet
    if (!user && rawUserId && mongoose.Types.ObjectId.isValid(rawUserId)) {
      user = await User.findById(rawUserId);
      if (user) {
        researcherProfile = await ResearcherProfile.findOne({ userId: user._id });
      }
      if (!user && credentialsProvided && !rawEmail) {
        res.status(401).json({
          success: false,
          message: "Invalid authentication token or user not found.",
        });
        return;
      }
    }

    // 3. Resolve by Email if not resolved yet
    if (!user && rawEmail) {
      user = await User.findOne({ email: rawEmail });
      if (user) {
        researcherProfile = await ResearcherProfile.findOne({ userId: user._id });
      }
    }

    // 4. Fallback: if user exists, create/attach profile and ensure researcher role
    if (user && !researcherProfile) {
      if (user.userType !== "researcher") {
        user.userType = "researcher";
        await user.save();
      }

      const resolvedName =
        user.name ||
        user.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      researcherProfile = await ResearcherProfile.create({
        userId: user._id,
        fullName: resolvedName,
        contact: { email: user.email },
        onboardingCompleted: false,
        onboardingStep: 1,
      });
    }

    // 4. Validate credentials
    if (credentialsProvided && (!user || !researcherProfile)) {
      res.status(401).json({
        success: false,
        message: "Invalid researcher credentials.",
      });
      return;
    }

    // 5. In development, fallback to first researcher profile if no credentials provided
    if (!user || !researcherProfile) {
      if (process.env.NODE_ENV !== "production") {
        const devResearcher = await ResearcherProfile.findOne();
        if (devResearcher) {
          const devUser = await User.findById(devResearcher.userId);
          if (devUser) {
            req.user = devUser;
            req.researcherProfile = devResearcher;
            next();
            return;
          }
        }
      }

      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a researcher.",
      });
      return;
    }

    req.user = user;
    req.researcherProfile = researcherProfile;
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
 * Resolves either an authenticated Student or Teacher.
 * Populates req.user and either req.studentProfile or req.teacherProfile.
 */
export const authenticateStudentOrTeacher = async (
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

    const rawStudentProfileId =
      (req.headers["x-student-profile-id"] as string) ||
      (req.query.studentProfileId as string);

    const rawTeacherProfileId =
      (req.headers["x-teacher-profile-id"] as string) ||
      (req.query.teacherProfileId as string);

    // 1. Try explicit teacher profile ID
    if (rawTeacherProfileId && mongoose.Types.ObjectId.isValid(rawTeacherProfileId)) {
      const teacherProfile = await TeacherProfile.findById(rawTeacherProfileId);
      if (teacherProfile) {
        req.teacherProfile = teacherProfile;
        const u = await User.findById(teacherProfile.userId);
        if (u) req.user = u;
        next();
        return;
      }
    }

    // 2. Try explicit student profile ID
    if (rawStudentProfileId && mongoose.Types.ObjectId.isValid(rawStudentProfileId)) {
      const studentProfile = await StudentProfile.findById(rawStudentProfileId);
      if (studentProfile) {
        req.studentProfile = studentProfile;
        const u = await User.findById(studentProfile.userId);
        if (u) req.user = u;
        next();
        return;
      }
    }

    // 3. Resolve by user ID / Bearer token
    if (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId)) {
      const user = await User.findById(rawUserId);
      if (user) {
        req.user = user;
        if (user.userType === "teacher") {
          const teacherProfile = await TeacherProfile.findOne({ userId: user._id });
          if (teacherProfile) {
            req.teacherProfile = teacherProfile;
            next();
            return;
          }
        } else {
          const studentProfile = await StudentProfile.findOne({ userId: user._id });
          if (studentProfile) {
            req.studentProfile = studentProfile;
            next();
            return;
          }
        }
      }
    }

    // 4. In development mode fallback
    if (process.env.NODE_ENV !== "production") {
      if (rawTeacherProfileId) {
        const devTeacher = await TeacherProfile.findOne();
        if (devTeacher) {
          req.teacherProfile = devTeacher;
          const u = await User.findById(devTeacher.userId);
          if (u) req.user = u;
          next();
          return;
        }
      }

      const routeStudentId = Array.isArray(req.params.studentId)
        ? req.params.studentId[0]
        : req.params.studentId;

      if (routeStudentId && mongoose.Types.ObjectId.isValid(routeStudentId)) {
        const studentProfile = await StudentProfile.findById(routeStudentId);
        if (studentProfile) {
          req.studentProfile = studentProfile;
          const u = await User.findById(studentProfile.userId);
          if (u) req.user = u;
          next();
          return;
        }
      }

      const devStudent = await StudentProfile.findOne();
      if (devStudent) {
        req.studentProfile = devStudent;
        const u = await User.findById(devStudent.userId);
        if (u) req.user = u;
        next();
        return;
      }
    }

    res.status(401).json({
      success: false,
      message: "Authentication required. Please log in as a student or teacher.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication error";
    res.status(500).json({
      success: false,
      message,
    });
  }
};

/**
 * General user authentication middleware for Course Marketplace.
 * Checks for Bearer token or x-user-id header or userId query param.
 * Returns 401 if missing or invalid.
 */
export const authenticateUser = async (
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

    if (!rawUserId) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in.",
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(rawUserId)) {
      res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
      return;
    }

    const user = await User.findById(rawUserId);
    if (!user) {
      res.status(401).json({
        success: false,
        message: "User not found or session expired.",
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication error";
    res.status(500).json({
      success: false,
      message,
    });
  }
};

/**
 * Provider-specific authorization middleware.
 * Ensures the authenticated user has the 'provider' role.
 * Returns 403 if user is not a provider.
 */
export const authenticateProvider = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  await authenticateUser(req, res, async () => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    if (req.user.userType !== "provider") {
      res.status(403).json({
        success: false,
        message: "Forbidden: Provider access required.",
      });
      return;
    }

    next();
  });
};

/**
 * Learner-specific authentication middleware.
 * Ensures the user is logged in as a learner, student, or personal user.
 */
export const authenticateLearner = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  await authenticateUser(req, res, async () => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a learner.",
      });
      return;
    }

    next();
  });
};

/**
 * Optional authentication for public course browsing.
 * Populates req.user if a valid token is provided, but allows guest access.
 */
export const optionalAuthenticateUser = async (
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

    if (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId)) {
      const user = await User.findById(rawUserId);
      if (user) {
        req.user = user;
      }
    }
  } catch {
    // Non-blocking
  }
  next();
};

const resolveParam = (p: unknown): string | undefined => {
  if (typeof p === "string") return p;
  if (Array.isArray(p) && typeof p[0] === "string") return p[0];
  return undefined;
};

/**
 * Strict Institution Authorization Middleware
 * Enforces server-side tenant isolation:
 * 1. Resolves authenticated user via authenticateUser
 * 2. Resolves target institutionId from route params (:institutionId or :id),
 *    request headers (x-institution-id), query, or body.
 * 3. Never trusts client assertions: queries DB for active InstitutionMembership
 * 4. Verifies role requirements if allowedRoles is specified
 * 5. Returns 403 Forbidden on cross-institution access or role mismatch
 */
export const authenticateInstitutionMember = (allowedRoles?: InstitutionRole[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await authenticateUser(req, res, async () => {
      try {
        if (!req.user) {
          res.status(401).json({
            success: false,
            message: "Authentication required.",
          });
          return;
        }

        const rawInstitutionId =
          resolveParam(req.params.institutionId) ||
          resolveParam(req.params.id) ||
          (req.headers["x-institution-id"] as string) ||
          (req.query.institutionId as string) ||
          req.body?.institutionId;

        if (!rawInstitutionId || !mongoose.Types.ObjectId.isValid(rawInstitutionId)) {
          res.status(400).json({
            success: false,
            message: "A valid institution ID is required in route parameters or headers.",
          });
          return;
        }

        const institutionId = rawInstitutionId.toString();

        // Check active membership
        let membership = await InstitutionMembership.findOne({
          institutionId,
          userId: req.user._id,
          status: "active",
        });

        // If not found in membership, check if the user is the institution owner
        if (!membership) {
          const institutionDoc = await Institution.findById(institutionId);
          if (institutionDoc && institutionDoc.owner.toString() === req.user._id.toString()) {
            // Auto-heal/sync owner membership as admin if missing
            membership = await InstitutionMembership.findOneAndUpdate(
              { institutionId, userId: req.user._id },
              {
                $setOnInsert: {
                  institutionId,
                  userId: req.user._id,
                  role: "admin",
                  status: "active",
                  title: "Institution Owner & Administrator",
                },
              },
              { upsert: true, new: true }
            );
          }
        }

        if (!membership || membership.status !== "active") {
          res.status(403).json({
            success: false,
            message: "Forbidden: You do not have an active membership in this institution.",
          });
          return;
        }

        // Verify role restriction if provided
        if (allowedRoles && allowedRoles.length > 0) {
          if (!allowedRoles.includes(membership.role)) {
            res.status(403).json({
              success: false,
              message: `Forbidden: Requires institution role [${allowedRoles.join(", ")}]. Your current role is '${membership.role}'.`,
            });
            return;
          }
        }

        req.institutionId = institutionId;
        req.institutionMembership = membership;
        next();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Institution authorization error";
        res.status(500).json({
          success: false,
          message,
        });
      }
    });
  };
};

export const requireInstitutionAdmin = authenticateInstitutionMember(["admin"]);
export const requireInstitutionManagement = authenticateInstitutionMember(["admin", "subadmin"]);
export const requireInstitutionStaff = authenticateInstitutionMember(["admin", "subadmin", "trainer"]);

/**
 * Granular Permission Middleware
 * Admin is always granted access.
 * Sub-Admin is checked for explicit permission in membership.permissions array.
 * Other roles are denied with 403 Forbidden.
 */
export const requireInstitutionPermission = (requiredPermission: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const baseMiddleware = authenticateInstitutionMember(["admin", "subadmin"]);
    await baseMiddleware(req, res, () => {
      const membership = req.institutionMembership;
      if (!membership) {
        res.status(403).json({
          success: false,
          message: "Forbidden: No active institution membership found.",
        });
        return;
      }

      if (membership.role === "admin") {
        next();
        return;
      }

      if (membership.role === "subadmin") {
        const hasPermission =
          Array.isArray(membership.permissions) &&
          membership.permissions.includes(requiredPermission);

        if (hasPermission) {
          next();
          return;
        }

        res.status(403).json({
          success: false,
          message: `Forbidden: Sub-Admin lacks required '${requiredPermission}' permission.`,
        });
        return;
      }

      res.status(403).json({
        success: false,
        message: "Forbidden: Insufficient privileges for this operation.",
      });
    });
  };
};
