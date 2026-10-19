import mongoose, { Document, Schema } from "mongoose";

export type EducationLevel =
  | "school"
  | "undergraduate"
  | "postgraduate"
  | "competitive_exam"
  | "professional"
  | "other";

export interface IUndergraduateDetails {
  institution?: string;
  degree?: string;
  specialization?: string;
  year?: string;
  semester?: string;
  university?: string;
  syllabusFileName?: string;
}

export interface IPostgraduateDetails {
  institution?: string;
  degree?: string;
  specialization?: string;
  thesisTopic?: string;
  researchArea?: string;
  year?: string;
  syllabusFileName?: string;
}

export interface ICompetitiveExamDetails {
  targetExam?: string;
  targetYear?: string;
  category?: string;
  preparationMode?: string;
  syllabusFileName?: string;
}

export interface ISchoolDetails {
  schoolName?: string;
  board?: string;
  classLevel?: string;
  studyMode?: string;
  selectedSubject?: string;
  customSubject?: string;
  syllabusFileName?: string;
  textbookFileName?: string;
}

export type StudentType = "institution" | "tuition" | "external";

export interface IStudentProfile extends Document {
  userId: mongoose.Types.ObjectId;
  studentType: StudentType;
  organizationId?: mongoose.Types.ObjectId;
  classSectionId?: mongoose.Types.ObjectId;

  name: string;
  phone?: string;
  dob?: string;
  gender?: string;
  avatar?: string;

  goal?: string;
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
  studyPreferences?: {
    category?: string;
    goal?: string;
    currentScore?: string;
    hasTakenExam?: boolean;
    targetScore?: string;
    preferredTools?: string[];
    uploadedMaterialFileName?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

const studentProfileSchema = new Schema<IStudentProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    studentType: {
      type: String,
      enum: ["institution", "tuition", "external"],
      default: "external",
      required: true,
      index: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      index: true,
    },

    classSectionId: {
      type: Schema.Types.ObjectId,
      ref: "ClassSection",
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    dob: {
      type: String,
      trim: true,
    },

    gender: {
      type: String,
      trim: true,
    },

    avatar: {
      type: String,
      trim: true,
    },

    goal: {
      type: String,
      trim: true,
    },

    learningPath: {
      type: String,
      trim: true,
      default: "school",
    },

    education: {
      level: {
        type: String,
        enum: [
          "school",
          "undergraduate",
          "postgraduate",
          "competitive_exam",
          "professional",
          "other",
        ],
      },

      board: {
        type: String,
        trim: true,
      },

      classLevel: {
        type: String,
        trim: true,
      },

      degree: {
        type: String,
        trim: true,
      },

      specialization: {
        type: String,
        trim: true,
      },

      institution: {
        type: String,
        trim: true,
      },
    },

    schoolDetails: {
      schoolName: { type: String, trim: true },
      board: { type: String, trim: true },
      classLevel: { type: String, trim: true },
      studyMode: { type: String, trim: true },
      selectedSubject: { type: String, trim: true },
      customSubject: { type: String, trim: true },
      syllabusFileName: { type: String, trim: true },
      textbookFileName: { type: String, trim: true },
    },

    undergraduateDetails: {
      institution: { type: String, trim: true },
      degree: { type: String, trim: true },
      specialization: { type: String, trim: true },
      year: { type: String, trim: true },
      semester: { type: String, trim: true },
      university: { type: String, trim: true },
      syllabusFileName: { type: String, trim: true },
    },

    postgraduateDetails: {
      institution: { type: String, trim: true },
      degree: { type: String, trim: true },
      specialization: { type: String, trim: true },
      thesisTopic: { type: String, trim: true },
      researchArea: { type: String, trim: true },
      year: { type: String, trim: true },
      syllabusFileName: { type: String, trim: true },
    },

    competitiveExamDetails: {
      targetExam: { type: String, trim: true },
      targetYear: { type: String, trim: true },
      category: { type: String, trim: true },
      preparationMode: { type: String, trim: true },
      syllabusFileName: { type: String, trim: true },
    },

    studyPreferences: {
      category: { type: String, trim: true },
      goal: { type: String, trim: true },
      currentScore: { type: String, trim: true },
      hasTakenExam: { type: Boolean },
      targetScore: { type: String, trim: true },
      preferredTools: [{ type: String, trim: true }],
      uploadedMaterialFileName: { type: String, trim: true },
    },
  },
  {
    timestamps: true,
  }
);

const StudentProfile = mongoose.model<IStudentProfile>(
  "StudentProfile",
  studentProfileSchema
);

export default StudentProfile;