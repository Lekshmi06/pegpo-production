import mongoose from "mongoose";
import TuitionProviderProfile, {
  ITuitionProviderProfile,
  ITierScoreBreakdown,
  ITuitionProviderBadge,
  TuitionPlatformTier,
} from "../models/TuitionProviderProfile";
import TuitionReview from "../models/TuitionReview";
import TuitionEnrollment from "../models/TuitionEnrollment";
import {
  DEFAULT_TUITION_TIER_CONFIG,
  TuitionTierConfiguration,
} from "../config/tuition_tier_config";

/**
 * Normalizes an educational qualification string into an recognized academic level.
 */
export const normalizeEducationLevel = (
  degreeStr?: string
): "doctorate" | "master" | "bachelor" | "diploma" | null => {
  if (!degreeStr || typeof degreeStr !== "string") return null;
  const str = degreeStr.trim();
  if (!str) return null;

  if (/\b(ph\.?d|doctorate|doctoral|d\.?phil|post[-\s]?doc)\b/i.test(str)) {
    return "doctorate";
  }
  if (/\b(diploma|polytechnic|associate)\b/i.test(str)) {
    return "diploma";
  }
  if (/\b(master|masters|m\.?tech|m\.?sc|m\.?a|m\.?com|m\.?ed|mba|mca|ms|post[-\s]?grad|pg)\b/i.test(str)) {
    return "master";
  }
  if (/\b(bachelor|bachelors|b\.?tech|b\.?sc|b\.?a|b\.?com|b\.?ed|bba|bca|b\.?e|bs|undergrad|undergraduate)\b/i.test(str)) {
    return "bachelor";
  }
  return null;
};

/**
 * Evaluates points for verified education level (30 points max).
 * Counts ONLY the highest relevant verified qualification.
 */
export const evaluateEducationPoints = (
  education: Array<{ degree: string; isVerified?: boolean }> = [],
  qualifications: string[] = [],
  isQualificationsVerified: boolean = false,
  config: TuitionTierConfiguration = DEFAULT_TUITION_TIER_CONFIG
): { points: number; matchedLevel: string | null; verified: boolean } => {
  if (!isQualificationsVerified && !education.some((e) => e.isVerified)) {
    return { points: 0, matchedLevel: null, verified: false };
  }

  const eligibleDegrees: string[] = [];

  for (const edu of education) {
    if (edu?.degree && (isQualificationsVerified || edu.isVerified)) {
      eligibleDegrees.push(edu.degree);
    }
  }

  if (isQualificationsVerified && Array.isArray(qualifications)) {
    for (const q of qualifications) {
      if (typeof q === "string" && q.trim()) {
        eligibleDegrees.push(q);
      }
    }
  }

  let highestLevel: "doctorate" | "master" | "bachelor" | "diploma" | null = null;
  let maxPoints = 0;

  for (const deg of eligibleDegrees) {
    const level = normalizeEducationLevel(deg);
    if (!level) continue;

    const points = config.education[level] || 0;
    if (points > maxPoints) {
      maxPoints = points;
      highestLevel = level;
    }
  }

  return {
    points: maxPoints,
    matchedLevel: highestLevel,
    verified: maxPoints > 0,
  };
};

/**
 * Evaluates points for verified teaching experience (25 points max).
 */
export const evaluateExperiencePoints = (
  experienceYears: number = 0,
  isExperienceVerified: boolean = false,
  config: TuitionTierConfiguration = DEFAULT_TUITION_TIER_CONFIG
): { points: number; verifiedYears: number; verified: boolean } => {
  if (!isExperienceVerified) {
    return { points: 0, verifiedYears: 0, verified: false };
  }

  const years = Number(experienceYears);
  if (isNaN(years) || years < 0) {
    return { points: 0, verifiedYears: 0, verified: false };
  }

  for (const bracket of config.experienceBrackets) {
    const minMatch = years >= bracket.min;
    const maxMatch = bracket.max === undefined || years <= bracket.max;
    if (minMatch && maxMatch) {
      return {
        points: bracket.points,
        verifiedYears: years,
        verified: true,
      };
    }
  }

  return { points: 0, verifiedYears: years, verified: true };
};

/**
 * Evaluates points for verified student ratings (25 points max).
 * Insufficient ratings (< minimum threshold) are treated as provisional, awarding 0 points without quality penalty.
 * Ratings below the minimum acceptable quality threshold (e.g. 3.0) do NOT remove provisional status.
 */
export const evaluateRatingPoints = (
  avgRating: number = 0,
  ratingCount: number = 0,
  config: TuitionTierConfiguration = DEFAULT_TUITION_TIER_CONFIG
): { points: number; isProvisional: boolean; provisionalReason?: string } => {
  const count = Math.max(0, Number(ratingCount) || 0);
  const rating = Number(avgRating) || 0;

  if (count < config.minRatingsForEvaluation) {
    return {
      points: 0,
      isProvisional: true,
      provisionalReason: `Insufficient ratings (accumulated ${count} of ${config.minRatingsForEvaluation} required verified ratings)`,
    };
  }

  // Quality check: Ratings below minimum acceptable quality do not remove provisional status
  if (rating < config.minimumAcceptableRating) {
    return {
      points: 0,
      isProvisional: true,
      provisionalReason: `Average student rating (${rating.toFixed(1)} ★) below minimum quality confirmation threshold (${config.minimumAcceptableRating.toFixed(1)} ★)`,
    };
  }

  for (const bracket of config.ratingBrackets) {
    const minMatch = rating >= bracket.min;
    const maxMatch = bracket.max === undefined || rating <= bracket.max;
    if (minMatch && maxMatch) {
      return { points: bracket.points, isProvisional: false };
    }
  }

  return { points: 0, isProvisional: false };
};

/**
 * Evaluates points for verified student reviews (20 points max).
 */
export const evaluateReviewPoints = (
  reviewCount: number = 0,
  config: TuitionTierConfiguration = DEFAULT_TUITION_TIER_CONFIG
): { points: number } => {
  const count = Math.max(0, Number(reviewCount) || 0);

  for (const bracket of config.reviewBrackets) {
    const minMatch = count >= bracket.min;
    const maxMatch = bracket.max === undefined || count <= bracket.max;
    if (minMatch && maxMatch) {
      return { points: bracket.points };
    }
  }

  return { points: 0 };
};

/**
 * Maps a total point score (0–100) to the corresponding platform tier.
 * A provider with low ratings (< minimum acceptable rating) is capped at standard tier.
 */
export const calculateTierFromPoints = (
  totalPoints: number,
  isProvisional: boolean,
  avgRating: number = 0,
  ratingCount: number = 0,
  config: TuitionTierConfiguration = DEFAULT_TUITION_TIER_CONFIG
): { tier: TuitionPlatformTier; isProvisional: boolean } => {
  const points = Math.max(0, Math.min(100, Math.round(totalPoints)));

  let tier: TuitionPlatformTier = "standard";

  if (points >= config.tierThresholds.diamond) {
    tier = "diamond";
  } else if (points >= config.tierThresholds.platinum) {
    tier = "platinum";
  } else if (points >= config.tierThresholds.gold) {
    tier = "gold";
  } else {
    tier = "standard";
  }

  // Quality Guard: A provider with low ratings (< minimumAcceptableRating) must NOT receive an artificially high tier
  if (ratingCount >= config.minRatingsForEvaluation && avgRating < config.minimumAcceptableRating) {
    tier = "standard";
  }

  return { tier, isProvisional };
};

/**
 * Computes the full 100-point tier score breakdown for a provider profile.
 */
export const computeProviderTierScore = (
  profile: ITuitionProviderProfile,
  verifiedRatingAverage: number = 0,
  verifiedRatingCount: number = 0,
  verifiedReviewCount: number = 0,
  config: TuitionTierConfiguration = DEFAULT_TUITION_TIER_CONFIG
): ITierScoreBreakdown => {
  const isQualificationsVerified =
    Boolean(profile.isQualificationsVerified) || profile.verificationStatus === "verified";
  const isExperienceVerified =
    Boolean(profile.isExperienceVerified) || profile.verificationStatus === "verified";

  const educationResult = evaluateEducationPoints(
    profile.education,
    profile.qualifications,
    isQualificationsVerified,
    config
  );

  const experienceResult = evaluateExperiencePoints(
    profile.experienceYears,
    isExperienceVerified,
    config
  );

  const ratingResult = evaluateRatingPoints(
    verifiedRatingAverage,
    verifiedRatingCount,
    config
  );

  const reviewResult = evaluateReviewPoints(
    verifiedReviewCount,
    config
  );

  const totalPoints = Math.min(
    100,
    educationResult.points +
      experienceResult.points +
      ratingResult.points +
      reviewResult.points
  );

  const isProvisional = ratingResult.isProvisional;

  return {
    educationLevelMatched: educationResult.matchedLevel || undefined,
    educationPoints: educationResult.points,
    verifiedExperienceYears: experienceResult.verifiedYears,
    experiencePoints: experienceResult.points,
    verifiedRatingAverage,
    verifiedRatingCount,
    ratingPoints: ratingResult.points,
    verifiedReviewCount,
    reviewPoints: reviewResult.points,
    totalPoints,
    isProvisional,
    lastCalculatedAt: new Date(),
  };
};

/**
 * Recalculates verified metrics from database records, re-scores the provider, and updates their tier.
 * Preserves system-calculated score and tier separately from any admin override.
 */
/**
 * Evaluates platform-awarded achievement badges based on verified activity and eligibility criteria.
 * Badges are independent from tiers (Standard, Gold, Platinum, Diamond) and cannot be self-assigned.
 */
export const evaluateProviderBadges = (
  profile: ITuitionProviderProfile
): ITuitionProviderBadge[] => {
  const badges: ITuitionProviderBadge[] = [];
  const now = new Date();

  // 1. EduPye Verified Educator
  if (profile.verificationStatus === "verified") {
    badges.push({
      badgeId: "verified_educator",
      title: "EduPye Verified Educator",
      description: "Identity and educational credentials officially verified by EduPye Administration",
      icon: "ShieldCheck",
      awardedAt: profile.verifiedAt || now,
      criteria: "Official admin verification completed",
    });
  }

  // 2. EduPye Experienced Tutor
  if (profile.isExperienceVerified && (profile.experienceYears || 0) >= 5) {
    badges.push({
      badgeId: "experienced_tutor",
      title: "EduPye Experienced Tutor",
      description: "Demonstrated 5+ years of verified professional tutoring experience",
      icon: "Briefcase",
      awardedAt: now,
      criteria: "5+ years of verified teaching experience",
    });
  }

  // 3. EduPye Top Rated
  if ((profile.rating?.average || 0) >= 4.8 && (profile.rating?.count || 0) >= 5) {
    badges.push({
      badgeId: "top_rated",
      title: "EduPye Top Rated",
      description: "Consistently exceptional student feedback with >= 4.8 stars across 5+ verified reviews",
      icon: "Star",
      awardedAt: now,
      criteria: ">= 4.8 average rating with at least 5 verified reviews",
    });
  }

  // 4. EduPye Student Favourite
  if ((profile.rating?.count || 0) >= 10 && (profile.rating?.average || 0) >= 4.5) {
    badges.push({
      badgeId: "student_favourite",
      title: "EduPye Student Favourite",
      description: "Popular mentor trusted by a large cohort of 10+ students with high satisfaction",
      icon: "Heart",
      awardedAt: now,
      criteria: "10+ verified student reviews with >= 4.5 average rating",
    });
  }

  // 5. EduPye Consistent Performer
  if (
    profile.verificationStatus === "verified" &&
    (profile.tierScore?.totalPoints || 0) >= 25
  ) {
    badges.push({
      badgeId: "consistent_performer",
      title: "EduPye Consistent Performer",
      description: "Recognized platform milestone achiever with strong multi-criteria evaluation score",
      icon: "Award",
      awardedAt: now,
      criteria: "Verified provider with >= 25 evaluation points",
    });
  }

  return badges;
};

export const recalculateAndSaveProviderTier = async (
  profileId: string,
  actor?: {
    adminUserId?: string;
    adminName?: string;
    reason?: string;
  },
  overrideTier?: TuitionPlatformTier,
  config: TuitionTierConfiguration = DEFAULT_TUITION_TIER_CONFIG
): Promise<ITuitionProviderProfile> => {
  const profile = await TuitionProviderProfile.findById(profileId);
  if (!profile) {
    throw new Error("Tuition provider profile not found");
  }

  // 1. Fetch all published reviews for this provider
  const publishedReviews = await TuitionReview.find({
    providerId: profile.userId,
    status: "published",
  });

  // 2. Filter genuine reviews linked strictly to COMPLETED and PAID tuition enrolments
  const enrollmentIds = publishedReviews.map((r) => r.enrollmentId).filter(Boolean);
  const eligibleEnrollments = await TuitionEnrollment.find({
    _id: { $in: enrollmentIds },
    status: "completed",
    paymentTransactionId: { $exists: true, $ne: "" },
  }).select("_id");

  const eligibleEnrollmentIdSet = new Set(
    eligibleEnrollments.map((e) => e._id.toString())
  );

  const verifiedReviews = publishedReviews.filter(
    (r) => r.enrollmentId && eligibleEnrollmentIdSet.has(r.enrollmentId.toString())
  );

  const verifiedReviewCount = verifiedReviews.length;
  const verifiedRatingCount = verifiedReviews.length;
  const verifiedRatingAverage =
    verifiedRatingCount > 0
      ? Number(
          (
            verifiedReviews.reduce((sum, r) => sum + r.rating, 0) / verifiedRatingCount
          ).toFixed(1)
        )
      : 0;

  // Sync profile rating aggregate with verified completed student feedback
  profile.rating = {
    average: verifiedRatingAverage,
    count: verifiedRatingCount,
  };

  // 3. Compute 100-point score breakdown (unaffected by admin override)
  const ratingResult = evaluateRatingPoints(
    verifiedRatingAverage,
    verifiedRatingCount,
    config
  );

  const scoreBreakdown = computeProviderTierScore(
    profile,
    verifiedRatingAverage,
    verifiedRatingCount,
    verifiedReviewCount,
    config
  );

  const { tier: calculatedTier, isProvisional } = calculateTierFromPoints(
    scoreBreakdown.totalPoints,
    ratingResult.isProvisional,
    verifiedRatingAverage,
    verifiedRatingCount,
    config
  );

  // Preserve system-calculated scores and tier
  profile.tierScore = scoreBreakdown;
  profile.calculatedTier = calculatedTier;
  profile.isProvisionalTier = isProvisional;
  profile.provisionalReason = ratingResult.provisionalReason;

  // 4. Handle tier assignment and admin override separation
  const previousEffectiveTier = profile.platformTier || "standard";
  let assignedTier: TuitionPlatformTier;
  const isExplicitOverride = Boolean(overrideTier);

  if (isExplicitOverride) {
    assignedTier = overrideTier!;
    profile.isOverridden = true;
    profile.platformTier = assignedTier;
    profile.overrideDetails = {
      isOverridden: true,
      previousTier: previousEffectiveTier,
      overriddenTier: assignedTier,
      adminUserId:
        actor?.adminUserId && mongoose.Types.ObjectId.isValid(actor.adminUserId)
          ? new mongoose.Types.ObjectId(actor.adminUserId)
          : undefined,
      adminName: actor?.adminName || "Platform Admin",
      reason: actor?.reason || `Admin override to ${assignedTier}`,
      overriddenAt: new Date(),
    };
  } else if (profile.isOverridden && profile.overrideDetails?.isOverridden && profile.overrideDetails?.overriddenTier) {
    // Preserve existing admin override; update underlying system score
    assignedTier = profile.overrideDetails.overriddenTier;
    profile.platformTier = assignedTier;
  } else {
    // Normal system calculation
    assignedTier = calculatedTier;
    profile.platformTier = calculatedTier;
    profile.isOverridden = false;
    profile.overrideDetails = { isOverridden: false };
  }

  profile.tierAssignedAt = new Date();
  profile.tierAssignedBy = actor?.adminName || (profile.isOverridden ? "Platform Admin" : "System Automated Evaluation");

  // 5. Append to Tier Audit Trail
  if (!profile.tierAuditTrail) {
    profile.tierAuditTrail = [];
  }

  profile.tierAuditTrail.push({
    tier: assignedTier,
    previousTier: previousEffectiveTier,
    totalPoints: scoreBreakdown.totalPoints,
    isProvisional: profile.isProvisionalTier,
    assignedBy: actor?.adminName || (profile.isOverridden ? "Platform Admin" : "System Automated Evaluation"),
    adminUserId:
      actor?.adminUserId && mongoose.Types.ObjectId.isValid(actor.adminUserId)
        ? new mongoose.Types.ObjectId(actor.adminUserId)
        : undefined,
    reason:
      actor?.reason ||
      (isExplicitOverride
        ? `Admin override to ${assignedTier}`
        : `System evaluation: ${scoreBreakdown.totalPoints} pts (${calculatedTier})`),
    isOverride: profile.isOverridden,
    assignedAt: new Date(),
  });

  // 6. Automatically evaluate platform-awarded achievement badges
  profile.badges = evaluateProviderBadges(profile);

  await profile.save();
  return profile;
};
