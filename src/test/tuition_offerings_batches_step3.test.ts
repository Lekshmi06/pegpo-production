import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import assert from "assert";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import User from "../models/User";
import TuitionProviderProfile from "../models/TuitionProviderProfile";
import TuitionOffering from "../models/TuitionOffering";
import TuitionBatch from "../models/TuitionBatch";
import TuitionEnrollment from "../models/TuitionEnrollment";

import * as providerService from "../services/tuition_provider_service";
import * as scheduleService from "../services/tuition_schedule_service";
import * as marketplaceService from "../services/tuition_marketplace_service";
import * as studentService from "../services/tuition_student_service";

async function runStep3OfferingsBatchesSuite() {
  console.log("==========================================================================");
  console.log("  EDUPYE PHASE 3: TUITION OFFERINGS & BATCHES MANAGEMENT TEST SUITE       ");
  console.log("==========================================================================\n");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(mongoUri);
  console.log("✓ Connected to MongoDB.\n");

  const timestamp = Date.now();
  let testsPassed = 0;
  let testsFailed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      testsPassed++;
    } catch (err: any) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    -> ${err.message}`);
      testsFailed++;
    }
  }

  try {
    // ------------------------------------------------------------------------
    // SETUP: Create Verified Provider A, Verified Provider B, and Unverified Provider C
    // ------------------------------------------------------------------------
    console.log("--- 1. PROVIDER SETUP & AUTHORIZATION GUARDS ---");

    // Clean up stale test offerings from prior test runs to ensure deterministic pagination
    const staleTestUsers = await User.find({ email: /@edupye\.test$/ }, "_id");
    const staleUserIds = staleTestUsers.map((u) => u._id);
    if (staleUserIds.length > 0) {
      await TuitionOffering.deleteMany({ providerId: { $in: staleUserIds } });
      await TuitionBatch.deleteMany({ providerId: { $in: staleUserIds } });
    }

    const userA = await User.create({
      email: `tutor_a_${timestamp}@edupye.test`,
      name: "Dr. Vikram Sethi",
      userType: "tuition_provider",
      roles: ["tuition_provider"],
      activeRole: "tuition_provider",
    });

    const profileA = await TuitionProviderProfile.create({
      userId: userA._id,
      fullName: "Dr. Vikram Sethi",
      headline: "Senior Physics Faculty & JEE Mentor",
      bio: "12+ years teaching Rotational Mechanics, Electrodynamics and Modern Physics.",
      education: [
        {
          degree: "PhD in Theoretical Physics",
          institution: "Indian Institute of Science (IISc)",
          yearOfPassing: 2012,
          isVerified: true,
        },
      ],
      qualifications: ["PhD in Theoretical Physics", "BSc Physics Hons"],
      experienceYears: 12,
      isQualificationsVerified: true,
      isExperienceVerified: true,
      subjects: ["Physics"],
      classesTaught: ["Class 12", "JEE Prep"],
      teachingMode: ["online", "hybrid"],
      verificationStatus: "verified",
      platformTier: "diamond",
      calculatedTier: "diamond",
      isProvisionalTier: false,
      rating: { average: 4.9, count: 15 },
      pricing: { minHourlyRate: 1500, maxHourlyRate: 3500, currency: "INR" },
      isActive: true,
    });

    const userB = await User.create({
      email: `tutor_b_${timestamp}@edupye.test`,
      name: "Sunita Rao",
      userType: "tuition_provider",
      roles: ["tuition_provider"],
      activeRole: "tuition_provider",
    });

    const profileB = await TuitionProviderProfile.create({
      userId: userB._id,
      fullName: "Sunita Rao",
      headline: "Mathematics Educator & Olympiad Coach",
      education: [
        {
          degree: "MSc Mathematics",
          institution: "Delhi University",
          yearOfPassing: 2018,
          isVerified: true,
        },
      ],
      qualifications: ["MSc Mathematics"],
      experienceYears: 6,
      isQualificationsVerified: true,
      isExperienceVerified: true,
      subjects: ["Mathematics"],
      classesTaught: ["Class 10", "Class 11"],
      teachingMode: ["online"],
      verificationStatus: "verified",
      platformTier: "gold",
      calculatedTier: "gold",
      isProvisionalTier: false,
      rating: { average: 4.6, count: 8 },
      pricing: { minHourlyRate: 1000, maxHourlyRate: 2000, currency: "INR" },
      isActive: true,
    });

    const userUnverified = await User.create({
      email: `tutor_pending_${timestamp}@edupye.test`,
      name: "Rahul Verma",
      userType: "student",
      roles: ["student"],
      activeRole: "student",
    });

    const profileUnverified = await TuitionProviderProfile.create({
      userId: userUnverified._id,
      fullName: "Rahul Verma",
      subjects: ["Chemistry"],
      classesTaught: ["Class 11"],
      verificationStatus: "pending",
      platformTier: "standard",
      isProvisionalTier: true,
      isActive: true,
    });

    await test("Unverified provider cannot create tuition offerings", async () => {
      try {
        await scheduleService.createOffering(userUnverified._id.toString(), {
          title: "Inorganic Chemistry Foundation",
          subject: "Chemistry",
          classLevel: "Class 11",
          feeAmount: 2000,
        });
        assert(false, "Unverified provider should not be allowed to create offerings");
      } catch (err: any) {
        assert(err.message.includes("Only verified tuition providers can create offerings"));
      }
    });

    // ------------------------------------------------------------------------
    // 2. OFFERING CREATION & VALIDATION
    // ------------------------------------------------------------------------
    console.log("\n--- 2. OFFERING CREATION & INPUT VALIDATION ---");

    let offeringA1: any;
    let offeringA2Group: any;

    await test("Verified provider creates 1:1 offering with automatic capacity locking to 1", async () => {
      offeringA1 = await scheduleService.createOffering(userA._id.toString(), {
        title: "1:1 Advanced Physics Problem Solving",
        subject: "Physics",
        classLevel: "Class 12",
        description: "Intensive 1:1 personalized coaching for JEE Advanced rotational mechanics.",
        teachingMode: "online",
        classFormat: "1:1",
        scheduleModel: "flexible_slot",
        maxCapacity: 99, // Should be clamped to 1
        feeAmount: 2500,
        billingUnit: "hourly",
        currency: "INR",
        availableDays: ["Monday", "Wednesday", "Friday"],
        duration: "12 Weeks",
      });

      assert.strictEqual(offeringA1.maxCapacity, 1, "1:1 offering capacity must be locked to 1");
      assert.strictEqual(offeringA1.classFormat, "1:1");
      assert.strictEqual(offeringA1.status, "published");
      assert.strictEqual(offeringA1.isActive, true);
    });

    await test("Verified provider creates 1:2 small group offering with capacity locked to 2", async () => {
      const offering12 = await scheduleService.createOffering(userA._id.toString(), {
        title: "1:2 Duo Physics Masterclass",
        subject: "Physics",
        classLevel: "Class 12",
        description: "Semi-private 2-student cohort for JEE physics.",
        teachingMode: "hybrid",
        classFormat: "1:2",
        scheduleModel: "fixed_batch",
        maxCapacity: 10,
        feeAmount: 4000,
        billingUnit: "monthly",
      });

      assert.strictEqual(offering12.maxCapacity, 2, "1:2 offering capacity must be locked to 2");
    });

    await test("Verified provider creates group (1:N) cohort offering with custom capacity and duration", async () => {
      offeringA2Group = await scheduleService.createOffering(userA._id.toString(), {
        title: "Class 12 Comprehensive JEE Physics Masterclass",
        subject: "Physics",
        classLevel: "Class 12",
        description: "Complete curriculum coverage from Mechanics to Optics with weekly SmartBoard problem sessions.",
        teachingMode: "online",
        classFormat: "group",
        scheduleModel: "fixed_batch",
        maxCapacity: 15,
        feeAmount: 5000,
        billingUnit: "monthly",
        currency: "INR",
        availableDays: ["Tuesday", "Thursday", "Saturday"],
        duration: "6 Months",
        totalSessionsPlanned: 48,
        status: "published",
      });

      assert.strictEqual(offeringA2Group.maxCapacity, 15);
      assert.strictEqual(offeringA2Group.duration, "6 Months");
      assert.strictEqual(offeringA2Group.totalSessionsPlanned, 48);
    });

    await test("Offering creation rejects empty title, subject, or classLevel", async () => {
      try {
        await scheduleService.createOffering(userA._id.toString(), {
          title: "   ",
          subject: "Physics",
          classLevel: "Class 12",
          feeAmount: 1000,
        });
        assert(false, "Should reject empty title");
      } catch (err: any) {
        assert(err.message.includes("Title, subject, and class level are required"));
      }
    });

    await test("Offering creation rejects negative fee amount", async () => {
      try {
        await scheduleService.createOffering(userA._id.toString(), {
          title: "Valid Title",
          subject: "Physics",
          classLevel: "Class 12",
          feeAmount: -500,
        });
        assert(false, "Should reject negative fee");
      } catch (err: any) {
        assert(err.message.includes("Valid fee amount is required"));
      }
    });

    // ------------------------------------------------------------------------
    // 3. OFFERING EDITING & OWNERSHIP ISOLATION
    // ------------------------------------------------------------------------
    console.log("\n--- 3. OFFERING EDITING & OWNERSHIP ISOLATION ---");

    await test("Provider A successfully edits their own offering details and syllabus", async () => {
      const updated = await scheduleService.updateOffering(userA._id.toString(), offeringA2Group._id.toString(), {
        title: "Class 12 Elite JEE Physics Masterclass (Updated)",
        feeAmount: 5500,
        duration: "8 Months",
      });

      assert.strictEqual(updated.title, "Class 12 Elite JEE Physics Masterclass (Updated)");
      assert.strictEqual(updated.feeAmount, 5500);
      assert.strictEqual(updated.duration, "8 Months");
    });

    await test("Provider B cannot edit Provider A's offering (Strict 403 Data Isolation)", async () => {
      try {
        await scheduleService.updateOffering(userB._id.toString(), offeringA2Group._id.toString(), {
          title: "Hacked by Provider B",
          feeAmount: 100,
        });
        assert(false, "Cross-provider edit must fail");
      } catch (err: any) {
        assert(err.message.includes("Unauthorized: You can only edit your own offerings"));
      }

      // Verify DB record remained unchanged
      const offeringInDb = await TuitionOffering.findById(offeringA2Group._id);
      assert.strictEqual(offeringInDb?.feeAmount, 5500);
    });

    await test("Provider A archives an offering; status becomes 'archived' and isActive is false", async () => {
      const toArchive = await scheduleService.createOffering(userA._id.toString(), {
        title: "Temporary Short Workshop",
        subject: "Physics",
        classLevel: "Class 12",
        description: "Temporary physics problem solving workshop.",
        feeAmount: 500,
      });

      const res = await scheduleService.deleteOffering(userA._id.toString(), toArchive._id.toString());
      assert.strictEqual(res.success, true);

      const archivedInDb = await TuitionOffering.findById(toArchive._id);
      assert.strictEqual(archivedInDb?.status, "archived");
      assert.strictEqual(archivedInDb?.isActive, false);
    });

    await test("Provider B cannot delete or archive Provider A's offering", async () => {
      try {
        await scheduleService.deleteOffering(userB._id.toString(), offeringA2Group._id.toString());
        assert(false, "Cross-provider delete must fail");
      } catch (err: any) {
        assert(err.message.includes("Unauthorized: You can only delete or archive your own offerings"));
      }
    });

    // ------------------------------------------------------------------------
    // 4. BATCHES CREATION, SCHEDULING & DOUBLE-BOOKING PREVENTION
    // ------------------------------------------------------------------------
    console.log("\n--- 4. BATCHES CREATION & SCHEDULING INTEGRITY ---");

    let batchA1: any;

    await test("Provider A creates fixed recurring batch for group offering", async () => {
      batchA1 = await scheduleService.createBatch(userA._id.toString(), {
        offeringId: offeringA2Group._id.toString(),
        title: "Class 12 Evening JEE Cohort 1",
        daysOfWeek: ["Tuesday", "Thursday", "Saturday"],
        startTime: "18:00",
        endTime: "19:30",
        maxCapacity: 15,
        startDate: new Date(),
        status: "active",
        notes: "Target: Mechanics modules by month 2",
      });

      assert.strictEqual(batchA1.title, "Class 12 Evening JEE Cohort 1");
      assert.strictEqual(batchA1.enrolledCount, 0);
      assert.strictEqual(batchA1.maxCapacity, 15);
      assert.strictEqual(batchA1.subject, "Physics");
      assert.strictEqual(batchA1.teachingMode, "online");
    });

    await test("Cannot create batch for another provider's offering", async () => {
      try {
        await scheduleService.createBatch(userB._id.toString(), {
          offeringId: offeringA2Group._id.toString(),
          title: "Unauthorized Batch Attempt",
          daysOfWeek: ["Monday"],
          startTime: "10:00",
          endTime: "11:00",
        });
        assert(false, "Provider B cannot create batch for Provider A's offering");
      } catch (err: any) {
        assert(err.message.includes("Unauthorized or offering not found"));
      }
    });

    await test("Batch creation rejects invalid time interval where startTime >= endTime", async () => {
      try {
        await scheduleService.createBatch(userA._id.toString(), {
          offeringId: offeringA2Group._id.toString(),
          title: "Invalid Inverted Timing Batch",
          daysOfWeek: ["Monday"],
          startTime: "20:00",
          endTime: "19:00", // Inverted
        });
        assert(false, "Should reject inverted time");
      } catch (err: any) {
        assert(err.message.includes("Batch start time must be earlier than end time"));
      }
    });

    await test("1:1 Offering batch capacity cannot exceed 1", async () => {
      try {
        await scheduleService.createBatch(userA._id.toString(), {
          offeringId: offeringA1._id.toString(),
          title: "1:1 Slot Batch",
          daysOfWeek: ["Monday"],
          startTime: "16:00",
          endTime: "17:00",
          maxCapacity: 5, // Exceeds 1:1 limit
        });
        assert(false, "Should reject 1:1 capacity > 1");
      } catch (err: any) {
        assert(err.message.includes("1:1 offerings cannot have a batch capacity greater than 1"));
      }
    });

    await test("Double-booking prevention blocks overlapping batch on same day & interval", async () => {
      try {
        await scheduleService.createBatch(userA._id.toString(), {
          offeringId: offeringA2Group._id.toString(),
          title: "Colliding Tuesday Batch",
          daysOfWeek: ["Tuesday"], // Collides with batchA1 (Tuesday 18:00 - 19:30)
          startTime: "18:30",
          endTime: "20:00", // Overlaps 18:00 - 19:30
          maxCapacity: 10,
        });
        assert(false, "Overlapping batch should be blocked by conflict guard");
      } catch (err: any) {
        assert(err.message.includes("Double-booking conflict"));
      }
    });

    // ------------------------------------------------------------------------
    // 5. BATCH EDITING, CAPACITY INTEGRITY & DATA ISOLATION
    // ------------------------------------------------------------------------
    console.log("\n--- 5. BATCH EDITING & CAPACITY INTEGRITY ---");

    await test("Provider A edits batch details and timing", async () => {
      const updated = await scheduleService.updateBatch(userA._id.toString(), batchA1._id.toString(), {
        title: "Class 12 Evening JEE Cohort 1 (Revised)",
        notes: "Revised curriculum timeline",
      });

      assert.strictEqual(updated.title, "Class 12 Evening JEE Cohort 1 (Revised)");
      assert.strictEqual(updated.notes, "Revised curriculum timeline");
    });

    await test("Provider B cannot edit Provider A's batch", async () => {
      try {
        await scheduleService.updateBatch(userB._id.toString(), batchA1._id.toString(), {
          title: "Cross-provider hijack attempt",
        });
        assert(false, "Cross-provider batch update must fail");
      } catch (err: any) {
        assert(err.message.includes("Unauthorized: You can only edit your own batches"));
      }
    });

    await test("Capacity integrity guard prevents reducing maxCapacity below enrolledCount", async () => {
      // Simulate 5 enrolled students in batchA1
      await TuitionBatch.updateOne({ _id: batchA1._id }, { enrolledCount: 5 });

      try {
        await scheduleService.updateBatch(userA._id.toString(), batchA1._id.toString(), {
          maxCapacity: 3, // Less than current enrolled count of 5
        });
        assert(false, "Should reject lowering capacity below enrolled students");
      } catch (err: any) {
        assert(err.message.includes("Capacity integrity violation"));
      }

      // Setting capacity >= enrolled count succeeds
      const validCapUpdate = await scheduleService.updateBatch(userA._id.toString(), batchA1._id.toString(), {
        maxCapacity: 8,
      });
      assert.strictEqual(validCapUpdate.maxCapacity, 8);
    });

    await test("Provider safely cancels batch; status becomes 'cancelled'", async () => {
      const toCancel = await scheduleService.createBatch(userA._id.toString(), {
        offeringId: offeringA2Group._id.toString(),
        title: "Temporary Morning Batch",
        daysOfWeek: ["Sunday"],
        startTime: "09:00",
        endTime: "10:30",
        maxCapacity: 10,
      });

      const res = await scheduleService.deleteBatch(userA._id.toString(), toCancel._id.toString());
      assert.strictEqual(res.success, true);

      const inDb = await TuitionBatch.findById(toCancel._id);
      assert.strictEqual(inDb?.status, "cancelled");
    });

    // ------------------------------------------------------------------------
    // 6. STUDENT MARKETPLACE DISCOVERY & OFFERING FILTERING
    // ------------------------------------------------------------------------
    console.log("\n--- 6. STUDENT MARKETPLACE DISCOVERY & FILTERING ---");

    // Create an offering for Provider B (Mathematics)
    const offeringBMath = await scheduleService.createOffering(userB._id.toString(), {
      title: "Class 10 CBSE & Olympiad Mathematics",
      subject: "Mathematics",
      classLevel: "Class 10",
      description: "Complete trigonometry, quadratic equations, and coordinate geometry.",
      teachingMode: "online",
      classFormat: "group",
      maxCapacity: 20,
      feeAmount: 3000,
      billingUnit: "monthly",
      availableDays: ["Monday", "Wednesday"],
      duration: "4 Months",
      status: "published",
    });

    await test("Marketplace search finds all published offerings from verified providers", async () => {
      const search = await marketplaceService.searchTuitionOfferings({ limit: 50 });
      const titles = search.offerings.map((o) => o.title);
      assert(search.offerings.length >= 2, "Must find at least offerings A and B");
      assert(titles.some((t) => t.includes("JEE Physics")));
      assert(titles.some((t) => t.includes("Olympiad Mathematics")));
    });

    await test("Filter offerings by subject ('Physics' vs 'Mathematics')", async () => {
      const physicsResults = await marketplaceService.searchTuitionOfferings({ subject: "Physics" });
      assert(physicsResults.offerings.every((o) => o.subject === "Physics"));

      const mathResults = await marketplaceService.searchTuitionOfferings({ subject: "Mathematics" });
      assert(mathResults.offerings.every((o) => o.subject === "Mathematics"));
    });

    await test("Filter offerings by class level ('Class 12' vs 'Class 10')", async () => {
      const c12Results = await marketplaceService.searchTuitionOfferings({ classLevel: "Class 12" });
      assert(c12Results.offerings.every((o) => o.classLevel === "Class 12"));
    });

    await test("Filter offerings by class format ('1:1' vs 'group')", async () => {
      const oneToOneResults = await marketplaceService.searchTuitionOfferings({ classFormat: "1:1" });
      assert(oneToOneResults.offerings.every((o) => o.classFormat === "1:1"));

      const groupResults = await marketplaceService.searchTuitionOfferings({ classFormat: "group" });
      assert(groupResults.offerings.every((o) => o.classFormat === "group" || o.classFormat === "1:N"));
    });

    await test("Filter offerings by fee range (minFee and maxFee)", async () => {
      const cheapOfferings = await marketplaceService.searchTuitionOfferings({ maxFee: 3500 });
      assert(cheapOfferings.offerings.every((o) => o.feeAmount <= 3500));

      const premiumOfferings = await marketplaceService.searchTuitionOfferings({ minFee: 4000 });
      assert(premiumOfferings.offerings.every((o) => o.feeAmount >= 4000));
    });

    await test("Filter offerings by provider tier ('diamond' vs 'gold')", async () => {
      const diamondResults = await marketplaceService.searchTuitionOfferings({ tier: "diamond" });
      assert(diamondResults.offerings.every((o) => o.provider?.platformTier === "diamond"));

      const goldResults = await marketplaceService.searchTuitionOfferings({ tier: "gold" });
      assert(goldResults.offerings.every((o) => o.provider?.platformTier === "gold"));
    });

    await test("Filter offerings by minimum tutor experience (10+ years)", async () => {
      const expResults = await marketplaceService.searchTuitionOfferings({ minExperience: 10 });
      assert(expResults.offerings.every((o) => (o.provider?.experienceYears || 0) >= 10));
    });

    await test("Filter offerings by tutor qualification ('PhD')", async () => {
      const phdResults = await marketplaceService.searchTuitionOfferings({ qualification: "PhD" });
      assert(phdResults.offerings.length >= 1);
      assert(
        phdResults.offerings.every((o) =>
          o.provider?.qualifications?.some((q: string) => q.toLowerCase().includes("phd"))
        )
      );
    });

    await test("Filter offerings by availability day ('Tuesday')", async () => {
      const tuesdayResults = await marketplaceService.searchTuitionOfferings({ day: "Tuesday" });
      assert(tuesdayResults.offerings.length >= 1);
      assert(
        tuesdayResults.offerings.every(
          (o) =>
            o.availableDays?.includes("Tuesday") ||
            o.timeSlots?.some((ts) => ts.day.toLowerCase() === "tuesday")
        )
      );
    });

    await test("Archived or unverified provider offerings are strictly excluded from public discovery", async () => {
      // 1. Create a draft offering for Provider A
      const draftOff = await scheduleService.createOffering(userA._id.toString(), {
        title: "Secret Draft Syllabus",
        subject: "Physics",
        classLevel: "Class 12",
        description: "Draft syllabus for internal planning only.",
        feeAmount: 3000,
        status: "draft",
      });

      const search = await marketplaceService.searchTuitionOfferings({ search: "Secret Draft" });
      assert.strictEqual(search.offerings.length, 0, "Draft offerings must not appear in public marketplace");
    });

    await test("Public offering details API returns offering, provider details, reviews, and active batches", async () => {
      const details = await marketplaceService.getPublicOfferingDetails(offeringA2Group._id.toString());
      assert.strictEqual(details.offering._id.toString(), offeringA2Group._id.toString());
      assert.strictEqual(details.provider.fullName, "Dr. Vikram Sethi");
      assert.strictEqual(details.provider.platformTier, "diamond");
      assert(details.batches.length >= 1, "Must include linked active cohorts");
      assert(Array.isArray(details.reviews));
    });

    // ------------------------------------------------------------------------
    // 7. STEP 3 VERIFICATION: THREE CRITICAL INTEGRITY CHECKS
    // ------------------------------------------------------------------------
    console.log("\n--- 7. STEP 3 CRITICAL VERIFICATION: INTEGRITY & CONCURRENCY CHECKS ---");

    await test("Verification 1: Archiving offering cancels active batches while preserving existing enrolments and student records intact", async () => {
      // 1. Create a student user
      const studentUser = await User.create({
        email: `student_integrity_${timestamp}@edupye.test`,
        name: "Aakash Mehta",
        userType: "student",
        roles: ["student"],
        activeRole: "student",
      });

      // 2. Create an offering and batch to archive
      const offToArchive = await scheduleService.createOffering(userA._id.toString(), {
        title: "Experimental Wave Optics Masterclass",
        subject: "Physics",
        classLevel: "Class 12",
        description: "Special intensive module on wave theory, diffraction, and interference patterns.",
        teachingMode: "online",
        classFormat: "group",
        scheduleModel: "fixed_batch",
        maxCapacity: 10,
        feeAmount: 3500,
        billingUnit: "monthly",
      });

      const batchToArchive = await scheduleService.createBatch(userA._id.toString(), {
        offeringId: offToArchive._id,
        title: "Wave Optics Batch Alpha",
        daysOfWeek: ["Monday", "Wednesday"],
        startTime: "17:00",
        endTime: "18:30",
        maxCapacity: 10,
        timezone: "Asia/Kolkata",
      });

      // 3. Create an active enrollment for the student in this batch
      const dummyRequestId = new mongoose.Types.ObjectId();
      const enrollment = await TuitionEnrollment.create({
        studentId: studentUser._id,
        providerId: userA._id,
        offeringId: offToArchive._id,
        batchId: batchToArchive._id,
        requestId: dummyRequestId,
        subject: offToArchive.subject,
        classLevel: offToArchive.classLevel,
        classFormat: offToArchive.classFormat,
        teachingMode: offToArchive.teachingMode,
        scheduleModel: offToArchive.scheduleModel,
        scheduleDetails: {
          daysOfWeek: batchToArchive.daysOfWeek,
          startTime: batchToArchive.startTime,
          endTime: batchToArchive.endTime,
        },
        status: "active",
        feePaid: 3500,
        currency: "INR",
        paymentTransactionId: `TXN_ARCHIVE_TEST_${timestamp}`,
        enrolledAt: new Date(),
        sessionsAttended: 3,
        totalSessionsConducted: 4,
      });

      // 4. Provider archives the offering
      const archiveResult = await scheduleService.deleteOffering(userA._id.toString(), offToArchive._id.toString());
      assert.strictEqual(archiveResult.success, true);

      // 5. Verify offering is soft-archived (not hard-deleted)
      const refreshedOffering = await TuitionOffering.findById(offToArchive._id);
      assert(refreshedOffering, "Offering must still exist in database");
      assert.strictEqual(refreshedOffering.status, "archived");
      assert.strictEqual(refreshedOffering.isActive, false);

      // 6. Verify batch is cancelled (not hard-deleted)
      const refreshedBatch = await TuitionBatch.findById(batchToArchive._id);
      assert(refreshedBatch, "Batch must still exist in database");
      assert.strictEqual(refreshedBatch.status, "cancelled");

      // 7. Verify student enrollment record is 100% INTACT and unchanged
      const refreshedEnrollment = await TuitionEnrollment.findById(enrollment._id);
      assert(refreshedEnrollment, "Student enrollment record must remain intact in database");
      assert.strictEqual(refreshedEnrollment.status, "active", "Enrollment status must not be deleted or corrupted");
      assert.strictEqual(refreshedEnrollment.feePaid, 3500);
      assert.strictEqual(refreshedEnrollment.paymentTransactionId, `TXN_ARCHIVE_TEST_${timestamp}`);
      assert.strictEqual(refreshedEnrollment.studentId.toString(), studentUser._id.toString());
      assert.strictEqual(refreshedEnrollment.batchId?.toString(), batchToArchive._id.toString());
      assert.strictEqual(refreshedEnrollment.offeringId?.toString(), offToArchive._id.toString());
      assert.strictEqual(refreshedEnrollment.sessionsAttended, 3);

      // 8. Verify student overview service resolves the enrolled offering and batch data without errors
      const studentOverview = await studentService.getTuitionStudentOverview(studentUser._id.toString());
      assert.strictEqual(studentOverview.activeEnrollmentsCount, 1);
      assert.strictEqual(studentOverview.activeEnrollments[0]._id.toString(), enrollment._id.toString());
      assert.strictEqual((studentOverview.activeEnrollments[0].offeringId as any).title, "Experimental Wave Optics Masterclass");
    });

    await test("Verification 2: Recurring batch schedules enforce valid IANA timezones and 24-hr local times consistently", async () => {
      // 1. Create a batch with a valid non-default IANA timezone (America/New_York)
      const usBatch = await scheduleService.createBatch(userA._id.toString(), {
        offeringId: offeringA2Group._id,
        title: "US Eastern Timezone Physics Cohort",
        daysOfWeek: ["Saturday"],
        startTime: "10:00",
        endTime: "11:30",
        maxCapacity: 15,
        timezone: "America/New_York",
      });
      assert.strictEqual(usBatch.timezone, "America/New_York");
      assert.strictEqual(usBatch.startTime, "10:00");
      assert.strictEqual(usBatch.endTime, "11:30");

      // 2. Reject invalid IANA timezone string
      try {
        await scheduleService.createBatch(userA._id.toString(), {
          offeringId: offeringA2Group._id,
          title: "Invalid TZ Batch",
          daysOfWeek: ["Sunday"],
          startTime: "10:00",
          endTime: "11:30",
          timezone: "Invalid/Fictional_Zone",
        });
        assert(false, "Should reject invalid IANA timezone");
      } catch (err: any) {
        assert(err.message.includes("Invalid IANA time zone"), `Expected IANA validation error, got: ${err.message}`);
      }

      // 3. Reject invalid time format (e.g. 12-hour AM/PM or > 23 hours)
      try {
        await scheduleService.createBatch(userA._id.toString(), {
          offeringId: offeringA2Group._id,
          title: "Malformed Time Batch",
          daysOfWeek: ["Sunday"],
          startTime: "10:00 AM",
          endTime: "11:30 AM",
        });
        assert(false, "Should reject non 24-hr format");
      } catch (err: any) {
        assert(err.message.includes("24-hour HH:mm format"));
      }

      // 4. Reject invalid update to an invalid timezone
      try {
        await scheduleService.updateBatch(userA._id.toString(), usBatch._id.toString(), {
          timezone: "Not/RealZone",
        });
        assert(false, "Should reject invalid timezone during update");
      } catch (err: any) {
        assert(err.message.includes("Invalid IANA time zone"));
      }
    });

    await test("Verification 3: Providers cannot directly modify enrolledCount; batch capacity and counts are backend-protected", async () => {
      // 1. Attempting to pass non-zero enrolledCount in createBatch is strictly blocked
      try {
        await scheduleService.createBatch(userA._id.toString(), {
          offeringId: offeringA2Group._id,
          title: "Tampered Enrolment Count Cohort",
          daysOfWeek: ["Sunday"],
          startTime: "14:00",
          endTime: "15:30",
          enrolledCount: 7 as any,
        });
        assert(false, "Should block enrolledCount on batch creation");
      } catch (err: any) {
        assert(err.message.includes("Direct assignment of enrolledCount is not permitted"));
      }

      // 2. Create legitimate batch with enrolledCount = 0
      const safeBatch = await scheduleService.createBatch(userA._id.toString(), {
        offeringId: offeringA2Group._id,
        title: "Integrity Enrolment Guard Batch",
        daysOfWeek: ["Sunday"],
        startTime: "14:00",
        endTime: "15:30",
        maxCapacity: 12,
      });
      assert.strictEqual(safeBatch.enrolledCount, 0);

      // 3. Attempting to directly mutate enrolledCount via updateBatch is strictly blocked
      try {
        await scheduleService.updateBatch(userA._id.toString(), safeBatch._id.toString(), {
          enrolledCount: 10 as any,
        });
        assert(false, "Should block direct modification of enrolledCount via updateBatch");
      } catch (err: any) {
        assert(err.message.includes("Direct modification of enrolledCount is not permitted"));
      }

      // 4. Confirm database state remained completely untampered
      const untouchedBatch = await TuitionBatch.findById(safeBatch._id);
      assert.strictEqual(untouchedBatch?.enrolledCount, 0);

      // 5. Capacity Integrity: Cannot lower maxCapacity below current enrolledCount
      untouchedBatch!.enrolledCount = 4;
      await untouchedBatch!.save();

      try {
        await scheduleService.updateBatch(userA._id.toString(), safeBatch._id.toString(), {
          maxCapacity: 3, // Lower than 4
        });
        assert(false, "Should reject maxCapacity lower than enrolledCount");
      } catch (err: any) {
        assert(err.message.includes("Capacity integrity violation"));
      }
    });

    // ------------------------------------------------------------------------
    // SUMMARY
    // ------------------------------------------------------------------------
    console.log("\n==========================================================================");
    console.log(`  STEP 3 TEST SUITE: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log("==========================================================================\n");

    if (testsFailed > 0) {
      process.exit(1);
    }
  } finally {
    await mongoose.disconnect();
    console.log("✓ MongoDB test connection closed.");
  }
}

runStep3OfferingsBatchesSuite().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
