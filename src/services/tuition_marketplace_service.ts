import mongoose from "mongoose";
import TuitionProviderProfile, {
  ITuitionProviderProfile,
  TuitionPlatformTier,
} from "../models/TuitionProviderProfile";
import TuitionOffering from "../models/TuitionOffering";
import TuitionBatch from "../models/TuitionBatch";
import TuitionReview from "../models/TuitionReview";

export interface MarketplaceSearchParams {
  search?: string;
  subject?: string;
  classLevel?: string;
  teachingMode?: "online" | "offline" | "hybrid";
  classFormat?: "1:1" | "1:2" | "group" | "1:N";
  tier?: TuitionPlatformTier;
  minRating?: number;
  maxFee?: number;
  minExperience?: number;
  qualification?: string;
  page?: number;
  limit?: number;
}

export interface OfferingSearchParams {
  search?: string;
  subject?: string;
  classLevel?: string;
  teachingMode?: "online" | "offline" | "hybrid";
  classFormat?: "1:1" | "1:2" | "group" | "1:N";
  minFee?: number;
  maxFee?: number;
  day?: string;
  tier?: TuitionPlatformTier;
  minRating?: number;
  minExperience?: number;
  qualification?: string;
  page?: number;
  limit?: number;
}

export const searchTuitionProviders = async (params: MarketplaceSearchParams) => {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Math.min(50, Number(params.limit) || 12));
  const skip = (page - 1) * limit;

  // Strict Security Rule: ONLY verified and active providers appear in the public marketplace
  const filter: any = {
    verificationStatus: "verified",
    isActive: true,
  };

  if (params.search?.trim()) {
    const searchRegex = new RegExp(params.search.trim(), "i");
    filter.$or = [
      { fullName: searchRegex },
      { headline: searchRegex },
      { bio: searchRegex },
      { subjects: searchRegex },
      { classesTaught: searchRegex },
    ];
  }

  if (params.subject?.trim()) {
    filter.subjects = { $in: [new RegExp(`^${params.subject.trim()}$`, "i")] };
  }

  if (params.classLevel?.trim()) {
    filter.classesTaught = { $in: [new RegExp(`^${params.classLevel.trim()}$`, "i")] };
  }

  if (params.teachingMode) {
    filter.teachingMode = { $in: [params.teachingMode] };
  }

  if (params.tier && (params.tier as string) !== "All") {
    filter.platformTier = params.tier;
  }

  if (params.minRating && Number(params.minRating) > 0) {
    filter["rating.average"] = { $gte: Number(params.minRating) };
  }

  if (params.maxFee && Number(params.maxFee) > 0) {
    filter["pricing.minHourlyRate"] = { $lte: Number(params.maxFee) };
  }

  if (params.minExperience && Number(params.minExperience) > 0) {
    filter.experienceYears = { $gte: Number(params.minExperience) };
  }

  if (params.qualification?.trim()) {
    const qualRegex = new RegExp(params.qualification.trim(), "i");
    filter.$or = [
      ...(filter.$or || []),
      { qualifications: qualRegex },
      { "education.degree": qualRegex },
    ];
  }

  const [providers, totalCount] = await Promise.all([
    TuitionProviderProfile.find(filter)
      .select("-verificationNotes -supportingDocuments")
      .sort({ isProvisionalTier: 1, "tierScore.totalPoints": -1, "rating.average": -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TuitionProviderProfile.countDocuments(filter),
  ]);

  // Attach offerings summary to each provider
  const providerUserIds = providers.map((p) => p.userId);
  const offerings = await TuitionOffering.find({
    providerId: { $in: providerUserIds },
    isActive: true,
  })
    .select("providerId title subject classLevel teachingMode classFormat feeAmount billingUnit currency")
    .lean();

  const offeringsByProvider: Record<string, any[]> = {};
  for (const off of offerings) {
    const pId = off.providerId.toString();
    if (!offeringsByProvider[pId]) offeringsByProvider[pId] = [];
    offeringsByProvider[pId].push(off);
  }

  const results = providers.map((provider) => ({
    ...provider,
    offerings: offeringsByProvider[provider.userId.toString()] || [],
  }));

  return {
    providers: results,
    pagination: {
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
};

/**
 * Retrieves public profile details for a verified tuition provider.
 */
export const getPublicTuitionProviderDetails = async (identifier: string) => {
  let profile: ITuitionProviderProfile | null = null;

  if (mongoose.Types.ObjectId.isValid(identifier)) {
    // Check by profile ID or user ID
    profile = await TuitionProviderProfile.findOne({
      $or: [{ _id: identifier }, { userId: identifier }],
      verificationStatus: "verified",
      isActive: true,
    }).lean();
  }

  if (!profile) {
    throw new Error("Verified tuition provider not found");
  }

  const providerUserId = profile.userId;

  // Active offerings
  const offerings = await TuitionOffering.find({
    providerId: providerUserId,
    isActive: true,
  }).lean();

  // Active batches for these offerings
  const offeringIds = offerings.map((o) => o._id);
  const batches = await TuitionBatch.find({
    offeringId: { $in: offeringIds },
    status: "active",
  }).lean();

  // Verified reviews
  const reviews = await TuitionReview.find({
    providerId: providerUserId,
    status: "published",
  })
    .populate("studentId", "name")
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return {
    profile,
    offerings,
    batches,
    reviews,
  };
};

/**
 * Searches published tuition offerings from verified providers with rich filtering.
 */
export const searchTuitionOfferings = async (params: OfferingSearchParams) => {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Math.min(50, Number(params.limit) || 12));
  const skip = (page - 1) * limit;

  // 1. Build provider-level filter: ONLY verified and active providers
  const providerFilter: any = {
    verificationStatus: "verified",
    isActive: true,
  };

  if (params.tier && (params.tier as string) !== "All") {
    providerFilter.platformTier = params.tier;
  }

  if (params.minRating && Number(params.minRating) > 0) {
    providerFilter["rating.average"] = { $gte: Number(params.minRating) };
  }

  if (params.minExperience && Number(params.minExperience) > 0) {
    providerFilter.experienceYears = { $gte: Number(params.minExperience) };
  }

  if (params.qualification?.trim()) {
    const qualRegex = new RegExp(params.qualification.trim(), "i");
    providerFilter.$or = [
      { qualifications: qualRegex },
      { "education.degree": qualRegex },
    ];
  }

  const eligibleProviders = await TuitionProviderProfile.find(providerFilter)
    .select(
      "userId fullName headline photoUrl platformTier calculatedTier isOverridden isProvisionalTier provisionalReason rating experienceYears qualifications education badges"
    )
    .lean();

  if (eligibleProviders.length === 0) {
    return {
      offerings: [],
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
    };
  }

  const providerMap = new Map<string, any>();
  const providerUserIds: mongoose.Types.ObjectId[] = [];
  for (const prov of eligibleProviders) {
    const uId = prov.userId.toString();
    providerMap.set(uId, prov);
    providerUserIds.push(prov.userId as mongoose.Types.ObjectId);
  }

  // 2. Build offering-level filter
  const offeringFilter: any = {
    providerId: { $in: providerUserIds },
    isActive: true,
    status: { $in: ["published", null] }, // published or default active
  };

  if (params.search?.trim()) {
    const sRegex = new RegExp(params.search.trim(), "i");
    offeringFilter.$or = [
      { title: sRegex },
      { description: sRegex },
      { subject: sRegex },
      { classLevel: sRegex },
    ];
  }

  if (params.subject?.trim() && params.subject !== "All") {
    offeringFilter.subject = new RegExp(`^${params.subject.trim()}$`, "i");
  }

  if (params.classLevel?.trim() && params.classLevel !== "All") {
    offeringFilter.classLevel = new RegExp(`^${params.classLevel.trim()}$`, "i");
  }

  if (params.teachingMode && (params.teachingMode as string) !== "All") {
    offeringFilter.teachingMode = params.teachingMode;
  }

  if (params.classFormat && (params.classFormat as string) !== "All") {
    if (params.classFormat === "group" || params.classFormat === "1:N") {
      offeringFilter.classFormat = { $in: ["group", "1:N"] };
    } else {
      offeringFilter.classFormat = params.classFormat;
    }
  }

  if (params.minFee !== undefined && Number(params.minFee) >= 0) {
    offeringFilter.feeAmount = { ...(offeringFilter.feeAmount || {}), $gte: Number(params.minFee) };
  }

  if (params.maxFee !== undefined && Number(params.maxFee) > 0) {
    offeringFilter.feeAmount = { ...(offeringFilter.feeAmount || {}), $lte: Number(params.maxFee) };
  }

  if (params.day?.trim() && params.day !== "All") {
    const dayRegex = new RegExp(`^${params.day.trim()}$`, "i");
    offeringFilter.$or = [
      { availableDays: { $in: [dayRegex] } },
      { "timeSlots.day": dayRegex },
    ];
  }

  const [rawOfferings, totalCount] = await Promise.all([
    TuitionOffering.find(offeringFilter).lean(),
    TuitionOffering.countDocuments(offeringFilter),
  ]);

  // Enrich with provider details
  const enriched = rawOfferings.map((off) => {
    const prov = providerMap.get(off.providerId.toString()) || null;
    return {
      ...off,
      provider: prov,
    };
  });

  // Sort offerings: non-provisional first, then by provider platform tier weight, then rating average
  const tierWeight: Record<string, number> = {
    diamond: 4,
    platinum: 3,
    gold: 2,
    standard: 1,
  };

  enriched.sort((a, b) => {
    const provA = a.provider;
    const provB = b.provider;

    const aProvisional = provA?.isProvisionalTier ? 1 : 0;
    const bProvisional = provB?.isProvisionalTier ? 1 : 0;
    if (aProvisional !== bProvisional) return aProvisional - bProvisional;

    const aTier = tierWeight[provA?.platformTier || "standard"] || 0;
    const bTier = tierWeight[provB?.platformTier || "standard"] || 0;
    if (aTier !== bTier) return bTier - aTier;

    const aRating = provA?.rating?.average || 0;
    const bRating = provB?.rating?.average || 0;
    return bRating - aRating;
  });

  const paged = enriched.slice(skip, skip + limit);

  // Attach active batches to these offerings
  const pagedOfferingIds = paged.map((o) => o._id);
  const activeBatches = await TuitionBatch.find({
    offeringId: { $in: pagedOfferingIds },
    status: { $in: ["upcoming", "active"] },
  }).lean();

  const batchesByOffering: Record<string, any[]> = {};
  for (const b of activeBatches) {
    const offId = b.offeringId.toString();
    if (!batchesByOffering[offId]) batchesByOffering[offId] = [];
    batchesByOffering[offId].push(b);
  }

  const results = paged.map((off) => ({
    ...off,
    batches: batchesByOffering[off._id.toString()] || [],
  }));

  return {
    offerings: results,
    pagination: {
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
};

/**
 * Retrieves public details for a single published offering including provider, reviews, and batches.
 */
export const getPublicOfferingDetails = async (offeringId: string) => {
  if (!mongoose.Types.ObjectId.isValid(offeringId)) {
    throw new Error("Invalid offering ID");
  }

  const offering = await TuitionOffering.findOne({
    _id: offeringId,
    isActive: true,
  }).lean();

  if (!offering) {
    throw new Error("Tuition offering not found or inactive");
  }

  const provider = await TuitionProviderProfile.findOne({
    userId: offering.providerId,
    verificationStatus: "verified",
    isActive: true,
  })
    .select("-verificationNotes -supportingDocuments")
    .lean();

  if (!provider) {
    throw new Error("Offering provider is not verified or inactive");
  }

  const batches = await TuitionBatch.find({
    offeringId: offering._id,
    status: { $in: ["upcoming", "active"] },
  }).lean();

  const reviews = await TuitionReview.find({
    providerId: offering.providerId,
    status: "published",
  })
    .populate("studentId", "name")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return {
    offering,
    provider,
    batches,
    reviews,
  };
};

