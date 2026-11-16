import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "./db";
import User from "../models/User";

export async function seedAdminAccounts(): Promise<void> {
  await connectDB();
  console.log("Connected to MongoDB for admin account seeding...");

  const defaultPassword = "Password123!";
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // 1. Platform Super Admin
  const superAdminEmail = "superadmin@edupye.com";
  let superAdmin = await User.findOne({
    $or: [{ email: superAdminEmail }, { username: "superadmin" }, { userId: "SA-001" }],
  });

  if (!superAdmin) {
    superAdmin = await User.create({
      id: 1,
      userId: "SA-001",
      username: "superadmin",
      email: superAdminEmail,
      displayName: "Platform Super Admin",
      fullName: "Platform Super Admin",
      name: "Platform Super Admin",
      role: "Super Admin",
      adminRole: "Super Admin",
      department: "Executive Management",
      designation: "Chief Platform Administrator",
      password: passwordHash,
      passwordHash: passwordHash,
      status: "Active",
      tokenVersion: 0,
      failedLoginAttempts: 0,
    });
    console.log("✅ Platform Super Admin created:", superAdminEmail);
  } else {
    superAdmin.password = passwordHash;
    superAdmin.passwordHash = passwordHash;
    superAdmin.role = "Super Admin";
    superAdmin.adminRole = "Super Admin";
    superAdmin.userId = superAdmin.userId || "SA-001";
    superAdmin.username = superAdmin.username || "superadmin";
    superAdmin.displayName = superAdmin.displayName || "Platform Super Admin";
    superAdmin.status = "Active";
    superAdmin.tokenVersion = 0;
    superAdmin.failedLoginAttempts = 0;
    await superAdmin.save();
    console.log("🔄 Platform Super Admin updated with verified credentials:", superAdminEmail);
  }

  // 2. Tuition Operations Admin
  const tuitionAdminEmail = "tuitionadmin@edupye.com";
  let tuitionAdmin = await User.findOne({
    $or: [{ email: tuitionAdminEmail }, { username: "tuitionadmin" }, { userId: "TAD-001" }],
  });

  const tuitionModules = [1, 2, 3, 4, 5, 33];

  if (!tuitionAdmin) {
    tuitionAdmin = await User.create({
      id: 2,
      userId: "TAD-001",
      username: "tuitionadmin",
      email: tuitionAdminEmail,
      displayName: "Tuition Operations Admin",
      fullName: "Tuition Operations Admin",
      name: "Tuition Operations Admin",
      role: "Tuition Operations Admin",
      adminRole: "Tuition Operations Admin",
      department: "Tuition Operations",
      designation: "Tuition Operations Lead",
      allowedModules: tuitionModules,
      password: passwordHash,
      passwordHash: passwordHash,
      status: "Active",
      tokenVersion: 0,
      failedLoginAttempts: 0,
    });
    console.log("✅ Tuition Operations Admin created:", tuitionAdminEmail);
  } else {
    tuitionAdmin.password = passwordHash;
    tuitionAdmin.passwordHash = passwordHash;
    tuitionAdmin.role = "Tuition Operations Admin";
    tuitionAdmin.adminRole = "Tuition Operations Admin";
    tuitionAdmin.userId = tuitionAdmin.userId || "TAD-001";
    tuitionAdmin.username = tuitionAdmin.username || "tuitionadmin";
    tuitionAdmin.displayName = tuitionAdmin.displayName || "Tuition Operations Admin";
    tuitionAdmin.allowedModules = tuitionModules;
    tuitionAdmin.status = "Active";
    tuitionAdmin.tokenVersion = 0;
    tuitionAdmin.failedLoginAttempts = 0;
    await tuitionAdmin.save();
    console.log("🔄 Tuition Operations Admin updated with verified credentials:", tuitionAdminEmail);
  }

  console.log("\n=======================================================");
  console.log("🎯 Admin Accounts Seeded Successfully:");
  console.log("1. Super Admin: superadmin@edupye.com / Password123! (Role: Super Admin)");
  console.log("2. Tuition Admin: tuitionadmin@edupye.com / Password123! (Role: Tuition Operations Admin, Modules: [1, 2, 3, 4, 5, 33])");
  console.log("=======================================================\n");
}

if (require.main === module || (process.argv[1] && process.argv[1].includes("seed_admin_accounts"))) {
  seedAdminAccounts()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("❌ Failed to seed admin accounts:", err);
      await mongoose.disconnect();
      process.exit(1);
    });
}

