import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User";
import TeacherProfile from "../models/TeacherProfile";
import TeachingContext from "../models/TeachingContext";
import LessonPlan from "../models/LessonPlan";
import { registerUser } from "../services/auth_service";
import {
  createTeachingContext,
  getTeachingContextsByTeacher,
  getTeachingContextById,
  updateTeachingContext,
} from "../services/teaching_context_service";
import {
  createLessonPlan,
  getLessonPlansByContext,
  updateLessonSessionStatus,
  generateAILessonPlan,
} from "../services/lesson_plan_service";

async function runVerification() {
  console.log("=== STARTING TEACHING CONTEXT & LESSON PLANNER INTEGRATION TESTS ===");
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log("Connected to MongoDB.");

  const teacherAEmail = `teacher_a_${Date.now()}@edupye.com`;
  const teacherBEmail = `teacher_b_${Date.now()}@edupye.com`;

  try {
    // -------------------------------------------------------------
    // SETUP: Register two teachers
    // -------------------------------------------------------------
    console.log("\n[SETUP] Registering Teacher A and Teacher B...");
    const teacherA = await registerUser({
      email: teacherAEmail,
      password: "Password123!",
      name: "Dr. Alok Verma",
      userType: "teacher",
    });
    const profileA = await TeacherProfile.findOne({ userId: teacherA.user._id });
    if (!profileA) throw new Error("Teacher A profile missing");

    const teacherB = await registerUser({
      email: teacherBEmail,
      password: "Password123!",
      name: "Ms. Neha Gupta",
      userType: "teacher",
    });
    const profileB = await TeacherProfile.findOne({ userId: teacherB.user._id });
    if (!profileB) throw new Error("Teacher B profile missing");

    console.log("✓ Teacher A and Teacher B registered.");

    // -------------------------------------------------------------
    // TEST 1 & 2: Teacher A creates multiple TeachingContexts
    // -------------------------------------------------------------
    console.log("\n[TEST 1 & 2] Teacher A creates multiple contexts (Class 10 A Physics and Class 10 B Physics)...");
    const context10A = await createTeachingContext(profileA._id, {
      classLevel: "Class 10",
      section: "A",
      subject: "Physics",
      curriculumBoard: "CBSE",
      academicYear: "2026-2027",
    });

    const context10B = await createTeachingContext(profileA._id, {
      classLevel: "Class 10",
      section: "B",
      subject: "Physics",
      curriculumBoard: "CBSE",
      academicYear: "2026-2027",
    });

    const context11Chem = await createTeachingContext(profileA._id, {
      classLevel: "Class 11",
      section: "Morning",
      subject: "Chemistry",
      curriculumBoard: "CBSE",
      academicYear: "2026-2027",
    });

    const teacherAContexts = await getTeachingContextsByTeacher(profileA._id);
    if (teacherAContexts.length !== 3) {
      throw new Error(`Expected 3 contexts for Teacher A, got ${teacherAContexts.length}`);
    }
    console.log(`✓ Teacher A successfully created 3 distinct teaching contexts.`);

    // -------------------------------------------------------------
    // TEST 3: Distinct Contexts with same classLevel & subject
    // -------------------------------------------------------------
    console.log("\n[TEST 3] Verifying Class 10 A and Class 10 B exist as independent contexts...");
    if (context10A._id.toString() === context10B._id.toString()) {
      throw new Error("Class 10A and 10B have identical IDs!");
    }
    if (context10A.section !== "A" || context10B.section !== "B") {
      throw new Error("Sections not assigned correctly");
    }
    console.log(`✓ Verified independent contexts: ID_10A=${context10A._id}, ID_10B=${context10B._id}`);

    // -------------------------------------------------------------
    // TEST 4: LessonPlans isolated by TeachingContext
    // -------------------------------------------------------------
    console.log("\n[TEST 4] Creating LessonPlans isolated by TeachingContext...");
    const plan10A = await createLessonPlan(profileA._id, {
      contextId: context10A._id.toString(),
      chapterTitle: "Light: Reflection & Refraction",
      unitNumber: 1,
      totalEstimatedHours: 4,
      sessions: [
        {
          sessionNumber: 1,
          title: "Introduction to Spherical Mirrors",
          durationMinutes: 45,
          learningObjectives: ["Understand focal length and center of curvature"],
          teachingMethod: "Interactive Smartboard",
          keyConcepts: ["Reflection", "Mirrors"],
          status: "planned",
        },
        {
          sessionNumber: 2,
          title: "Ray Diagrams for Concave Mirrors",
          durationMinutes: 45,
          learningObjectives: ["Draw ray diagrams for real images"],
          teachingMethod: "Problem Solving",
          keyConcepts: ["Ray Diagrams", "Focal Point"],
          status: "planned",
        },
      ],
    });

    const plan10B = await createLessonPlan(profileA._id, {
      contextId: context10B._id.toString(),
      chapterTitle: "Light: Reflection & Refraction",
      unitNumber: 1,
      totalEstimatedHours: 4,
      sessions: [
        {
          sessionNumber: 1,
          title: "Introduction to Spherical Mirrors",
          durationMinutes: 45,
          learningObjectives: ["Understand focal length and center of curvature"],
          teachingMethod: "Interactive Smartboard",
          keyConcepts: ["Reflection", "Mirrors"],
          status: "planned",
        },
        {
          sessionNumber: 2,
          title: "Ray Diagrams for Concave Mirrors",
          durationMinutes: 45,
          learningObjectives: ["Draw ray diagrams for real images"],
          teachingMethod: "Problem Solving",
          keyConcepts: ["Ray Diagrams", "Focal Point"],
          status: "planned",
        },
      ],
    });

    const plansFor10A = await getLessonPlansByContext(context10A._id.toString(), profileA._id);
    const plansFor10B = await getLessonPlansByContext(context10B._id.toString(), profileA._id);

    if (plansFor10A.length !== 1 || plansFor10B.length !== 1) {
      throw new Error("Lesson plans not filtered correctly by context!");
    }
    console.log("✓ Verified 10A and 10B have their own isolated lesson plans.");

    // -------------------------------------------------------------
    // TEST 5: Updating Class 10A progress does NOT affect Class 10B
    // -------------------------------------------------------------
    console.log("\n[TEST 5] Updating Session 1 in Class 10A to 'completed'...");
    await updateLessonSessionStatus(plan10A._id.toString(), profileA._id, 1, "completed", "Class 10A finished mirrors topic smoothly.");

    const updatedPlan10A = await LessonPlan.findById(plan10A._id);
    const untouchedPlan10B = await LessonPlan.findById(plan10B._id);

    const session1In10A = updatedPlan10A?.sessions.find((s) => s.sessionNumber === 1);
    const session1In10B = untouchedPlan10B?.sessions.find((s) => s.sessionNumber === 1);

    if (session1In10A?.status !== "completed") {
      throw new Error("Session 1 in 10A was not updated to completed!");
    }
    if (session1In10B?.status !== "planned") {
      throw new Error("FAILED: Session 1 in 10B was incorrectly mutated when 10A was updated!");
    }
    console.log("✓ Pacing isolation confirmed: Class 10A is on Session 2, while Class 10B remains on Session 1.");

    // -------------------------------------------------------------
    // TEST 6: Cross-Teacher Security & Authorization
    // -------------------------------------------------------------
    console.log("\n[TEST 6] Testing Cross-Teacher Authorization Security...");
    try {
      // Teacher B attempts to view Teacher A's context
      await getTeachingContextById(context10A._id.toString(), profileB._id);
      throw new Error("SECURITY BREACH: Teacher B was allowed to access Teacher A's TeachingContext!");
    } catch (err: any) {
      if (!err.message.includes("Unauthorized")) {
        throw err;
      }
      console.log("✓ Protected: Teacher B correctly denied access to Teacher A's TeachingContext.");
    }

    try {
      // Teacher B attempts to create a lesson plan inside Teacher A's context
      await createLessonPlan(profileB._id, {
        contextId: context10A._id.toString(),
        chapterTitle: "Hacked Chapter",
      });
      throw new Error("SECURITY BREACH: Teacher B was allowed to create a plan in Teacher A's context!");
    } catch (err: any) {
      if (!err.message.includes("Unauthorized")) {
        throw err;
      }
      console.log("✓ Protected: Teacher B correctly denied creating a plan in Teacher A's context.");
    }

    // -------------------------------------------------------------
    // TEST 7: AI Lesson Plan Generation
    // -------------------------------------------------------------
    console.log("\n[TEST 7] Testing AI Lesson Plan Generation...");
    const aiDraft = await generateAILessonPlan(profileA._id, {
      contextId: context10A._id.toString(),
      chapterTitle: "Electromagnetic Induction",
      availableSessions: 3,
      durationMinutes: 45,
    });

    if (!aiDraft.data || !aiDraft.data.sessions || aiDraft.data.sessions.length < 3) {
      throw new Error("AI draft generation did not produce structured sessions!");
    }
    console.log(`✓ AI generated structured plan with ${aiDraft.data.sessions.length} sessions for "Electromagnetic Induction".`);

    console.log("\n=======================================================");
    console.log(" ALL 7 TEACHING CONTEXT & LESSON PLANNER TESTS PASSED! ");
    console.log("=======================================================\n");
  } finally {
    // Cleanup test data
    await User.deleteMany({ email: { $in: [teacherAEmail, teacherBEmail] } });
    await TeacherProfile.deleteMany({ name: { $in: ["Dr. Alok Verma", "Ms. Neha Gupta"] } });
    await TeachingContext.deleteMany({
      subject: { $in: ["Physics", "Chemistry"] },
      academicYear: "2026-2027",
    });
    await LessonPlan.deleteMany({
      chapterTitle: { $in: ["Light: Reflection & Refraction", "Electromagnetic Induction"] },
    });
    await mongoose.disconnect();
    console.log("Cleaned up test data and disconnected from MongoDB.");
  }
}

runVerification().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
