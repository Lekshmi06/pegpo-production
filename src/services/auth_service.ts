import User, { IUser } from "../models/User";
import StudentProfile, { IStudentProfile } from "../models/StudentProfile";

export interface RegisterInput {
  email: string;
  password?: string;
  name?: string;
  userType?: "student";
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
  token: string;
}

export const registerUser = async (data: RegisterInput): Promise<AuthResult> => {
  const cleanEmail = (data.email || "").trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Email is required");
  }

  const existingUser = await User.findOne({ email: cleanEmail });
  if (existingUser) {
    // If user exists and already has a student profile, retrieve it or return existing
    const existingProfile = await StudentProfile.findOne({ userId: existingUser._id }).lean();
    if (existingUser.password && data.password && existingUser.password !== data.password) {
      throw new Error("A user with this email already exists");
    }
    
    // If existing user had no password yet, save it
    if (!existingUser.password && data.password) {
      existingUser.password = data.password;
      if (data.name && !existingUser.name) existingUser.name = data.name;
      await existingUser.save();
    }

    return {
      user: {
        _id: (existingUser._id as any).toString(),
        email: existingUser.email,
        name: existingUser.name || data.name,
        userType: existingUser.userType,
        language: existingUser.language,
      },
      studentProfile: existingProfile,
      token: (existingUser._id as any).toString(),
    };
  }

  const resolvedName =
    data.name?.trim() ||
    cleanEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const user = await User.create({
    email: cleanEmail,
    password: data.password || "",
    name: resolvedName,
    userType: data.userType || "student",
    language: "English",
  });

  try {
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
      token: (user._id as any).toString(),
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

  const user = await User.findOne({ email: cleanEmail });
  if (!user) {
    throw new Error("Invalid email or password");
  }

  // Plain-text password check as specified in requirements
  if (user.password && data.password && user.password !== data.password) {
    throw new Error("Invalid email or password");
  }

  // If user previously had no password, save provided password
  if (!user.password && data.password) {
    user.password = data.password;
    await user.save();
  }

  let studentProfile = await StudentProfile.findOne({ userId: user._id }).lean();

  // If profile doesn't exist yet for this user, create an initial one
  if (!studentProfile) {
    const resolvedName =
      user.name ||
      cleanEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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
    token: (user._id as any).toString(),
  };
};

export const getCurrentUser = async (userId: string): Promise<AuthResult> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
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
    token: (user._id as any).toString(),
  };
};
