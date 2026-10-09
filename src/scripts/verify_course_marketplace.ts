import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import User from "../models/User";
import Course from "../models/Course";
import Enrollment from "../models/Enrollment";
import { registerUser, loginUser } from "../services/auth_service";
import {
  createCourse,
  getProviderCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  togglePublishCourse,
  addCourseSection,
  addCourseLesson,
  getMarketplaceCourses,
} from "../services/course_service";
import {
  enrollInCourse,
  getLearnerEnrolledCourses,
  getLearnerCourseLearningState,
  updateLessonProgress,
  verifyLessonAccess,
} from "../services/enrollment_service";

async function runTests() {
  const uri = process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/edupye";
  await mongoose.connect(uri);
  console.log("Connected to MongoDB at:", uri);

  const suffix = Date.now();
  const providerAEmail = `provider.a.${suffix}@test.edupye.com`;
  const providerBEmail = `provider.b.${suffix}@test.edupye.com`;
  const learnerEmail = `learner.${suffix}@test.edupye.com`;

  try {
    // 1. Provider Registration & Login
    console.log("\n1. Testing Provider Registration & Login...");
    const provAReg = await registerUser({
      email: providerAEmail,
      password: "Password123!",
      name: "Provider Alice",
      userType: "provider",
    });
    if (provAReg.user.userType !== "provider") {
      throw new Error(`Expected userType 'provider', got: ${provAReg.user.userType}`);
    }
    console.log("✓ Provider Alice registered with userType 'provider'.");

    const provBReg = await registerUser({
      email: providerBEmail,
      password: "Password123!",
      name: "Provider Bob",
      userType: "provider",
    });
    console.log("✓ Provider Bob registered.");

    const provALogin = await loginUser({ email: providerAEmail, password: "Password123!" });
    if (provALogin.user.userType !== "provider") {
      throw new Error("Provider login failed to return provider role");
    }
    console.log("✓ Provider Alice logged in successfully.");

    // 2. Learner Registration & Login
    console.log("\n2. Testing Learner Registration & Login...");
    const learnerReg = await registerUser({
      email: learnerEmail,
      password: "Password123!",
      name: "Learner Charlie",
      userType: "learner",
    });
    if (learnerReg.user.userType !== "learner") {
      throw new Error(`Expected userType 'learner', got: ${learnerReg.user.userType}`);
    }
    console.log("✓ Learner Charlie registered with userType 'learner'.");

    const learnerLogin = await loginUser({ email: learnerEmail, password: "Password123!" });
    if (learnerLogin.user.userType !== "learner") {
      throw new Error("Learner login failed to return learner role");
    }
    console.log("✓ Learner Charlie logged in successfully.");

    // 3. Provider Creates Course (Draft by default)
    console.log("\n3. Testing Provider Alice Creates Course...");
    const courseA = await createCourse(provAReg.user as any, {
      title: "Mastering TypeScript & Modern Cloud",
      shortDescription: "From basics to enterprise full-stack development",
      description: "Comprehensive guide to TypeScript, Node.js, and cloud systems.",
      category: "Software Engineering",
      level: "Intermediate",
      price: 49.99,
      language: "English",
    });
    if (courseA.status !== "draft") throw new Error("New course should start in draft status");
    if (courseA.provider.toString() !== provAReg.user._id) throw new Error("Provider ID mismatch");
    console.log(`✓ Course created: "${courseA.title}" (ID: ${courseA._id}, status: ${courseA.status})`);

    // 4. Provider Edits Own Course
    console.log("\n4. Testing Provider Alice Edits Own Course...");
    const updatedCourseA = await updateCourse(courseA._id.toString(), provAReg.user._id, {
      price: 39.99,
      category: "Web Development",
    });
    if (updatedCourseA.price !== 39.99) throw new Error("Price update failed");
    console.log(`✓ Provider Alice successfully updated price to $${updatedCourseA.price}`);

    // 5. Provider B Attempts to Edit Provider A's Course -> MUST FAIL (403 Forbidden)
    console.log("\n5. Testing Security: Provider Bob attempts to edit Alice's course...");
    let bobBlocked = false;
    try {
      await updateCourse(courseA._id.toString(), provBReg.user._id, {
        title: "Hacked by Bob",
      });
    } catch (err: any) {
      if (err.message.includes("Forbidden") || err.message.includes("not own")) {
        bobBlocked = true;
      }
    }
    if (!bobBlocked) throw new Error("CRITICAL SECURITY FLAW: Bob was able to edit Alice's course!");
    console.log("✓ Access control enforced: Bob was blocked with Forbidden from modifying Alice's course.");

    // 6. Learner attempts to view unpublished course -> MUST FAIL (403 Access Denied)
    console.log("\n6. Testing Security: Learner Charlie attempts to view Alice's draft course...");
    let learnerBlockedDraft = false;
    try {
      await getCourseById(courseA._id.toString(), learnerReg.user._id);
    } catch (err: any) {
      if (err.message.includes("Access denied") || err.message.includes("not published")) {
        learnerBlockedDraft = true;
      }
    }
    if (!learnerBlockedDraft) throw new Error("Security flaw: Learner could view unpublished draft course!");
    console.log("✓ Access control enforced: Learner cannot view Alice's draft course.");

    // 7. Provider Builds Curriculum: Add Section & Lessons
    console.log("\n7. Testing Curriculum Building: Add Section & Lessons...");
    await addCourseSection(courseA._id.toString(), provAReg.user._id, "Module 1: Advanced Types", "Core type mechanics");
    const courseWithSec = await Course.findById(courseA._id);
    const sec1Id = courseWithSec!.sections[0]._id!.toString();

    await addCourseLesson(courseA._id.toString(), provAReg.user._id, sec1Id, {
      title: "Generics & Conditional Types",
      contentType: "video",
      durationMinutes: 25,
      videoUrl: "https://example.com/videos/generics.mp4",
      isPreviewFree: true,
    });

    await addCourseLesson(courseA._id.toString(), provAReg.user._id, sec1Id, {
      title: "Mapped Types & Utility Types Deep Dive",
      contentType: "article",
      durationMinutes: 15,
      articleContent: "Mapped types allow you to create new types based on existing ones.",
      isPreviewFree: false,
    });

    await addCourseSection(courseA._id.toString(), provAReg.user._id, "Module 2: Real-World Architecture", "Microservices & Serverless");
    const courseWith2Sec = await Course.findById(courseA._id);
    const sec2Id = courseWith2Sec!.sections[1]._id!.toString();

    await addCourseLesson(courseA._id.toString(), provAReg.user._id, sec2Id, {
      title: "Cloud Deployment Reference Guide",
      contentType: "document",
      durationMinutes: 20,
      resourceFileName: "deployment-checklist.pdf",
      resourceFileUrl: "/uploads/courses/checklist.pdf",
      isPreviewFree: false,
    });

    const refreshedA = await Course.findById(courseA._id);
    if (refreshedA!.sections.length !== 2) throw new Error("Expected 2 sections");
    if (refreshedA!.totalLessons !== 3) throw new Error(`Expected 3 total lessons, got ${refreshedA!.totalLessons}`);
    console.log(`✓ Curriculum built: ${refreshedA!.sections.length} sections, ${refreshedA!.totalLessons} lessons, ${refreshedA!.totalDurationMinutes} minutes.`);

    // 8. Provider Publishes Course
    console.log("\n8. Testing Course Publishing...");
    const publishedA = await togglePublishCourse(courseA._id.toString(), provAReg.user._id, "published");
    if (publishedA.status !== "published") throw new Error("Course should be published");
    console.log(`✓ Course "${publishedA.title}" successfully published at ${publishedA.publishedAt}`);

    // 9. Provider Dashboard Overview
    console.log("\n9. Testing Provider Dashboard Metrics...");
    const provDashboard = await getProviderCourses(provAReg.user._id);
    if (provDashboard.stats.publishedCourses !== 1) throw new Error("Expected 1 published course");
    console.log(`✓ Provider dashboard reports: Total: ${provDashboard.stats.totalCourses}, Published: ${provDashboard.stats.publishedCourses}, Draft: ${provDashboard.stats.draftCourses}`);

    // 10. Marketplace Search & Catalog
    console.log("\n10. Testing Marketplace Search & Filter...");
    const marketplaceAll = await getMarketplaceCourses({});
    if (marketplaceAll.courses.length === 0) throw new Error("Expected published courses in marketplace");
    console.log(`✓ Marketplace browse found ${marketplaceAll.total} course(s).`);

    const searchResult = await getMarketplaceCourses({ search: "TypeScript" });
    if (searchResult.courses.length === 0) throw new Error("Expected search result for 'TypeScript'");
    console.log(`✓ Search for 'TypeScript' matched ${searchResult.courses.length} course(s).`);

    // 11. Learner Enrolls in Course
    console.log("\n11. Testing Learner Enrollment...");
    const enrollRes1 = await enrollInCourse(learnerReg.user._id, courseA._id.toString());
    if (enrollRes1.alreadyEnrolled) throw new Error("Initial enrollment should not be alreadyEnrolled");
    console.log(`✓ Learner enrolled in course (payment status: ${enrollRes1.enrollment.paymentStatus}).`);

    // 12. Prevent Duplicate Enrollment
    console.log("\n12. Testing Duplicate Enrollment Prevention...");
    const enrollRes2 = await enrollInCourse(learnerReg.user._id, courseA._id.toString());
    if (!enrollRes2.alreadyEnrolled) throw new Error("Duplicate enrollment was not detected!");
    console.log("✓ Duplicate enrollment safely prevented and handled gracefully.");

    // 13. Learner Views My Courses
    console.log("\n13. Testing Learner My Courses...");
    const myCourses = await getLearnerEnrolledCourses(learnerReg.user._id);
    if (myCourses.enrollments.length === 0) throw new Error("Expected enrolled course in learner dashboard");
    console.log(`✓ Learner sees ${myCourses.enrollments.length} enrolled course(s).`);

    // 14. Learner Learning Flow & Progress Tracking
    console.log("\n14. Testing Learning Flow & Progress Tracking...");
    const lesson1Id = refreshedA!.sections[0].lessons[0]._id!.toString();
    const lesson2Id = refreshedA!.sections[0].lessons[1]._id!.toString();

    // Verify Lesson Access for enrolled learner
    const protectedAccess = await verifyLessonAccess(learnerReg.user._id, courseA._id.toString(), lesson2Id);
    if (protectedAccess.lesson.title !== "Mapped Types & Utility Types Deep Dive") {
      throw new Error("Failed to retrieve protected lesson content for enrolled learner");
    }
    console.log(`✓ Enrolled learner granted access to protected lesson: "${protectedAccess.lesson.title}".`);

    // Unenrolled random user attempts protected access -> MUST FAIL (403)
    let unenrolledBlocked = false;
    try {
      await verifyLessonAccess(provBReg.user._id, courseA._id.toString(), lesson2Id);
    } catch (err: any) {
      if (err.message.includes("Forbidden") || err.message.includes("must enroll")) {
        unenrolledBlocked = true;
      }
    }
    if (!unenrolledBlocked) throw new Error("Security flaw: Unenrolled user could access protected lesson!");
    console.log("✓ Unenrolled user successfully blocked from protected lesson content.");

    // Mark Lesson 1 Complete
    const progress1 = await updateLessonProgress(learnerReg.user._id, courseA._id.toString(), lesson1Id, true);
    console.log(`✓ Lesson 1 completed. Progress: ${progress1.enrollment.progressPercentage}%.`);

    // Mark Lesson 2 Complete
    const progress2 = await updateLessonProgress(learnerReg.user._id, courseA._id.toString(), lesson2Id, true);
    console.log(`✓ Lesson 2 completed. Progress: ${progress2.enrollment.progressPercentage}%.`);

    // Resume Learning State
    const learningState = await getLearnerCourseLearningState(learnerReg.user._id, courseA._id.toString());
    if (learningState.enrollment.completedLessons.length !== 2) throw new Error("Completed lessons count mismatch");
    console.log(`✓ Resumed course state verified. Enrolled learner has completed ${learningState.enrollment.completedLessons.length}/${learningState.course.totalLessons} lessons.`);

    console.log("\n========================================================");
    console.log("ALL COURSE MARKETPLACE BACKEND TESTS PASSED SUCCESSFULLY!");
    console.log("========================================================");
  } finally {
    // Clean up test data
    await User.deleteMany({ email: { $in: [providerAEmail, providerBEmail, learnerEmail] } });
    await Course.deleteMany({ providerName: { $in: ["Provider Alice", "Provider Bob"] } });
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
