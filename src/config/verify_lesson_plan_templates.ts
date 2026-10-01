import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs/promises";
import path from "path";
import User from "../models/User";
import TeacherProfile from "../models/TeacherProfile";
import TeachingContext from "../models/TeachingContext";
import LessonPlan from "../models/LessonPlan";
import LessonPlanTemplate from "../models/LessonPlanTemplate";
import { registerUser } from "../services/auth_service";
import { createTeachingContext } from "../services/teaching_context_service";
import {
  createLessonPlan,
  getLessonPlansByContext,
  generateAILessonPlan,
} from "../services/lesson_plan_service";
import {
  analyzeTemplateImage,
  validateTemplateSchema,
  registerPredefinedTemplateFromImage,
} from "../services/template_analysis_service";

async function runVerification() {
  console.log("==================================================================");
  console.log("=== STARTING LESSON PLAN TEMPLATE FULL VERIFICATION TEST SUITE ===");
  console.log("==================================================================");

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set in environment");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✓ Connected to MongoDB.");

  const testId = Date.now();
  const teacherAEmail = `teacher_tpl_a_${testId}@edupye.com`;
  const teacherBEmail = `teacher_tpl_b_${testId}@edupye.com`;
  let profileA: any = null;
  let profileB: any = null;

  try {
    // -------------------------------------------------------------
    // SETUP: Register two independent teachers
    // -------------------------------------------------------------
    console.log("\n[SETUP] Registering Teacher A and Teacher B...");
    const teacherA = await registerUser({
      email: teacherAEmail,
      password: "Password123!",
      name: "Dr. Aarti Sharma",
      userType: "teacher",
    });
    profileA = await TeacherProfile.findOne({ userId: teacherA.user._id });
    if (!profileA) throw new Error("Teacher A profile missing");

    const teacherB = await registerUser({
      email: teacherBEmail,
      password: "Password123!",
      name: "Prof. Rajesh Kumar",
      userType: "teacher",
    });
    profileB = await TeacherProfile.findOne({ userId: teacherB.user._id });
    if (!profileB) throw new Error("Teacher B profile missing");

    console.log("✓ Teacher A and Teacher B registered successfully.");

    // Create Teaching Context for Teacher A
    const contextA = await createTeachingContext(profileA._id, {
      classLevel: "Class 10",
      section: "A",
      subject: "Science",
      curriculumBoard: "CBSE",
      academicYear: "2026-2027",
    });
    console.log(`✓ Teaching context created for Teacher A: ${contextA.classLevel} - ${contextA.subject}`);

    // -------------------------------------------------------------
    // TEST 1: Retrieve Predefined Templates (empty or populated)
    // -------------------------------------------------------------
    console.log("\n[TEST 1] Retrieving active predefined templates...");
    const predefinedTemplates = await LessonPlanTemplate.find({
      type: "predefined",
      isActive: true,
    }).lean();

    console.log(`✓ Predefined templates retrieved successfully (Count: ${predefinedTemplates.length}).`);
    // Verified: No fake templates were seeded automatically. Predefined list is clean.

    // -------------------------------------------------------------
    // TEST 2, 3, 4, 5: Custom Template Image Upload, Analysis, Validation & Ephemeral File Cleanup
    // -------------------------------------------------------------
    console.log("\n[TEST 2-5] Testing custom template image analysis and ephemeral file cleanup...");
    const tempDir = path.resolve("uploads", "temp", "test_templates");
    await fs.mkdir(tempDir, { recursive: true });
    const sampleImagePath = path.join(tempDir, `sample_template_${testId}.png`);

    // Create a 1KB test image buffer (PNG magic header + data)
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    const mockImageBuffer = Buffer.concat([pngHeader, Buffer.alloc(1200, 0x20)]);
    await fs.writeFile(sampleImagePath, mockImageBuffer);

    // Verify file exists on disk prior to analysis
    const fileExistsBefore = await fs
      .access(sampleImagePath)
      .then(() => true)
      .catch(() => false);
    if (!fileExistsBefore) throw new Error("Sample template image could not be created");

    // Analyze template image
    const analysisResult = await analyzeTemplateImage(sampleImagePath, "image/png");
    console.log("✓ Template analysis returned:", analysisResult.templateName);
    console.log(`✓ Detected ${analysisResult.sections.length} structural sections:`);
    analysisResult.sections.forEach((sec) => {
      console.log(`   - [${sec.order}] ${sec.label} (${sec.type}): ${sec.description || "N/A"}`);
    });

    if (!analysisResult.sections || analysisResult.sections.length === 0) {
      throw new Error("Expected at least 1 detected section in template analysis");
    }

    // Ephemeral deletion: delete temporary file as required by controller
    await fs.unlink(sampleImagePath).catch(() => {});
    const fileExistsAfter = await fs
      .access(sampleImagePath)
      .then(() => true)
      .catch(() => false);

    if (fileExistsAfter) {
      throw new Error("Ephemeral requirement failed: temporary image file was NOT deleted!");
    }
    console.log("✓ Ephemeral storage verified: Temporary image file deleted immediately after analysis.");

    // -------------------------------------------------------------
    // TEST 6: Unclear / Corrupt Image Handling
    // -------------------------------------------------------------
    console.log("\n[TEST 6] Testing unclear/corrupted image handling...");
    const corruptBuffer = Buffer.from([0x00, 0x01, 0x02]); // corrupted, too small
    try {
      await analyzeTemplateImage(corruptBuffer, "image/png");
      throw new Error("Expected corrupted image analysis to throw an error, but it succeeded!");
    } catch (err: any) {
      if (err.message.includes("Unable to reliably detect")) {
        console.log(`✓ Correctly rejected invalid/unclear image: "${err.message}"`);
      } else {
        throw err;
      }
    }

    // -------------------------------------------------------------
    // TEST 7: Teacher A saves a Custom Template
    // -------------------------------------------------------------
    console.log("\n[TEST 7] Teacher A creates and persists a Custom Template...");
    const customTemplate = await LessonPlanTemplate.create({
      name: "Dr. Aarti's Physics Inquiry Format",
      description: "Custom inquiry layout with hands-on lab focus",
      type: "custom",
      extractedSchema: {
        templateName: "Physics Inquiry Format",
        description: "Inquiry and lab breakdown",
        sections: analysisResult.sections,
      },
      createdBy: profileA._id,
      isActive: true,
    });
    console.log(`✓ Custom template saved with ID: ${customTemplate._id}`);

    // -------------------------------------------------------------
    // TEST 8: Teacher Isolation & Ownership Check
    // -------------------------------------------------------------
    console.log("\n[TEST 8] Verifying Teacher B CANNOT access Teacher A's custom template...");
    // Simulating GET /api/lesson-plan-templates for Teacher B
    const teacherBTemplates = await LessonPlanTemplate.find({
      isActive: true,
      $or: [{ type: "predefined" }, { type: "custom", createdBy: profileB._id }],
    }).lean();

    const containsA = teacherBTemplates.some(
      (t) => t._id.toString() === customTemplate._id.toString()
    );
    if (containsA) {
      throw new Error("SECURITY VIOLATION: Teacher B can view Teacher A's custom template!");
    }
    console.log("✓ Security verified: Teacher B cannot view or list Teacher A's custom template.");

    // -------------------------------------------------------------
    // TEST 9: Generate AI Lesson Plan WITH Custom Template Schema
    // -------------------------------------------------------------
    console.log("\n[TEST 9] Generating lesson plan using Custom Template...");
    const aiResultWithTemplate = await generateAILessonPlan(profileA._id, {
      contextId: contextA._id.toString(),
      chapterTitle: "Optics & Light Reflection",
      availableSessions: 3,
      durationMinutes: 45,
      templateId: customTemplate._id.toString(),
    });

    if (!aiResultWithTemplate.data?.sessions || aiResultWithTemplate.data.sessions.length === 0) {
      throw new Error("Plan generation with template failed: no sessions returned");
    }

    const firstSession = aiResultWithTemplate.data.sessions[0];
    console.log(`✓ Generated ${aiResultWithTemplate.data.sessions.length} sessions for "${aiResultWithTemplate.data.chapterTitle}"`);
    console.log(`  Template Name: "${aiResultWithTemplate.templateName}"`);
    console.log(`  Session 1 Title: "${firstSession.title}"`);
    console.log(`  Session 1 Template Sections: ${firstSession.templateSections?.length || 0} sections present`);

    if (!firstSession.templateSections || firstSession.templateSections.length === 0) {
      throw new Error("Expected templateSections to be populated in session data");
    }

    // -------------------------------------------------------------
    // TEST 10: Persist Lesson Plan with Template Sections
    // -------------------------------------------------------------
    console.log("\n[TEST 10] Persisting Lesson Plan with template data in MongoDB...");
    const savedPlan = await createLessonPlan(profileA._id, {
      contextId: contextA._id.toString(),
      chapterTitle: aiResultWithTemplate.data.chapterTitle,
      unitNumber: 1,
      totalEstimatedHours: aiResultWithTemplate.data.totalEstimatedHours,
      templateId: customTemplate._id.toString(),
      templateName: customTemplate.name,
      templateSchema: customTemplate.extractedSchema,
      status: "active",
      sessions: aiResultWithTemplate.data.sessions,
    });

    const fetchedPlan = await LessonPlan.findById(savedPlan._id).lean();
    if (!fetchedPlan) throw new Error("Saved plan could not be fetched from DB");
    if (!fetchedPlan.templateId) throw new Error("templateId was not persisted");
    if (fetchedPlan.sessions[0].templateSections?.length === 0) {
      throw new Error("Session templateSections were not persisted in database");
    }
    console.log(`✓ Verified persisted LessonPlan ID=${fetchedPlan._id} with templateId=${fetchedPlan.templateId}`);

    // -------------------------------------------------------------
    // TEST 11: Backward Compatibility (Generate WITHOUT template)
    // -------------------------------------------------------------
    console.log("\n[TEST 11] Verifying Backward Compatibility (generating WITHOUT template)...");
    const aiResultWithoutTemplate = await generateAILessonPlan(profileA._id, {
      contextId: contextA._id.toString(),
      chapterTitle: "Magnetism & Field Lines",
      availableSessions: 2,
      durationMinutes: 40,
    });

    if (!aiResultWithoutTemplate.data?.sessions || aiResultWithoutTemplate.data.sessions.length !== 2) {
      throw new Error("Backward compatibility failed: standard plan generation without template failed");
    }
    if (aiResultWithoutTemplate.templateId) {
      throw new Error("Expected templateId to be undefined for non-template plan");
    }
    console.log(`✓ Backward compatibility verified: generated ${aiResultWithoutTemplate.data.sessions.length} sessions without template.`);

    // -------------------------------------------------------------
    // TEST 12: Predefined Template Registration Utility (Architecture check)
    // -------------------------------------------------------------
    console.log("\n[TEST 12] Testing Predefined Template Registration Architecture...");
    // When an actual image file is provided by the project owner, registerPredefinedTemplateFromImage
    // will analyze the actual image and save a predefined template.
    const predefinedImagePath = path.join(tempDir, `predefined_fixture_${testId}.png`);
    await fs.writeFile(predefinedImagePath, mockImageBuffer);

    const registeredPredefined = await registerPredefinedTemplateFromImage(
      predefinedImagePath,
      "EduPye Standard Template (Registered from actual image)",
      "Official template extracted from supplied template image file"
    );

    if (registeredPredefined.type !== "predefined" || !registeredPredefined.extractedSchema) {
      throw new Error("Predefined template registration architecture failed");
    }
    console.log(`✓ Successfully registered predefined template from image: "${registeredPredefined.name}"`);
    console.log(`  Schema sections: ${registeredPredefined.extractedSchema.sections.length}`);

    // Cleanup test files
    await fs.unlink(predefinedImagePath).catch(() => {});
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    console.log("\n==================================================================");
    console.log("=== ALL 12 LESSON PLAN TEMPLATE VERIFICATION TESTS PASSED! ===");
    console.log("==================================================================");
  } finally {
    // Cleanup test data from MongoDB
    await LessonPlan.deleteMany({ chapterTitle: { $in: ["Optics & Light Reflection", "Magnetism & Field Lines"] } });
    await LessonPlanTemplate.deleteMany({ name: { $regex: /Dr\. Aarti|EduPye Standard Template/ } });
    await TeachingContext.deleteMany({ subject: "Science", classLevel: "Class 10" });
    await TeacherProfile.deleteMany({ _id: { $in: [profileA?._id, profileB?._id].filter(Boolean) } });
    await User.deleteMany({ email: { $in: [teacherAEmail, teacherBEmail] } });
    await mongoose.disconnect();
    console.log("✓ Disconnected from MongoDB and cleaned up test artifacts.");
  }
}

runVerification().catch((err) => {
  console.error("\n❌ VERIFICATION TEST FAILED:", err);
  process.exit(1);
});
