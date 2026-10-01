import User from "../models/User";
import StudentProfile, {
  IUndergraduateDetails,
  IPostgraduateDetails,
  ICompetitiveExamDetails,
  ISchoolDetails,
  EducationLevel,
} from "../models/StudentProfile";

interface CreateStudentData {
  email: string;
  name: string;
  userType?: "student";
  language?: string;
  goal?: string;
  phone?: string;
  learningPath?: string;

  education?: {
    level?: EducationLevel;
    board?: string;
    classLevel?: string;
    degree?: string;
    specialization?: string;
    institution?: string;
  };

  schoolDetails?: ISchoolDetails;
  undergraduateDetails?: IUndergraduateDetails;
  postgraduateDetails?: IPostgraduateDetails;
  competitiveExamDetails?: ICompetitiveExamDetails;
}

export interface UpdateStudentData {
  name?: string;
  phone?: string;
  dob?: string;
  gender?: string;
  avatar?: string;
  goal?: string;
  learningPath?: string;
  language?: string;

  education?: {
    level?: EducationLevel;
    board?: string;
    classLevel?: string;
    degree?: string;
    specialization?: string;
    institution?: string;
  };

  schoolDetails?: ISchoolDetails;
  undergraduateDetails?: IUndergraduateDetails;
  postgraduateDetails?: IPostgraduateDetails;
  competitiveExamDetails?: ICompetitiveExamDetails;
}

export const createStudent = async (data: CreateStudentData) => {
  const cleanEmail = (data.email || "").trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Email is required");
  }

  const existingUser = await User.findOne({
    email: cleanEmail,
  });

  if (existingUser) {
    throw new Error("This email ID already has an account or is already in use. Please log in instead.");
  }

  let user;
  try {
    user = await User.create({
      email: cleanEmail,
      userType: "student",
      language: data.language,
    });
  } catch (createErr: any) {
    if (createErr?.code === 11000 || (createErr?.name === "MongoServerError" && createErr?.code === 11000)) {
      throw new Error("This email ID already has an account or is already in use. Please log in instead.");
    }
    throw createErr;
  }

  try {
    const studentProfile = await StudentProfile.create({
      userId: user._id,
      name: data.name,
      phone: data.phone,
      goal: data.goal,
      learningPath: data.learningPath || "school",
      education: data.education,
      schoolDetails: data.schoolDetails,
      undergraduateDetails: data.undergraduateDetails,
      postgraduateDetails: data.postgraduateDetails,
      competitiveExamDetails: data.competitiveExamDetails,
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

  if (data.dob !== undefined) {
    studentUpdate.dob = data.dob;
  }

  if (data.gender !== undefined) {
    studentUpdate.gender = data.gender;
  }

  if (data.avatar !== undefined) {
    studentUpdate.avatar = data.avatar;
  }

  if (data.goal !== undefined) {
    studentUpdate.goal = data.goal;
  }

  if (data.learningPath !== undefined) {
    studentUpdate.learningPath = data.learningPath;
  }

  if (data.education !== undefined) {
    studentUpdate.education = data.education;
  }

  if (data.schoolDetails !== undefined) {
    studentUpdate.schoolDetails = data.schoolDetails;
  }

  if (data.undergraduateDetails !== undefined) {
    studentUpdate.undergraduateDetails = data.undergraduateDetails;
  }

  if (data.postgraduateDetails !== undefined) {
    studentUpdate.postgraduateDetails = data.postgraduateDetails;
  }

  if (data.competitiveExamDetails !== undefined) {
    studentUpdate.competitiveExamDetails = data.competitiveExamDetails;
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