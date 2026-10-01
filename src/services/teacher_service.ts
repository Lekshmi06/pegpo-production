import User from "../models/User";
import TeacherProfile, {
  ITeacherProfile,
  TeacherType,
} from "../models/TeacherProfile";

export interface CreateTeacherData {
  userId?: string;
  email?: string;
  name: string;
  phone?: string;
  dob?: string;
  gender?: string;
  avatar?: string;
  bio?: string;
  teacherType?: TeacherType;
  institution?: string;
  tuitionCentre?: string;
  department?: string;
  designation?: string;
  subjects?: string[];
  classesTaught?: string[];
  boards?: string[];
  experienceYears?: number;
  goal?: string;
  preferences?: {
    activeDepartment?: string;
    activeSubject?: string;
  };
}

export interface UpdateTeacherData {
  name?: string;
  phone?: string;
  dob?: string;
  gender?: string;
  avatar?: string;
  bio?: string;
  teacherType?: TeacherType;
  institution?: string;
  tuitionCentre?: string;
  department?: string;
  designation?: string;
  subjects?: string[];
  classesTaught?: string[];
  boards?: string[];
  experienceYears?: number;
  goal?: string;
  preferences?: {
    activeDepartment?: string;
    activeSubject?: string;
  };
  language?: string;
}

export const createTeacherProfile = async (data: CreateTeacherData) => {
  let userId = data.userId;

  if (!userId && data.email) {
    let existingUser = await User.findOne({
      email: data.email.toLowerCase(),
    });

    if (!existingUser) {
      existingUser = await User.create({
        email: data.email.toLowerCase(),
        name: data.name,
        userType: "teacher",
        language: "English",
      });
    } else if (existingUser.userType !== "teacher") {
      existingUser.userType = "teacher";
      await existingUser.save();
    }
    userId = (existingUser._id as any).toString();
  }

  if (!userId) {
    throw new Error("User ID or Email is required to create a Teacher profile");
  }

  const existingProfile = await TeacherProfile.findOne({ userId });
  if (existingProfile) {
    throw new Error("Teacher profile already exists for this user");
  }

  const teacherProfile = await TeacherProfile.create({
    userId,
    name: data.name,
    phone: data.phone,
    dob: data.dob,
    gender: data.gender,
    avatar: data.avatar,
    bio: data.bio,
    teacherType: data.teacherType || "institution",
    institution: data.institution,
    tuitionCentre: data.tuitionCentre,
    department: data.department,
    designation: data.designation,
    subjects: data.subjects || [],
    classesTaught: data.classesTaught || [],
    boards: data.boards || [],
    experienceYears: data.experienceYears ?? 0,
    goal: data.goal || "Lesson Planning",
    preferences: data.preferences,
  });

  return teacherProfile;
};

export const getTeacherById = async (profileId: string) => {
  const profile = await TeacherProfile.findById(profileId)
    .populate("userId", "email userType language")
    .lean();

  if (!profile) {
    throw new Error("Teacher profile not found");
  }

  return profile;
};

export const getTeacherByUserId = async (userId: string) => {
  const profile = await TeacherProfile.findOne({ userId })
    .populate("userId", "email userType language")
    .lean();

  if (!profile) {
    throw new Error("Teacher profile not found");
  }

  return profile;
};

export const getTeacherByEmail = async (email: string) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new Error("User not found");
  }

  const profile = await TeacherProfile.findOne({ userId: user._id })
    .populate("userId", "email userType language")
    .lean();

  if (!profile) {
    throw new Error("Teacher profile not found");
  }

  return profile;
};

export const updateTeacherProfile = async (
  profileId: string,
  data: UpdateTeacherData
) => {
  const teacherUpdate: Partial<ITeacherProfile> = {};

  if (data.name !== undefined) teacherUpdate.name = data.name;
  if (data.phone !== undefined) teacherUpdate.phone = data.phone;
  if (data.dob !== undefined) teacherUpdate.dob = data.dob;
  if (data.gender !== undefined) teacherUpdate.gender = data.gender;
  if (data.avatar !== undefined) teacherUpdate.avatar = data.avatar;
  if (data.bio !== undefined) teacherUpdate.bio = data.bio;
  if (data.teacherType !== undefined) teacherUpdate.teacherType = data.teacherType;
  if (data.institution !== undefined) teacherUpdate.institution = data.institution;
  if (data.tuitionCentre !== undefined) teacherUpdate.tuitionCentre = data.tuitionCentre;
  if (data.department !== undefined) teacherUpdate.department = data.department;
  if (data.designation !== undefined) teacherUpdate.designation = data.designation;
  if (data.subjects !== undefined) teacherUpdate.subjects = data.subjects;
  if (data.classesTaught !== undefined) teacherUpdate.classesTaught = data.classesTaught;
  if (data.boards !== undefined) teacherUpdate.boards = data.boards;
  if (data.experienceYears !== undefined) teacherUpdate.experienceYears = data.experienceYears;
  if (data.goal !== undefined) teacherUpdate.goal = data.goal;
  if (data.preferences !== undefined) teacherUpdate.preferences = data.preferences;

  const teacherProfile = await TeacherProfile.findById(profileId);
  if (!teacherProfile) {
    throw new Error("Teacher profile not found");
  }

  if (Object.keys(teacherUpdate).length > 0) {
    await TeacherProfile.findByIdAndUpdate(
      profileId,
      { $set: teacherUpdate },
      { new: true, runValidators: true }
    );
  }

  // Update name and language on User model if provided
  const userUpdates: Record<string, any> = {};
  if (data.name !== undefined && data.name.trim()) userUpdates.name = data.name.trim();
  if (data.language !== undefined) userUpdates.language = data.language;

  if (Object.keys(userUpdates).length > 0) {
    await User.findByIdAndUpdate(
      teacherProfile.userId,
      { $set: userUpdates },
      { new: true }
    );
  }

  return getTeacherById(profileId);
};

export const updateTeacherPassword = async (
  profileId: string,
  newPassword: string
) => {
  const teacherProfile = await TeacherProfile.findById(profileId);
  if (!teacherProfile) {
    throw new Error("Teacher profile not found");
  }
  await User.findByIdAndUpdate(teacherProfile.userId, {
    $set: { password: newPassword },
  });
  return true;
};

