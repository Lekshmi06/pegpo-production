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

    userType: {
      type: String,
      required: true,
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
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model<IUser>("User", userSchema);

export default User;