import mongoose, { Document, Schema } from "mongoose";

export type UserRole =
  | "student"
  | "teacher"
  | "researcher"
  | "institution"
  | "work"
  | "personal";

export interface IUser extends Document {
  email: string;
  password?: string;
  name?: string;
  userType: UserRole;
  language?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: false, // optional on model so legacy documents without password don't crash
      trim: true,
    },

    name: {
      type: String,
      trim: true,
    },

    userType: {
      type: String,
      required: true,
      default: "student",
      enum: [
        "student",
        "teacher",
        "researcher",
        "institution",
        "work",
        "personal",
      ],
    },

    language: {
      type: String,
      trim: true,
      default: "English",
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model<IUser>("User", userSchema);

export default User;