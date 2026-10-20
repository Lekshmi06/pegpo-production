import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import User from "../models/User";
import ResearcherProfile from "../models/ResearcherProfile";
import Course from "../models/Course";
import connectDB from "../config/db";

export async function migrateProviderAccounts(): Promise<void> {
  console.log("=== RUNNING COURSE PROVIDER ACCOUNT MIGRATION ===");
  await connectDB();

  // Find all courses and their provider IDs
  const courses = await Course.find({}, "provider providerName title").lean();
  console.log(`Found ${courses.length} courses in database.`);

  for (const course of courses) {
    if (!course.provider) continue;

    const user = await User.findById(course.provider);
    if (!user) {
      console.warn(`Provider user not found for course: ${course.title} (ID: ${course.provider})`);
      continue;
    }

    console.log(`Checking course provider user: ${user.email} (Current userType: ${user.userType})`);

    // If the user is not a teacher (teachers can author courses), ensure userType is 'provider'
    if (user.userType !== "teacher" && user.userType !== "provider") {
      console.log(`  -> Correcting corrupted role from '${user.userType}' to 'provider' for: ${user.email}`);
      user.userType = "provider";
      await user.save();

      // Clean up any incomplete/spurious ResearcherProfile documents created erroneously
      const deletedRp = await ResearcherProfile.deleteMany({
        userId: user._id,
        onboardingCompleted: false,
      });
      if (deletedRp.deletedCount > 0) {
        console.log(`  -> Removed ${deletedRp.deletedCount} spurious uncompleted ResearcherProfile(s) for ${user.email}`);
      }
    } else if (user.userType === "provider") {
      // Ensure no leftover spurious incomplete researcher profile
      const deletedRp = await ResearcherProfile.deleteMany({
        userId: user._id,
        onboardingCompleted: false,
      });
      if (deletedRp.deletedCount > 0) {
        console.log(`  -> Cleaned up ${deletedRp.deletedCount} leftover ResearcherProfile(s) for provider: ${user.email}`);
      }
    }
  }

  console.log("=== COURSE PROVIDER ACCOUNT MIGRATION COMPLETED ===\n");
}

if (process.argv[1]?.includes("migrate_provider_account")) {
  migrateProviderAccounts()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Migration error:", err);
      await mongoose.disconnect();
      process.exit(1);
    });
}
