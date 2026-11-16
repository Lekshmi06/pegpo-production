import mongoose from "mongoose";
import assert from "assert";
import dotenv from "dotenv";
import TuitionProviderProfile, {
  TuitionPlatformTier,
} from "../models/TuitionProviderProfile";
import TuitionReview from "../models/TuitionReview";
import TuitionEnrollment from "../models/TuitionEnrollment";
import TuitionOffering from "../models/TuitionOffering";
import TuitionRequest from "../models/TuitionRequest";
import User from "../models/User";
import * as tierService from "../services/tuition_tier_service";
import * as providerService from "../services/tuition_provider_service";
import * as reviewService from "../services/tuition_review_service";
import { DEFAULT_TUITION_TIER_CONFIG } from "../config/tuition_tier_config";
import { requireTuitionPlatformAdmin } from "../middlewares/auth_middleware";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/edupye_tuition_tier_test";

async function runTuitionTierEvaluationTests() {
  console.log("==========================================================================");
  console.log("  EDUPYE PHASE 3: TUITION PROVIDER POINTS-BASED TIER EVALUATION AUDIT     ");
  console.log("==========================================================================\n");

  let testsPassed = 0;
  let testsFailed = 0;

  const test = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      testsPassed++;
      console.log(`  ✓ PASS: ${name}`);
    } catch (err: any) {
      testsFailed++;
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    Error: ${err.message}\n`);
    }
  };

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✓ Connected to MongoDB test database.\n");

    const timestamp = Date.now();

    // ------------------------------------------------------------------------
    // SECTION 1: UNIT SCORING BOUNDARIES & FORMULA INTEGRITY
    // ------------------------------------------------------------------------
    console.log("--- 1. SCORING BOUNDARIES & TIER THRESHOLDS ---");

    await test("Tier threshold mapping (0-39 Standard, 40-59 Gold, 60-79 Platinum, 80-100 Diamond)", async () => {
      assert.strictEqual(tierService.calculateTierFromPoints(0, false).tier, "standard");
      assert.strictEqual(tierService.calculateTierFromPoints(39, false).tier, "standard");
      assert.strictEqual(tierService.calculateTierFromPoints(40, false).tier, "gold");
      assert.strictEqual(tierService.calculateTierFromPoints(59, false).tier, "gold");
      assert.strictEqual(tierService.calculateTierFromPoints(60, false).tier, "platinum");
      assert.strictEqual(tierService.calculateTierFromPoints(79, false).tier, "platinum");
      assert.strictEqual(tierService.calculateTierFromPoints(80, false).tier, "diamond");
      assert.strictEqual(tierService.calculateTierFromPoints(100, false).tier, "diamond");
    });

    // ------------------------------------------------------------------------
    // SECTION 2: EDUCATION QUALIFICATION SCORING (30 PTS MAX)
    // ------------------------------------------------------------------------
    console.log("\n--- 2. EDUCATION LEVEL EVALUATION (30 POINTS MAX) ---");

    await test("Diploma awards exactly 5 points when verified", async () => {
      const res = tierService.evaluateEducationPoints(
        [{ degree: "Diploma in Mechanical Engineering", isVerified: true }],
        [],
        false
      );
      assert.strictEqual(res.points, 5);
      assert.strictEqual(res.matchedLevel, "diploma");
    });

    await test("Bachelor's degree awards exactly 15 points when verified", async () => {
      const res = tierService.evaluateEducationPoints(
        [{ degree: "Bachelor of Science in Physics (B.Sc)", isVerified: true }],
        [],
        false
      );
      assert.strictEqual(res.points, 15);
      assert.strictEqual(res.matchedLevel, "bachelor");
    });

    await test("Master's / PG degree awards exactly 23 points when verified", async () => {
      const res = tierService.evaluateEducationPoints(
        [{ degree: "Master of Science in Mathematics (M.Sc)", isVerified: true }],
        [],
        false
      );
      assert.strictEqual(res.points, 23);
      assert.strictEqual(res.matchedLevel, "master");
    });

    await test("PhD / Doctorate awards exactly 30 points when verified", async () => {
      const res = tierService.evaluateEducationPoints(
        [{ degree: "Doctor of Philosophy in Quantum Physics (Ph.D)", isVerified: true }],
        [],
        false
      );
      assert.strictEqual(res.points, 30);
      assert.strictEqual(res.matchedLevel, "doctorate");
    });

    await test("Multiple qualifications: Only highest relevant verified qualification is counted (not additive)", async () => {
      const res = tierService.evaluateEducationPoints(
        [
          { degree: "Diploma in Computer Applications", isVerified: true },
          { degree: "B.Tech in Computer Science", isVerified: true },
          { degree: "M.Tech in Artificial Intelligence", isVerified: true },
        ],
        [],
        false
      );
      // Master's (23) is the highest; should NOT be 5 + 15 + 23 = 43
      assert.strictEqual(res.points, 23);
      assert.strictEqual(res.matchedLevel, "master");
    });

    await test("Unverified or unrecognized qualification awards 0 points", async () => {
      const unverified = tierService.evaluateEducationPoints(
        [{ degree: "Ph.D in Biophysics", isVerified: false }],
        [],
        false
      );
      assert.strictEqual(unverified.points, 0);

      const unrecognized = tierService.evaluateEducationPoints(
        [{ degree: "Self-taught online certificate", isVerified: true }],
        [],
        false
      );
      assert.strictEqual(unrecognized.points, 0);
    });

    // ------------------------------------------------------------------------
    // SECTION 3: TEACHING EXPERIENCE SCORING (25 PTS MAX)
    // ------------------------------------------------------------------------
    console.log("\n--- 3. TEACHING EXPERIENCE EVALUATION (25 POINTS MAX) ---");

    await test("Teaching experience brackets: Below 1 yr (3), 1-2 yrs (7), 3-5 yrs (13), 6-10 yrs (19), >10 yrs (25)", async () => {
      assert.strictEqual(tierService.evaluateExperiencePoints(0.5, true).points, 3);
      assert.strictEqual(tierService.evaluateExperiencePoints(1, true).points, 7);
      assert.strictEqual(tierService.evaluateExperiencePoints(2.5, true).points, 7);
      assert.strictEqual(tierService.evaluateExperiencePoints(3, true).points, 13);
      assert.strictEqual(tierService.evaluateExperiencePoints(5, true).points, 13);
      assert.strictEqual(tierService.evaluateExperiencePoints(6, true).points, 19);
      assert.strictEqual(tierService.evaluateExperiencePoints(10, true).points, 19);
      assert.strictEqual(tierService.evaluateExperiencePoints(11, true).points, 25);
      assert.strictEqual(tierService.evaluateExperiencePoints(20, true).points, 25);
    });

    await test("Unverified, negative, or invalid experience awards 0 points", async () => {
      assert.strictEqual(tierService.evaluateExperiencePoints(15, false).points, 0);
      assert.strictEqual(tierService.evaluateExperiencePoints(-5, true).points, 0);
      assert.strictEqual(tierService.evaluateExperiencePoints(NaN, true).points, 0);
    });

    // ------------------------------------------------------------------------
    // SECTION 4: STUDENT RATING SCORING & PROVISIONAL STATUS (25 PTS MAX)
    // ------------------------------------------------------------------------
    console.log("\n--- 4. STUDENT RATING EVALUATION & PROVISIONAL STATUS ---");

    await test("Insufficient ratings (< 3 verified student ratings) handled as provisional/unrated (0 pts, no penalty)", async () => {
      const res0 = tierService.evaluateRatingPoints(5.0, 0);
      assert.strictEqual(res0.points, 0);
      assert.strictEqual(res0.isProvisional, true);

      const res2 = tierService.evaluateRatingPoints(4.9, 2);
      assert.strictEqual(res2.points, 0);
      assert.strictEqual(res2.isProvisional, true);
    });

    await test("Verified student ratings brackets with >= 3 ratings: <3.0 (0), 3.0-3.4 (8), 3.5-3.9 (13), 4.0-4.4 (18), 4.5-4.7 (22), 4.8-5.0 (25)", async () => {
      assert.strictEqual(tierService.evaluateRatingPoints(2.8, 5).points, 0);
      assert.strictEqual(tierService.evaluateRatingPoints(3.2, 5).points, 8);
      assert.strictEqual(tierService.evaluateRatingPoints(3.7, 5).points, 13);
      assert.strictEqual(tierService.evaluateRatingPoints(4.2, 5).points, 18);
      assert.strictEqual(tierService.evaluateRatingPoints(4.6, 5).points, 22);
      assert.strictEqual(tierService.evaluateRatingPoints(4.9, 5).points, 25);
      assert.strictEqual(tierService.evaluateRatingPoints(4.9, 5).isProvisional, false);
    });

    // ------------------------------------------------------------------------
    // SECTION 5: STUDENT REVIEWS SCORING (20 PTS MAX)
    // ------------------------------------------------------------------------
    console.log("\n--- 5. STUDENT REVIEWS EVALUATION (20 POINTS MAX) ---");

    await test("Verified student reviews brackets: 0-2 (0), 3-5 (5), 6-10 (10), 11-20 (15), >20 (20)", async () => {
      assert.strictEqual(tierService.evaluateReviewPoints(0).points, 0);
      assert.strictEqual(tierService.evaluateReviewPoints(2).points, 0);
      assert.strictEqual(tierService.evaluateReviewPoints(3).points, 5);
      assert.strictEqual(tierService.evaluateReviewPoints(5).points, 5);
      assert.strictEqual(tierService.evaluateReviewPoints(6).points, 10);
      assert.strictEqual(tierService.evaluateReviewPoints(10).points, 10);
      assert.strictEqual(tierService.evaluateReviewPoints(11).points, 15);
      assert.strictEqual(tierService.evaluateReviewPoints(20).points, 15);
      assert.strictEqual(tierService.evaluateReviewPoints(21).points, 20);
      assert.strictEqual(tierService.evaluateReviewPoints(50).points, 20);
    });

    // ------------------------------------------------------------------------
    // SECTION 6: INTEGRATION & PROVISIONAL TIER BEHAVIOR
    // ------------------------------------------------------------------------
    console.log("\n--- 6. INTEGRATION, PROVISIONAL TIERS & REVIEWS RECALCULATION ---");

    const tutorUser = await User.create({
      email: `tutor_tier_${timestamp}@edupye.test`,
      name: "Dr. Alok Verma",
      userType: "teacher",
      roles: ["teacher"],
      activeRole: "teacher",
    });

    const tutorProfile = await providerService.submitTuitionProviderOnboarding(
      tutorUser._id.toString(),
      {
        fullName: "Dr. Alok Verma",
        education: [{ degree: "Doctor of Philosophy in Chemistry (Ph.D)", institution: "IISc Bangalore" }],
        experienceYears: 8, // 19 pts once verified
        subjects: ["Chemistry"],
        classesTaught: ["Class 12", "JEE Prep"],
        teachingMode: ["online"],
      }
    );

    await test("New provider onboarding: Provider cannot self-assign tier or points; initialized to Standard (provisional)", async () => {
      const refreshed = await TuitionProviderProfile.findById(tutorProfile._id);
      assert.strictEqual(refreshed?.platformTier, "standard");
      assert.strictEqual(refreshed?.isProvisionalTier, true);
      assert.strictEqual(refreshed?.tierScore.totalPoints, 0); // Not verified yet
    });

    await test("Admin verification triggers automatic scoring: PhD (30) + 8 yrs (19) = 49 pts -> Gold (Provisional)", async () => {
      const verified = await providerService.adminUpdateVerificationStatus(
        tutorProfile._id.toString(),
        "verified",
        "Academic credentials and thesis verified with IISc",
        undefined, // no override passed: evaluate automatically!
        { id: tutorUser._id.toString(), name: "Head of Academic Verification" }
      );

      assert.strictEqual(verified.verificationStatus, "verified");
      assert.strictEqual(verified.platformTier, "gold"); // 49 points falls in 40-59 (Gold)
      assert.strictEqual(verified.isProvisionalTier, true); // < 3 ratings -> provisional
      assert.strictEqual(verified.tierScore.educationPoints, 30);
      assert.strictEqual(verified.tierScore.experiencePoints, 19);
      assert.strictEqual(verified.tierScore.ratingPoints, 0);
      assert.strictEqual(verified.tierScore.reviewPoints, 0);
      assert.strictEqual(verified.tierScore.totalPoints, 49);
      assert.strictEqual(verified.tierScore.isProvisional, true);
    });

    // Create 3 genuine student enrolments & reviews to test recalculation & provisional lift
    const studentUsers: any[] = [];
    for (let i = 1; i <= 3; i++) {
      const s = await User.create({
        email: `student_review_${i}_${timestamp}@edupye.test`,
        name: `Student Reviewer ${i}`,
        userType: "student",
        roles: ["student"],
        activeRole: "student",
      });
      studentUsers.push(s);
    }

    const offering = await TuitionOffering.create({
      providerId: tutorUser._id,
      providerProfileId: tutorProfile._id,
      title: "Class 12 Advanced Organic Chemistry",
      description: "In-depth reaction mechanisms, stereochemistry, and synthesis mastery.",
      subject: "Chemistry",
      classLevel: "Class 12",
      teachingMode: "online",
      classFormat: "1:1",
      scheduleModel: "flexible_slot",
      billingUnit: "hourly",
      feeAmount: 1200,
      currency: "INR",
      isActive: true,
    });

    const enrollments: any[] = [];
    for (let i = 0; i < 3; i++) {
      const req: any = await TuitionRequest.create({
        studentId: studentUsers[i]._id,
        providerId: tutorUser._id,
        offeringId: offering._id,
        subject: "Chemistry",
        teachingMode: "online",
        classFormat: "1:1",
        scheduleModel: "flexible_slot",
        feeAmount: 1200,
        currency: "INR",
        status: "paid",
        requestedSlot: { day: "Tuesday", startTime: "14:00", endTime: "15:00" },
      });
      const enr = await TuitionEnrollment.create({
        studentId: studentUsers[i]._id,
        providerId: tutorUser._id,
        offeringId: offering._id,
        requestId: req._id,
        subject: "Chemistry",
        classLevel: "Class 12",
        classFormat: "1:1",
        teachingMode: "online",
        scheduleModel: "flexible_slot",
        scheduleDetails: { slotDay: "Tuesday", startTime: "14:00", endTime: "15:00" },
        status: "completed",
        feePaid: 1200,
        currency: "INR",
        paymentTransactionId: `TX_REV_${i}_${timestamp}`,
        enrolledAt: new Date(),
        sessionsAttended: 4,
        totalSessionsConducted: 4,
      });
      enrollments.push(enr);
    }

    await test("Duplicate reviews for the same enrollment are prevented", async () => {
      // First review succeeds
      await reviewService.createTuitionReview(studentUsers[0]._id.toString(), {
        providerId: tutorUser._id.toString(),
        enrollmentId: enrollments[0]._id.toString(),
        rating: 5,
        reviewText: "Excellent organic chemistry educator, explained mechanisms thoroughly!",
      });

      // Second review by same student for same enrollment must fail
      let duplicateError = false;
      try {
        await reviewService.createTuitionReview(studentUsers[0]._id.toString(), {
          providerId: tutorUser._id.toString(),
          enrollmentId: enrollments[0]._id.toString(),
          rating: 4,
          reviewText: "Trying to submit a duplicate review",
        });
      } catch (err: any) {
        duplicateError = true;
        assert(err.message.includes("already submitted"));
      }
      assert.strictEqual(duplicateError, true);
    });

    await test("Accumulating 3 verified reviews triggers automatic recalculation & lifts provisional status", async () => {
      // Submit second review (rating 5)
      await reviewService.createTuitionReview(studentUsers[1]._id.toString(), {
        providerId: tutorUser._id.toString(),
        enrollmentId: enrollments[1]._id.toString(),
        rating: 5,
        reviewText: "Spectacular reaction kinetics breakdown. Very patient and helpful.",
      });

      // Still at 2 reviews -> still provisional
      let profileMid = await TuitionProviderProfile.findById(tutorProfile._id);
      assert.strictEqual(profileMid?.isProvisionalTier, true);
      assert.strictEqual(profileMid?.tierScore.ratingPoints, 0);

      // Submit third review (rating 5) -> now reaches 3 verified reviews!
      await reviewService.createTuitionReview(studentUsers[2]._id.toString(), {
        providerId: tutorUser._id.toString(),
        enrollmentId: enrollments[2]._id.toString(),
        rating: 5,
        reviewText: "Top tier chemistry guidance. My mock scores improved drastically.",
      });

      // Refetch profile: 3 reviews at 5.0 avg -> rating points = 25, review points = 5
      // Total points: Education (30) + Experience (19) + Rating (25) + Reviews (5) = 79 points!
      // 79 points falls in 60-79 (Platinum)!
      const profileUpdated = await TuitionProviderProfile.findById(tutorProfile._id);
      assert.strictEqual(profileUpdated?.isProvisionalTier, false);
      assert.strictEqual(profileUpdated?.tierScore.isProvisional, false);
      assert.strictEqual(profileUpdated?.tierScore.educationPoints, 30);
      assert.strictEqual(profileUpdated?.tierScore.experiencePoints, 19);
      assert.strictEqual(profileUpdated?.tierScore.ratingPoints, 25);
      assert.strictEqual(profileUpdated?.tierScore.reviewPoints, 5);
      assert.strictEqual(profileUpdated?.tierScore.totalPoints, 79);
      assert.strictEqual(profileUpdated?.calculatedTier, "platinum");
      assert.strictEqual(profileUpdated?.platformTier, "platinum"); // Transitioned from Gold to Platinum!
    });

    await test("Provider with three low ratings (< 3.0) remains provisional and is capped at standard tier", async () => {
      // Create a provider with high credentials (PhD = 30 pts, 8 yrs = 19 pts -> 49 pts)
      const lowRatedTutor = await User.create({
        email: `tutor_low_${timestamp}@edupye.test`,
        name: "Dr. Low Rating",
        userType: "teacher",
        roles: ["teacher"],
        activeRole: "teacher",
      });

      const lowProfile = await providerService.submitTuitionProviderOnboarding(
        lowRatedTutor._id.toString(),
        {
          fullName: "Dr. Low Rating",
          education: [{ degree: "Doctor of Philosophy", institution: "Test University" }],
          experienceYears: 8,
          subjects: ["Mathematics"],
          classesTaught: ["Class 10"],
          teachingMode: ["online"],
        }
      );

      await providerService.adminUpdateVerificationStatus(
        lowProfile._id.toString(),
        "verified",
        "Credentials verified",
        undefined,
        "Admin Reviewer"
      );

      // Create 3 completed enrolments
      const lowOffering = await TuitionOffering.create({
        providerId: lowRatedTutor._id,
        providerProfileId: lowProfile._id,
        title: "Calculus",
        description: "Math course",
        subject: "Mathematics",
        classLevel: "Class 10",
        teachingMode: "online",
        classFormat: "1:1",
        scheduleModel: "flexible_slot",
        billingUnit: "hourly",
        feeAmount: 500,
        currency: "INR",
        isActive: true,
      });

      for (let j = 1; j <= 3; j++) {
        const student = await User.create({
          email: `student_low_${j}_${timestamp}@edupye.test`,
          name: `Dissatisfied Student ${j}`,
          userType: "student",
          roles: ["student"],
          activeRole: "student",
        });

        const enr = await TuitionEnrollment.create({
          studentId: student._id,
          providerId: lowRatedTutor._id,
          offeringId: lowOffering._id,
          requestId: new mongoose.Types.ObjectId(),
          subject: "Mathematics",
          classLevel: "Class 10",
          classFormat: "1:1",
          teachingMode: "online",
          scheduleModel: "flexible_slot",
          status: "completed",
          feePaid: 500,
          currency: "INR",
          paymentTransactionId: `TX_LOW_${j}_${timestamp}`,
          enrolledAt: new Date(),
        });

        // Submit low rating (2.0 stars)
        await reviewService.createTuitionReview(student._id.toString(), {
          providerId: lowRatedTutor._id.toString(),
          enrollmentId: enr._id.toString(),
          rating: 2,
          reviewText: "Unprepared sessions, arrived late and did not finish the syllabus.",
        });
      }

      const refreshedLowProfile = await TuitionProviderProfile.findById(lowProfile._id);
      // Even with 3 reviews, average is 2.0 < 3.0:
      assert.strictEqual(refreshedLowProfile?.isProvisionalTier, true, "Low rating must NOT remove provisional status");
      assert(refreshedLowProfile?.provisionalReason?.includes("below minimum quality"));
      assert.strictEqual(refreshedLowProfile?.tierScore.ratingPoints, 0, "Rating < 3.0 awards 0 rating points");
      assert.strictEqual(
        refreshedLowProfile?.calculatedTier,
        "standard",
        "Provider with low ratings must NOT receive artificially high tier (capped at standard)"
      );
      assert.strictEqual(refreshedLowProfile?.platformTier, "standard");
    });

    await test("Review submission on active (incomplete) enrolment is strictly rejected", async () => {
      const activeEnrStudent = await User.create({
        email: `student_active_${timestamp}@edupye.test`,
        name: "Active Student",
        userType: "student",
        roles: ["student"],
        activeRole: "student",
      });

      const activeEnr = await TuitionEnrollment.create({
        studentId: activeEnrStudent._id,
        providerId: tutorUser._id,
        offeringId: offering._id,
        requestId: new mongoose.Types.ObjectId(),
        subject: "Chemistry",
        classLevel: "Class 12",
        classFormat: "1:1",
        teachingMode: "online",
        scheduleModel: "flexible_slot",
        status: "active", // NOT completed!
        feePaid: 1200,
        currency: "INR",
        paymentTransactionId: `TX_ACTIVE_${timestamp}`,
        enrolledAt: new Date(),
      });

      let reviewError = false;
      try {
        await reviewService.createTuitionReview(activeEnrStudent._id.toString(), {
          providerId: tutorUser._id.toString(),
          enrollmentId: activeEnr._id.toString(),
          rating: 5,
          reviewText: "Trying to review before class completed",
        });
      } catch (err: any) {
        reviewError = true;
        assert(err.message.includes("completed"));
      }
      assert.strictEqual(reviewError, true, "Must prevent review before tuition service completion");
    });

    // ------------------------------------------------------------------------
    // SECTION 7: ADMIN OVERRIDE & AUDIT TRAIL
    // ------------------------------------------------------------------------
    console.log("\n--- 7. ADMIN TIER OVERRIDE & AUDIT LOGGING ---");

    await test("Admin tier override preserves system-calculated score and tier separately without mutating underlying points", async () => {
      const adminUser = await User.create({
        email: `platform_admin_${timestamp}@edupye.test`,
        name: "Director of Quality Assurance",
        userType: "institution",
        roles: ["institution"],
        activeRole: "institution",
      });

      const profileBefore = await TuitionProviderProfile.findById(tutorProfile._id);
      const calculatedPointsBefore = profileBefore?.tierScore.totalPoints;
      const calculatedTierBefore = profileBefore?.calculatedTier;

      const overridden = await providerService.adminAssignTier(
        tutorProfile._id.toString(),
        "diamond",
        {
          id: adminUser._id.toString(),
          name: adminUser.name,
          reason: "National Science Olympiad mentor recognition override",
        }
      );

      // Overridden platformTier is Diamond
      assert.strictEqual(overridden.platformTier, "diamond");
      assert.strictEqual(overridden.isOverridden, true);
      assert.strictEqual(overridden.overrideDetails?.previousTier, "platinum");
      assert.strictEqual(overridden.overrideDetails?.overriddenTier, "diamond");
      assert.strictEqual(overridden.overrideDetails?.adminUserId?.toString(), adminUser._id.toString());
      assert.strictEqual(overridden.overrideDetails?.reason, "National Science Olympiad mentor recognition override");

      // System-calculated score and tier remain completely intact and separate
      assert.strictEqual(overridden.calculatedTier, calculatedTierBefore);
      assert.strictEqual(overridden.tierScore.totalPoints, calculatedPointsBefore);
      assert.strictEqual(overridden.tierScore.educationPoints, 30);
      assert.strictEqual(overridden.tierScore.experiencePoints, 19);
      assert.strictEqual(overridden.tierScore.ratingPoints, 25);
      assert.strictEqual(overridden.tierScore.reviewPoints, 5);

      const latestAudit = overridden.tierAuditTrail[overridden.tierAuditTrail.length - 1];
      assert.strictEqual(latestAudit.tier, "diamond");
      assert.strictEqual(latestAudit.previousTier, "platinum");
      assert.strictEqual(latestAudit.isOverride, true);
      assert.strictEqual(latestAudit.assignedBy, adminUser.name);
      assert.strictEqual(latestAudit.adminUserId?.toString(), adminUser._id.toString());
    });

    await test("Experience points recalculate when provider profile is reviewed or triggered by admin", async () => {
      // Tutor gains 4 more years experience (crosses 10 yrs milestone -> awards 25 pts)
      await TuitionProviderProfile.updateOne(
        { _id: tutorProfile._id },
        { experienceYears: 12 }
      );

      const adminUser = await User.findOne({ email: `platform_admin_${timestamp}@edupye.test` });

      const recalculated = await providerService.adminRecalculateProviderTier(
        tutorProfile._id.toString(),
        {
          id: adminUser?._id.toString(),
          name: adminUser?.name,
          reason: "Milestone experience tenure review",
        }
      );

      // Experience score recalculated to 25 points
      assert.strictEqual(recalculated.tierScore.experiencePoints, 25);
      assert.strictEqual(recalculated.tierScore.verifiedExperienceYears, 12);
      // New total points: 30 + 25 + 25 + 5 = 85 points -> calculated tier is Diamond!
      assert.strictEqual(recalculated.tierScore.totalPoints, 85);
      assert.strictEqual(recalculated.calculatedTier, "diamond");
    });

    await test("Unauthorized non-admin user is rejected from admin tier modification", async () => {
      const regularStudent = await User.create({
        email: `student_unauth_${timestamp}@edupye.test`,
        name: "Regular Student",
        userType: "student",
        roles: ["student"],
        activeRole: "student",
      });

      let forbiddenStatus = 0;
      let forbiddenMessage = "";

      const mockReq: any = {
        user: regularStudent,
        headers: {},
      };

      const mockRes: any = {
        status: (code: number) => {
          forbiddenStatus = code;
          return {
            json: (payload: any) => {
              forbiddenMessage = payload.message;
            },
          };
        },
      };

      let nextCalled = false;
      await requireTuitionPlatformAdmin(mockReq, mockRes, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false, "Non-admin must not proceed to next handler");
      assert.strictEqual(forbiddenStatus, 403);
      assert(forbiddenMessage.includes("Platform administrator authorization is required"));
    });

    await test("Authorized platform admin passes guard and can recalculate provider tier", async () => {
      const platformAdmin = await User.create({
        email: `admin_recalc_${timestamp}@edupye.admin`,
        name: "System Admin Recalculator",
        userType: "institution",
        roles: ["institution"],
        activeRole: "institution",
      });

      const mockReq: any = {
        user: platformAdmin,
        headers: {},
      };

      let nextCalled = false;
      const mockRes: any = {
        status: () => ({ json: () => {} }),
      };

      await requireTuitionPlatformAdmin(mockReq, mockRes, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true, "Platform admin must pass guard");

      const recalculated = await providerService.adminRecalculateProviderTier(
        tutorProfile._id.toString(),
        {
          id: platformAdmin._id.toString(),
          name: platformAdmin.name,
          reason: "Quality audit re-score",
        }
      );
      assert(recalculated.tierScore.totalPoints > 0);
      assert.strictEqual(recalculated.platformTier, "diamond"); // recalculated from verified records (85 points)
    });

    // ------------------------------------------------------------------------
    // SUMMARY
    // ------------------------------------------------------------------------
    console.log("\n==========================================================================");
    console.log(`  POINTS-BASED TIER EVALUATION AUDIT: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log("==========================================================================\n");

    if (testsFailed > 0) {
      process.exit(1);
    }
  } finally {
    await mongoose.disconnect();
    console.log("✓ MongoDB test connection closed.");
  }
}

runTuitionTierEvaluationTests().catch((err) => {
  console.error("Fatal test runner failure:", err);
  process.exit(1);
});
