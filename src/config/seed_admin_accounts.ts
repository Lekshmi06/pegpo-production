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
  const allAdminModules = Array.from({ length: 33 }, (_, i) => i + 1); // [1..33]
  const tuitionModules = [1, 2, 3, 4, 5, 33];
  const staffModules = [1, 2, 3, 4, 5];

  // 1. Platform Super Admin (superadmin / SA-001)
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
      allowedModules: allAdminModules,
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
    superAdmin.allowedModules = allAdminModules;
    superAdmin.status = "Active";
    superAdmin.tokenVersion = 0;
    superAdmin.failedLoginAttempts = 0;
    await superAdmin.save();
    console.log("🔄 Platform Super Admin updated with verified credentials:", superAdminEmail);
  }

  // Also support legacy alias labeeb.eee if exists
  let labeebAdmin = await User.findOne({ username: "labeeb.eee" });
  if (labeebAdmin) {
    labeebAdmin.password = passwordHash;
    labeebAdmin.passwordHash = passwordHash;
    labeebAdmin.role = "Super Admin";
    labeebAdmin.adminRole = "Super Admin";
    labeebAdmin.status = "Active";
    labeebAdmin.tokenVersion = 0;
    labeebAdmin.failedLoginAttempts = 0;
    await labeebAdmin.save();
    console.log("🔄 Alias labeeb.eee updated to Super Admin");
  }

  // 2. Tuition Operations Admin (tuitionadmin / TAD-001)
  const tuitionAdminEmail = "tuitionadmin@edupye.com";
  let tuitionAdmin = await User.findOne({
    $or: [{ email: tuitionAdminEmail }, { username: "tuitionadmin" }, { userId: "TAD-001" }],
  });

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

  // 3. General Admin (admin / ADM-001)
  const adminEmail = "admin@edupye.com";
  let generalAdmin = await User.findOne({
    $or: [{ email: adminEmail }, { username: "admin" }, { userId: "ADM-001" }],
  });

  if (!generalAdmin) {
    generalAdmin = await User.create({
      id: 3,
      userId: "ADM-001",
      username: "admin",
      email: adminEmail,
      displayName: "General Administrator",
      fullName: "General Administrator",
      name: "General Administrator",
      role: "Admin",
      adminRole: "Admin",
      department: "Administration",
      designation: "System Administrator",
      allowedModules: allAdminModules,
      password: passwordHash,
      passwordHash: passwordHash,
      status: "Active",
      tokenVersion: 0,
      failedLoginAttempts: 0,
    });
    console.log("✅ General Admin created:", adminEmail);
  } else {
    generalAdmin.password = passwordHash;
    generalAdmin.passwordHash = passwordHash;
    generalAdmin.role = "Admin";
    generalAdmin.adminRole = "Admin";
    generalAdmin.userId = generalAdmin.userId || "ADM-001";
    generalAdmin.username = generalAdmin.username || "admin";
    generalAdmin.displayName = generalAdmin.displayName || "General Administrator";
    generalAdmin.allowedModules = allAdminModules;
    generalAdmin.status = "Active";
    generalAdmin.tokenVersion = 0;
    generalAdmin.failedLoginAttempts = 0;
    await generalAdmin.save();
    console.log("🔄 General Admin updated with verified credentials:", adminEmail);
  }

  // Also support legacy alias sarah.mitchell / ADM-101 if exists
  let sarahAdmin = await User.findOne({
    $or: [{ username: "sarah.mitchell" }, { email: "sarah.mitchell@edupye.com" }, { userId: "ADM-101" }],
  });
  if (sarahAdmin) {
    sarahAdmin.password = passwordHash;
    sarahAdmin.passwordHash = passwordHash;
    sarahAdmin.role = "Admin";
    sarahAdmin.adminRole = "Admin";
    sarahAdmin.status = "Active";
    sarahAdmin.tokenVersion = 0;
    sarahAdmin.failedLoginAttempts = 0;
    await sarahAdmin.save();
    console.log("🔄 Alias sarah.mitchell updated to Admin");
  }

  // 4. Staff Account (staff / STF-001)
  const staffEmail = "staff@edupye.com";
  let staffUser = await User.findOne({
    $or: [{ email: staffEmail }, { username: "staff" }, { userId: "STF-001" }],
  });

  if (!staffUser) {
    staffUser = await User.create({
      id: 4,
      userId: "STF-001",
      username: "staff",
      email: staffEmail,
      displayName: "Operations Staff",
      fullName: "Operations Staff",
      name: "Operations Staff",
      role: "Staff",
      adminRole: "Staff",
      department: "Operations",
      designation: "Operations Specialist",
      allowedModules: staffModules,
      password: passwordHash,
      passwordHash: passwordHash,
      status: "Active",
      tokenVersion: 0,
      failedLoginAttempts: 0,
    });
    console.log("✅ Staff account created:", staffEmail);
  } else {
    staffUser.password = passwordHash;
    staffUser.passwordHash = passwordHash;
    staffUser.role = "Staff";
    staffUser.adminRole = "Staff";
    staffUser.userId = staffUser.userId || "STF-001";
    staffUser.username = staffUser.username || "staff";
    staffUser.displayName = staffUser.displayName || "Operations Staff";
    staffUser.allowedModules = staffModules;
    staffUser.status = "Active";
    staffUser.tokenVersion = 0;
    staffUser.failedLoginAttempts = 0;
    await staffUser.save();
    console.log("🔄 Staff account updated with verified credentials:", staffEmail);
  }

  // Also support legacy alias john.manager / STF-101 if exists
  let johnStaff = await User.findOne({
    $or: [{ username: "john.manager" }, { email: "john.manager@edupye.com" }, { userId: "STF-101" }],
  });
  if (johnStaff) {
    johnStaff.password = passwordHash;
    johnStaff.passwordHash = passwordHash;
    johnStaff.role = "Staff";
    johnStaff.adminRole = "Staff";
    johnStaff.status = "Active";
    johnStaff.tokenVersion = 0;
    johnStaff.failedLoginAttempts = 0;
    await johnStaff.save();
    console.log("🔄 Alias john.manager updated to Staff");
  }

  console.log("\n=======================================================");
  console.log("🎯 All 4 Admin/Staff Accounts Seeded Successfully:");
  console.log("1. Super Admin: superadmin / superadmin@edupye.com / SA-001 (Pass: Password123!) [Modules: All 33]");
  console.log("2. Tuition Admin: tuitionadmin / tuitionadmin@edupye.com / TAD-001 (Pass: Password123!) [Modules: 1, 2, 3, 4, 5, 33]");
  console.log("3. General Admin: admin / admin@edupye.com / ADM-001 (Pass: Password123!) [Modules: All 33]");
  console.log("4. Staff: staff / staff@edupye.com / STF-001 (Pass: Password123!) [Modules: 1, 2, 3, 4, 5]");
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
