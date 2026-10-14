import mongoose, { Document, Schema } from "mongoose";

export type UserRole =
  | "student"
  | "teacher"
  | "researcher"
  | "institution"
  | "company"
  | "work"
  | "personal"
  | "provider"
  | "learner";

export interface IUserExternalIdentity {
  sourceSystem: "school" | "college";
  externalUserId: string;
  namespace: string;
  institutionId?: string;
  mappedAt?: Date;
}

export interface IUser extends Document {
  email: string;
  password?: string;
  name?: string;
  userType: UserRole;
  language?: string;
  status?: "active" | "suspended" | "deactivated";
  isSuspended?: boolean;
  externalIdentity?: IUserExternalIdentity;
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
        "company",
        "work",
        "personal",
        "provider",
        "learner",
      ],
    },

    language: {
      type: String,
      trim: true,
      default: "English",
    },

    status: {
      type: String,
      enum: ["active", "suspended", "deactivated"],
      default: "active",
    },

    isSuspended: {
      type: Boolean,
      default: false,
    },

    externalIdentity: {
      sourceSystem: { type: String, enum: ["school", "college"] },
      externalUserId: { type: String, trim: true },
      namespace: { type: String, trim: true },
      institutionId: { type: String, trim: true },
      mappedAt: { type: Date, default: Date.now },
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index(
  { "externalIdentity.namespace": 1 },
  { sparse: true }
);
userSchema.index(
  { "externalIdentity.sourceSystem": 1, "externalIdentity.externalUserId": 1 },
  { sparse: true }
);

const User = mongoose.model<IUser>("User", userSchema);

export default User;