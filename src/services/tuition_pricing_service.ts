import mongoose from "mongoose";
import TuitionPricing, {
  ITuitionPricing,
  TuitionCurriculum,
} from "../models/TuitionPricing";
import TuitionProviderProfile from "../models/TuitionProviderProfile";

export interface PricingResolutionResult {
  studentHourlyRate: number;
  teacherHourlyPayoutRate: number;
  currency: string;
  matchedRuleId?: mongoose.Types.ObjectId;
  curriculum: string;
  classLevel: string;
  subject: string;
  teacherTier?: string;
}

export interface PricingSnapshot {
  studentHourlyRate: number;
  currency: string;
  totalHoursRequested: number;
  totalAmount: number;
  teacherHourlyPayoutRate?: number;
}

/**
 * Resolves the applicable hourly student billing rate and teacher payout rate
 * based on subject, classLevel, curriculum, and optional teacher verification tier.
 * Follows a most-specific to least-specific matching priority with guaranteed platform fallback.
 */
export async function resolveTuitionPricing(params: {
  subject: string;
  classLevel?: string;
  curriculum?: string;
  teacherId?: string;
}): Promise<PricingResolutionResult> {
  const { subject, classLevel = "all", curriculum = "all", teacherId } = params;

  // Determine teacher tier if teacherId is provided
  let teacherTier: "standard" | "silver" | "gold" | "platinum" = "standard";
  if (teacherId && mongoose.Types.ObjectId.isValid(teacherId)) {
    const profile = await TuitionProviderProfile.findOne({ userId: teacherId });
    if (profile?.platformTier) {
      teacherTier = profile.platformTier.toLowerCase() as any;
    }
  }

  // Matching priorities:
  // 1. Exact subject + classLevel + curriculum
  // 2. Exact subject + curriculum (wildcard classLevel)
  // 3. Exact classLevel + curriculum (wildcard subject)
  // 4. Exact curriculum (wildcard subject + classLevel)
  // 5. Global fallback (all / all / all)

  const activeRules = await TuitionPricing.find({ isActive: true }).lean();

  let matchedRule: ITuitionPricing | null = null;

  // 1. Exact match
  matchedRule =
    activeRules.find(
      (r) =>
        r.subject.toLowerCase() === subject.toLowerCase() &&
        r.classLevel.toLowerCase() === classLevel.toLowerCase() &&
        r.curriculum.toLowerCase() === curriculum.toLowerCase()
    ) || null;

  // 2. Exact subject + curriculum
  if (!matchedRule) {
    matchedRule =
      activeRules.find(
        (r) =>
          r.subject.toLowerCase() === subject.toLowerCase() &&
          r.curriculum.toLowerCase() === curriculum.toLowerCase() &&
          r.classLevel === "all"
      ) || null;
  }

  // 3. Exact classLevel + curriculum
  if (!matchedRule) {
    matchedRule =
      activeRules.find(
        (r) =>
          r.classLevel.toLowerCase() === classLevel.toLowerCase() &&
          r.curriculum.toLowerCase() === curriculum.toLowerCase() &&
          r.subject === "all"
      ) || null;
  }

  // 4. Exact curriculum
  if (!matchedRule) {
    matchedRule =
      activeRules.find(
        (r) =>
          r.curriculum.toLowerCase() === curriculum.toLowerCase() &&
          r.subject === "all" &&
          r.classLevel === "all"
      ) || null;
  }

  // 5. Platform default rule
  if (!matchedRule) {
    matchedRule =
      activeRules.find(
        (r) =>
          r.subject === "all" &&
          r.classLevel === "all" &&
          r.curriculum === "all"
      ) || null;
  }

  const studentHourlyRate = matchedRule?.studentHourlyRate ?? 800;
  let teacherHourlyPayoutRate = matchedRule?.teacherHourlyPayoutRate ?? 500;

  // Apply tier override if rule specifies teacherTierRates
  if (matchedRule?.teacherTierRates && matchedRule.teacherTierRates[teacherTier]) {
    teacherHourlyPayoutRate = matchedRule.teacherTierRates[teacherTier];
  }

  return {
    studentHourlyRate,
    teacherHourlyPayoutRate,
    currency: matchedRule?.currency || "INR",
    matchedRuleId: matchedRule?._id as mongoose.Types.ObjectId,
    curriculum,
    classLevel,
    subject,
    teacherTier,
  };
}

/**
 * Creates an immutable pricing snapshot for requests and enrollments.
 */
export function generatePricingSnapshot(
  studentHourlyRate: number,
  totalHours: number,
  currency: string = "INR",
  teacherHourlyPayoutRate?: number
): PricingSnapshot {
  return {
    studentHourlyRate,
    currency,
    totalHoursRequested: totalHours,
    totalAmount: Math.round(studentHourlyRate * totalHours),
    teacherHourlyPayoutRate,
  };
}

/**
 * Admin: List all active and archived pricing cards.
 */
export async function listAllPricingRules(): Promise<ITuitionPricing[]> {
  return await TuitionPricing.find().sort({ createdAt: -1 });
}

/**
 * Admin: Create a new pricing rule card.
 */
export async function createPricingRule(
  data: Partial<ITuitionPricing>,
  adminUserId?: string
): Promise<ITuitionPricing> {
  return await TuitionPricing.create({
    ...data,
    createdBy: adminUserId ? new mongoose.Types.ObjectId(adminUserId) : undefined,
  });
}

/**
 * Admin: Update an existing pricing rule card.
 */
export async function updatePricingRule(
  pricingId: string,
  updateData: Partial<ITuitionPricing>
): Promise<ITuitionPricing | null> {
  return await TuitionPricing.findByIdAndUpdate(pricingId, updateData, {
    new: true,
  });
}

