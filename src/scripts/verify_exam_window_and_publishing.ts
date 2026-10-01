import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import Test from "../models/Test";
import Question from "../models/Question";
import TestAttempt from "../models/TestAttempt";
import StudentProfile from "../models/StudentProfile";
import TeacherProfile from "../models/TeacherProfile";
import ClassSection from "../models/ClassSection";
import User from "../models/User";
import {
  computeExamTimeWindow,
  listTests,
  startTestAttempt,
  submitTestAttempt,
  getAttemptAnalysis,
} from "../services/test_service";
import {
  saveAssessment,
  getAssessmentScheduledAttempts,
  publishAssessmentResults,
} from "../services/assessment_service";
import { enrollStudentInClass } from "../services/class_section_service";
import StudentMembership from "../models/StudentMembership";

async function runVerification() {
  console.log("=== STARTING EXAM WINDOW & RESULTS PUBLISHING VERIFICATION ===");
  await mongoose.connect(process.env.MONGODB_URI || "");
  console.log("Connected to MongoDB successfully.\n");

  const cleanupIds: {
    tests: mongoose.Types.ObjectId[];
    questions: mongoose.Types.ObjectId[];
    attempts: mongoose.Types.ObjectId[];
    users: mongoose.Types.ObjectId[];
    students: mongoose.Types.ObjectId[];
    teachers: mongoose.Types.ObjectId[];
    sections: mongoose.Types.ObjectId[];
  } = {
    tests: [],
    questions: [],
    attempts: [],
    users: [],
    students: [],
    teachers: [],
    sections: [],
  };

  try {
    // 1. Setup mock teacher, class, and student
    const teacherUser = (await User.create({
      email: `test_teacher_${Date.now()}@edupye.test`,
      userType: "teacher",
    })) as any;
    cleanupIds.users.push(teacherUser._id);

    const teacher = (await TeacherProfile.create({
      userId: teacherUser._id,
      name: "Prof. Examination",
      teacherType: "institution",
    })) as any;
    cleanupIds.teachers.push(teacher._id);

    const section = (await ClassSection.create({
      teacherProfileId: teacher._id,
      name: "Batch Alpha 10-A",
      classLevel: "Class 10",
      section: "A",
      board: "CBSE",
      academicYear: "2026-2027",
    } as any)) as any;
    cleanupIds.sections.push(section._id);

    const studentUser = (await User.create({
      email: `test_arnav_${Date.now()}@edupye.test`,
      userType: "student",
    })) as any;
    cleanupIds.users.push(studentUser._id);

    const student = (await StudentProfile.create({
      userId: studentUser._id,
      name: "Arnav TestStudent",
      enrolledClasses: [
        {
          classSectionId: section._id,
          enrolledAt: new Date(),
          status: "active",
        },
      ],
      education: { classLevel: "Class 10", board: "CBSE" },
    } as any)) as any;
    cleanupIds.students.push(student._id);

    await enrollStudentInClass({
      classSectionId: section._id,
      studentProfileId: student._id,
      rollNumber: "101",
    });

    console.log("✓ Step 1: Created Teacher, Section, and Enrolled Student (Arnav).");

    // 2. Test Time Window Computation (Upcoming, Active, Closed)
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Upcoming Window: 1 hour in the future
    const upcomingStart = new Date(now.getTime() + 60 * 60 * 1000);
    const upcomingEnd = new Date(now.getTime() + 120 * 60 * 1000);
    const upcomingWindow = computeExamTimeWindow({
      startDate: upcomingStart,
      endDate: upcomingEnd,
      scheduledDate: now,
    });
    if (upcomingWindow.status !== "upcoming") {
      throw new Error(`Expected upcoming status, got: ${upcomingWindow.status}`);
    }
    console.log("✓ Step 2a: Future exam accurately detected as 'upcoming'.");

    // Active Window: started 15 mins ago, ends in 45 mins
    const activeStart = new Date(now.getTime() - 15 * 60 * 1000);
    const activeEnd = new Date(now.getTime() + 45 * 60 * 1000);
    const activeWindow = computeExamTimeWindow({
      startDate: activeStart,
      endDate: activeEnd,
      scheduledDate: now,
    });
    if (activeWindow.status !== "active") {
      throw new Error(`Expected active status, got: ${activeWindow.status}`);
    }
    console.log("✓ Step 2b: In-session exam accurately detected as 'active'.");

    // Closed Window: ended 30 mins ago
    const closedStart = new Date(now.getTime() - 90 * 60 * 1000);
    const closedEnd = new Date(now.getTime() - 30 * 60 * 1000);
    const closedWindow = computeExamTimeWindow({
      startDate: closedStart,
      endDate: closedEnd,
      scheduledDate: now,
    });
    if (closedWindow.status !== "closed") {
      throw new Error(`Expected closed status, got: ${closedWindow.status}`);
    }
    console.log("✓ Step 2c: Past exam window accurately detected as 'closed'.");

    // 3. Create a scheduled test in DB
    const scheduledTest = await saveAssessment({
      title: "Class 10 Biology Unit Test",
      description: "Mandatory timed unit test for section 10-A",
      subject: "Science",
      board: "CBSE",
      classLevel: "Class 10",
      durationMinutes: 45,
      teacherProfileId: teacher._id.toString(),
      targetClassSectionIds: [section._id],
      status: "published",
      usages: {
        studyMaterial: false,
        practice: false,
        scheduledTest: true,
      },
      schedule: {
        scheduledDate: now,
        startDate: activeStart,
        endDate: activeEnd,
        startTime: "09:00",
        endTime: "10:00",
        targetGroups: [section._id],
      },
      resultsPublished: false,
      questions: [
        {
          question: "Which organelle is known as the powerhouse of the cell?",
          questionType: "mcq",
          marks: 2,
          options: [
            { id: "A", text: "Nucleus" },
            { id: "B", text: "Mitochondria" },
            { id: "C", text: "Ribosome" },
            { id: "D", text: "Golgi apparatus" },
          ],
          correctAnswer: "B",
          explanation: "Mitochondria generate most of the cell's ATP.",
        },
        {
          question: "Chlorophyll is primarily responsible for absorbing which light spectrum?",
          questionType: "mcq",
          marks: 2,
          options: [
            { id: "A", text: "Green" },
            { id: "B", text: "Blue and Red" },
            { id: "C", text: "Yellow" },
            { id: "D", text: "Infrared" },
          ],
          correctAnswer: "B",
          explanation: "Chlorophyll absorbs blue and red wavelengths while reflecting green.",
        },
      ],
    });
    cleanupIds.tests.push(scheduledTest._id);
    for (const q of scheduledTest.questions) {
      cleanupIds.questions.push(q as any);
    }
    console.log("✓ Step 3: Created and published scheduled test with 2 questions.");

    // 4. Verify listTests for the student
    const studentTestList = await listTests({
      studentProfileId: student._id.toString(),
      usage: "scheduledTest",
    });
    const foundTest = studentTestList.find((t) => t.id === scheduledTest._id.toString());
    if (!foundTest) {
      throw new Error("Student cannot see the enrolled scheduled test!");
    }
    if (foundTest.hasAttempted !== false) {
      throw new Error("Expected hasAttempted: false for unattempted exam");
    }
    if (foundTest.windowStatus !== "active") {
      throw new Error(`Expected windowStatus 'active', got: ${foundTest.windowStatus}`);
    }
    console.log("✓ Step 4: Student test catalog reflects active test with hasAttempted=false.");

    // 5. Start attempt as student
    const session = await startTestAttempt(
      scheduledTest._id.toString(),
      student._id.toString(),
      studentUser._id.toString(),
      "scheduled_test"
    );
    cleanupIds.attempts.push(new mongoose.Types.ObjectId(session.attemptId));
    console.log("✓ Step 5: Started test session:", session.attemptId);

    // 6. Submit attempt
    const submissionResult = await submitTestAttempt(
      scheduledTest._id.toString(),
      student._id.toString(),
      studentUser._id.toString(),
      {
        attemptId: session.attemptId,
        answers: {
          "0": "B",
          "1": "B",
        },
        timeSpentSeconds: 600,
        attemptMode: "scheduled_test",
      }
    );

    // Verify results are withheld immediately after student submission
    if (submissionResult.isResultPublished !== false) {
      throw new Error("Expected isResultPublished: false on student submission response!");
    }
    if ((submissionResult as any).score !== undefined) {
      throw new Error("Score was leaked to student before teacher published results!");
    }
    if ((submissionResult as any).questions !== undefined) {
      throw new Error("Questions and explanations leaked to student before publishing!");
    }
    console.log("✓ Step 6: Test submitted. Scores and explanations successfully withheld pending teacher review.");

    // 7. Verify student cannot attempt again!
    let blockedReAttempt = false;
    try {
      await startTestAttempt(
        scheduledTest._id.toString(),
        student._id.toString(),
        studentUser._id.toString(),
        "scheduled_test"
      );
    } catch (err: any) {
      blockedReAttempt = true;
      console.log(`✓ Step 7: Re-attempt blocked as expected: "${err.message}"`);
    }
    if (!blockedReAttempt) {
      throw new Error("CRITICAL: Student was able to start a second attempt on a completed scheduled test!");
    }

    // 8. Verify listTests now marks the exam as hasAttempted=true and isResultPublished=false
    const updatedTestList = await listTests({
      studentProfileId: student._id.toString(),
      usage: "scheduledTest",
    });
    const updatedTest = updatedTestList.find((t) => t.id === scheduledTest._id.toString());
    if (!updatedTest?.hasAttempted) {
      throw new Error("Expected test to be marked as hasAttempted=true!");
    }
    if (updatedTest.isResultPublished !== false) {
      throw new Error("Expected isResultPublished: false in test list!");
    }
    console.log("✓ Step 8: Student test catalog reflects Finished state with results pending.");

    // 9. Teacher views submissions in teacher dashboard
    const teacherData = await getAssessmentScheduledAttempts(scheduledTest._id.toString());
    if (teacherData.totalAttempts !== 1) {
      throw new Error(`Expected 1 submission in teacher data, got: ${teacherData.totalAttempts}`);
    }
    if (teacherData.attempts[0].score !== 4) {
      throw new Error(`Teacher should see actual student score (4), got: ${teacherData.attempts[0].score}`);
    }
    if (teacherData.resultsPublished !== false) {
      throw new Error("Teacher dashboard should show resultsPublished: false initially");
    }
    console.log("✓ Step 9: Teacher dashboard shows submission with student score 4/4 and resultsPublished=false.");

    // 10. Teacher publishes results!
    const publishRes = await publishAssessmentResults(scheduledTest._id.toString(), true);
    if (!publishRes.resultsPublished) {
      throw new Error("Failed to publish results!");
    }
    console.log("✓ Step 10: Teacher published results successfully.");

    // 11. Student can now fetch detailed analysis with scores, correct answers, and explanations!
    const publishedAnalysis = await getAttemptAnalysis(session.attemptId, student._id.toString());
    if (!publishedAnalysis.isResultPublished) {
      throw new Error("Expected isResultPublished: true on student analysis!");
    }
    if (publishedAnalysis.score !== 4) {
      throw new Error(`Expected score 4 on published analysis, got: ${publishedAnalysis.score}`);
    }
    if (!publishedAnalysis.questions || publishedAnalysis.questions.length !== 2) {
      throw new Error("Questions and explanations missing from published analysis!");
    }
    if (!publishedAnalysis.questions[0].explanation) {
      throw new Error("Explanation missing on published question!");
    }
    console.log("✓ Step 11: Student analysis now includes score, correct answers, and explanations!");

    // 12. Student catalog also reflects results available
    const postPublishList = await listTests({
      studentProfileId: student._id.toString(),
      usage: "scheduledTest",
    });
    const postPublishTest = postPublishList.find((t) => t.id === scheduledTest._id.toString());
    if (!postPublishTest?.isResultPublished) {
      throw new Error("Expected isResultPublished: true in student catalog after publishing!");
    }
    console.log("✓ Step 12: Student catalog reflects 'Results Available' state.");

    console.log("\n========================================================");
    console.log("🎉 ALL TESTS PASSED! EXAM WINDOWS, ATTEMPT BLOCKING, AND RESULT WITHHOLDING/PUBLISHING ARE VERIFIED.");
    console.log("========================================================\n");
  } finally {
    // Cleanup
    console.log("Cleaning up test documents...");
    await Question.deleteMany({ _id: { $in: cleanupIds.questions } });
    await TestAttempt.deleteMany({ _id: { $in: cleanupIds.attempts } });
    await Test.deleteMany({ _id: { $in: cleanupIds.tests } });
    await StudentProfile.deleteMany({ _id: { $in: cleanupIds.students } });
    await StudentMembership.deleteMany({ studentProfileId: { $in: cleanupIds.students } });
    await TeacherProfile.deleteMany({ _id: { $in: cleanupIds.teachers } });
    await ClassSection.deleteMany({ _id: { $in: cleanupIds.sections } });
    await User.deleteMany({ _id: { $in: cleanupIds.users } });
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
