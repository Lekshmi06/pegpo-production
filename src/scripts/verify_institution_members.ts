import mongoose from "mongoose";
import dotenv from "dotenv";
import User, { IUser } from "../models/User";
import Institution, { IInstitution } from "../models/Institution";
import InstitutionMembership, { IInstitutionMembership } from "../models/InstitutionMembership";
import * as institutionService from "../services/institution_service";



dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/edupye";

async function runMemberManagementTests() {
  console.log("========================================================");
  console.log("STARTING INSTITUTION MEMBER MANAGEMENT & PERMISSION TESTS");
  console.log("========================================================");

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB at:", MONGODB_URI);

  const cleanupEmails = [
    "owner_inst_a@test.com",
    "subadmin_a@test.com",
    "unauthorized_subadmin_a@test.com",
    "trainer_a@test.com",
    "trainee_alice@test.com",
    "trainee_bob@test.com",
    "parent_a@test.com",
    "outsider_dan@test.com",
    "invitee_eve@test.com",
    "owner_inst_b@test.com",
  ];

  try {
    // Cleanup prior run artifacts
    const priorUsers = await User.find({ email: { $in: cleanupEmails } });
    const priorUserIds = priorUsers.map((u) => u._id);
    await InstitutionMembership.deleteMany({ userId: { $in: priorUserIds } });
    await Institution.deleteMany({
      slug: { $in: ["member-test-academy-a", "member-test-academy-b"] },
    });
    await User.deleteMany({ email: { $in: cleanupEmails } });

    // 0. Seed test users
    console.log("\n0. Seeding Test Users...");
    const ownerA = await User.create({
      name: "Owner A",
      email: "owner_inst_a@test.com",
      password: "password123",
      userType: "provider",
    });

    const subAdminA = await User.create({
      name: "SubAdmin With Permissions",
      email: "subadmin_a@test.com",
      password: "password123",
      userType: "teacher",
    });

    const unauthorizedSubAdminA = await User.create({
      name: "SubAdmin Without Permissions",
      email: "unauthorized_subadmin_a@test.com",
      password: "password123",
      userType: "teacher",
    });

    const trainerA = await User.create({
      name: "Trainer Tom",
      email: "trainer_a@test.com",
      password: "password123",
      userType: "teacher",
    });

    const traineeAlice = await User.create({
      name: "Trainee Alice",
      email: "trainee_alice@test.com",
      password: "password123",
      userType: "student",
    });

    const traineeBob = await User.create({
      name: "Trainee Bob",
      email: "trainee_bob@test.com",
      password: "password123",
      userType: "student",
    });

    const parentA = await User.create({
      name: "Parent Patricia",
      email: "parent_a@test.com",
      password: "password123",
      userType: "student",
    });

    const outsiderDan = await User.create({
      name: "Outsider Dan",
      email: "outsider_dan@test.com",
      password: "password123",
      userType: "student",
    });

    const inviteeEve = await User.create({
      name: "Invitee Eve",
      email: "invitee_eve@test.com",
      password: "password123",
      userType: "student",
    });

    const ownerB = await User.create({
      name: "Owner B",
      email: "owner_inst_b@test.com",
      password: "password123",
      userType: "provider",
    });
    console.log("✓ Seeded 10 test users successfully.");

    // 1. Create Institutions
    console.log("\n1. Setting Up Institutions A and B...");
    const instAData = await institutionService.createInstitution(
      ownerA._id.toString(),
      {
        name: "Member Test Academy A",
        institutionType: "training_institute",
      }
    );
    const instA = instAData.institution;
    const ownerAMembership = instAData.membership;

    const instBData = await institutionService.createInstitution(
      ownerB._id.toString(),
      {
        name: "Member Test Academy B",
        institutionType: "company",
      }
    );
    const instB = instBData.institution;
    console.log(`✓ Created Institution A (${instA._id}) and Institution B (${instB._id}).`);

    // 2. Admin Member Management (Add members with various roles)
    console.log("\n2. Testing Admin Member Addition & Assignment...");
    const subAdminMem = await institutionService.addOrInviteMember(
      instA._id.toString(),
      ownerA._id.toString(),
      {
        email: subAdminA.email,
        role: "subadmin",
        title: "Operations Lead",
        permissions: ["manage_members", "invite_members"],
        status: "active",
      }
    );
    console.log("✓ Admin added Sub-Admin with 'manage_members' permission.");

    const unauthSubAdminMem = await institutionService.addOrInviteMember(
      instA._id.toString(),
      ownerA._id.toString(),
      {
        email: unauthorizedSubAdminA.email,
        role: "subadmin",
        title: "Observer Sub-Admin",
        permissions: ["view_reports"], // No manage_members
        status: "active",
      }
    );
    console.log("✓ Admin added Sub-Admin without 'manage_members' permission.");

    const trainerMem = await institutionService.addOrInviteMember(
      instA._id.toString(),
      ownerA._id.toString(),
      {
        email: trainerA.email,
        role: "trainer",
        title: "Lead Python Trainer",
        status: "active",
      }
    );
    console.log("✓ Admin added Trainer.");

    const traineeAliceMem = await institutionService.addOrInviteMember(
      instA._id.toString(),
      ownerA._id.toString(),
      {
        email: traineeAlice.email,
        role: "trainee",
        title: "Full-Stack Trainee",
        status: "active",
      }
    );
    console.log("✓ Admin added Trainee Alice.");

    const parentMem = await institutionService.addOrInviteMember(
      instA._id.toString(),
      ownerA._id.toString(),
      {
        email: parentA.email,
        role: "parent",
        title: "Guardian of Alice",
        linkedLearners: [traineeAlice._id.toString()],
        status: "active",
      }
    );
    console.log("✓ Admin added Parent with linked learner Alice.");

    // 3. Sub-Admin Permission Restrictions
    console.log("\n3. Testing Sub-Admin Permissions...");
    // 3a. Authorized subadmin CAN invite a trainee
    const traineeBobMem = await institutionService.addOrInviteMember(
      instA._id.toString(),
      subAdminA._id.toString(),
      {
        email: traineeBob.email,
        role: "trainee",
        status: "active",
      }
    );
    console.log("✓ Sub-Admin with manage_members successfully added Trainee Bob.");

    // 3b. Unauthorized subadmin CANNOT invite a member
    try {
      await institutionService.addOrInviteMember(
        instA._id.toString(),
        unauthorizedSubAdminA._id.toString(),
        {
          email: "another_trainee@test.com",
          role: "trainee",
        }
      );
      throw new Error("Security breach: Sub-Admin without invite permissions should have been blocked!");
    } catch (err: any) {
      if (err.message.includes("lacks permission to invite members") || err.statusCode === 403) {
        console.log("✓ Sub-Admin without invite permission correctly blocked (403 Forbidden).");
      } else {
        throw err;
      }
    }

    // 3c. Sub-Admin CANNOT assign Admin role
    try {
      await institutionService.addOrInviteMember(
        instA._id.toString(),
        subAdminA._id.toString(),
        {
          email: "wannabe_admin@test.com",
          role: "admin",
        }
      );
      throw new Error("Security breach: Sub-Admin should not be able to assign Admin role!");
    } catch (err: any) {
      if (err.message.includes("cannot assign the Administrator role") || err.statusCode === 403) {
        console.log("✓ Sub-Admin blocked from assigning Admin role (403 Forbidden).");
      } else {
        throw err;
      }
    }

    // 3d. Sub-Admin CANNOT update or remove Admin
    try {
      await institutionService.updateMemberRole(
        instA._id.toString(),
        ownerAMembership._id.toString(),
        subAdminA._id.toString(),
        { title: "Hacked Title" }
      );
      throw new Error("Security breach: Sub-Admin should not modify an Admin!");
    } catch (err: any) {
      if (err.message.includes("cannot modify or assign Admin roles") || err.statusCode === 403) {
        console.log("✓ Sub-Admin blocked from modifying Admin (403 Forbidden).");
      } else {
        throw err;
      }
    }

    // 4. Trainer Restrictions
    console.log("\n4. Testing Trainer Access Restrictions...");
    try {
      await institutionService.addOrInviteMember(
        instA._id.toString(),
        trainerA._id.toString(),
        {
          email: "trainee_from_trainer@test.com",
          role: "trainee",
        }
      );
      throw new Error("Security breach: Trainer should not be allowed to invite members!");
    } catch (err: any) {
      if (err.statusCode === 403) {
        console.log("✓ Trainer blocked from inviting members (403 Forbidden).");
      } else {
        throw err;
      }
    }

    try {
      await institutionService.removeMember(
        instA._id.toString(),
        traineeBobMem._id.toString(),
        trainerA._id.toString()
      );
      throw new Error("Security breach: Trainer should not be allowed to remove members!");
    } catch (err: any) {
      if (err.statusCode === 403) {
        console.log("✓ Trainer blocked from removing members (403 Forbidden).");
      } else {
        throw err;
      }
    }

    // 5. Trainee Restrictions (Can view self, cannot view others)
    console.log("\n5. Testing Trainee Access Restrictions...");
    // Trainee viewing self -> OK
    const aliceSelf = await institutionService.getMemberById(
      instA._id.toString(),
      traineeAliceMem._id.toString(),
      traineeAlice._id.toString()
    );
    if (!aliceSelf || aliceSelf._id.toString() !== traineeAliceMem._id.toString()) {
      throw new Error("Trainee should be able to view their own profile.");
    }
    console.log("✓ Trainee Alice successfully viewed her own membership.");

    // Trainee viewing Bob -> Blocked (403)
    try {
      await institutionService.getMemberById(
        instA._id.toString(),
        traineeBobMem._id.toString(),
        traineeAlice._id.toString()
      );
      throw new Error("Security breach: Trainee should not be able to view another member's profile!");
    } catch (err: any) {
      if (err.statusCode === 403 && err.message.includes("only view their own membership")) {
        console.log("✓ Trainee blocked from viewing another member's profile (403 Forbidden).");
      } else {
        throw err;
      }
    }

    // 6. Parent Access Restrictions (Can view linked learner, blocked for unlinked learner)
    console.log("\n6. Testing Parent Access Restrictions...");
    // Parent Patricia viewing linked learner Alice -> OK
    const parentViewAlice = await institutionService.getMemberById(
      instA._id.toString(),
      traineeAliceMem._id.toString(),
      parentA._id.toString()
    );
    if (!parentViewAlice) {
      throw new Error("Parent should be able to view linked learner.");
    }
    console.log("✓ Parent successfully viewed linked learner (Alice).");

    // Parent Patricia viewing unlinked learner Bob -> Blocked (403)
    try {
      await institutionService.getMemberById(
        instA._id.toString(),
        traineeBobMem._id.toString(),
        parentA._id.toString()
      );
      throw new Error("Security breach: Parent should not be able to view unlinked learner Bob!");
    } catch (err: any) {
      if (err.statusCode === 403 && err.message.includes("linked learners")) {
        console.log("✓ Parent blocked from accessing unlinked learner Bob (403 Forbidden).");
      } else {
        throw err;
      }
    }

    // 7. Non-Member Access Denial
    console.log("\n7. Testing Non-Member Access Denial...");
    try {
      await institutionService.getMemberById(
        instA._id.toString(),
        traineeAliceMem._id.toString(),
        outsiderDan._id.toString()
      );
      throw new Error("Security breach: Non-member Dan should have been rejected!");
    } catch (err: any) {
      if (err.statusCode === 403) {
        console.log("✓ Non-member Dan denied access to Institution A (403 Forbidden).");
      } else {
        throw err;
      }
    }

    // 8. Cross-Institution Isolation (Institution A vs Institution B)
    console.log("\n8. Testing Cross-Institution Isolation...");
    try {
      // Owner of Inst B tries to view member in Inst A
      await institutionService.getMemberById(
        instA._id.toString(),
        traineeAliceMem._id.toString(),
        ownerB._id.toString()
      );
      throw new Error("Security breach: Cross-institution access should have been rejected!");
    } catch (err: any) {
      if (err.statusCode === 403) {
        console.log("✓ Owner of Institution B denied access to Institution A members (403 Forbidden).");
      } else {
        throw err;
      }
    }

    // 9. Owner Protection Safeguards
    console.log("\n9. Testing Owner Protection Safeguards...");
    // 9a. Demote owner
    try {
      await institutionService.updateMemberRole(
        instA._id.toString(),
        ownerAMembership._id.toString(),
        ownerA._id.toString(),
        { role: "trainee" }
      );
      throw new Error("Security breach: Demoting owner should have been rejected!");
    } catch (err: any) {
      if (err.message.includes("Cannot demote the institution owner")) {
        console.log("✓ Owner cannot be demoted (Protected).");
      } else {
        throw err;
      }
    }

    // 9b. Suspend owner
    try {
      await institutionService.updateMemberRole(
        instA._id.toString(),
        ownerAMembership._id.toString(),
        ownerA._id.toString(),
        { status: "suspended" }
      );
      throw new Error("Security breach: Suspending owner should have been rejected!");
    } catch (err: any) {
      if (err.message.includes("Cannot suspend or deactivate the institution owner")) {
        console.log("✓ Owner cannot be suspended or deactivated (Protected).");
      } else {
        throw err;
      }
    }

    // 9c. Remove owner
    try {
      await institutionService.removeMember(
        instA._id.toString(),
        ownerAMembership._id.toString(),
        ownerA._id.toString()
      );
      throw new Error("Security breach: Removing owner should have been rejected!");
    } catch (err: any) {
      if (err.message.includes("Cannot remove the institution owner")) {
        console.log("✓ Owner cannot be removed (Protected).");
      } else {
        throw err;
      }
    }

    // 10. Duplicate Membership Prevention
    console.log("\n10. Testing Duplicate Membership Prevention...");
    try {
      await institutionService.addOrInviteMember(
        instA._id.toString(),
        ownerA._id.toString(),
        {
          email: traineeAlice.email, // Already a member!
          role: "trainee",
        }
      );
      throw new Error("Security breach: Duplicate membership should have been rejected!");
    } catch (err: any) {
      if (err.statusCode === 409 || err.message.includes("already a member")) {
        console.log("✓ Duplicate membership rejected with 409 Conflict.");
      } else {
        throw err;
      }
    }

    // 11. Invitation and Registration / Join Flow
    console.log("\n11. Testing Secure Invitation & Acceptance Flow...");
    // 11a. Admin creates invitation for Eve
    const eveInvite = await institutionService.addOrInviteMember(
      instA._id.toString(),
      ownerA._id.toString(),
      {
        email: inviteeEve.email,
        role: "trainee",
        title: "Frontend Intern",
        status: "invited",
      }
    );

    if (eveInvite.status !== "invited" || !eveInvite.invitationCode) {
      throw new Error("Invitation was not created with invited status and invitation code.");
    }
    const inviteCode = eveInvite.invitationCode;
    console.log(`✓ Invitation generated with secure code: ${inviteCode} (Status: invited).`);

    // 11b. Public lookup of invitation details
    const info = await institutionService.getInvitationInfoByCode(inviteCode);
    if (info.code !== inviteCode || info.institution.name !== "Member Test Academy A") {
      throw new Error("Invitation lookup returned mismatched institution details.");
    }
    console.log("✓ Looked up invitation details publicly via invitation code.");

    // 11c. Invitee accepts invitation
    const acceptResult = await institutionService.acceptInvitation(
      inviteCode,
      inviteeEve._id.toString()
    );
    if (acceptResult.membership.status !== "active") {
      throw new Error("Accepted membership status is not active.");
    }
    if (acceptResult.membership.invitationCode) {
      throw new Error("Accepted membership did not clear invitationCode.");
    }
    console.log("✓ Invitee Eve accepted invitation; status updated to active and code redeemed.");

    // 11d. Re-using same invitation code should fail
    try {
      await institutionService.acceptInvitation(inviteCode, outsiderDan._id.toString());
      throw new Error("Security breach: Re-using redeemed invitation code should fail!");
    } catch (err: any) {
      if (err.statusCode === 404 || err.message.includes("Invalid or expired")) {
        console.log("✓ Redeemed invitation code cannot be reused (404/Invalid).");
      } else {
        throw err;
      }
    }

    // 12. Member Deactivation & Safe Removal
    console.log("\n12. Testing Status Toggle & Safe Member Removal...");
    // Suspend Trainee Bob
    const suspendedBob = await institutionService.updateMemberRole(
      instA._id.toString(),
      traineeBobMem._id.toString(),
      ownerA._id.toString(),
      { status: "suspended" }
    );
    if (suspendedBob.status !== "suspended") {
      throw new Error("Failed to suspend Trainee Bob.");
    }
    console.log("✓ Trainee Bob status toggled to suspended.");

    // Remove Trainee Bob
    const removeResult = await institutionService.removeMember(
      instA._id.toString(),
      traineeBobMem._id.toString(),
      ownerA._id.toString()
    );
    if (!removeResult.success) {
      throw new Error("Failed to remove Trainee Bob.");
    }
    const verifyRemoved = await InstitutionMembership.findById(traineeBobMem._id);
    if (verifyRemoved) {
      throw new Error("Trainee Bob membership was not deleted.");
    }
    console.log("✓ Trainee Bob membership safely removed from institution.");

    // Cleanup artifacts
    await InstitutionMembership.deleteMany({
      institutionId: { $in: [instA._id, instB._id] },
    });
    await Institution.deleteMany({ _id: { $in: [instA._id, instB._id] } });
    await User.deleteMany({ email: { $in: cleanupEmails } });
    console.log("\n✓ Test data cleaned up successfully.");

    console.log("\n========================================================");
    console.log("ALL 12 INSTITUTION MEMBER MANAGEMENT TESTS PASSED!");
    console.log("========================================================");
  } finally {
    await mongoose.disconnect();
  }
}

runMemberManagementTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
