import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import User from "../models/User";
import Institution from "../models/Institution";
import InstitutionMembership from "../models/InstitutionMembership";
import { registerUser } from "../services/auth_service";
import * as institutionService from "../services/institution_service";

async function runTests() {
  const uri = process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/edupye";
  await mongoose.connect(uri);
  console.log("Connected to MongoDB at:", uri);

  const suffix = Date.now();
  const ownerAEmail = `owner.a.${suffix}@test.edupye.com`;
  const ownerBEmail = `owner.b.${suffix}@test.edupye.com`;
  const subAdminEmail = `subadmin.${suffix}@test.edupye.com`;
  const trainerEmail = `trainer.${suffix}@test.edupye.com`;
  const traineeEmail = `trainee.${suffix}@test.edupye.com`;
  const outsiderEmail = `outsider.${suffix}@test.edupye.com`;

  try {
    // 0. Setup Users
    console.log("\n0. Setting up test users...");
    const userOwnerA = await registerUser({
      email: ownerAEmail,
      password: "Password123!",
      name: "Owner Alice (Institution A)",
      userType: "teacher", // Global userType remains independent!
    });
    const userOwnerB = await registerUser({
      email: ownerBEmail,
      password: "Password123!",
      name: "Owner Bob (Institution B)",
      userType: "teacher",
    });
    const userSubAdmin = await registerUser({
      email: subAdminEmail,
      password: "Password123!",
      name: "SubAdmin Sam",
      userType: "teacher",
    });
    const userTrainer = await registerUser({
      email: trainerEmail,
      password: "Password123!",
      name: "Trainer Tom",
      userType: "teacher",
    });
    const userTrainee = await registerUser({
      email: traineeEmail,
      password: "Password123!",
      name: "Trainee Tina",
      userType: "student",
    });
    const userOutsider = await registerUser({
      email: outsiderEmail,
      password: "Password123!",
      name: "Outsider Oscar",
      userType: "personal",
    });
    console.log("✓ Test users created with independent global userTypes.");

    // 1. Create Institution (Phase 1)
    console.log("\n1. Testing Institution Creation (Phase 1)...");
    const { institution: instA, membership: ownerAMembership } =
      await institutionService.createInstitution(userOwnerA.user._id.toString(), {
        name: "Acme Tech Academy",
        institutionType: "company",
        description: "Enterprise software training organization",
        contactEmail: "contact@acmetech.com",
        website: "https://acmetech.example.com",
      });

    if (!instA || !instA._id) throw new Error("Institution creation failed.");
    console.log(`✓ Institution created: "${instA.name}" (Type: ${instA.institutionType}, Slug: ${instA.slug})`);

    // 2. Institution Owner Becomes Admin (Phase 2)
    console.log("\n2. Testing Institution Owner Membership (Phase 2)...");
    if (ownerAMembership.role !== "admin") {
      throw new Error(`Expected owner membership role 'admin', got: ${ownerAMembership.role}`);
    }
    if (ownerAMembership.status !== "active") {
      throw new Error(`Expected owner membership status 'active', got: ${ownerAMembership.status}`);
    }
    console.log("✓ Institution creator is automatically assigned active 'admin' membership.");

    // Create Institution B for Tenant Isolation Testing
    const { institution: instB } = await institutionService.createInstitution(
      userOwnerB.user._id.toString(),
      {
        name: "Omega University Training",
        institutionType: "college",
      }
    );
    console.log(`✓ Second institution created: "${instB.name}"`);

    // 3. Admin can access institution & view metrics
    console.log("\n3. Testing Admin Dashboard Metrics Retrieval...");
    const dashboardData = await institutionService.getInstitutionDashboardMetrics(
      instA._id.toString()
    );
    if (!dashboardData || dashboardData.metrics.totalAdmins < 1) {
      throw new Error("Failed to retrieve dashboard metrics.");
    }
    console.log(
      `✓ Admin retrieved dashboard metrics: Total Members: ${dashboardData.metrics.totalMembers}, Admins: ${dashboardData.metrics.totalAdmins}`
    );

    // 4. Admin adds SubAdmin, Trainer, and Trainee
    console.log("\n4. Testing Adding Members to Institution...");
    const subAdminMember = await institutionService.addOrInviteMember(
      instA._id.toString(),
      userOwnerA.user._id.toString(),
      {
        email: subAdminEmail,
        role: "subadmin",
        title: "Operations Manager",
      }
    );
    console.log("✓ SubAdmin added to Institution A.");

    const trainerMember = await institutionService.addOrInviteMember(
      instA._id.toString(),
      userOwnerA.user._id.toString(),
      {
        email: trainerEmail,
        role: "trainer",
        title: "Senior Python Trainer",
      }
    );
    console.log("✓ Trainer added to Institution A.");

    const traineeMember = await institutionService.addOrInviteMember(
      instA._id.toString(),
      userOwnerA.user._id.toString(),
      {
        email: traineeEmail,
        role: "trainee",
        title: "Cohort 2026 Trainee",
      }
    );
    console.log("✓ Trainee added to Institution A.");

    // Verify member count updated
    const membersList = await institutionService.getInstitutionMembers(instA._id.toString());
    if (membersList.total !== 4) {
      throw new Error(`Expected 4 members in Institution A, got ${membersList.total}`);
    }
    console.log(`✓ Total members in Institution A verified: ${membersList.total}`);

    // 5. Test Non-Member access check (Simulation of middleware logic)
    console.log("\n5. Testing Tenant Access for Non-Member (Oscar)...");
    const outsiderMembership = await InstitutionMembership.findOne({
      institutionId: instA._id,
      userId: userOutsider.user._id,
      status: "active",
    });
    if (outsiderMembership) {
      throw new Error("Outsider should NOT have membership in Institution A.");
    }
    console.log("✓ Non-member Oscar has no active membership in Institution A (would receive 403 Forbidden).");

    // 6. Test Cross-Institution Access (User from Institution A accesses Institution B)
    console.log("\n6. Testing Strict Tenant Isolation (Cross-Institution Access)...");
    const crossAccessMembership = await InstitutionMembership.findOne({
      institutionId: instB._id,
      userId: userOwnerA.user._id,
      status: "active",
    });
    if (crossAccessMembership) {
      throw new Error("Owner of Institution A should NOT have membership in Institution B.");
    }
    console.log("✓ Tenant isolation confirmed: Alice (Institution A) has no membership in Institution B (strictly 403 Forbidden).");

    // 7. Role Permission Verification: SubAdmin / Trainer / Trainee cannot perform Admin-only actions
    console.log("\n7. Testing Role Privilege Isolation...");
    // A trainer or trainee should have their role strictly checked
    if (trainerMember.role === "admin" || traineeMember.role === "admin") {
      throw new Error("Trainer or Trainee mistakenly holds admin role.");
    }
    // Try to demote the owner - should be blocked
    try {
      await institutionService.updateMemberRole(
        instA._id.toString(),
        ownerAMembership._id.toString(),
        { role: "trainee" }
      );
      throw new Error("Security breach: Demoting institution owner should have been rejected!");
    } catch (err: any) {
      if (err.message.includes("Cannot demote the institution owner")) {
        console.log("✓ Owner protection confirmed: Demoting the institution owner is prohibited.");
      } else {
        throw err;
      }
    }

    // Try to remove the owner - should be blocked
    try {
      await institutionService.removeMember(
        instA._id.toString(),
        ownerAMembership._id.toString()
      );
      throw new Error("Security breach: Removing institution owner should have been rejected!");
    } catch (err: any) {
      if (err.message.includes("Cannot remove the institution owner")) {
        console.log("✓ Owner protection confirmed: Removing the institution owner is prohibited.");
      } else {
        throw err;
      }
    }

    // 8. Test Duplicate Membership Rejection
    console.log("\n8. Testing Duplicate Membership Prevention...");
    try {
      await institutionService.addOrInviteMember(
        instA._id.toString(),
        userOwnerA.user._id.toString(),
        {
          email: traineeEmail, // Trainee is already a member
          role: "trainee",
        }
      );
      throw new Error("Security breach: Duplicate membership was allowed!");
    } catch (err: any) {
      if (err.message.includes("already a member")) {
        console.log("✓ Duplicate membership safely rejected with 409 Conflict message.");
      } else {
        throw err;
      }
    }

    // Direct database level compound unique index check:
    console.log("\n9. Testing MongoDB Compound Unique Index on (institutionId, userId)...");
    try {
      await InstitutionMembership.create({
        institutionId: instA._id,
        userId: userTrainee.user._id,
        role: "trainee",
      });
      throw new Error("Database unique index failed to prevent duplicate insertion!");
    } catch (dbErr: any) {
      if (dbErr.code === 11000 || dbErr.message.includes("duplicate key")) {
        console.log("✓ MongoDB unique index { institutionId: 1, userId: 1 } strictly enforced duplicate key rejection.");
      } else {
        throw dbErr;
      }
    }

    // 10. Test User Institutions query
    console.log("\n10. Testing getUserInstitutions...");
    const aliceInstitutions = await institutionService.getUserInstitutions(
      userOwnerA.user._id.toString()
    );
    if (aliceInstitutions.length !== 1 || aliceInstitutions[0].institution.slug !== instA.slug) {
      throw new Error("getUserInstitutions returned incorrect list.");
    }
    console.log(`✓ Alice has ${aliceInstitutions.length} active institution(s) with role: ${aliceInstitutions[0].membership.role}.`);

    const tinaInstitutions = await institutionService.getUserInstitutions(
      userTrainee.user._id.toString()
    );
    if (tinaInstitutions.length !== 1 || tinaInstitutions[0].membership.role !== "trainee") {
      throw new Error("Tina's institution membership role is incorrect.");
    }
    console.log(`✓ Tina has ${tinaInstitutions.length} active institution(s) with role: ${tinaInstitutions[0].membership.role}.`);

    // 11. Test Institution Profile Update (Admin operation)
    console.log("\n11. Testing Institution Profile Update...");
    const updatedInstA = await institutionService.updateInstitution(instA._id.toString(), {
      description: "Updated premier tech enterprise training academy",
      contactPhone: "+1-800-555-0199",
    });
    if (updatedInstA.contactPhone !== "+1-800-555-0199") {
      throw new Error("Institution update did not persist correctly.");
    }
    console.log("✓ Institution profile successfully updated by admin.");

    // 12. Cleanup test artifacts
    await InstitutionMembership.deleteMany({
      institutionId: { $in: [instA._id, instB._id] },
    });
    await Institution.deleteMany({
      _id: { $in: [instA._id, instB._id] },
    });
    console.log("✓ Test artifacts cleaned up.");

    console.log("\n========================================================");
    console.log("ALL INSTITUTION (PHASES 1–3) BACKEND INTEGRATION TESTS PASSED!");
    console.log("========================================================\n");
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
