import mongoose, { Document, Schema } from "mongoose";

export type EducationLevel =
  | "school"
  | "undergraduate"
  | "postgraduate"
  | "professional"
  | "other";

export interface IStudentProfile extends Document {
  userId: mongoose.Types.ObjectId;

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

  schoolDetails?: {
    schoolName?: string;
    board?: string;
    classLevel?: string;
    studyMode?: string;
    selectedSubject?: string;
    customSubject?: string;
    syllabusFileName?: string;
    textbookFileName?: string;
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
      schoolName: {
        type: String,
        trim: true,
      },
      board: {
        type: String,
        trim: true,
      },
      classLevel: {
        type: String,
        trim: true,
      },
      studyMode: {
        type: String,
        trim: true,
      },
      selectedSubject: {
        type: String,
        trim: true,
      },
      customSubject: {
        type: String,
        trim: true,
      },
      syllabusFileName: {
        type: String,
        trim: true,
      },
      textbookFileName: {
        type: String,
        trim: true,
      },
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