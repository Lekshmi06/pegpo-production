import crypto from "node:crypto";
import mongoose from "mongoose";
import User, { IUser } from "../models/User";
import TeacherProfile, { ITeacherProfile } from "../models/TeacherProfile";
import StudentProfile, { IStudentProfile } from "../models/StudentProfile";
import TeachingContext from "../models/TeachingContext";

export type SSOSourceSystem = "school" | "college";
export type SSORole = "teacher" | "student";

export interface SSOAcademicContext {
  schoolName?: string;
  departmentId?: string;
  departmentName?: string;
  sclassName?: string;
  section?: string;
  subjectName?: string;
  courseCode?: string;
  courseName?: string;
  rollNum?: number | string;
  facultyId?: string;
  studentId?: string;
  academicYear?: string;
}

/**
 * ============================================================================
 * EDUPYE CROSS-MODULE SSO TOKEN CONTRACT (RFC 7519 COMPLIANT JWT)
 * ============================================================================
 * iss: Issuer ('edupye:school' | 'edupye:college')
 * aud: Audience (must be 'edupye:core')
 * sub: Stable external subject identifier (e.g. 'ext:school:teacher:123')
 * sourceSystem: 'school' | 'college'
 * externalUserId: Raw unique user ID in the source system
 * institutionId: Unique institution ID in the source system (schoolId or deptId)
 * role: Target role in Core ('teacher' | 'student')
 * name: Full user display name
 * email: Real email if available, or undefined for roll-number based accounts
 * academicContext: Contextual academic metadata (course, class, subject)
 * jti: Cryptographically random token identifier (prevents replay)
 * iat: Issued at timestamp (seconds)
 * exp: Expiration timestamp (seconds, short-lived: 900s / 15 mins max)
 */
export interface SSOTokenPayload {
  iss: "edupye:school" | "edupye:college";
  aud: "edupye:core";
  sub: string;
  sourceSystem: SSOSourceSystem;
  externalUserId: string;
  institutionId: string;
  role: SSORole;
  name: string;
  email?: string;
  academicContext?: SSOAcademicContext;
  jti: string;
  iat: number;
  exp: number;
}

export interface SSOExchangeResult {
  token: string;
  user: {
    _id: string;
    email: string;
    name: string;
    userType: string;
    sourceSystem: SSOSourceSystem;
    externalUserId: string;
  };
  profile: any;
  role: SSORole;
  sourceSystem: SSOSourceSystem;
  institutionId: string;
}

export class SSOAuthError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 401, code = "SSO_AUTH_ERROR") {
    super(message);
    this.name = "SSOAuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

import SSOTokenRegistry from "../models/SSOTokenRegistry";

// ----------------------------------------------------------------------------
// Configuration & Secrets
// ----------------------------------------------------------------------------

/**
 * Validates SSO environment configuration on service startup.
 * Immediately fails boot in production if secret is missing or insecure (<32 characters).
 */
export function validateSSOConfigurationOnStartup(): void {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.EDUPYE_SSO_SECRET || process.env.CROSS_MODULE_SSO_SECRET;

  if (isProd) {
    if (!secret) {
      throw new Error(
        "FATAL SECURITY CONFIGURATION: EDUPYE_SSO_SECRET or CROSS_MODULE_SSO_SECRET must be set in production mode. Refusing startup with fallback secrets."
      );
    }
    if (secret.length < 32) {
      throw new Error(
        "FATAL SECURITY CONFIGURATION: EDUPYE_SSO_SECRET is too short/weak for production (minimum 32 characters required)."
      );
    }
  }
}

export const getSSOSecret = (): string => {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.EDUPYE_SSO_SECRET || process.env.CROSS_MODULE_SSO_SECRET;

  if (isProd) {
    if (!secret) {
      throw new Error(
        "FATAL SECURITY CONFIGURATION: EDUPYE_SSO_SECRET or CROSS_MODULE_SSO_SECRET must be set in production mode."
      );
    }
    if (secret.length < 32) {
      throw new Error(
        "FATAL SECURITY CONFIGURATION: EDUPYE_SSO_SECRET is too short/weak for production (minimum 32 characters required)."
      );
    }
    return secret;
  }

  return secret || "edupye_cross_module_sso_master_secret_2026";
};

export const ALLOWED_SSO_ISSUERS = new Set<string>([
  "edupye:school",
  "edupye:college",
]);

export const EXPECTED_SSO_AUDIENCE = "edupye:core";
export const DEFAULT_SSO_TTL_SECONDS = 900; // 15 minutes
export const CLOCK_SKEW_TOLERANCE_SECONDS = 30; // 30 seconds

// ----------------------------------------------------------------------------
// Token Replay & Revocation Registry (Persistent MongoDB + Fast In-Memory Buffer)
// ----------------------------------------------------------------------------
interface ReplayRecord {
  consumedAt: number;
  exp: number;
  sourceSystem: string;
  externalUserId: string;
}

const consumedJtiRegistry = new Map<string, ReplayRecord>();
const revokedJtiRegistry = new Set<string>();

/**
 * Periodically purge expired JTI entries from memory buffer
 */
export function pruneExpiredJtiRecords(): void {
  const now = Math.floor(Date.now() / 1000);
  for (const [jti, record] of consumedJtiRegistry.entries()) {
    if (record.exp < now) {
      consumedJtiRegistry.delete(jti);
    }
  }
}

/**
 * Explicitly revoke an SSO token before its expiration.
 * Persisted to MongoDB so all instances and post-restart instances honor it.
 */
export async function revokeSSOToken(
  jti: string,
  options: {
    sourceSystem?: SSOSourceSystem;
    externalUserId?: string;
    expiresAt?: Date;
  } = {}
): Promise<void> {
  revokedJtiRegistry.add(jti);

  if (mongoose.connection.readyState === 1) {
    const defaultExpiry = options.expiresAt || new Date(Date.now() + DEFAULT_SSO_TTL_SECONDS * 1000);
    await SSOTokenRegistry.findOneAndUpdate(
      { jti },
      {
        $set: {
          jti,
          sourceSystem: options.sourceSystem || "school",
          externalUserId: options.externalUserId || "unknown",
          isRevoked: true,
          revokedAt: new Date(),
          expiresAt: defaultExpiry,
        },
      },
      { upsert: true, returnDocument: "after" }
    );
  }
}

/**
 * Check if a JTI has been revoked across memory buffer and MongoDB persistent store
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  if (revokedJtiRegistry.has(jti)) return true;

  if (mongoose.connection.readyState === 1) {
    const record = await SSOTokenRegistry.findOne({ jti, isRevoked: true });
    if (record) {
      revokedJtiRegistry.add(jti);
      return true;
    }
  }

  return false;
}

/**
 * Clear in-memory buffer only (used to simulate container cold starts in tests)
 */
export function clearInMemorySSOCache(): void {
  consumedJtiRegistry.clear();
  revokedJtiRegistry.clear();
}

/**
 * Reset registries (for testing purposes)
 */
export async function resetSSORegistries(): Promise<void> {
  clearInMemorySSOCache();
  if (mongoose.connection.readyState === 1) {
    await SSOTokenRegistry.deleteMany({});
  }
}

// ----------------------------------------------------------------------------
// Token Encoding, Signing, and Verification Helpers
// ----------------------------------------------------------------------------
function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

function parseBase64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

/**
 * Cryptographically sign an SSO payload into an HS256 JWT
 */
export function generateSSOToken(
  payload: Omit<SSOTokenPayload, "iat" | "exp" | "jti" | "aud"> & {
    iat?: number;
    exp?: number;
    jti?: string;
    aud?: "edupye:core";
  },
  customSecret?: string
): string {
  const secret = customSecret || getSSOSecret();
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const fullPayload: SSOTokenPayload = {
    ...payload,
    aud: payload.aud || "edupye:core",
    jti: payload.jti || crypto.randomUUID(),
    iat: payload.iat !== undefined ? payload.iat : now,
    exp: payload.exp !== undefined ? payload.exp : now + DEFAULT_SSO_TTL_SECONDS,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify and decode an SSO Token with strict issuer, audience, and signature validation
 */
export function verifySSOToken(
  token: string,
  options: {
    expectedAudience?: string;
    customSecret?: string;
    checkReplay?: boolean;
  } = {}
): SSOTokenPayload {
  if (!token || typeof token !== "string") {
    throw new SSOAuthError("SSO token is missing or malformed", 401, "TOKEN_MISSING");
  }

  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    throw new SSOAuthError("Invalid SSO token format (must be 3-part JWT)", 401, "TOKEN_MALFORMED");
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const secret = options.customSecret || getSSOSecret();

  // 1. Verify Cryptographic Signature with Timing-Safe Equality
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw new SSOAuthError("Invalid SSO token signature", 401, "INVALID_SIGNATURE");
  }

  // 2. Parse Payload
  let payload: SSOTokenPayload;
  try {
    payload = JSON.parse(parseBase64url(encodedPayload));
  } catch {
    throw new SSOAuthError("Invalid SSO token payload JSON", 401, "INVALID_PAYLOAD_JSON");
  }

  const now = Math.floor(Date.now() / 1000);

  // 3. Strict Issuer Validation
  if (!payload.iss || !ALLOWED_SSO_ISSUERS.has(payload.iss)) {
    throw new SSOAuthError(
      `Untrusted SSO token issuer '${payload.iss}'. Expected 'edupye:school' or 'edupye:college'.`,
      401,
      "INVALID_ISSUER"
    );
  }

  // Cross-system claim consistency check
  if (
    (payload.iss === "edupye:school" && payload.sourceSystem !== "school") ||
    (payload.iss === "edupye:college" && payload.sourceSystem !== "college")
  ) {
    throw new SSOAuthError(
      `Issuer '${payload.iss}' does not match sourceSystem '${payload.sourceSystem}'`,
      401,
      "SOURCE_ISSUER_MISMATCH"
    );
  }

  // 4. Strict Audience Validation
  const expectedAud = options.expectedAudience || EXPECTED_SSO_AUDIENCE;
  if (payload.aud !== expectedAud) {
    throw new SSOAuthError(
      `Invalid SSO token audience '${payload.aud}'. Expected '${expectedAud}'.`,
      401,
      "INVALID_AUDIENCE"
    );
  }

  // 5. Expiry Check (with clock skew tolerance)
  if (!payload.exp || typeof payload.exp !== "number") {
    throw new SSOAuthError("SSO token is missing expiration claim ('exp')", 401, "MISSING_EXP");
  }

  if (payload.exp + CLOCK_SKEW_TOLERANCE_SECONDS < now) {
    throw new SSOAuthError("SSO token has expired", 401, "TOKEN_EXPIRED");
  }

  // 6. Issued-At Future Check
  if (payload.iat && payload.iat - CLOCK_SKEW_TOLERANCE_SECONDS > now) {
    throw new SSOAuthError("SSO token issued in the future (clock skew)", 401, "TOKEN_FUTURE_IAT");
  }

  // 7. Token Revocation Check (in-memory fast cache check for sync verify)
  if (payload.jti && revokedJtiRegistry.has(payload.jti)) {
    throw new SSOAuthError("SSO token has been revoked", 401, "TOKEN_REVOKED");
  }

  // 8. Replay Check if requested
  if (options.checkReplay && payload.jti) {
    if (consumedJtiRegistry.has(payload.jti)) {
      throw new SSOAuthError(
        "SSO token replay detected. Token has already been consumed.",
        401,
        "TOKEN_REPLAY_DETECTED"
      );
    }
  }

  // 9. Required Fields Validation
  if (!payload.externalUserId || !payload.role || !payload.institutionId || !payload.sub) {
    throw new SSOAuthError(
      "SSO token is missing mandatory claims (externalUserId, role, institutionId, or sub)",
      400,
      "MISSING_MANDATORY_CLAIMS"
    );
  }

  if (payload.role !== "teacher" && payload.role !== "student") {
    throw new SSOAuthError(
      `Invalid role '${payload.role}'. Core SSO supports 'teacher' and 'student'.`,
      400,
      "INVALID_ROLE"
    );
  }

  return payload;
}

/**
 * Mark a validated SSO Token JTI as consumed to prevent replay attacks.
 * Uses atomic MongoDB operations with TTL indexing to guarantee multi-instance
 * safety across Render container restarts.
 */
export async function markSSOTokenConsumed(payload: SSOTokenPayload): Promise<void> {
  if (!payload.jti) return;
  pruneExpiredJtiRecords();

  // Fast memory buffer check
  if (consumedJtiRegistry.has(payload.jti)) {
    throw new SSOAuthError(
      "SSO token replay detected. Token has already been consumed.",
      401,
      "TOKEN_REPLAY_DETECTED"
    );
  }

  // Persistent MongoDB atomic check & record
  if (mongoose.connection.readyState === 1) {
    const existing = await SSOTokenRegistry.findOne({ jti: payload.jti });
    if (existing) {
      if (existing.isRevoked) {
        throw new SSOAuthError("SSO token has been revoked", 401, "TOKEN_REVOKED");
      }
      if (existing.isConsumed) {
        throw new SSOAuthError(
          "SSO token replay detected. Token has already been consumed.",
          401,
          "TOKEN_REPLAY_DETECTED"
        );
      }
    }

    try {
      await SSOTokenRegistry.create({
        jti: payload.jti,
        sourceSystem: payload.sourceSystem,
        externalUserId: payload.externalUserId,
        isConsumed: true,
        consumedAt: new Date(),
        isRevoked: false,
        expiresAt: new Date(payload.exp * 1000),
      });
    } catch (err: any) {
      if (err.code === 11000) {
        throw new SSOAuthError(
          "SSO token replay detected. Token has already been consumed.",
          401,
          "TOKEN_REPLAY_DETECTED"
        );
      }
      throw err;
    }
  }

  consumedJtiRegistry.set(payload.jti, {
    consumedAt: Math.floor(Date.now() / 1000),
    exp: payload.exp,
    sourceSystem: payload.sourceSystem,
    externalUserId: payload.externalUserId,
  });
}

// ----------------------------------------------------------------------------
// Stable Identity Resolution & Mapping
// ----------------------------------------------------------------------------

/**
 * Deterministically construct the external namespace key
 */
export function buildExternalNamespace(
  sourceSystem: SSOSourceSystem,
  role: SSORole,
  externalUserId: string
): string {
  return `ext:${sourceSystem}:${role}:${externalUserId.trim().toLowerCase()}`;
}

/**
 * Deterministically construct a safe synthetic email when real email is missing
 * or to prevent collisions with native local accounts.
 */
export function buildDeterministicSyntheticEmail(
  sourceSystem: SSOSourceSystem,
  role: SSORole,
  externalUserId: string
): string {
  const sanitizedId = externalUserId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return `sso_${sourceSystem}_${role}_${sanitizedId}@sso.edupye.local`;
}

/**
 * Resolves or provisions a Core User and associated Profile (TeacherProfile or StudentProfile)
 * using the stable external identifier and namespace.
 *
 * Guarantees:
 * 1. Safe against duplicate user creation upon repeat logins.
 * 2. Does not rely on email alone as the identity key.
 * 3. Never mutates native ERP databases.
 * 4. Strictly sets appropriate userType and role boundaries.
 */
export async function resolveSSOIdentity(
  payload: SSOTokenPayload
): Promise<{ user: IUser; profile: any; isNew: boolean }> {
  const namespace =
    payload.sub ||
    buildExternalNamespace(payload.sourceSystem, payload.role, payload.externalUserId);

  // 1. Look up existing Core User by namespaced external identity
  let user = await User.findOne({
    "externalIdentity.namespace": namespace,
  });

  let isNew = false;

  // 2. If not found by namespace, check fallback criteria
  if (!user && payload.externalUserId) {
    user = await User.findOne({
      "externalIdentity.sourceSystem": payload.sourceSystem,
      "externalIdentity.externalUserId": payload.externalUserId,
    });
  }

  const resolvedName = payload.name?.trim() || `User ${payload.externalUserId}`;
  const syntheticEmail = buildDeterministicSyntheticEmail(
    payload.sourceSystem,
    payload.role,
    payload.externalUserId
  );
  const targetEmail = payload.email?.trim().toLowerCase() || syntheticEmail;

  // 3. Create new user if not existing
  if (!user) {
    // Check if user exists with the exact target email
    const existingWithEmail = await User.findOne({ email: targetEmail });
    if (existingWithEmail) {
      // If email exists and has no external identity or same identity, link safely
      if (!existingWithEmail.externalIdentity?.namespace) {
        existingWithEmail.externalIdentity = {
          sourceSystem: payload.sourceSystem,
          externalUserId: payload.externalUserId,
          namespace,
          institutionId: payload.institutionId,
          mappedAt: new Date(),
        };
        await existingWithEmail.save();
        user = existingWithEmail;
      } else {
        // Email collision with another account -> use synthetic email
        user = await User.create({
          email: syntheticEmail,
          name: resolvedName,
          userType: payload.role,
          language: "English",
          externalIdentity: {
            sourceSystem: payload.sourceSystem,
            externalUserId: payload.externalUserId,
            namespace,
            institutionId: payload.institutionId,
            mappedAt: new Date(),
          },
        });
        isNew = true;
      }
    } else {
      user = await User.create({
        email: targetEmail,
        name: resolvedName,
        userType: payload.role,
        language: "English",
        externalIdentity: {
          sourceSystem: payload.sourceSystem,
          externalUserId: payload.externalUserId,
          namespace,
          institutionId: payload.institutionId,
          mappedAt: new Date(),
        },
      });
      isNew = true;
    }
  } else {
    // Refresh name if updated in ERP
    if (payload.name && user.name !== resolvedName) {
      user.name = resolvedName;
      await user.save();
    }
  }

  // 4. Establish / Resolve Linked Profile
  let profile: any = null;

  if (payload.role === "teacher") {
    profile = await TeacherProfile.findOne({ userId: user._id });

    if (!profile) {
      const institutionName =
        payload.academicContext?.schoolName ||
        payload.academicContext?.departmentName ||
        `${payload.sourceSystem.toUpperCase()} Institution`;

      profile = await TeacherProfile.create({
        userId: user._id,
        name: resolvedName,
        teacherType: "institution",
        institution: institutionName,
        department: payload.academicContext?.departmentName || "Academics",
        designation: payload.academicContext?.facultyId ? "Faculty Member" : "Teacher",
        subjects: payload.academicContext?.subjectName ? [payload.academicContext.subjectName] : [],
        classesTaught: payload.academicContext?.sclassName ? [payload.academicContext.sclassName] : [],
        boards: ["CBSE"],
        goal: "Lesson Planning",
      });
    }

    // Attach TeachingContext if academic context details provided
    if (payload.academicContext?.subjectName && payload.academicContext?.sclassName) {
      const existingContext = await TeachingContext.findOne({
        teacherId: profile._id,
        classLevel: payload.academicContext.sclassName,
        subject: payload.academicContext.subjectName,
      });

      if (!existingContext) {
        await TeachingContext.create({
          teacherId: profile._id,
          contextType: "institution",
          institution: profile.institution,
          classLevel: payload.academicContext.sclassName,
          section: payload.academicContext.section || "A",
          subject: payload.academicContext.subjectName,
          curriculumBoard: "CBSE",
          academicYear: payload.academicContext.academicYear || "2026-2027",
        });
      }
    }
  } else {
    // Student Profile
    profile = await StudentProfile.findOne({ userId: user._id });

    if (!profile) {
      const learningPath = payload.sourceSystem === "school" ? "school" : "undergraduate";

      profile = await StudentProfile.create({
        userId: user._id,
        name: resolvedName,
        studentType: "institution",
        goal: "Academic Excellence",
        learningPath,
        schoolDetails: {
          schoolName: payload.academicContext?.schoolName || "School",
          classLevel: payload.academicContext?.sclassName || "Class 10",
          selectedSubject: payload.academicContext?.subjectName || "Science",
          studyMode: "full_syllabus",
        },
        undergraduateDetails: {
          institution: payload.academicContext?.departmentName || "College",
          degree: "Degree",
          specialization: payload.academicContext?.departmentName,
          semester: "Semester 1",
        },
      });
    }
  }

  return { user, profile, isNew };
}

/**
 * Complete Token Exchange Workflow:
 * 1. Verifies token signature, issuer, audience, and expiration.
 * 2. Checks and marks JTI to prevent token replay.
 * 3. Resolves or provisions Core User and linked Profile.
 * 4. Issues Core session token.
 */
export async function exchangeSSOToken(ssoToken: string): Promise<SSOExchangeResult> {
  // 1. Verify token signature, structure, and claims
  const payload = verifySSOToken(ssoToken, { checkReplay: true });

  // 2. Persistent Revocation Check across cluster instances
  const revoked = await isTokenRevoked(payload.jti);
  if (revoked) {
    throw new SSOAuthError("SSO token has been revoked", 401, "TOKEN_REVOKED");
  }

  // 3. Atomically consume JTI in persistent MongoDB registry (prevents multi-instance replay)
  await markSSOTokenConsumed(payload);

  // 4. Resolve Core Identity
  const { user, profile } = await resolveSSOIdentity(payload);

  // 5. Verify Core Account Status (Deactivated/Suspended Enforcement)
  if (user.status === "deactivated" || user.status === "suspended" || user.isSuspended) {
    throw new SSOAuthError(
      `Access denied: User account is ${user.status || "suspended"} in EduPye Core.`,
      403,
      "ACCOUNT_DEACTIVATED"
    );
  }

  // 6. Return authenticated Core session
  const coreSessionToken = (user._id as any).toString();

  return {
    token: coreSessionToken,
    user: {
      _id: (user._id as any).toString(),
      email: user.email,
      name: user.name || "",
      userType: user.userType,
      sourceSystem: payload.sourceSystem,
      externalUserId: payload.externalUserId,
    },
    profile,
    role: payload.role,
    sourceSystem: payload.sourceSystem,
    institutionId: payload.institutionId,
  };
}
