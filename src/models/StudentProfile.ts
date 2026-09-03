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

  goal?: string;

  education?: {
    level?: EducationLevel;
    board?: string;
    classLevel?: string;
    degree?: string;
    specialization?: string;
    institution?: string;
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

    goal: {
      type: String,
      trim: true,
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