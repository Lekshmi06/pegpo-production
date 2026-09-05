import User from "../models/User";
import StudentProfile from "../models/StudentProfile";

interface CreateStudentData {
  email: string;
  name: string;
  userType?: "student";
  language?: string;
  goal?: string;
  phone?: string;

  education?: {
    level?:
      | "school"
      | "undergraduate"
      | "postgraduate"
      | "professional"
      | "other";
    board?: string;
    classLevel?: string;
    degree?: string;
    specialization?: string;
    institution?: string;
  };
}

export interface UpdateStudentData {
  name?: string;
  phone?: string;
  goal?: string;
  language?: string;

  education?: {
    level?:
      | "school"
      | "undergraduate"
      | "postgraduate"
      | "professional"
      | "other";
    board?: string;
    classLevel?: string;
    degree?: string;
    specialization?: string;
    institution?: string;
  };
}

export const createStudent = async (data: CreateStudentData) => {
  const existingUser = await User.findOne({
    email: data.email.toLowerCase(),
  });

  if (existingUser) {
    throw new Error("A user with this email already exists");
  }

  const user = await User.create({
    email: data.email,
    userType: "student",
    language: data.language,
  });

  try {
    const studentProfile = await StudentProfile.create({
      userId: user._id,
      name: data.name,
      phone: data.phone,
      goal: data.goal,
      education: data.education,
    });

    return {
      user,
      studentProfile,
    };
  } catch (error) {
    // Prevent an orphan User document if profile creation fails.
    await User.findByIdAndDelete(user._id);
    throw error;
  }
};

export const getStudentById = async (studentProfileId: string) => {
  const studentProfile = await StudentProfile.findById(studentProfileId)
    .populate("userId", "email userType language")
    .lean();

  if (!studentProfile) {
    throw new Error("Student not found");
  }

  return studentProfile;
};

export const getStudentByEmail = async (email: string) => {
  const user = await User.findOne({
    email: email.toLowerCase(),
  });

  if (!user) {
    throw new Error("Student not found");
  }

  const studentProfile = await StudentProfile.findOne({
    userId: user._id,
  })
    .populate("userId", "email userType language")
    .lean();

  if (!studentProfile) {
    throw new Error("Student not found");
  }

  return studentProfile;
};

export const updateStudent = async (
  studentProfileId: string,
  data: UpdateStudentData
) => {
  const studentUpdate: Omit<UpdateStudentData, "language"> = {};

  if (data.name !== undefined) {
    studentUpdate.name = data.name;
  }

  if (data.phone !== undefined) {
    studentUpdate.phone = data.phone;
  }

  if (data.goal !== undefined) {
    studentUpdate.goal = data.goal;
  }

  if (data.education !== undefined) {
    studentUpdate.education = data.education;
  }

  // First confirm that the student profile exists.
  const studentProfile = await StudentProfile.findById(
    studentProfileId
  );

  if (!studentProfile) {
    throw new Error("Student not found");
  }

  // Update StudentProfile fields.
  if (Object.keys(studentUpdate).length > 0) {
    await StudentProfile.findByIdAndUpdate(
      studentProfileId,
      { $set: studentUpdate },
      {
        new: true,
        runValidators: true,
      }
    );
  }

  // Update language in the related User document.
  if (data.language !== undefined) {
    const user = await User.findByIdAndUpdate(
      studentProfile.userId,
      { $set: { language: data.language } },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!user) {
      throw new Error("Student not found");
    }
  }

  // Return the complete updated student profile.
  return getStudentById(studentProfileId);
};