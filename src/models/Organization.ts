import mongoose, { Document, Schema } from "mongoose";

export type OrganizationType = "institution" | "tuition";

export interface IOrganization extends Document {
  name: string;
  type: OrganizationType;
  code?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  board?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["institution", "tuition"],
      default: "institution",
      required: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    address: {
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
    board: {
      type: String,
      trim: true,
      default: "CBSE",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

organizationSchema.index({ type: 1, isActive: 1 });
organizationSchema.index({ code: 1 });

const Organization = mongoose.model<IOrganization>("Organization", organizationSchema);

export default Organization;
