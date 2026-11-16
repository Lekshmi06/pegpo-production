import mongoose from "mongoose";
import dotenv from "dotenv";
import TuitionPricing from "../models/TuitionPricing";

dotenv.config();

export async function runCentralizedTuitionMigration() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set in environment");
  }

  console.log("=== Starting Centralized Tuition Phase A Migration ===");
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database connection handle not available");
  }

  // 1. Audit Existing Record Counts
  const preRequestsCount = await db.collection("tuitionrequests").countDocuments();
  const preEnrollmentsCount = await db.collection("tuitionenrollments").countDocuments();
  const preSessionsCount = await db.collection("tuitionsessions").countDocuments();
  const preOfferingsCount = await db.collection("tuitionofferings").countDocuments();
  console.log(`Audited Existing Historical Records:`);
  console.log(` - Tuition Requests: ${preRequestsCount}`);
  console.log(` - Tuition Enrollments: ${preEnrollmentsCount}`);
  console.log(` - Tuition Sessions: ${preSessionsCount}`);
  console.log(` - Tuition Offerings: ${preOfferingsCount}`);

  // 2. Adjust tuitionrequests Indexes
  console.log("\n--- Checking and updating indexes on tuitionrequests ---");
  const requestIndexes = await db.collection("tuitionrequests").indexes();
  const reqOfferingIdx = requestIndexes.find((i) => i.name === "studentId_1_offeringId_1");
  if (reqOfferingIdx) {
    console.log("Dropping legacy studentId_1_offeringId_1 index on tuitionrequests...");
    await db.collection("tuitionrequests").dropIndex("studentId_1_offeringId_1");
  }
  console.log("Creating partial studentId_1_offeringId_1 index on tuitionrequests (only where offeringId exists)...");
  await db.collection("tuitionrequests").createIndex(
    { studentId: 1, offeringId: 1 },
    {
      unique: true,
      partialFilterExpression: {
        offeringId: { $exists: true, $type: "objectId" },
        status: { $in: ["pending", "accepted"] },
      },
      name: "studentId_1_offeringId_1",
    }
  );
  await db.collection("tuitionrequests").createIndex(
    { studentId: 1, status: 1 },
    { name: "studentId_1_status_1" }
  );
  await db.collection("tuitionrequests").createIndex(
    { selectedTeacherId: 1, status: 1 },
    { name: "selectedTeacherId_1_status_1" }
  );

  // 3. Adjust tuitionenrollments Indexes
  console.log("\n--- Checking and updating indexes on tuitionenrollments ---");
  const enrollmentIndexes = await db.collection("tuitionenrollments").indexes();
  const enrOfferingIdx = enrollmentIndexes.find((i) => i.name === "studentId_1_offeringId_1");
  if (enrOfferingIdx) {
    console.log("Dropping legacy studentId_1_offeringId_1 index on tuitionenrollments...");
    await db.collection("tuitionenrollments").dropIndex("studentId_1_offeringId_1");
  }
  console.log("Creating partial studentId_1_offeringId_1 index on tuitionenrollments (only where offeringId exists)...");
  await db.collection("tuitionenrollments").createIndex(
    { studentId: 1, offeringId: 1 },
    {
      unique: true,
      partialFilterExpression: {
        offeringId: { $exists: true, $type: "objectId" },
        status: "active",
      },
      name: "studentId_1_offeringId_1",
    }
  );
  await db.collection("tuitionenrollments").createIndex(
    { studentId: 1, teacherId: 1, status: 1 },
    { name: "studentId_1_teacherId_1_status_1" }
  );

  // 4. Adjust tuitionsessions Indexes
  console.log("\n--- Checking and updating indexes on tuitionsessions ---");
  await db.collection("tuitionsessions").createIndex(
    { teacherId: 1, sessionDate: 1 },
    { name: "teacherId_1_sessionDate_1" }
  );
  await db.collection("tuitionsessions").createIndex(
    { isTrial: 1, status: 1 },
    { name: "isTrial_1_status_1" }
  );

  // 5. Seed Default Tuition Pricing Matrices
  console.log("\n--- Seeding Initial Centralized Tuition Pricing Matrices ---");
  const defaultPricings = [
    {
      subject: "all",
      classLevel: "all",
      curriculum: "all" as const,
      studentHourlyRate: 800,
      teacherHourlyPayoutRate: 500,
      teacherTierRates: {
        standard: 500,
        silver: 600,
        gold: 750,
        platinum: 900,
      },
      currency: "INR",
      isActive: true,
      notes: "Platform default fallback pricing matrix",
    },
    {
      subject: "Mathematics",
      classLevel: "Grade 11-12",
      curriculum: "CBSE" as const,
      studentHourlyRate: 1000,
      teacherHourlyPayoutRate: 650,
      teacherTierRates: {
        standard: 650,
        silver: 750,
        gold: 900,
        platinum: 1100,
      },
      currency: "INR",
      isActive: true,
      notes: "Senior secondary CBSE Mathematics rate card",
    },
    {
      subject: "Physics",
      classLevel: "Grade 11-12",
      curriculum: "CBSE" as const,
      studentHourlyRate: 1000,
      teacherHourlyPayoutRate: 650,
      teacherTierRates: {
        standard: 650,
        silver: 750,
        gold: 900,
        platinum: 1100,
      },
      currency: "INR",
      isActive: true,
      notes: "Senior secondary CBSE Physics rate card",
    },
    {
      subject: "all",
      classLevel: "Grade 11-12",
      curriculum: "Competitive Exam" as const,
      studentHourlyRate: 1500,
      teacherHourlyPayoutRate: 950,
      teacherTierRates: {
        standard: 950,
        silver: 1100,
        gold: 1350,
        platinum: 1600,
      },
      currency: "INR",
      isActive: true,
      notes: "JEE / NEET Competitive Exam tuition pricing card",
    },
    {
      subject: "all",
      classLevel: "all",
      curriculum: "IB" as const,
      studentHourlyRate: 1800,
      teacherHourlyPayoutRate: 1100,
      teacherTierRates: {
        standard: 1100,
        silver: 1300,
        gold: 1550,
        platinum: 1800,
      },
      currency: "INR",
      isActive: true,
      notes: "International Baccalaureate (IB) tuition pricing card",
    },
  ];

  for (const pricing of defaultPricings) {
    const existing = await TuitionPricing.findOne({
      subject: pricing.subject,
      classLevel: pricing.classLevel,
      curriculum: pricing.curriculum,
    });
    if (!existing) {
      await TuitionPricing.create(pricing);
      console.log(`+ Seeded pricing card: ${pricing.subject} / ${pricing.classLevel} / ${pricing.curriculum}`);
    } else {
      console.log(`= Pricing card already exists: ${pricing.subject} / ${pricing.classLevel} / ${pricing.curriculum}`);
    }
  }

  // 6. Verify Post-Migration Record Counts (Ensuring No Data Lost)
  const postRequestsCount = await db.collection("tuitionrequests").countDocuments();
  const postEnrollmentsCount = await db.collection("tuitionenrollments").countDocuments();
  const postSessionsCount = await db.collection("tuitionsessions").countDocuments();
  const postOfferingsCount = await db.collection("tuitionofferings").countDocuments();

  if (
    preRequestsCount !== postRequestsCount ||
    preEnrollmentsCount !== postEnrollmentsCount ||
    preSessionsCount !== postSessionsCount ||
    preOfferingsCount !== postOfferingsCount
  ) {
    throw new Error(
      `DATA INTEGRITY VIOLATION! Count mismatch during migration: ` +
        `Requests: ${preRequestsCount}->${postRequestsCount}, ` +
        `Enrollments: ${preEnrollmentsCount}->${postEnrollmentsCount}, ` +
        `Sessions: ${preSessionsCount}->${postSessionsCount}`
    );
  }

  console.log("\n=== Centralized Tuition Phase A Migration COMPLETED SUCCESSFULLY ===");
  console.log("All historical records perfectly preserved.");
}

// Allow CLI execution
if (require.main === module) {
  runCentralizedTuitionMigration()
    .then(() => {
      console.log("Migration finished.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

