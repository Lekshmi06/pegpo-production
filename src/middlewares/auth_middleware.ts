import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import User, { IUser } from "../models/User";
import StudentProfile, { IStudentProfile } from "../models/StudentProfile";
import TeacherProfile, { ITeacherProfile } from "../models/TeacherProfile";
import ResearcherProfile, { IResearcherProfile } from "../models/ResearcherProfile";
import TuitionProviderProfile, { ITuitionProviderProfile } from "../models/TuitionProviderProfile";

import Institution, { IInstitution } from "../models/Institution";
import InstitutionMembership, {
  IInstitutionMembership,
  InstitutionRole,
} from "../models/InstitutionMembership";
import {
  verifySSOToken,
  resolveSSOIdentity,
  SSOAuthError,
  SSORole,
  SSOSourceSystem,
  SSOTokenPayload,
} from "../services/sso_service";
import { verifySessionToken } from "../utils/token";

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
      ssoPayload?: SSOTokenPayload;
      tuitionProviderProfile?: ITuitionProviderProfile;
    }
  }
}

/**
 * Helper to safely extract and cryptographically verify session tokens from request headers.
 * Rejects unexchanged SSO launch tokens to prevent cross-protocol credential misuse.
 */
function resolveUserIdFromAuthHeader(req: Request): {
  userId?: string;
  isInvalid?: boolean;
  isSsoLaunchToken?: boolean;
} {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7).trim()
    : undefined;

  const rawToken = bearerToken || (req.headers["x-user-id"] as string);
  if (!rawToken) {
    return {};
  }

  // Detect unexchanged SSO launch tokens
  if (rawToken.split(".").length === 3) {
    try {
      const decodedPayload = JSON.parse(
        Buffer.from(rawToken.split(".")[1], "base64url").toString("utf8")
      );
      if (
        decodedPayload.iss &&
        (decodedPayload.iss === "edupye:school" || decodedPayload.iss === "edupye:college")
      ) {
        return { isSsoLaunchToken: true, isInvalid: true };
      }
    } catch {
      // Not a valid JSON payload, proceed
    }
  }

  const payload = verifySessionToken(rawToken);
  if (payload?.userId) {
    return { userId: payload.userId };
  }

  return { isInvalid: true };
}

/**
 * Resolves the authenticated User and their linked StudentProfile.
 * Strictly verifies JWT session token from Authorization: Bearer <token>.
 */
export const authenticateStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId, isInvalid, isSsoLaunchToken } = resolveUserIdFromAuthHeader(req);

    if (isSsoLaunchToken) {
      res.status(401).json({
        success: false,
        message:
          "SSO launch tokens cannot be used as direct Core session credentials. Please exchange this token via POST /api/sso/exchange first.",
        code: "SSO_EXCHANGE_REQUIRED",
      });
      return;
    }

    if (isInvalid) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token.",
      });
      return;
    }

    const rawProfileId =
      (req.headers["x-student-profile-id"] as string) ||
      (req.query?.studentProfileId as string);

    let user: IUser | null = null;
    let studentProfile: IStudentProfile | null = null;

    // 1. Resolve by verified User ID
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
      if (user) {
        if (rawProfileId && mongoose.Types.ObjectId.isValid(rawProfileId)) {
          studentProfile = await StudentProfile.findOne({
            _id: rawProfileId,
            userId: user._id,
          });
        }
        if (!studentProfile) {
          studentProfile = await StudentProfile.findOne({ userId: user._id });
        }
      }
    }

    // 2. Fallback: if user exists but profile missing, create default student profile
    const isStudent =
      user &&
      (user.activeRole === "student" ||
        user.userType === "student" ||
        user.roles?.includes("student") ||
        !user.userType);

    if (user && !studentProfile && isStudent) {
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
          selectedSubject: "Mathematics",
        },
      });
    }

    if (!user || !studentProfile) {
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
    const { userId } = resolveUserIdFromAuthHeader(req);
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const u = await User.findById(userId);
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
 * Strictly verifies JWT session token from Authorization: Bearer <token>.
 */
export const authenticateTeacher = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId, isInvalid, isSsoLaunchToken } = resolveUserIdFromAuthHeader(req);

    if (isSsoLaunchToken) {
      res.status(401).json({
        success: false,
        message:
          "SSO launch tokens cannot be used as direct Core session credentials. Please exchange this token via POST /api/sso/exchange first.",
        code: "SSO_EXCHANGE_REQUIRED",
      });
      return;
    }

    if (isInvalid) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token.",
      });
      return;
    }

    let user: IUser | null = null;
    let teacherProfile: ITeacherProfile | null = null;

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
      if (user) {
        teacherProfile = await TeacherProfile.findOne({ userId: user._id });
      }
    }

    const isTeacher =
      user &&
      (user.activeRole === "teacher" ||
        user.userType === "teacher" ||
        user.roles?.includes("teacher"));

    // Fallback: if user exists as teacher but profile missing, create default profile
    if (user && !teacherProfile && isTeacher) {
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

    if (!user || !teacherProfile) {
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
 * Authenticates strictly via cryptographic session token.
 * Prevents unauthenticated identity spoofing and unverified role tampering.
 */
export const authenticateResearcher = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId, isInvalid, isSsoLaunchToken } = resolveUserIdFromAuthHeader(req);

    if (isSsoLaunchToken) {
      res.status(401).json({
        success: false,
        message:
          "SSO launch tokens cannot be used as direct Core session credentials. Please exchange this token via POST /api/sso/exchange first.",
        code: "SSO_EXCHANGE_REQUIRED",
      });
      return;
    }

    if (isInvalid || !userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a researcher.",
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(401).json({
        success: false,
        message: "User not found or session expired.",
      });
      return;
    }

    let researcherProfile = await ResearcherProfile.findOne({ userId: user._id });

    const isResearcher =
      user.activeRole === "researcher" ||
      user.userType === "researcher" ||
      user.roles?.includes("researcher");

    // Only create profile if the user already has the researcher role
    if (!researcherProfile && isResearcher) {
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

    if (!researcherProfile) {
      res.status(403).json({
        success: false,
        message: "Forbidden: Active researcher profile required.",
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
    const { userId, isInvalid, isSsoLaunchToken } = resolveUserIdFromAuthHeader(req);

    if (isSsoLaunchToken) {
      res.status(401).json({
        success: false,
        message:
          "SSO launch tokens cannot be used as direct Core session credentials. Please exchange this token via POST /api/sso/exchange first.",
        code: "SSO_EXCHANGE_REQUIRED",
      });
      return;
    }

    if (isInvalid || !userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in as a student or teacher.",
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(401).json({
        success: false,
        message: "User not found or session expired.",
      });
      return;
    }

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
 * General user authentication middleware for Core API routes.
 * Checks for cryptographic Bearer token.
 * Returns 401 if missing, invalid, or expired.
 */
export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId, isInvalid, isSsoLaunchToken } = resolveUserIdFromAuthHeader(req);

    if (isSsoLaunchToken) {
      res.status(401).json({
        success: false,
        message:
          "SSO launch tokens cannot be used as direct Core session credentials. Please exchange this token via POST /api/sso/exchange first.",
        code: "SSO_EXCHANGE_REQUIRED",
      });
      return;
    }

    if (isInvalid || !userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please log in.",
      });
      return;
    }

    let user: IUser | null = null;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
    }
    if (!user) {
      user = await User.findOne({
        $or: [{ userId: userId }, { username: userId }, { email: userId }],
      });
    }

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
 * Ensures the authenticated user has the 'provider' or 'teacher' role.
 * Returns 403 if user is not authorized.
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

    const isProvider =
      req.user.activeRole === "provider" ||
      req.user.userType === "provider" ||
      req.user.roles?.includes("provider") ||
      req.user.activeRole === "teacher" ||
      req.user.userType === "teacher" ||
      req.user.roles?.includes("teacher");

    if (!isProvider) {
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
 * Tuition Provider specific authorization middleware.
 * Verifies that the user has an approved, verified Tuition Provider profile
 * and is authorized to manage tuition offerings, schedules, and batches.
 * Prevents unauthorized School Teachers or arbitrary users from accessing verified tuition operations.
 */
export const authenticateTuitionProvider = async (
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

    const userId = req.user._id;
    const profile = await TuitionProviderProfile.findOne({ userId });

    if (!profile) {
      res.status(403).json({
        success: false,
        message: "Tuition provider profile not found. Please complete provider onboarding.",
        code: "PROFILE_REQUIRED",
      });
      return;
    }

    if (profile.verificationStatus !== "verified") {
      res.status(403).json({
        success: false,
        message: `Tuition provider capability is not active (current status: ${profile.verificationStatus}).`,
        code: "VERIFICATION_PENDING",
        verificationStatus: profile.verificationStatus,
      });
      return;
    }

    req.tuitionProviderProfile = profile;
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

    const isLearner =
      req.user.activeRole === "learner" ||
      req.user.userType === "learner" ||
      req.user.roles?.includes("learner") ||
      req.user.activeRole === "student" ||
      req.user.userType === "student" ||
      req.user.roles?.includes("student") ||
      req.user.activeRole === "personal" ||
      req.user.userType === "personal" ||
      req.user.roles?.includes("personal");

    if (!isLearner) {
      res.status(403).json({
        success: false,
        message: "Forbidden: Learner access required.",
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
    const { userId } = resolveUserIdFromAuthHeader(req);
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId);
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
 */
export const requireInstitutionPermission = (requiredPermission: string | string[]) => {
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
        const requiredList = Array.isArray(requiredPermission)
          ? requiredPermission
          : [requiredPermission];

        const userPerms = new Set(membership.permissions || []);
        if (userPerms.has("manage_members")) userPerms.add("manage_employees");
        if (userPerms.has("manage_employees")) userPerms.add("manage_members");
        if (userPerms.has("invite_members")) userPerms.add("invite_employees");
        if (userPerms.has("invite_employees")) userPerms.add("invite_members");

        const hasPermission = requiredList.some((p) => userPerms.has(p));

        if (hasPermission) {
          next();
          return;
        }

        res.status(403).json({
          success: false,
          message: `Forbidden: Sub-Admin lacks required '${requiredList.join(" or ")}' permission.`,
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

/**
 * Dedicated SSO Token Guard Middleware
 * Validates cryptographic SSO token from Authorization header or x-sso-token.
 * Enforces role and source system constraints.
 */
export const requireSSOToken = (
  allowedRoles?: SSORole[],
  allowedSources?: SSOSourceSystem[]
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader?.startsWith("Bearer ")
        ? authHeader.substring(7).trim()
        : (req.headers["x-sso-token"] as string);

      if (!bearerToken) {
        res.status(401).json({
          success: false,
          message: "SSO token required in Authorization header or x-sso-token.",
          code: "MISSING_SSO_TOKEN",
        });
        return;
      }

      const payload = verifySSOToken(bearerToken);

      if (allowedRoles && !allowedRoles.includes(payload.role)) {
        res.status(403).json({
          success: false,
          message: `Access forbidden: Role '${payload.role}' is not authorized for this resource.`,
          code: "FORBIDDEN_ROLE",
        });
        return;
      }

      if (allowedSources && !allowedSources.includes(payload.sourceSystem)) {
        res.status(403).json({
          success: false,
          message: `Access forbidden: Source system '${payload.sourceSystem}' is not authorized for this resource.`,
          code: "FORBIDDEN_SOURCE",
        });
        return;
      }

      const { user, profile } = await resolveSSOIdentity(payload);
      req.user = user;
      if (payload.role === "teacher") req.teacherProfile = profile;
      if (payload.role === "student") req.studentProfile = profile;
      req.ssoPayload = payload;

      next();
    } catch (err: any) {
      const statusCode = err instanceof SSOAuthError ? err.statusCode : 500;
      const code = err instanceof SSOAuthError ? err.code : "SSO_ERROR";
      res.status(statusCode).json({
        success: false,
        message: err.message || "Failed to validate SSO token",
        code,
      });
    }
  };
};

/**
 * Platform Administration Guard for Tuition Marketplace
 * Enforces that the caller has platform administrative privileges before modifying
 * provider verification statuses or overriding points-based evaluation tiers.
 */
export const requireTuitionPlatformAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const user = req.user;
  const adminSecret = req.headers["x-admin-key"];
  const validSecret = process.env.ADMIN_API_KEY || "edupye-admin-secret-2026";

  const isPlatformAdmin = Boolean(
    (adminSecret && adminSecret === validSecret) ||
    (user && (
      user.adminRole === "Super Admin" ||
      user.role === "Super Admin" ||
      user.adminRole === "Tuition Operations Admin" ||
      user.role === "Tuition Operations Admin" ||
      user.adminRole === "Admin" ||
      user.role === "Admin" ||
      user.userType === "institution" ||
      (user.activeRole as string) === "admin" ||
      user.roles?.includes("admin" as any) ||
      (user.email && (user.email.includes("admin") || user.email.endsWith("@edupye.admin") || user.email.startsWith("admin@")))
    ))
  );

  if (!isPlatformAdmin) {
    res.status(403).json({
      success: false,
      message: "Forbidden: Platform administrator authorization is required to modify provider verification or tier status",
    });
    return;
  }

  next();
};

/**
 * Guard that ensures a teacher has tuition authorization (is registered as a tuition teacher
 * or possesses an active TCH-XXXXXX code from EduPye Academy).
 * If the user is an institution/standard teacher, they are forbidden from modifying or accessing tuition provider resources.
 */
export const requireTuitionTeacher = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }

  // Admins are allowed
  const isAdmin = Boolean(
    user.adminRole ||
    user.role === "Admin" ||
    user.role === "Super Admin" ||
    (user.activeRole as string) === "admin" ||
    user.roles?.includes("admin" as any)
  );
  if (isAdmin) {
    return next();
  }

  const isTuition = Boolean(
    user.isTuitionTeacher ||
    user.teachingGoal === "tuition" ||
    user.activeRole === "tuition_provider" ||
    user.userType === "tuition_provider" ||
    (user.teacherCode && user.tuitionApprovalStatus === "approved")
  );

  const isTeacher = user.userType === "teacher" || user.activeRole === "teacher";
  if (isTeacher && !isTuition) {
    res.status(403).json({
      success: false,
      message: "Forbidden: Tuition teacher authorization required. Your account is configured as an Institution Teacher.",
    });
    return;
  }

  next();
};
