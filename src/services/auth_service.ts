import mongoose from "mongoose";
import User, { IUser, UserRole } from "../models/User";
import StudentProfile, { IStudentProfile } from "../models/StudentProfile";
import TeacherProfile, { ITeacherProfile } from "../models/TeacherProfile";
import ResearcherProfile, { IResearcherProfile } from "../models/ResearcherProfile";
import { hashPassword, verifyPassword, isLegacyPlaintext } from "../utils/password";
import { generateSessionToken } from "../utils/token";

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
    throw new Error("This account does not have password login enabled. Please use your institutional portal or SSO.");
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

export const getCurrentUser = async (userId: string): Promise<AuthResult> => {
  const user = await User.findById(userId);
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
  if (input.userId && mongoose.Types.ObjectId.isValid(input.userId)) {
    user = await User.findById(input.userId);
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
