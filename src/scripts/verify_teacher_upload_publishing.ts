import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import connectDB from "../config/db";
import User from "../models/User";
import TeacherProfile from "../models/TeacherProfile";
import StudentProfile from "../models/StudentProfile";
import ClassSection from "../models/ClassSection";
import TeacherMaterial from "../models/TeacherMaterial";
import { TeacherMaterialService } from "../services/teacher_material_service";

interface TestStepResult {
  step: number;
  description: string;
  passed: boolean;
  details?: string;
}

const results: TestStepResult[] = [];

function record(step: number, description: string, passed: boolean, details?: string) {
  results.push({ step, description, passed, details });
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} Step ${step}: ${description}${details ? ` -> ${details}` : ""}`);
}

async function runVerification() {
  console.log("\n=======================================================");
  console.log("STARTING TEACHER UPLOAD & PUBLISHING VERIFICATION");
  console.log("=======================================================\n");

  await connectDB();
  console.log("MongoDB connected successfully\n");

  const cleanupTasks: Array<() => Promise<void>> = [];

  try {
    // 1. Create Teacher fixture
    const teacherUser = await User.create({
      name: "Dr. Richard Feynman",
      email: `richard.feynman.${Date.now()}@edupye.com`,
      userType: "teacher",
    });
    const teacherProfile = await TeacherProfile.create({
      userId: teacherUser._id,
      name: "Dr. Richard Feynman",
      teacherType: "institution",
      department: "Physics",
      subjects: ["Physics", "Quantum Mechanics"],
      classesTaught: ["Class 11", "Class 12"],
    });

    cleanupTasks.push(async () => {
      await TeacherProfile.findByIdAndDelete(teacherProfile._id);
      await User.findByIdAndDelete(teacherUser._id);
    });

    // 2. Create Student fixture
    const studentUser = await User.create({
      name: "Marie Curie",
      email: `marie.curie.${Date.now()}@edupye.com`,
      userType: "student",
    });
    const studentProfile = await StudentProfile.create({
      userId: studentUser._id,
      name: "Marie Curie",
      schoolDetails: {
        schoolName: "Delhi Public School",
        board: "CBSE",
        classLevel: "Class 11",
        selectedSubject: "Physics",
      },
    });

    cleanupTasks.push(async () => {
      await StudentProfile.findByIdAndDelete(studentProfile._id);
      await User.findByIdAndDelete(studentUser._id);
    });

    // 3. Create dummy file for upload test
    const dummyUploadDir = path.resolve("uploads", "test_materials");
    fs.mkdirSync(dummyUploadDir, { recursive: true });
    const dummyFilePath = path.join(dummyUploadDir, `test_notes_${Date.now()}.txt`);
    fs.writeFileSync(
      dummyFilePath,
      "Title: Electromagnetism & Maxwell Equations.\nChapter Summary: In depth breakdown of Gauss's Law, Faraday's Law and Ampere's Law."
    );

    const mockMulterFile: Express.Multer.File = {
      fieldname: "file",
      originalname: "Maxwell_Equations_Lecture_Notes.pdf",
      encoding: "7bit",
      mimetype: "application/pdf",
      size: 1024,
      destination: dummyUploadDir,
      filename: path.basename(dummyFilePath),
      path: dummyFilePath,
      buffer: Buffer.from(""),
      stream: null as any,
    };

    record(1, "Create teacher and student test fixtures", Boolean(teacherProfile._id && studentProfile._id));

    // 4. Test Material Creation as Draft
    const draftMaterial = await TeacherMaterialService.createMaterial(
      teacherProfile,
      mockMulterFile,
      {
        title: "Electromagnetism Lecture Slides & Notes",
        description: "Comprehensive notes for Class 11 Physics midterm",
        category: "slides",
        subject: "Physics",
        classLevel: "Class 11",
        targetAudience: "all",
        status: "draft",
        allowStudentDownload: true,
        allowAIChat: true,
      }
    );

    cleanupTasks.push(async () => {
      await TeacherMaterial.findByIdAndDelete(draftMaterial._id);
    });

    record(
      2,
      "Teacher uploads material and saves as draft",
      Boolean(draftMaterial._id && draftMaterial.status === "draft" && draftMaterial.publishedAt === null),
      `Status: ${draftMaterial.status}`
    );

    // 5. Test Teacher Listing
    const teacherMaterials = await TeacherMaterialService.getTeacherMaterials(teacherProfile._id);
    record(
      3,
      "Teacher can view uploaded materials",
      Boolean(teacherMaterials.length >= 1 && teacherMaterials[0].title === draftMaterial.title),
      `Found ${teacherMaterials.length} materials for teacher`
    );

    // 6. Test Student Isolation (Drafts must NOT be visible to student)
    const initialStudentMaterials = await TeacherMaterialService.getPublishedMaterialsForStudents(
      { subject: "Physics" },
      studentProfile
    );
    const draftFoundByStudent = initialStudentMaterials.some(
      (m) => m._id.toString() === draftMaterial._id.toString()
    );
    record(
      4,
      "Student cannot see teacher drafts (Strict publishing privacy)",
      !draftFoundByStudent,
      `Draft is correctly hidden from students`
    );

    // 7. Teacher Publishes Material to Students
    const publishedMaterial = await TeacherMaterialService.setPublishStatus(
      draftMaterial._id.toString(),
      teacherProfile._id,
      "published",
      "all"
    );

    record(
      5,
      "Teacher publishes material to students",
      Boolean(publishedMaterial && publishedMaterial.status === "published" && publishedMaterial.publishedAt),
      `Published at: ${publishedMaterial?.publishedAt}`
    );

    // 8. Student Now Sees Published Material
    const updatedStudentMaterials = await TeacherMaterialService.getPublishedMaterialsForStudents(
      { subject: "Physics" },
      studentProfile
    );
    const publishedFoundByStudent = updatedStudentMaterials.some(
      (m) => m._id.toString() === draftMaterial._id.toString()
    );
    record(
      6,
      "Student can now access published teacher material",
      publishedFoundByStudent,
      `Found published material in student library`
    );

    // 9. Student Records Download Count
    await TeacherMaterialService.recordDownload(draftMaterial._id.toString());
    const materialAfterDownload = await TeacherMaterial.findById(draftMaterial._id);
    record(
      7,
      "Download counter increments when accessed",
      Boolean(materialAfterDownload && materialAfterDownload.downloadsCount === 1),
      `Downloads: ${materialAfterDownload?.downloadsCount}`
    );

    // 10. Teacher Unpublishes Material back to Draft
    const unpublishedMaterial = await TeacherMaterialService.setPublishStatus(
      draftMaterial._id.toString(),
      teacherProfile._id,
      "draft"
    );

    const materialsAfterUnpublish = await TeacherMaterialService.getPublishedMaterialsForStudents(
      { subject: "Physics" },
      studentProfile
    );
    const unpublishHidden = !materialsAfterUnpublish.some(
      (m) => m._id.toString() === draftMaterial._id.toString()
    );

    record(
      8,
      "Teacher unpublishes material, instantly hiding it from students",
      Boolean(unpublishedMaterial?.status === "draft" && unpublishHidden),
      `Successfully reverted to draft`
    );

    // Clean up test file
    if (fs.existsSync(dummyFilePath)) {
      fs.unlinkSync(dummyFilePath);
    }
  } catch (err) {
    console.error("Verification failed with exception:", err);
  } finally {
    console.log("\nExecuting cleanup tasks...");
    for (const task of cleanupTasks) {
      try {
        await task();
      } catch (e) {
        console.warn("Cleanup error:", e);
      }
    }
    await mongoose.disconnect();
    console.log("MongoDB disconnected.\n");

    const passedCount = results.filter((r) => r.passed).length;
    console.log("=======================================================");
    console.log(`VERIFICATION SUMMARY: ${passedCount} / ${results.length} PASSED`);
    console.log("=======================================================\n");

    if (passedCount !== results.length) {
      process.exit(1);
    }
  }
}

runVerification();
