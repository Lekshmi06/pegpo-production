import mongoose, { Document, Schema } from "mongoose";

export type TeacherType = "institution" | "tuition";

export const TEACHER_GOALS = [
  "Lesson Planning",
  "Improve Profession",
  "Update Knowledge",
  "Higher Study",
  "Engage Students",
  "Conduct a Class",
  "Tuition",
  "Other",
] as const;

export type TeacherGoal = (typeof TEACHER_GOALS)[number];

export interface ITeacherProfile extends Document {
  userId: mongoose.Types.ObjectId;

  // Personal information
  name: string;
  phone?: string;
  dob?: string;
  gender?: string;
  avatar?: string;
  bio?: string;

  // Teaching information
  teacherType: TeacherType;
  institution?: string;
  tuitionCentre?: string;
  department?: string;
  designation?: string;

  // Teaching scope (supports multiple subjects, classes, boards)
  subjects: string[];
  classesTaught: string[];
  boards: string[];
  experienceYears?: number;

  // Teacher goals
  goal?: TeacherGoal | string;

  // Active workspace preferences
  preferences?: {
    activeDepartment?: string;
    activeSubject?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

const teacherProfileSchema = new Schema<ITeacherProfile>(
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

    bio: {
      type: String,
      trim: true,
    },

    teacherType: {
      type: String,
      enum: ["institution", "tuition"],
      default: "institution",
      required: true,
    },

    institution: {
      type: String,
      trim: true,
    },

    tuitionCentre: {
      type: String,
      trim: true,
    },

    department: {
      type: String,
      trim: true,
    },

    designation: {
      type: String,
      trim: true,
    },

    subjects: {
      type: [String],
      default: [],
    },

    classesTaught: {
      type: [String],
      default: [],
    },

    boards: {
      type: [String],
      default: [],
    },

    experienceYears: {
      type: Number,
      default: 0,
      min: 0,
    },

    goal: {
      type: String,
      default: "Lesson Planning",
      trim: true,
    },

    preferences: {
      activeDepartment: { type: String, trim: true },
      activeSubject: { type: String, trim: true },
    },
  },
  {
    timestamps: true,
  }
);

const TeacherProfile = mongoose.model<ITeacherProfile>(
  "TeacherProfile",
  teacherProfileSchema
);

export default TeacherProfile;
