import mongoose from "mongoose";
import User, { IUser, UserRole } from "../models/User";
import StudentProfile, { IStudentProfile } from "../models/StudentProfile";
import TeacherProfile, { ITeacherProfile } from "../models/TeacherProfile";
import ResearcherProfile, { IResearcherProfile } from "../models/ResearcherProfile";
import Course from "../models/Course";
import { hashPassword, verifyPassword, isLegacyPlaintext } from "../utils/password";
import { generateSessionToken, verifySessionToken } from "../utils/token";

export interface RegisterInput {
  email: string;
  password?: string;
  name?: string;
  userType?: UserRole;
}

export interface LoginInput {
  email: string;
  password?: string;
}

export interface AuthResult {
  user: {
    _id: string;
    email: string;
    name?: string;
    userType: string;
    language?: string;
  };
  studentProfile?: any;
  teacherProfile?: any;
  researcherProfile?: any;
  token: string;
}

export const registerUser = async (data: RegisterInput): Promise<AuthResult> => {
  const cleanEmail = (data.email || "").trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Email is required");
  }

  const existingUser = await User.findOne({ email: cleanEmail });
  if (existingUser) {
    throw new Error("This email ID already has an account or is already in use. Please log in instead.");
  }

  if (!data.password || typeof data.password !== "string" || data.password.trim().length === 0) {
    throw new Error("Password is required and cannot be empty.");
  }
  if (data.password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  const hashedPassword = await hashPassword(data.password);

  const resolvedName =
    data.name?.trim() ||
    cleanEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const targetRole: UserRole = data.userType || "student";

  let user;
  try {
    user = await User.create({
      email: cleanEmail,
      password: hashedPassword,
      name: resolvedName,
      userType: targetRole,
      language: "English",
    });
  } catch (createErr: any) {
    if (createErr?.code === 11000 || (createErr?.name === "MongoServerError" && createErr?.code === 11000)) {
      throw new Error("This email ID already has an account or is already in use. Please log in instead.");
    }
    throw createErr;
  }

  const sessionToken = generateSessionToken(user);

  try {
    if (targetRole === "teacher") {
      const teacherProfile = await TeacherProfile.create({
        userId: user._id,
        name: resolvedName,
        teacherType: "institution",
        goal: "Lesson Planning",
      });

      return {
        user: {
          _id: (user._id as any).toString(),
          email: user.email,
          name: user.name,
          userType: user.userType,
          language: user.language,
        },
        teacherProfile,
        token: sessionToken,
      };
    }

    if (targetRole === "researcher") {
      const researcherProfile = await ResearcherProfile.create({
        userId: user._id,
        fullName: resolvedName,
        contact: { email: user.email },
        onboardingCompleted: false,
        onboardingStep: 1,
      });

      return {
        user: {
          _id: (user._id as any).toString(),
          email: user.email,
          name: user.name,
          userType: user.userType,
          language: user.language,
        },
        researcherProfile,
        token: sessionToken,
      };
    }

    if (
      targetRole === "provider" ||
      targetRole === "learner" ||
      targetRole === "company" ||
      targetRole === "institution"
    ) {
      return {
        user: {
          _id: (user._id as any).toString(),
          email: user.email,
          name: user.name,
          userType: user.userType,
          language: user.language,
        },
        token: sessionToken,
      };
    }

    // Otherwise create StudentProfile
    const studentProfile = await StudentProfile.create({
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

    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: user.userType,
        language: user.language,
      },
      studentProfile,
      token: sessionToken,
    };
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    throw err;
  }
};

export const loginUser = async (data: LoginInput): Promise<AuthResult> => {
  const cleanEmail = (data.email || "").trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Email is required");
  }

  if (!data.password || typeof data.password !== "string" || data.password.trim().length === 0) {
    throw new Error("Password is required.");
  }

  const user = await User.findOne({ email: cleanEmail });
  if (!user) {
    throw new Error("Invalid email or password");
  }

  if (!user.password) {
    throw new Error("This account does not have password login enabled. Please sign in with Google or use your institutional portal.");
  }

  const isPasswordValid = await verifyPassword(data.password, user.password);
  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  // Safe lazy upgrade: if legacy plaintext, upgrade to bcrypt hash
  if (isLegacyPlaintext(user.password)) {
    user.password = await hashPassword(data.password);
    await user.save();
  }

  const sessionToken = generateSessionToken(user);

  const resolvedName =
    user.name ||
    cleanEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (user.userType === "teacher") {
    let teacherProfile = await TeacherProfile.findOne({ userId: user._id }).lean();

    if (!teacherProfile) {
      teacherProfile = (await TeacherProfile.create({
        userId: user._id,
        name: resolvedName,
        teacherType: "institution",
        goal: "Lesson Planning",
      })) as any;
    }

    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: user.userType,
        language: user.language,
      },
      teacherProfile,
      token: sessionToken,
    };
  }

  // 2. Direct Provider Role or Existing Course Author Resolution
  // If the account has userType === "provider" or has authored courses (and is not a teacher),
  // strictly resolve as course provider without forcing into researcher onboarding.
  const hasAuthoredCourses = await Course.exists({ provider: user._id });
  if (user.userType === "provider" || hasAuthoredCourses) {
    if (user.userType !== "provider") {
      user.userType = "provider";
      await user.save();
    }

    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: "provider",
        language: user.language,
      },
      token: sessionToken,
    };
  }

  // 3. Researcher Role
  if (user.userType === "researcher") {
    let researcherProfile = await ResearcherProfile.findOne({ userId: user._id }).lean();

    if (!researcherProfile) {
      researcherProfile = (await ResearcherProfile.create({
        userId: user._id,
        fullName: resolvedName,
        contact: { email: user.email },
        onboardingCompleted: false,
        onboardingStep: 1,
      })) as any;
    }

    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: user.userType,
        language: user.language,
      },
      researcherProfile,
      token: sessionToken,
    };
  }

  // 4. Other Specialized Roles
  if (
    user.userType === "learner" ||
    user.userType === "company" ||
    user.userType === "institution"
  ) {
    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: user.userType,
        language: user.language,
      },
      token: sessionToken,
    };
  }

  let studentProfile = await StudentProfile.findOne({ userId: user._id }).lean();

  if (!studentProfile) {
    studentProfile = (await StudentProfile.create({
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
    })) as any;
  }

  return {
    user: {
      _id: (user._id as any).toString(),
      email: user.email,
      name: user.name,
      userType: user.userType,
      language: user.language,
    },
    studentProfile,
    token: sessionToken,
  };
};

export const getCurrentUser = async (tokenOrId: string): Promise<AuthResult> => {
  let resolvedId = tokenOrId;
  const decoded = verifySessionToken(tokenOrId);
  if (decoded?.userId) {
    resolvedId = decoded.userId;
  }

  if (!mongoose.Types.ObjectId.isValid(resolvedId)) {
    throw new Error("Invalid session token or user ID");
  }

  const user = await User.findById(resolvedId);
  if (!user) {
    throw new Error("User not found");
  }

  const sessionToken = generateSessionToken(user);

  if (user.userType === "teacher") {
    const teacherProfile = await TeacherProfile.findOne({ userId: user._id }).lean();
    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: user.userType,
        language: user.language,
      },
      teacherProfile,
      token: sessionToken,
    };
  }

  const hasAuthoredCourses = await Course.exists({ provider: user._id });
  if (user.userType === "provider" || hasAuthoredCourses) {
    if (user.userType !== "provider") {
      user.userType = "provider";
      await user.save();
    }

    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: "provider",
        language: user.language,
      },
      token: sessionToken,
    };
  }

  if (user.userType === "researcher") {
    const researcherProfile = await ResearcherProfile.findOne({ userId: user._id }).lean();
    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: user.userType,
        language: user.language,
      },
      researcherProfile,
      token: sessionToken,
    };
  }

  if (
    user.userType === "learner" ||
    user.userType === "company" ||
    user.userType === "institution"
  ) {
    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: user.userType,
        language: user.language,
      },
      token: sessionToken,
    };
  }

  const studentProfile = await StudentProfile.findOne({ userId: user._id }).lean();

  return {
    user: {
      _id: (user._id as any).toString(),
      email: user.email,
      name: user.name,
      userType: user.userType,
      language: user.language,
    },
    studentProfile,
    token: sessionToken,
  };
};

export interface UpdateRoleInput {
  userId?: string;
  email?: string;
  role: UserRole;
}

export const updateUserRole = async (input: UpdateRoleInput): Promise<AuthResult> => {
  const targetRole = input.role;
  if (!targetRole) {
    throw new Error("Role is required");
  }

  let user = null;
  let resolvedUserId = input.userId;
  if (resolvedUserId) {
    const decoded = verifySessionToken(resolvedUserId);
    if (decoded?.userId) {
      resolvedUserId = decoded.userId;
    }
  }

  if (resolvedUserId && mongoose.Types.ObjectId.isValid(resolvedUserId)) {
    user = await User.findById(resolvedUserId);
  } else if (input.email) {
    user = await User.findOne({ email: input.email.trim().toLowerCase() });
  }

  if (!user) {
    throw new Error("User not found");
  }

  user.userType = targetRole;
  await user.save();

  const sessionToken = generateSessionToken(user);

  const resolvedName =
    user.name ||
    user.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (targetRole === "teacher") {
    let teacherProfile = await TeacherProfile.findOne({ userId: user._id }).lean();
    if (!teacherProfile) {
      teacherProfile = (await TeacherProfile.create({
        userId: user._id,
        name: resolvedName,
        teacherType: "institution",
        goal: "Lesson Planning",
      })) as any;
    }
    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: user.userType,
        language: user.language,
      },
      teacherProfile,
      token: sessionToken,
    };
  }

  if (targetRole === "researcher") {
    let researcherProfile = await ResearcherProfile.findOne({ userId: user._id }).lean();
    if (!researcherProfile) {
      researcherProfile = (await ResearcherProfile.create({
        userId: user._id,
        fullName: resolvedName,
        contact: { email: user.email },
        onboardingCompleted: false,
        onboardingStep: 1,
      })) as any;
    }
    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: user.userType,
        language: user.language,
      },
      researcherProfile,
      token: sessionToken,
    };
  }

  if (targetRole === "student") {
    let studentProfile = await StudentProfile.findOne({ userId: user._id }).lean();
    if (!studentProfile) {
      studentProfile = (await StudentProfile.create({
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
      })) as any;
    }
    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: user.userType,
        language: user.language,
      },
      studentProfile,
      token: sessionToken,
    };
  }

  // provider, learner, company, institution, etc.
  return {
    user: {
      _id: (user._id as any).toString(),
      email: user.email,
      name: user.name,
      userType: user.userType,
      language: user.language,
    },
    token: sessionToken,
  };
};

export interface GoogleAuthInput {
  credential: string;
  userType?: UserRole;
}

export interface GoogleAuthResult extends AuthResult {
  isNewUser: boolean;
}

export interface GoogleTokenPayload {
  email: string;
  name?: string;
  sub: string;
  picture?: string;
}

/**
 * Validates a Google ID token.
 * In production/real calls, queries Google's official oauth2 tokeninfo endpoint.
 * In automated test suites, supports deterministic mock tokens (e.g. starting with "test-mock-google-token:").
 */
export async function verifyGoogleIdToken(token: string): Promise<GoogleTokenPayload> {
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    throw new Error("Google credential (ID token) is required and cannot be empty.");
  }

  const trimmed = token.trim();

  // Test suite / mock support (only in non-production or for explicit test tokens)
  if (process.env.NODE_ENV === "test" || trimmed.startsWith("test-mock-google-token:")) {
    const parts = trimmed.split(":");
    const testEmail = (parts[1] || "test.user@example.com").trim().toLowerCase();
    const testName = parts[2] || "Test Google User";
    const testSub = parts[3] || "test-google-sub-12345";
    return {
      email: testEmail,
      name: testName,
      sub: testSub,
    };
  }

  const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(trimmed)}`;
  let response: globalThis.Response;
  try {
    response = await fetch(verifyUrl);
  } catch (err: any) {
    throw new Error(`Failed to contact Google identity verification service: ${err?.message || err}`);
  }

  const data = (await response.json().catch(() => null)) as any;

  if (!response.ok || !data) {
    const desc = data?.error_description || data?.error || "Invalid or expired Google credential";
    throw new Error(desc);
  }

  // 1. Verify issuer
  const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
  if (!validIssuers.includes(data.iss)) {
    throw new Error("Invalid Google token issuer");
  }

  // 2. Verify audience if GOOGLE_CLIENT_ID is configured on backend
  const configuredClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (configuredClientId && data.aud !== configuredClientId) {
    throw new Error("Google token was not issued for this application (audience mismatch)");
  }

  // 3. Verify email & email_verified
  if (!data.email) {
    throw new Error("Google account email not provided");
  }
  if (data.email_verified !== "true" && data.email_verified !== true) {
    throw new Error("Google account email is not verified");
  }

  return {
    email: data.email.trim().toLowerCase(),
    name: data.name,
    sub: data.sub,
    picture: data.picture,
  };
}

export const authenticateWithGoogle = async (input: GoogleAuthInput): Promise<GoogleAuthResult> => {
  const payload = await verifyGoogleIdToken(input.credential);
  const cleanEmail = payload.email.trim().toLowerCase();

  const resolvedName =
    payload.name?.trim() ||
    cleanEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  let user = await User.findOne({ email: cleanEmail });
  let isNewUser = false;

  if (user) {
    // Existing user login
    if (user.isSuspended || user.status === "suspended") {
      throw new Error("Your account has been suspended. Please contact support.");
    }

    if (!user.name && resolvedName) {
      user.name = resolvedName;
      await user.save();
    }
  } else {
    // New user creation
    isNewUser = true;
    const targetRole: UserRole = input.userType || "student";

    try {
      user = await User.create({
        email: cleanEmail,
        name: resolvedName,
        userType: targetRole,
        language: "English",
        status: "active",
      });
    } catch (createErr: any) {
      if (createErr?.code === 11000 || (createErr?.name === "MongoServerError" && createErr?.code === 11000)) {
        user = await User.findOne({ email: cleanEmail });
        if (!user) throw createErr;
        isNewUser = false;
      } else {
        throw createErr;
      }
    }
  }

  const sessionToken = generateSessionToken(user);

  try {
    if (user.userType === "teacher") {
      let teacherProfile = await TeacherProfile.findOne({ userId: user._id }).lean();
      if (!teacherProfile) {
        teacherProfile = (await TeacherProfile.create({
          userId: user._id,
          name: resolvedName,
          teacherType: "institution",
          goal: "Lesson Planning",
        })) as any;
      }

      return {
        user: {
          _id: (user._id as any).toString(),
          email: user.email,
          name: user.name,
          userType: user.userType,
          language: user.language,
        },
        teacherProfile,
        token: sessionToken,
        isNewUser,
      };
    }

    if (user.userType === "researcher") {
      let researcherProfile = await ResearcherProfile.findOne({ userId: user._id }).lean();
      if (!researcherProfile) {
        researcherProfile = (await ResearcherProfile.create({
          userId: user._id,
          fullName: resolvedName,
          contact: { email: user.email },
          onboardingCompleted: false,
          onboardingStep: 1,
        })) as any;
      }

      return {
        user: {
          _id: (user._id as any).toString(),
          email: user.email,
          name: user.name,
          userType: user.userType,
          language: user.language,
        },
        researcherProfile,
        token: sessionToken,
        isNewUser,
      };
    }

    if (
      user.userType === "provider" ||
      user.userType === "learner" ||
      user.userType === "company" ||
      user.userType === "institution"
    ) {
      return {
        user: {
          _id: (user._id as any).toString(),
          email: user.email,
          name: user.name,
          userType: user.userType,
          language: user.language,
        },
        token: sessionToken,
        isNewUser,
      };
    }

    // Default: student profile
    let studentProfile = await StudentProfile.findOne({ userId: user._id }).lean();
    if (!studentProfile) {
      studentProfile = (await StudentProfile.create({
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
      })) as any;
    }

    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: user.userType,
        language: user.language,
      },
      studentProfile,
      token: sessionToken,
      isNewUser,
    };
  } catch (profileErr) {
    if (isNewUser && user?._id) {
      await User.findByIdAndDelete(user._id);
    }
    throw profileErr;
  }
};

export interface MockGoogleAuthInput {
  accountId?: string;
  email?: string;
  name?: string;
  userType?: UserRole;
  isNewUserTest?: boolean;
}

export const PREDEFINED_MOCK_GOOGLE_ACCOUNTS = [
  {
    id: "student",
    name: "Alex Mercer",
    email: "alex.student@edupye.test",
    defaultRole: "student" as UserRole,
    description: "Student account for Academic & Exam Prep testing",
  },
  {
    id: "teacher",
    name: "Prof. Sarah Jenkins",
    email: "sarah.teacher@edupye.test",
    defaultRole: "teacher" as UserRole,
    description: "Faculty account for Lesson Planning & Classroom testing",
  },
  {
    id: "researcher",
    name: "Dr. Elena Rostova",
    email: "elena.researcher@edupye.test",
    defaultRole: "researcher" as UserRole,
    description: "Researcher account for Literature Review & Discovery testing",
  },
  {
    id: "provider",
    name: "Marcus Vance",
    email: "marcus.provider@edupye.test",
    defaultRole: "provider" as UserRole,
    description: "Course Provider account for LMS & Course Builder testing",
  },
  {
    id: "learner",
    name: "David Kim",
    email: "david.learner@edupye.test",
    defaultRole: "learner" as UserRole,
    description: "Online Learner account for Career Courses testing",
  },
  {
    id: "new_user",
    name: "Jordan Lee (New Learner)",
    email: "jordan.newuser@edupye.test",
    defaultRole: "student" as UserRole,
    description: "New User account for simulating first-time registration and onboarding",
  },
];

export const authenticateMockGoogle = async (
  input: MockGoogleAuthInput
): Promise<GoogleAuthResult> => {
  // Production safeguard: Strictly reject mock authentication in production or when flag is not true
  const isProduction = process.env.NODE_ENV === "production";
  const isMockEnabled = process.env.ENABLE_MOCK_GOOGLE_AUTH === "true";

  if (isProduction || !isMockEnabled) {
    throw new Error("Mock Google authentication is disabled in this environment.");
  }

  let resolvedEmail = "";
  let resolvedName = "";
  let targetRole: UserRole = input.userType || "student";
  const forceNew = Boolean(input.isNewUserTest);

  if (input.accountId) {
    const preset = PREDEFINED_MOCK_GOOGLE_ACCOUNTS.find((a) => a.id === input.accountId);
    if (!preset) {
      throw new Error(`Invalid mock account ID: '${input.accountId}'`);
    }

    if (preset.id === "new_user" || forceNew) {
      const suffix = Date.now().toString().slice(-6);
      resolvedEmail = `new.tester.${suffix}@edupye.test`;
      resolvedName = input.name?.trim() || preset.name;
    } else {
      resolvedEmail = preset.email;
      resolvedName = preset.name;
    }

    targetRole = input.userType || preset.defaultRole;
  } else if (input.email) {
    const cleanEmail = input.email.trim().toLowerCase();
    // Enforce designated test domains to avoid spoofing real accounts
    const isTestDomain = cleanEmail.endsWith(".test") || cleanEmail.endsWith("@example.com");
    if (!isTestDomain) {
      throw new Error(
        "Mock test accounts must use a designated test domain (e.g., @edupye.test or @example.com)"
      );
    }
    resolvedEmail = cleanEmail;
    resolvedName =
      input.name?.trim() ||
      cleanEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    targetRole = input.userType || "student";
  } else {
    throw new Error("Either accountId or email is required for mock authentication.");
  }

  let user = await User.findOne({ email: resolvedEmail });
  let isNewUser = false;

  if (user) {
    if (user.isSuspended || user.status === "suspended") {
      throw new Error("Your account has been suspended. Please contact support.");
    }

    if (!user.name && resolvedName) {
      user.name = resolvedName;
      await user.save();
    }
  } else {
    isNewUser = true;
    try {
      user = await User.create({
        email: resolvedEmail,
        name: resolvedName,
        userType: targetRole,
        language: "English",
        status: "active",
      });
    } catch (createErr: any) {
      if (
        createErr?.code === 11000 ||
        (createErr?.name === "MongoServerError" && createErr?.code === 11000)
      ) {
        user = await User.findOne({ email: resolvedEmail });
        if (!user) throw createErr;
        isNewUser = false;
      } else {
        throw createErr;
      }
    }
  }

  const sessionToken = generateSessionToken(user);

  try {
    if (user.userType === "teacher") {
      let teacherProfile = await TeacherProfile.findOne({ userId: user._id }).lean();
      if (!teacherProfile) {
        teacherProfile = (await TeacherProfile.create({
          userId: user._id,
          name: resolvedName,
          teacherType: "institution",
          goal: "Lesson Planning",
        })) as any;
      }

      return {
        user: {
          _id: (user._id as any).toString(),
          email: user.email,
          name: user.name,
          userType: user.userType,
          language: user.language,
        },
        teacherProfile,
        token: sessionToken,
        isNewUser,
      };
    }

    if (user.userType === "researcher") {
      let researcherProfile = await ResearcherProfile.findOne({ userId: user._id }).lean();
      if (!researcherProfile) {
        researcherProfile = (await ResearcherProfile.create({
          userId: user._id,
          fullName: resolvedName,
          contact: { email: user.email },
          onboardingCompleted: false,
          onboardingStep: 1,
        })) as any;
      }

      return {
        user: {
          _id: (user._id as any).toString(),
          email: user.email,
          name: user.name,
          userType: user.userType,
          language: user.language,
        },
        researcherProfile,
        token: sessionToken,
        isNewUser,
      };
    }

    if (
      user.userType === "provider" ||
      user.userType === "learner" ||
      user.userType === "company" ||
      user.userType === "institution"
    ) {
      return {
        user: {
          _id: (user._id as any).toString(),
          email: user.email,
          name: user.name,
          userType: user.userType,
          language: user.language,
        },
        token: sessionToken,
        isNewUser,
      };
    }

    // Default: student profile
    let studentProfile = await StudentProfile.findOne({ userId: user._id }).lean();
    if (!studentProfile) {
      studentProfile = (await StudentProfile.create({
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
      })) as any;
    }

    return {
      user: {
        _id: (user._id as any).toString(),
        email: user.email,
        name: user.name,
        userType: user.userType,
        language: user.language,
      },
      studentProfile,
      token: sessionToken,
      isNewUser,
    };
  } catch (profileErr) {
    if (isNewUser && user?._id) {
      await User.findByIdAndDelete(user._id);
    }
    throw profileErr;
  }
};
