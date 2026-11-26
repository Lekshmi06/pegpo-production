import mongoose, { Document, Schema } from "mongoose";
import crypto from "crypto";

export type UserRole =
  | "student"
  | "teacher"
  | "researcher"
  | "institution"
  | "company"
  | "work"
  | "personal"
  | "provider"
  | "learner"
  | "tuition_provider";

export interface IUserExternalIdentity {
  sourceSystem: "school" | "college";
  externalUserId: string;
  namespace: string;
  institutionId?: string;
  mappedAt?: Date;
}

export interface IUser extends Document {
  id?: number;
  userId?: string;
  username?: string;
  displayName?: string;
  fullName?: string;
  phone?: string;
  entityType?: "company" | "institution" | "startup" | null;
  provider?: string;
  emailVerified?: boolean;
  isEmailVerified?: boolean;
  phoneVerified?: boolean;
  avatarUrl?: string;
  role?: string;
  adminRole?: "Super Admin" | "Admin" | "Tuition Operations Admin" | "Staff" | string;
  allowedModules?: number[];
  department?: string;
  designation?: string;
  passwordHash?: string;
  lockoutReason?: string;
  createdBy?: mongoose.Types.ObjectId | string | null;
  createdById?: number | null;
  createdByName?: string;
  createdByRole?: string;
  assignedAdminId?: string | null;
  tokenVersion?: number;
  failedLoginAttempts?: number;
  lockoutUntil?: Date | null;
  lastLogin?: Date | null;
  lastLoginIp?: string | null;
  email: string;
  password?: string;
  name?: string;
  userType: UserRole; // backward-compatible role indicator
  roles: UserRole[]; // all assigned active roles
  activeRole: UserRole; // currently active workspace role
  studentCode?: string; // Permanent student code, e.g. STU-A1B2C3
  teacherCode?: string; // Permanent teacher code, e.g. TCH-D4E5F6
  isTuitionTeacher?: boolean;
  teachingGoal?: string;
  tuitionApprovalStatus?: "none" | "pending" | "approved" | "rejected" | "revoked" | "suspended";
  issuePermanentTuitionCode(): string;
  language?: string;
  status?: string;
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
        "tuition_provider",
      ],
    },

    roles: {
      type: [String],
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
        "tuition_provider",
      ],
      default: undefined,
    },

    activeRole: {
      type: String,
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
        "tuition_provider",
      ],
      default: undefined,
    },

    studentCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    teacherCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    isTuitionTeacher: {
      type: Boolean,
      default: false,
      index: true,
    },

    teachingGoal: {
      type: String,
      trim: true,
    },

    tuitionApprovalStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected", "revoked", "suspended"],
      default: "none",
      index: true,
    },

    language: {
      type: String,
      trim: true,
      default: "English",
    },

    status: {
      type: String,
      default: "Active",
    },

    // Unified Admin / ERP Fields
    id: { type: Number, unique: true, sparse: true, index: true },
    userId: { type: String, unique: true, sparse: true, trim: true, index: true },
    username: { type: String, unique: true, sparse: true, trim: true, lowercase: true, index: true },
    displayName: { type: String, trim: true },
    fullName: { type: String, default: null, trim: true },
    phone: { type: String, default: null, trim: true },
    entityType: { type: String, enum: ["company", "institution", "startup", null], default: null },
    provider: { type: String, default: "email" },
    emailVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    avatarUrl: { type: String, default: null },
    role: { type: String, trim: true, default: "user" },
    adminRole: {
      type: String,
      enum: ["Super Admin", "Admin", "Tuition Operations Admin", "Staff", null],
      default: null,
    },
    allowedModules: { type: [Number], default: undefined },
    department: { type: String, default: "General" },
    designation: { type: String, default: null },
    passwordHash: { type: String, default: null },
    lockoutReason: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdById: { type: Number, default: null },
    createdByName: { type: String, default: "System" },
    createdByRole: { type: String, default: "System" },
    assignedAdminId: { type: String, default: null },
    tokenVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },

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

// Helper functions to generate human-readable unique codes
export function generateStudentCode(): string {
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `STU-${rand}`;
}

export function generateTeacherCode(): string {
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `TCH-${rand}`;
}

// Method to issue permanent tuition code upon Admin approval or explicit grant
userSchema.methods.issuePermanentTuitionCode = function (this: IUser): string {
  const isTeacher =
    this.activeRole === "teacher" ||
    this.activeRole === "tuition_provider" ||
    this.userType === "teacher" ||
    this.userType === "tuition_provider" ||
    (Array.isArray(this.roles) && this.roles.some((r) => ["teacher", "tuition_provider"].includes(r)));

  const isStudent =
    this.activeRole === "student" ||
    this.activeRole === "learner" ||
    this.activeRole === "personal" ||
    this.userType === "student" ||
    this.userType === "learner" ||
    this.userType === "personal" ||
    (Array.isArray(this.roles) && this.roles.some((r) => ["student", "learner", "personal"].includes(r)));

  // If user has teacher role/capability, ensure teacherCode is issued
  if (isTeacher && !this.teacherCode) {
    this.teacherCode = generateTeacherCode();
  }

  // If user has student/learner/personal role/capability (or is not a teacher), ensure studentCode is issued
  if ((isStudent || !isTeacher) && !this.studentCode) {
    this.studentCode = generateStudentCode();
  }

  this.tuitionApprovalStatus = "approved";

  // Return appropriate code for the current activeRole/userType
  if (this.activeRole === "teacher" || this.activeRole === "tuition_provider" || (isTeacher && !isStudent)) {
    return this.teacherCode || "";
  }
  return this.studentCode || this.teacherCode || "";
};

// Guarantee role synchronization and backward compatibility before saving
userSchema.pre("save", function (this: IUser) {
  if (!this.roles || !Array.isArray(this.roles) || this.roles.length === 0) {
    this.roles = [this.userType || "student"];
  } else if (this.userType && !this.roles.includes(this.userType)) {
    this.roles.push(this.userType);
  }

  if (!this.activeRole) {
    this.activeRole = this.userType || this.roles[0] || "student";
  }

  // Keep legacy userType synchronized with activeRole
  this.userType = this.activeRole;

  // Existing users who already have codes remain 'approved'
  if (this.studentCode || this.teacherCode) {
    if (!this.tuitionApprovalStatus || this.tuitionApprovalStatus === "none") {
      this.tuitionApprovalStatus = "approved";
    }
  } else if (!this.tuitionApprovalStatus) {
    this.tuitionApprovalStatus = "none";
  }
});

const User = mongoose.model<IUser>("User", userSchema);

/**
 * Backfill helper to assign permanent studentCode and teacherCode to pre-existing user records.
 */
export async function backfillUserCodes(): Promise<{ studentsUpdated: number; teachersUpdated: number }> {
  let studentsUpdated = 0;
  let teachersUpdated = 0;

  // Students missing code
  const studentsWithoutCode = await User.find({
    $or: [{ userType: "student" }, { roles: { $in: ["student", "learner", "personal"] } }],
    studentCode: { $exists: false },
  });

  for (const s of studentsWithoutCode) {
    s.studentCode = generateStudentCode();
    await s.save();
    studentsUpdated++;
  }

  // Teachers missing code
  const teachersWithoutCode = await User.find({
    $or: [{ userType: "teacher" }, { userType: "tuition_provider" }, { roles: { $in: ["teacher", "tuition_provider"] } }],
    teacherCode: { $exists: false },
  });

  for (const t of teachersWithoutCode) {
    t.teacherCode = generateTeacherCode();
    await t.save();
    teachersUpdated++;
  }

  return { studentsUpdated, teachersUpdated };
}

export default User;