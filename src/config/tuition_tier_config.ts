export interface EducationPointsConfig {
  doctorate: number;
  master: number;
  bachelor: number;
  diploma: number;
}

export interface ExperienceBracket {
  min: number;
  max?: number;
  points: number;
}

export interface RatingBracket {
  min: number;
  max?: number;
  points: number;
}

export interface ReviewBracket {
  min: number;
  max?: number;
  points: number;
}

export interface TierThresholdsConfig {
  diamond: number;
  platinum: number;
  gold: number;
  standard: number;
}

export interface TuitionTierConfiguration {
  minRatingsForEvaluation: number;
  minReviewsForEvaluation: number;
  minimumAcceptableRating: number; // Minimum average student rating (e.g. 3.0) required to confirm tier and lift provisional status
  education: EducationPointsConfig;
  experienceBrackets: ExperienceBracket[];
  ratingBrackets: RatingBracket[];
  reviewBrackets: ReviewBracket[];
  tierThresholds: TierThresholdsConfig;
}

/**
 * Transparent 100-Point Tuition Provider Evaluation Model
 *
 * 1. Education Level: 30 points max (highest verified qualification)
 *    - Diploma / equivalent: 5
 *    - Bachelor's degree: 15
 *    - Master's / PG: 23
 *    - PhD / Doctorate: 30
 *
 * 2. Teaching Experience: 25 points max (verified during onboarding/admin review)
 *    - Below 1 year: 3
 *    - 1–2 years: 7
 *    - 3–5 years: 13
 *    - 6–10 years: 19
 *    - Above 10 years: 25
 *
 * 3. Student Rating: 25 points max (verified tuition students)
 *    - Below 3.0: 0
 *    - 3.0–3.4: 8
 *    - 3.5–3.9: 13
 *    - 4.0–4.4: 18
 *    - 4.5–4.7: 22
 *    - 4.8–5.0: 25
 *    - Minimum 3 verified ratings required; fewer treated as provisional/unrated.
 *
 * 4. Verified Student Reviews: 20 points max (linked to genuine enrolments)
 *    - 0–2: 0
 *    - 3–5: 5
 *    - 6–10: 10
 *    - 11–20: 15
 *    - Above 20: 20
 *
 * Tier Thresholds:
 *    - 0–39: Standard / Unranked
 *    - 40–59: Gold
 *    - 60–79: Platinum
 *    - 80–100: Diamond
 *
 * Note: Tiers are non-commission based and do not affect tuition pricing or platform revenue splits.
 */
export const DEFAULT_TUITION_TIER_CONFIG: TuitionTierConfiguration = {
  minRatingsForEvaluation: 3,
  minReviewsForEvaluation: 3,
  minimumAcceptableRating: 3.0,
  education: {
    doctorate: 30,
    master: 23,
    bachelor: 15,
    diploma: 5,
  },
  experienceBrackets: [
    { min: 0, max: 0.999, points: 3 },
    { min: 1, max: 2.999, points: 7 },
    { min: 3, max: 5.999, points: 13 },
    { min: 6, max: 10, points: 19 },
    { min: 10.001, points: 25 },
  ],
  ratingBrackets: [
    { min: 0, max: 2.999, points: 0 },
    { min: 3.0, max: 3.499, points: 8 },
    { min: 3.5, max: 3.999, points: 13 },
    { min: 4.0, max: 4.499, points: 18 },
    { min: 4.5, max: 4.799, points: 22 },
    { min: 4.8, max: 5.0, points: 25 },
  ],
  reviewBrackets: [
    { min: 0, max: 2, points: 0 },
    { min: 3, max: 5, points: 5 },
    { min: 6, max: 10, points: 10 },
    { min: 11, max: 20, points: 15 },
    { min: 21, points: 20 },
  ],
  tierThresholds: {
    diamond: 80,
    platinum: 60,
    gold: 40,
    standard: 0,
  },
};

