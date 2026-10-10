import mongoose, { Document, Schema, Types } from "mongoose";

export type InstitutionType =
  | "school"
  | "college"
  | "training_institute"
  | "coaching_centre"
  | "company"
  | "corporate_training"
  | "other";

export type InstitutionStatus = "active" | "inactive" | "pending" | "suspended";

export interface IInstitutionAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
}

export interface IInstitutionSettings {
  allowMemberInvites?: boolean;
  defaultBatchNaming?: string;
  industryOrField?: string;
  companySize?: string;
}

export interface IInstitution extends Document {
  name: string;
  slug: string;
  institutionType: InstitutionType;
  description?: string;
  logo?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  address?: IInstitutionAddress;
  owner: Types.ObjectId;
  status: InstitutionStatus;
  settings?: IInstitutionSettings;
  createdAt: Date;
  updatedAt: Date;
}

const institutionSchema = new Schema<IInstitution>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    institutionType: {
      type: String,
      required: true,
      default: "training_institute",
      enum: [
        "school",
        "college",
        "training_institute",
        "coaching_centre",
        "company",
        "corporate_training",
        "other",
      ],
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    logo: {
      type: String,
      trim: true,
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true },
      zipCode: { type: String, trim: true },
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "pending", "suspended"],
      default: "active",
      index: true,
    },
    settings: {
      allowMemberInvites: { type: Boolean, default: true },
      defaultBatchNaming: { type: String, default: "Batch" },
      industryOrField: { type: String, trim: true },
      companySize: { type: String, trim: true },
    },
  },
  {
    timestamps: true,
  }
);

// Helpful compound indexes
institutionSchema.index({ status: 1, institutionType: 1 });
institutionSchema.index({ owner: 1, createdAt: -1 });

export default mongoose.model<IInstitution>("Institution", institutionSchema);
