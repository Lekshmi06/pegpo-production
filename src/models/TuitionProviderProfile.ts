import mongoose, { Document, Schema } from "mongoose";

export type TuitionVerificationStatus = "pending" | "verified" | "rejected" | "needs_info";
export type TuitionPlatformTier = "standard" | "gold" | "platinum" | "diamond";
export type TuitionTeachingMode = "online" | "offline" | "hybrid";

export interface ITuitionEducation {
  degree: string;
  institution: string;
  yearOfPassing?: number;
  isVerified?: boolean;
}

export interface ITuitionDocument {
  title: string;
  documentUrl: string;
  uploadedAt: Date;
}

export interface IVerificationAuditEntry {
  status: TuitionVerificationStatus;
  decisionBy: string;
  notes?: string;
  decidedAt: Date;
}

export interface ITierScoreBreakdown {
  educationLevelMatched?: string;
  educationPoints: number;
  verifiedExperienceYears?: number;
  experiencePoints: number;
  verifiedRatingAverage?: number;
  verifiedRatingCount?: number;
  ratingPoints: number;
  verifiedReviewCount?: number;
  reviewPoints: number;
  totalPoints: number;
  isProvisional: boolean;
  lastCalculatedAt: Date;
}

export interface ITierOverrideDetails {
  isOverridden: boolean;
  previousTier?: TuitionPlatformTier;
  overriddenTier?: TuitionPlatformTier;
  adminUserId?: mongoose.Types.ObjectId;
  adminName?: string;
  reason?: string;
  overriddenAt?: Date;
}

export interface ITierAuditEntry {
  tier: TuitionPlatformTier;
  previousTier?: TuitionPlatformTier;
  totalPoints: number;
  isProvisional: boolean;
  assignedBy: string;
  adminUserId?: mongoose.Types.ObjectId;
  reason?: string;
  isOverride?: boolean;
  assignedAt: Date;
}

export interface ITuitionProviderBadge {
  badgeId: string;
  title: string;
  description: string;
  icon: string;
  awardedAt: Date;
  criteria: string;
}

export interface ITuitionProviderProfile extends Document {
  userId: mongoose.Types.ObjectId;
  fullName: string;
  headline?: string;
  bio?: string;
  photoUrl?: string;
  education: ITuitionEducation[];
  qualifications: string[];
  experienceYears: number;
  isQualificationsVerified?: boolean;
  isExperienceVerified?: boolean;
  subjects: string[];
  classesTaught: string[];
  teachingMode: TuitionTeachingMode[];
  teachingMethodology?: string;
  availableHours?: string;
  preferredSchedule?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  supportingDocuments: ITuitionDocument[];
  verificationStatus: TuitionVerificationStatus;
  verificationNotes?: string;
  verifiedAt?: Date;
  verificationAuditTrail: IVerificationAuditEntry[];
  platformTier: TuitionPlatformTier;
  calculatedTier: TuitionPlatformTier;
  isOverridden: boolean;
  overrideDetails?: ITierOverrideDetails;
  isProvisionalTier: boolean;
  provisionalReason?: string;
  tierScore: ITierScoreBreakdown;
  tierAssignedBy?: string;
  tierAssignedAt?: Date;
  tierAuditTrail: ITierAuditEntry[];
  badges: ITuitionProviderBadge[];
  rating: {
    average: number;
    count: number;
  };
  pricing: {
    minHourlyRate?: number;
    maxHourlyRate?: number;
    currency: string;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const tuitionProviderProfileSchema = new Schema<ITuitionProviderProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    headline: {
      type: String,
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
    },
    photoUrl: {
      type: String,
      trim: true,
    },
    education: [
      {
        degree: { type: String, required: true },
        institution: { type: String, required: true },
        yearOfPassing: { type: Number },
        isVerified: { type: Boolean, default: false },
      },
    ],
    qualifications: [{ type: String, trim: true }],
    experienceYears: {
      type: Number,
      default: 0,
      min: 0,
    },
    isQualificationsVerified: {
      type: Boolean,
      default: false,
    },
    isExperienceVerified: {
      type: Boolean,
      default: false,
    },
    subjects: {
      type: [String],
      required: true,
      index: true,
    },
    classesTaught: {
      type: [String],
      required: true,
      index: true,
    },
    teachingMode: {
      type: [String],
      enum: ["online", "offline", "hybrid"],
      default: ["online"],
      index: true,
    },
    teachingMethodology: {
      type: String,
      trim: true,
    },
    availableHours: {
      type: String,
      trim: true,
    },
    preferredSchedule: {
      type: String,
      trim: true,
    },
    location: {
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true, default: "India" },
    },
    supportingDocuments: [
      {
        title: { type: String, required: true },
        documentUrl: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected", "needs_info"],
      default: "pending",
      index: true,
    },
    verificationNotes: {
      type: String,
      trim: true,
    },
    verifiedAt: {
      type: Date,
    },
    verificationAuditTrail: [
      {
        status: { type: String, required: true },
        decisionBy: { type: String, required: true },
        notes: { type: String },
        decidedAt: { type: Date, default: Date.now },
      },
    ],
    platformTier: {
      type: String,
      enum: ["standard", "gold", "platinum", "diamond"],
      default: "standard",
      index: true,
    },
    calculatedTier: {
      type: String,
      enum: ["standard", "gold", "platinum", "diamond"],
      default: "standard",
      index: true,
    },
    isOverridden: {
      type: Boolean,
      default: false,
      index: true,
    },
    overrideDetails: {
      isOverridden: { type: Boolean, default: false },
      previousTier: { type: String, enum: ["standard", "gold", "platinum", "diamond"] },
      overriddenTier: { type: String, enum: ["standard", "gold", "platinum", "diamond"] },
      adminUserId: { type: Schema.Types.ObjectId, ref: "User" },
      adminName: { type: String },
      reason: { type: String },
      overriddenAt: { type: Date },
    },
    isProvisionalTier: {
      type: Boolean,
      default: true,
      index: true,
    },
    provisionalReason: {
      type: String,
    },
    tierScore: {
      educationLevelMatched: { type: String },
      educationPoints: { type: Number, default: 0 },
      verifiedExperienceYears: { type: Number, default: 0 },
      experiencePoints: { type: Number, default: 0 },
      verifiedRatingAverage: { type: Number, default: 0 },
      verifiedRatingCount: { type: Number, default: 0 },
      ratingPoints: { type: Number, default: 0 },
      verifiedReviewCount: { type: Number, default: 0 },
      reviewPoints: { type: Number, default: 0 },
      totalPoints: { type: Number, default: 0 },
      isProvisional: { type: Boolean, default: true },
      lastCalculatedAt: { type: Date, default: Date.now },
    },
    tierAssignedBy: {
      type: String,
      trim: true,
    },
    tierAssignedAt: {
      type: Date,
    },
    tierAuditTrail: [
      {
        tier: { type: String, required: true },
        previousTier: { type: String },
        totalPoints: { type: Number, default: 0 },
        isProvisional: { type: Boolean, default: false },
        assignedBy: { type: String, required: true },
        adminUserId: { type: Schema.Types.ObjectId, ref: "User" },
        reason: { type: String },
        isOverride: { type: Boolean, default: false },
        assignedAt: { type: Date, default: Date.now },
      },
    ],
    badges: [
      {
        badgeId: { type: String, required: true },
        title: { type: String, required: true },
        description: { type: String, required: true },
        icon: { type: String, default: "Award" },
        awardedAt: { type: Date, default: Date.now },
        criteria: { type: String, required: true },
      },
    ],
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0, min: 0 },
    },
    pricing: {
      minHourlyRate: { type: Number, min: 0, default: 500 },
      maxHourlyRate: { type: Number, min: 0, default: 2000 },
      currency: { type: String, default: "INR" },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

tuitionProviderProfileSchema.index({
  verificationStatus: 1,
  isActive: 1,
  subjects: 1,
  classesTaught: 1,
});

tuitionProviderProfileSchema.index({
  verificationStatus: 1,
  isActive: 1,
  "tierScore.totalPoints": -1,
  "rating.average": -1,
});

const TuitionProviderProfile = mongoose.model<ITuitionProviderProfile>(
  "TuitionProviderProfile",
  tuitionProviderProfileSchema
);

export default TuitionProviderProfile;

