import mongoose from "mongoose";
import TuitionProviderProfile, {
  ITuitionProviderProfile,
  TuitionPlatformTier,
  TuitionVerificationStatus,
} from "../models/TuitionProviderProfile";
import TuitionOffering from "../models/TuitionOffering";
import TuitionBatch from "../models/TuitionBatch";
import TuitionRequest from "../models/TuitionRequest";
import TuitionEnrollment from "../models/TuitionEnrollment";
import TuitionSession from "../models/TuitionSession";
import TuitionTransaction from "../models/TuitionTransaction";
import User from "../models/User";
import {
  computeProviderTierScore,
  recalculateAndSaveProviderTier,
} from "./tuition_tier_service";

export interface OnboardingInput {
  fullName: string;
  headline?: string;
  bio?: string;
  photoUrl?: string;
  education?: Array<{ degree: string; institution: string; yearOfPassing?: number }>;
  qualifications?: string[];
  experienceYears?: number;
  subjects: string[];
  classesTaught: string[];
  teachingMode: Array<"online" | "offline" | "hybrid">;
  teachingMethodology?: string;
  availableHours?: string;
  preferredSchedule?: string;
  location?: { city?: string; state?: string; country?: string };
  supportingDocuments?: Array<{ title: string; documentUrl: string }>;
  pricing?: { minHourlyRate?: number; maxHourlyRate?: number; currency?: string };
}

/**
 * Retrieves the tuition provider profile for a given user ID.
 */
export const getTuitionProviderProfile = async (
  userId: string
): Promise<ITuitionProviderProfile | null> => {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;
  return await TuitionProviderProfile.findOne({ userId });
};

/**
 * Submits or updates provider onboarding details.
 * Places the provider in 'pending' status awaiting platform verification.
 */
export const submitTuitionProviderOnboarding = async (
  userId: string,
  input: OnboardingInput
): Promise<ITuitionProviderProfile> => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (!input.fullName?.trim()) {
    throw new Error("Full name is required");
  }
  if (!input.subjects || input.subjects.length === 0) {
    throw new Error("At least one subject is required");
  }
  if (!input.classesTaught || input.classesTaught.length === 0) {
    throw new Error("At least one class/education level taught is required");
  }
  if (!input.teachingMode || input.teachingMode.length === 0) {
    throw new Error("At least one teaching mode (online, offline, hybrid) is required");
  }

  let profile = await TuitionProviderProfile.findOne({ userId });

  if (profile) {
    profile.fullName = input.fullName.trim();
    if (input.headline !== undefined) profile.headline = input.headline.trim();
    if (input.bio !== undefined) profile.bio = input.bio.trim();
    if (input.photoUrl !== undefined) profile.photoUrl = input.photoUrl.trim();
    if (input.education) profile.education = input.education;
    if (input.qualifications) profile.qualifications = input.qualifications;
    if (input.experienceYears !== undefined) profile.experienceYears = Math.max(0, input.experienceYears);
    profile.subjects = input.subjects;
    profile.classesTaught = input.classesTaught;
    profile.teachingMode = input.teachingMode;
    if (input.teachingMethodology !== undefined) profile.teachingMethodology = input.teachingMethodology.trim();
    if (input.availableHours !== undefined) profile.availableHours = input.availableHours.trim();
    if (input.preferredSchedule !== undefined) profile.preferredSchedule = input.preferredSchedule.trim();
    if (input.location) profile.location = input.location;
    if (input.supportingDocuments) {
      profile.supportingDocuments = input.supportingDocuments.map((doc) => ({
        title: doc.title,
        documentUrl: doc.documentUrl,
        uploadedAt: new Date(),
      }));
    }
    if (input.pricing) {
      profile.pricing = {
        minHourlyRate: input.pricing.minHourlyRate || profile.pricing.minHourlyRate,
        maxHourlyRate: input.pricing.maxHourlyRate || profile.pricing.maxHourlyRate,
        currency: input.pricing.currency || profile.pricing.currency || "INR",
      };
    }
    // Recompute score breakdown without granting verified status until admin review
    profile.tierScore = computeProviderTierScore(
      profile,
      profile.rating?.average || 0,
      profile.rating?.count || 0,
      0
    );

    // Set to pending when re-submitted if was previously rejected or needs_info
    if (profile.verificationStatus !== "verified") {
      profile.verificationStatus = "pending";
    }
    await profile.save();
  } else {
    profile = new TuitionProviderProfile({
      userId: user._id,
      fullName: input.fullName.trim(),
      headline: input.headline?.trim() || "",
      bio: input.bio?.trim() || "",
      photoUrl: input.photoUrl?.trim() || "",
      education: input.education || [],
      qualifications: input.qualifications || [],
      experienceYears: Math.max(0, input.experienceYears || 0),
      subjects: input.subjects,
      classesTaught: input.classesTaught,
      teachingMode: input.teachingMode,
      teachingMethodology: input.teachingMethodology?.trim() || "",
      availableHours: input.availableHours?.trim() || "",
      preferredSchedule: input.preferredSchedule?.trim() || "",
      location: input.location || { country: "India" },
      supportingDocuments: (input.supportingDocuments || []).map((doc) => ({
        title: doc.title,
        documentUrl: doc.documentUrl,
        uploadedAt: new Date(),
      })),
      pricing: {
        minHourlyRate: input.pricing?.minHourlyRate || 500,
        maxHourlyRate: input.pricing?.maxHourlyRate || 2000,
        currency: input.pricing?.currency || "INR",
      },
      verificationStatus: "pending",
      platformTier: "standard",
      isProvisionalTier: true,
      isQualificationsVerified: false,
      isExperienceVerified: false,
    });

    profile.tierScore = computeProviderTierScore(profile, 0, 0, 0);
    await profile.save();
  }

  return profile;
};

/**
 * Platform administration: Updates verification status, records audit history, and manages role permissions.
 */
export const adminUpdateVerificationStatus = async (
  profileId: string,
  status: TuitionVerificationStatus,
  notes?: string,
  tier?: TuitionPlatformTier,
  adminActor: string | { id?: string; name?: string; reason?: string } = "Platform Admin"
): Promise<ITuitionProviderProfile> => {
  const profile = await TuitionProviderProfile.findById(profileId);
  if (!profile) {
    throw new Error("Tuition provider profile not found");
  }

  const adminName =
    typeof adminActor === "string" ? adminActor : adminActor.name || "Platform Admin";
  const adminUserId = typeof adminActor === "object" ? adminActor.id : undefined;

  profile.verificationStatus = status;
  if (notes !== undefined) profile.verificationNotes = notes;

  if (!profile.verificationAuditTrail) profile.verificationAuditTrail = [];
  profile.verificationAuditTrail.push({
    status,
    decisionBy: adminName,
    notes: notes || `Verification status updated to ${status}`,
    decidedAt: new Date(),
  });

  const user = await User.findById(profile.userId);

  if (status === "verified") {
    profile.verifiedAt = new Date();
    profile.isQualificationsVerified = true;
    profile.isExperienceVerified = true;

    // Grant tuition_provider role upon official verification
    if (user) {
      if (!user.roles) user.roles = [user.userType || "student"];
      if (!user.roles.includes("tuition_provider")) {
        user.roles.push("tuition_provider");
      }
      await user.save();
    }
  } else if (status === "rejected" || status === "needs_info") {
    profile.isQualificationsVerified = false;
    profile.isExperienceVerified = false;

    // Revoke role if rejected or additional information required
    if (user && user.roles && user.roles.includes("tuition_provider")) {
      user.roles = user.roles.filter((r) => r !== "tuition_provider");
      if (user.activeRole === "tuition_provider") {
        user.activeRole = user.roles[0] || "student";
        user.userType = user.activeRole;
      }
      await user.save();
    }
  }

  await profile.save();

  // Recalculate tier based on verified status, qualifications, and experience
  return await recalculateAndSaveProviderTier(
    profileId,
    {
      adminUserId,
      adminName,
      reason: notes || `Verification transition to ${status}`,
    },
    tier
  );
};

/**
 * Platform administration: Lists provider applications by verification status.
 */
export const getTuitionVerifications = async (
  status?: TuitionVerificationStatus
): Promise<ITuitionProviderProfile[]> => {
  const query: any = {};
  if (status) query.verificationStatus = status;
  return await TuitionProviderProfile.find(query)
    .populate("userId", "name email userType")
    .sort({ createdAt: -1 });
};

/**
 * Platform administration: Overrides or explicitly assigns a platform badge/tier (Standard, Gold, Platinum, Diamond).
 * Records authenticated admin ID and decision audit trail.
 */
export const adminAssignTier = async (
  profileId: string,
  tier: TuitionPlatformTier,
  adminActor: string | { id?: string; name?: string; reason?: string } = "Platform Admin"
): Promise<ITuitionProviderProfile> => {
  const adminName =
    typeof adminActor === "string" ? adminActor : adminActor.name || "Platform Admin";
  const adminUserId = typeof adminActor === "object" ? adminActor.id : undefined;
  const reason = typeof adminActor === "object" ? adminActor.reason : undefined;

  return await recalculateAndSaveProviderTier(
    profileId,
    {
      adminUserId,
      adminName,
      reason: reason || `Admin tier override to ${tier}`,
    },
    tier
  );
};

/**
 * Platform administration: Triggers score and tier recalculation for a provider.
 */
export const adminRecalculateProviderTier = async (
  profileId: string,
  adminActor: string | { id?: string; name?: string; reason?: string } = "Platform Admin"
): Promise<ITuitionProviderProfile> => {
  const adminName =
    typeof adminActor === "string" ? adminActor : adminActor.name || "Platform Admin";
  const adminUserId = typeof adminActor === "object" ? adminActor.id : undefined;

  return await recalculateAndSaveProviderTier(profileId, {
    adminUserId,
    adminName,
    reason: "Admin requested recalculation",
  });
};

/**
 * Retrieves the tuition provider workspace dashboard summary.
 */
export const getTuitionProviderDashboardOverview = async (userId: string) => {
  const providerObjectId = new mongoose.Types.ObjectId(userId);

  const profile = await TuitionProviderProfile.findOne({ userId: providerObjectId });
  const activeOfferingsCount = await TuitionOffering.countDocuments({
    providerId: providerObjectId,
    isActive: true,
  });
  const activeBatchesCount = await TuitionBatch.countDocuments({
    providerId: providerObjectId,
    status: "active",
  });
  const pendingRequestsCount = await TuitionRequest.countDocuments({
    providerId: providerObjectId,
    status: "pending",
  });
  const activeEnrolledCount = await TuitionEnrollment.countDocuments({
    providerId: providerObjectId,
    status: "active",
  });

  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingSessions = await TuitionSession.find({
    providerId: providerObjectId,
    sessionDate: { $gte: now, $lte: nextWeek },
    status: { $in: ["scheduled", "live"] },
  })
    .sort({ sessionDate: 1, startTime: 1 })
    .limit(5)
    .lean();

  const transactions = await TuitionTransaction.find({
    providerId: providerObjectId,
    status: "paid",
  }).lean();

  const totalGrossEarnings = transactions.reduce((sum, tx) => sum + (tx.grossAmount || 0), 0);

  return {
    profile,
    activeOfferingsCount,
    activeBatchesCount,
    activeEnrolledCount,
    pendingRequestsCount,
    upcomingSessions,
    financialSummary: {
      totalGrossEarnings,
      transactionsCount: transactions.length,
      currency: "INR",
    },
  };
};

/**
 * Retrieves financial ledger for tuition provider.
 */
export const getTuitionProviderFinancials = async (userId: string) => {
  const providerObjectId = new mongoose.Types.ObjectId(userId);

  const transactions = await TuitionTransaction.find({
    providerId: providerObjectId,
  })
    .populate("studentId", "name email")
    .populate("offeringId", "title subject classLevel")
    .sort({ createdAt: -1 })
    .lean();

  const paidTransactions = transactions.filter((t) => t.status === "paid");
  const refundedTransactions = transactions.filter((t) => t.status === "refunded");
  const totalReceived = paidTransactions.reduce((acc, t) => acc + t.grossAmount, 0);
  const totalRefunded = refundedTransactions.reduce((acc, t) => acc + t.grossAmount, 0);
  const netEarnings = totalReceived - totalRefunded;

  // Student-wise breakdown
  const studentMap: Record<string, { studentName: string; studentEmail: string; totalPaid: number; count: number }> = {};
  for (const tx of paidTransactions) {
    const sId = (tx.studentId as any)?._id?.toString() || "unknown";
    const sName = (tx.studentId as any)?.name || "Student";
    const sEmail = (tx.studentId as any)?.email || "";
    if (!studentMap[sId]) {
      studentMap[sId] = { studentName: sName, studentEmail: sEmail, totalPaid: 0, count: 0 };
    }
    studentMap[sId].totalPaid += tx.grossAmount;
    studentMap[sId].count += 1;
  }

  return {
    summary: {
      totalGrossEarnings: totalReceived,
      totalRefunded,
      netEarnings,
      currency: "INR",
      transactionCount: transactions.length,
    },
    transactions,
    studentBreakdown: Object.values(studentMap),
  };
};

