import mongoose, { Document, Schema, Types } from "mongoose";

export type InstitutionRole =
  | "admin"
  | "subadmin"
  | "trainer"
  | "trainee"
  | "parent";

export type MembershipStatus = "active" | "invited" | "suspended";

export interface IInstitutionMembership extends Document {
  institutionId: Types.ObjectId;
  userId: Types.ObjectId;
  role: InstitutionRole;
  status: MembershipStatus;
  title?: string;
  department?: string;
  permissions?: string[];
  invitedBy?: Types.ObjectId;
  linkedLearners?: Types.ObjectId[];
  invitationCode?: string;
  notes?: string;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const institutionMembershipSchema = new Schema<IInstitutionMembership>(
  {
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
      default: "trainee",
      enum: ["admin", "subadmin", "trainer", "trainee", "parent"],
      index: true,
    },
    status: {
      type: String,
      required: true,
      default: "active",
      enum: ["active", "invited", "suspended"],
      index: true,
    },
    title: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    permissions: [
      {
        type: String,
        trim: true,
      },
    ],
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    linkedLearners: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    invitationCode: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// CRITICAL UNIQUE CONSTRAINT: A user cannot have multiple active/duplicate memberships in the same institution
institutionMembershipSchema.index({ institutionId: 1, userId: 1 }, { unique: true });

// Query optimization indexes for role lookups and tenant queries
institutionMembershipSchema.index({ institutionId: 1, role: 1 });
institutionMembershipSchema.index({ institutionId: 1, status: 1 });
institutionMembershipSchema.index({ userId: 1, status: 1 });

export default mongoose.model<IInstitutionMembership>(
  "InstitutionMembership",
  institutionMembershipSchema
);
