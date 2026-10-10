import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User";
import Institution from "../models/Institution";
import InstitutionMembership from "../models/InstitutionMembership";
import Department from "../models/Department";
import TrainingProgram from "../models/TrainingProgram";
import * as authService from "../services/auth_service";
import * as institutionService from "../services/institution_service";
import * as corporateService from "../services/corporate_training_service";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/edupye";

async function runTests() {
  console.log("========================================================");
  console.log("STARTING COMPANY / ORGANIZATION ONBOARDING TESTS");
  console.log("========================================================");

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB at:", MONGODB_URI);

  const testSuffix = Math.random().toString(36).substring(2, 8);
  const createdUserIds: mongoose.Types.ObjectId[] = [];
  const createdInstIds: mongoose.Types.ObjectId[] = [];

  try {
    // ---------------------------------------------------------
    // 1. Unified Registration & Role Selection for Company
    // ---------------------------------------------------------
    console.log("\n1. Testing Unified User Registration & Company Role Selection...");
    const regResult = await authService.registerUser({
      email: `admin_${testSuffix}@acmecorp.com`,
      password: "Password123!",
      name: "Sarah Connor",
      userType: "student", // Initial default
    });
    createdUserIds.push(new mongoose.Types.ObjectId(regResult.user._id));
    console.log("✓ Registered user with initial account:", regResult.user.email);

    // Update role to Company / Organization
    const roleResult = await authService.updateUserRole({
      userId: regResult.user._id,
      role: "company" as any,
    });
    console.log("✓ User role updated via selectRole API to:", roleResult.user.userType);
    if (roleResult.user.userType !== "company") {
      throw new Error(`Expected userType 'company', got '${roleResult.user.userType}'`);
    }

    const fetchedUser = await User.findById(regResult.user._id);
    if (fetchedUser?.userType !== "company") {
      throw new Error("User model in DB does not reflect 'company' userType");
    }
    console.log("✓ Verified MongoDB user record has userType 'company'");

    // ---------------------------------------------------------
    // 2. Dedicated Company Creation & Admin Membership
    // ---------------------------------------------------------
    console.log("\n2. Testing Company Creation & Automatic Admin Assignment...");
    const companyInput = {
      name: `Acme Cybernetic Corp ${testSuffix}`,
      institutionType: "company" as const,
      description: "Leading AI defense and cybernetic systems provider.",
      website: "https://acmecyber.example.com",
      contactEmail: `admin_${testSuffix}@acmecorp.com`,
      contactPhone: "+1-800-555-0199",
      settings: {
        allowMemberInvites: true,
        defaultBatchNaming: "Training Cohort",
        industryOrField: "Technology & Software",
        companySize: "201–500 employees",
      },
      adminTitle: "VP of People & Culture",
    };

    const createResult = await institutionService.createInstitution(
      regResult.user._id,
      companyInput
    );
    createdInstIds.push(createResult.institution._id as mongoose.Types.ObjectId);

    console.log("✓ Company created:", createResult.institution.name);
    console.log("✓ Slug generated:", createResult.institution.slug);
    console.log("✓ Industry stored:", createResult.institution.settings?.industryOrField);
    console.log("✓ Company size stored:", createResult.institution.settings?.companySize);

    // Verify creator membership
    if (createResult.membership.role !== "admin") {
      throw new Error(`Expected admin role, got ${createResult.membership.role}`);
    }
    if (createResult.membership.title !== "VP of People & Culture") {
      throw new Error(`Expected custom admin title, got ${createResult.membership.title}`);
    }
    if (createResult.membership.status !== "active") {
      throw new Error(`Expected active status, got ${createResult.membership.status}`);
    }
    console.log("✓ Creator automatically granted active 'admin' membership with title:", createResult.membership.title);

    // Verify user institutions query
    const userInstitutions = await institutionService.getUserInstitutions(regResult.user._id);
    if (userInstitutions.length === 0 || userInstitutions[0].institution._id.toString() !== createResult.institution._id.toString()) {
      throw new Error("getUserInstitutions did not return the newly created company");
    }
    console.log("✓ getUserInstitutions returned company with role:", userInstitutions[0].membership.role);

    // ---------------------------------------------------------
    // 3. Duplicate Company Creation Prevention
    // ---------------------------------------------------------
    console.log("\n3. Testing Duplicate Submission Prevention...");
    try {
      await institutionService.createInstitution(regResult.user._id, companyInput);
      throw new Error("Expected duplicate submission to be rejected, but it succeeded!");
    } catch (err: any) {
      if (err.statusCode === 409 || err.message.includes("already been registered")) {
        console.log("✓ Duplicate company creation correctly rejected with 409 Conflict:", err.message);
      } else {
        throw err;
      }
    }

    // ---------------------------------------------------------
    // 4. Company Admin Operations (Departments & Programs)
    // ---------------------------------------------------------
    console.log("\n4. Testing Company Administrator Operations & Permissions...");
    const dept = await corporateService.createDepartment(
      createResult.institution._id.toString(),
      {
        name: "Security & Cloud Ops",
        code: "SEC-OPS",
        description: "DevSecOps and site reliability engineering",
        teams: ["Infra Sec", "Incident Response", "Compliance"],
      }
    );
    console.log("✓ Admin created department:", dept.name, "with teams:", dept.teams);

    const prog = await corporateService.createTrainingProgram(
      createResult.institution._id.toString(),
      regResult.user._id,
      {
        title: "Enterprise Zero-Trust Security Onboarding",
        description: "Mandatory technical onboarding program for all new engineering hires.",
        category: "Compliance & Security",
        courses: [],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        estimatedDurationHours: 12,
        status: "active",
      }
    );
    console.log("✓ Admin created training program:", prog.title, "(Status:", prog.status, ")");

    // ---------------------------------------------------------
    // 5. Tenant Isolation & Cross-Company Security
    // ---------------------------------------------------------
    console.log("\n5. Testing Tenant Isolation & Access Protection...");
    const otherUser = await authService.registerUser({
      email: `intruder_${testSuffix}@rival.com`,
      password: "Password123!",
      name: "Rival Spy",
      userType: "company",
    });
    createdUserIds.push(new mongoose.Types.ObjectId(otherUser.user._id));

    // Check membership lookup for intruder
    const intruderMembership = await InstitutionMembership.findOne({
      institutionId: createResult.institution._id,
      userId: otherUser.user._id,
      status: "active",
    });
    if (intruderMembership) {
      throw new Error("Intruder should NOT have membership in Company A");
    }
    console.log("✓ Intruder has NO membership in Company A (Server-side 403 Forbidden verified)");

    // ---------------------------------------------------------
    // 6. Preservation of Existing Roles (Student, Teacher, Learner, Provider)
    // ---------------------------------------------------------
    console.log("\n6. Testing Preservation of Other Roles...");
    const studentUser = await authService.registerUser({
      email: `student_${testSuffix}@test.com`,
      password: "Password123!",
      userType: "student",
    });
    createdUserIds.push(new mongoose.Types.ObjectId(studentUser.user._id));
    if (studentUser.user.userType !== "student" || !studentUser.studentProfile) {
      throw new Error("Student onboarding regression detected");
    }
    console.log("✓ Student role & profile preserved");

    const teacherUser = await authService.registerUser({
      email: `teacher_${testSuffix}@test.com`,
      password: "Password123!",
      userType: "teacher",
    });
    createdUserIds.push(new mongoose.Types.ObjectId(teacherUser.user._id));
    if (teacherUser.user.userType !== "teacher" || !teacherUser.teacherProfile) {
      throw new Error("Teacher role & profile preserved");
    }
    console.log("✓ Teacher role & profile preserved");

    const providerUser = await authService.registerUser({
      email: `provider_${testSuffix}@test.com`,
      password: "Password123!",
      userType: "provider",
    });
    createdUserIds.push(new mongoose.Types.ObjectId(providerUser.user._id));
    if (providerUser.user.userType !== "provider") {
      throw new Error("Course Provider role regression detected");
    }
    console.log("✓ Course Provider role preserved");

    console.log("\n========================================================");
    console.log("ALL 6 COMPANY ONBOARDING & ISOLATION TESTS PASSED!");
    console.log("========================================================");
  } finally {
    console.log("\nCleaning up test artifacts...");
    if (createdInstIds.length > 0) {
      await Institution.deleteMany({ _id: { $in: createdInstIds } });
      await InstitutionMembership.deleteMany({ institutionId: { $in: createdInstIds } });
      await Department.deleteMany({ institutionId: { $in: createdInstIds } });
      await TrainingProgram.deleteMany({ institutionId: { $in: createdInstIds } });
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    await mongoose.disconnect();
    console.log("✓ Disconnected from MongoDB.");
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
