import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/User";
import Institution from "../models/Institution";
import InstitutionMembership from "../models/InstitutionMembership";
import Department from "../models/Department";
import TrainingProgram from "../models/TrainingProgram";
import Course from "../models/Course";
import Enrollment from "../models/Enrollment";
import * as institutionService from "../services/institution_service";
import * as corporateService from "../services/corporate_training_service";

const MONGO_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/edupye";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
}

async function runCorporateLearningTests() {
  console.log("========================================================");
  console.log("STARTING CORPORATE LEARNING & ONBOARDING INTEGRATION TESTS");
  console.log("========================================================");

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB at:", MONGO_URI);

  const timestamp = Date.now().toString(36);

  try {
    // 0. Seed test users
    console.log("\n0. Seeding Test Corporate Users...");
    const ceo = await User.create({
      name: "Corp CEO",
      email: `ceo_${timestamp}@nexuscorp.com`,
      userType: "institution",
    });

    const hrManager = await User.create({
      name: "HR Sarah",
      email: `sarah_${timestamp}@nexuscorp.com`,
      userType: "institution",
    });

    const trainer = await User.create({
      name: "Lead Trainer Alex",
      email: `alex_${timestamp}@nexuscorp.com`,
      userType: "teacher",
    });

    const employee1 = await User.create({
      name: "Dev Bob",
      email: `bob_${timestamp}@nexuscorp.com`,
      userType: "student",
    });

    const employee2 = await User.create({
      name: "Marketer Carol",
      email: `carol_${timestamp}@nexuscorp.com`,
      userType: "student",
    });

    const competitorCeo = await User.create({
      name: "Competitor Boss",
      email: `rival_${timestamp}@competitor.com`,
      userType: "institution",
    });

    console.log("✓ Seeded corporate users successfully.");

    // 1. Create Companies
    console.log("\n1. Setting up Company Tenants...");
    const { institution: companyA } = await institutionService.createInstitution(
      ceo._id.toString(),
      {
        name: `Nexus Enterprises ${timestamp}`,
        institutionType: "company",
        description: "Enterprise software and cloud consulting.",
      }
    );

    const { institution: companyB } = await institutionService.createInstitution(
      competitorCeo._id.toString(),
      {
        name: `Rival Corp ${timestamp}`,
        institutionType: "company",
        description: "Competitor organization.",
      }
    );

    assert(companyA.institutionType === "company", "Company A institutionType should be 'company'");
    console.log(`✓ Created Company A (${companyA.name}) and Company B (${companyB.name}).`);

    // 2. Departments and Teams
    console.log("\n2. Testing Departments & Teams in Company A...");
    const engDept = await corporateService.createDepartment(companyA._id.toString(), {
      name: "Engineering",
      description: "Software engineering and platform architecture.",
      teams: ["Frontend", "Backend", "DevOps"],
    });

    const mktDept = await corporateService.createDepartment(companyA._id.toString(), {
      name: "Marketing & Growth",
      description: "Demand gen and brand marketing.",
      teams: ["Content", "Performance"],
    });

    assert(engDept.teams.length === 3, "Engineering department should have 3 teams");
    assert(engDept.teams.includes("Backend"), "Engineering should include Backend team");

    // Test duplicate department in same company
    let duplicateRejected = false;
    try {
      await corporateService.createDepartment(companyA._id.toString(), {
        name: "Engineering",
      });
    } catch (e: any) {
      duplicateRejected = e.statusCode === 409 || e.message.includes("already exists");
    }
    assert(duplicateRejected, "Duplicate department in same company should be rejected with 409");
    console.log("✓ Departments and teams created with unique tenant constraint.");

    // 3. Member Management with Corporate Fields (Department, Team, Title, Manager)
    console.log("\n3. Testing Employee Management with Corporate Roles...");
    // Add HR Manager as subadmin with create_programs, assign_training, manage_employees
    const hrMembership = await institutionService.addOrInviteMember(
      companyA._id.toString(),
      ceo._id.toString(),
      {
        email: hrManager.email,
        role: "subadmin",
        title: "People & L&D Manager",
        department: "Human Resources",
        permissions: ["create_programs", "assign_training", "manage_employees", "view_reports"],
      }
    );
    assert(hrMembership.role === "subadmin", "HR should be subadmin");

    // Add Trainer
    await institutionService.addOrInviteMember(companyA._id.toString(), ceo._id.toString(), {
      email: trainer.email,
      role: "trainer",
      title: "Senior Tech Instructor",
      department: "Engineering",
    });

    // Add Employee 1 (Bob) with department, team, managerId
    const bobMembership = await institutionService.addOrInviteMember(
      companyA._id.toString(),
      hrManager._id.toString(),
      {
        email: employee1.email,
        role: "trainee",
        title: "Frontend Engineer",
        department: "Engineering",
        team: "Frontend",
        managerId: hrManager._id.toString(),
        onboardingStatus: "not_started",
      }
    );
    assert(bobMembership.department === "Engineering", "Bob department should be Engineering");
    assert(bobMembership.team === "Frontend", "Bob team should be Frontend");
    assert(bobMembership.onboardingStatus === "not_started", "Bob onboardingStatus should be not_started");

    // Add Employee 2 (Carol)
    await institutionService.addOrInviteMember(
      companyA._id.toString(),
      hrManager._id.toString(),
      {
        email: employee2.email,
        role: "trainee",
        title: "Growth Associate",
        department: "Marketing & Growth",
        team: "Performance",
        managerId: hrManager._id.toString(),
        onboardingStatus: "not_started",
      }
    );
    console.log("✓ Employees added with Department, Team, Title, and Manager references.");

    // 4. Cross-Tenant Isolation
    console.log("\n4. Testing Tenant Isolation between Company A and Company B...");
    const compBDepts = await corporateService.getDepartments(companyB._id.toString());
    assert(compBDepts.length === 0, "Company B must have 0 departments isolated from Company A");

    // Rival CEO attempts to access Company A members
    let rivalBlocked = false;
    try {
      await institutionService.getMemberById(
        companyA._id.toString(),
        bobMembership._id.toString(),
        competitorCeo._id.toString()
      );
    } catch (e: any) {
      rivalBlocked = e.statusCode === 403;
    }
    assert(rivalBlocked, "Competitor CEO must be blocked (403) from accessing Company A employee");
    console.log("✓ Cross-tenant access strictly blocked with 403 Forbidden.");

    // 5. Training Programs & Course Reuse
    console.log("\n5. Testing Training Program Creation with Existing Course Reuse...");
    // Create actual courses to link
    const course1 = await Course.create({
      title: `Company Onboarding: Culture & Tools ${timestamp}`,
      slug: `company-onboarding-${timestamp}`,
      description: "Standard onboarding orientation.",
      category: "Onboarding",
      level: "Beginner",
      language: "English",
      price: 0,
      currency: "USD",
      status: "published",
      provider: ceo._id,
      sections: [
        {
          title: "Introduction",
          order: 0,
          lessons: [
            {
              title: "Welcome & Security Best Practices",
              contentType: "article",
              articleContent: "Company policies and welcome notes.",
              order: 0,
            },
            {
              title: "Company Tooling",
              contentType: "article",
              articleContent: "Setup Slack, GitHub, and Jira.",
              order: 1,
            },
          ],
        },
      ],
      totalLessons: 2,
      totalDurationMinutes: 30,
      enrollmentCount: 0,
    });

    const course2 = await Course.create({
      title: `Engineering Standards & Code Quality ${timestamp}`,
      slug: `engineering-standards-${timestamp}`,
      description: "Code guidelines and deployment workflow.",
      category: "Technical",
      level: "Intermediate",
      language: "English",
      price: 0,
      currency: "USD",
      status: "published",
      provider: ceo._id,
      sections: [
        {
          title: "Architecture",
          order: 0,
          lessons: [
            {
              title: "Code Review Guide",
              contentType: "article",
              articleContent: "Code review standards.",
              order: 0,
            },
          ],
        },
      ],
      totalLessons: 1,
      totalDurationMinutes: 20,
      enrollmentCount: 0,
    });

    // Create Training Program with course1 & course2 assigned to Engineering department
    const onboardingProgram = await corporateService.createTrainingProgram(
      companyA._id.toString(),
      hrManager._id.toString(),
      {
        title: "Engineering New Hire Bootcamp",
        description: "Essential training required for new engineering staff.",
        category: "Onboarding",
        courses: [
          { courseId: course1._id.toString(), isRequired: true, order: 0 },
          { courseId: course2._id.toString(), isRequired: true, order: 1 },
        ],
        assignedEmployees: [employee1._id.toString()],
        assignedDepartments: ["Engineering"],
        dueDate: new Date(Date.now() + 7 * 86400000),
        estimatedDurationHours: 4,
      }
    );

    assert(onboardingProgram.courses.length === 2, "Program should contain 2 courses");
    assert(onboardingProgram.assignedEmployees.length >= 1, "Program should have assigned employees");
    console.log("✓ Training program created linking existing courses without data duplication.");

    // 6. Automated Course Enrollment Verification
    console.log("\n6. Verifying Auto-Provisioned Course Enrollments for Bob...");
    const bobEnrollmentCourse1 = await Enrollment.findOne({
      learner: employee1._id,
      course: course1._id,
    });
    const bobEnrollmentCourse2 = await Enrollment.findOne({
      learner: employee1._id,
      course: course2._id,
    });

    assert(Boolean(bobEnrollmentCourse1), "Bob must be automatically enrolled in course 1");
    assert(Boolean(bobEnrollmentCourse2), "Bob must be automatically enrolled in course 2");
    assert(bobEnrollmentCourse1?.paymentStatus === "waived", "Corporate enrollment should be 'waived'");
    assert(bobEnrollmentCourse1?.status === "active", "Enrollment should be active");
    console.log("✓ Existing Course and Enrollment models reused; Bob can immediately start learning.");

    // 7. Progress Tracking & Onboarding Completion
    console.log("\n7. Testing Progress Tracking & Onboarding Status Auto-Update...");
    // Check initial progress
    let bobProgress = await corporateService.getEmployeeTrainingProgress(
      companyA._id.toString(),
      employee1._id.toString()
    );
    assert(bobProgress.overallCompletionRate === 0, "Initial completion rate should be 0%");

    // Simulate Bob completing course 1
    bobEnrollmentCourse1!.progressPercentage = 100;
    bobEnrollmentCourse1!.status = "completed";
    await bobEnrollmentCourse1!.save();

    bobProgress = await corporateService.getEmployeeTrainingProgress(
      companyA._id.toString(),
      employee1._id.toString()
    );
    assert(bobProgress.overallCompletionRate === 50, "Completion rate after 1 course should be 50%");
    assert(bobProgress.employee.onboardingStatus === "in_progress", "Bob status should transition to 'in_progress'");

    // Simulate Bob completing course 2
    bobEnrollmentCourse2!.progressPercentage = 100;
    bobEnrollmentCourse2!.status = "completed";
    await bobEnrollmentCourse2!.save();

    bobProgress = await corporateService.getEmployeeTrainingProgress(
      companyA._id.toString(),
      employee1._id.toString()
    );
    assert(bobProgress.overallCompletionRate === 100, "Completion rate after all courses should be 100%");
    assert(bobProgress.employee.onboardingStatus === "completed", "Bob status should transition to 'completed'");
    console.log("✓ Progress computation verified; employee onboarding status auto-synced to 'completed'.");

    // 8. Corporate Dashboard Metrics Real Calculations
    console.log("\n8. Testing Corporate Dashboard Metrics Calculation...");
    const metrics = await corporateService.getCorporateDashboardMetrics(companyA._id.toString());
    assert(metrics.workforce.totalEmployees === 2, "Total employees should be 2");
    assert(metrics.workforce.totalManagers === 1, "Total managers should be 1");
    assert(metrics.workforce.totalTrainers === 1, "Total trainers should be 1");
    assert(metrics.workforce.totalDepartments === 2, "Total departments should be 2");
    assert(metrics.training.totalPrograms === 1, "Total programs should be 1");
    assert(metrics.onboarding.completed === 1, "1 employee completed onboarding (Bob)");
    assert(metrics.onboarding.completionRate === 50, "50% completion rate (1 of 2 employees)");
    assert(metrics.training.totalEnrollments >= 2, "Total enrollments should be >= 2");
    console.log("✓ Corporate Dashboard metrics computed from live database data.");

    // Clean up
    console.log("\nCleaning up test artifacts...");
    await TrainingProgram.deleteMany({ institutionId: { $in: [companyA._id, companyB._id] } });
    await Department.deleteMany({ institutionId: { $in: [companyA._id, companyB._id] } });
    await InstitutionMembership.deleteMany({ institutionId: { $in: [companyA._id, companyB._id] } });
    await Institution.deleteMany({ _id: { $in: [companyA._id, companyB._id] } });
    await Enrollment.deleteMany({ learner: { $in: [employee1._id, employee2._id] } });
    await Course.deleteMany({ _id: { $in: [course1._id, course2._id] } });
    await User.deleteMany({ _id: { $in: [ceo._id, hrManager._id, trainer._id, employee1._id, employee2._id, competitorCeo._id] } });
    console.log("✓ Test artifacts cleaned up.");

    console.log("\n========================================================");
    console.log("ALL 8 CORPORATE LEARNING & ONBOARDING TESTS PASSED!");
    console.log("========================================================");
  } finally {
    await mongoose.disconnect();
  }
}

runCorporateLearningTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
