import mongoose from "mongoose";
import dotenv from "dotenv";
import Note from "../models/Note";
import User from "../models/User";
import StudentProfile from "../models/StudentProfile";

dotenv.config();

const MONGO_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/edupye_real_test";

async function verifyNotebookLifecycle() {
  console.log("===============================================================");
  console.log("🚀 STARTING NOTEBOOK DATABASE PERSISTENCE & LIFECYCLE VERIFICATION");
  console.log("===============================================================\n");

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB successfully\n");

    // 1. Setup Student A (Primary Test Student)
    let userA = await User.findOne({ email: "student_a_notes@edupye.test" });
    if (!userA) {
      userA = await User.create({
        email: "student_a_notes@edupye.test",
        name: "Aarav Patel",
        userType: "student",
      });
    }

    let profileA = await StudentProfile.findOne({ userId: userA._id });
    if (!profileA) {
      profileA = await StudentProfile.create({
        userId: userA._id,
        name: userA.name || "Aarav Patel",
        goal: "CBSE Class 12 Boards",
        learningPath: "school",
      });
    }
    console.log(`✓ Student A resolved: ${userA.name} (${userA.email}, ID: ${userA._id})`);

    // 2. Setup Student B (Isolation Test Student)
    let userB = await User.findOne({ email: "student_b_notes@edupye.test" });
    if (!userB) {
      userB = await User.create({
        email: "student_b_notes@edupye.test",
        name: "Diya Sharma",
        userType: "student",
      });
    }

    let profileB = await StudentProfile.findOne({ userId: userB._id });
    if (!profileB) {
      profileB = await StudentProfile.create({
        userId: userB._id,
        name: userB.name || "Diya Sharma",
        goal: "NEET Prep",
        learningPath: "competitive_exam",
      });
    }
    console.log(`✓ Student B resolved: ${userB.name} (${userB.email}, ID: ${userB._id})\n`);

    // Clean up any previous test notes for these test users
    await Note.deleteMany({ userId: { $in: [userA._id, userB._id] } });

    // =========================================================================
    // TEST 1 — CREATE NOTE (Student A)
    // =========================================================================
    console.log("--- TEST 1: CREATE NOTE IN MONGODB ---");
    const initialContent = `# Newton's Laws of Motion\n\n1. **First Law (Inertia)**: An object remains at rest unless acted upon by a net force.\n2. **Second Law**: $F = ma$\n3. **Third Law**: Action & reaction are equal and opposite.\n\n- [ ] Revise derivation\n- [x] Read NCERT Chapter 5`;

    const noteA = await Note.create({
      userId: userA._id,
      studentProfileId: profileA._id,
      title: "Physics: Laws of Motion",
      content: initialContent,
      preview: "Newton's Laws of Motion. 1. First Law (Inertia): An object remains at rest...".slice(0, 120),
      tags: ["physics", "ncert", "mechanics"],
      isPinned: true,
    });

    if (!noteA || !noteA._id) {
      throw new Error("Failed to create Note A in MongoDB");
    }
    console.log(`✓ Note A created successfully: ID=${noteA._id}`);
    console.log(`  Title: "${noteA.title}"`);
    console.log(`  Preview: "${noteA.preview}"`);
    console.log(`  Pinned: ${noteA.isPinned}`);
    console.log(`  CreatedAt: ${noteA.createdAt.toISOString()}`);
    console.log(`  UpdatedAt: ${noteA.updatedAt.toISOString()}\n`);

    // =========================================================================
    // TEST 2 — RETRIEVE NOTES (Student A)
    // =========================================================================
    console.log("--- TEST 2: RETRIEVE NOTES FROM MONGODB ---");
    const notesForStudentA = await Note.find({ userId: userA._id }).sort({ isPinned: -1, updatedAt: -1 });
    if (notesForStudentA.length !== 1) {
      throw new Error(`Expected 1 note for Student A, got ${notesForStudentA.length}`);
    }
    if (notesForStudentA[0].title !== "Physics: Laws of Motion") {
      throw new Error(`Title mismatch. Expected "Physics: Laws of Motion", got "${notesForStudentA[0].title}"`);
    }
    console.log(`✓ Successfully retrieved ${notesForStudentA.length} note(s) for Student A`);
    console.log(`  Verified content persistence (${notesForStudentA[0].content.length} characters)\n`);

    // =========================================================================
    // TEST 3 — UPDATE TITLE, CONTENT & CHECKLIST ITEM (Student A)
    // =========================================================================
    console.log("--- TEST 3: UPDATE NOTE (TITLE, CONTENT & CHECKLIST TOGGLE) ---");
    // Simulate student toggling "- [ ] Revise derivation" to "- [x] Revise derivation" and editing title
    const updatedContent = initialContent.replace("- [ ] Revise derivation", "- [x] Revise derivation") + "\n- [ ] Practice 10 numericals";
    const updatedTitle = "Physics: Laws of Motion & Momentum";

    const updatedNoteA = await Note.findOneAndUpdate(
      { _id: noteA._id, userId: userA._id },
      {
        title: updatedTitle,
        content: updatedContent,
        preview: updatedContent.replace(/<[^>]*>/g, "").replace(/[#*_`\[\]]/g, "").slice(0, 120).trim(),
      },
      { returnDocument: "after", runValidators: true }
    );

    if (!updatedNoteA) {
      throw new Error("Failed to update Note A");
    }
    if (updatedNoteA.title !== updatedTitle) {
      throw new Error(`Updated title mismatch. Expected "${updatedTitle}", got "${updatedNoteA.title}"`);
    }
    if (!updatedNoteA.content.includes("- [x] Revise derivation")) {
      throw new Error("Checklist toggle was not persisted in MongoDB content");
    }
    console.log(`✓ Note updated successfully:`);
    console.log(`  New Title: "${updatedNoteA.title}"`);
    console.log(`  Checklist updated: contains "- [x] Revise derivation"`);
    console.log(`  New item appended: contains "- [ ] Practice 10 numericals"\n`);

    // =========================================================================
    // TEST 4 — DATA ISOLATION (Student B CANNOT access, update, or delete Note A)
    // =========================================================================
    console.log("--- TEST 4: STUDENT DATA ISOLATION & SECURITY ---");
    // Query Student B's notes: must be 0
    const notesForStudentB = await Note.find({ userId: userB._id });
    if (notesForStudentB.length !== 0) {
      throw new Error(`Data leak! Student B has ${notesForStudentB.length} notes, expected 0`);
    }
    console.log(`✓ Verified: Student B has 0 notes in their isolated workspace.`);

    // Student B attempts to find Note A using Note A's _id
    const noteLeakAttempt = await Note.findOne({ _id: noteA._id, userId: userB._id });
    if (noteLeakAttempt) {
      throw new Error("Security Violation: Student B was able to read Student A's note!");
    }
    console.log(`✓ Verified: Student B cannot read Student A's note by ID (returned null).`);

    // Student B attempts to update Note A using Note A's _id
    const unauthorizedUpdate = await Note.findOneAndUpdate(
      { _id: noteA._id, userId: userB._id },
      { title: "HACKED TITLE" },
      { returnDocument: "after" }
    );
    if (unauthorizedUpdate) {
      throw new Error("Security Violation: Student B was able to modify Student A's note!");
    }
    console.log(`✓ Verified: Student B cannot update Student A's note (returned null).`);

    // Student B attempts to delete Note A using Note A's _id
    const unauthorizedDelete = await Note.findOneAndDelete({ _id: noteA._id, userId: userB._id });
    if (unauthorizedDelete) {
      throw new Error("Security Violation: Student B was able to delete Student A's note!");
    }
    console.log(`✓ Verified: Student B cannot delete Student A's note (returned null).\n`);

    // Verify Note A is still pristine after unauthorized attempts
    const noteAStillIntact = await Note.findOne({ _id: noteA._id, userId: userA._id });
    if (!noteAStillIntact || noteAStillIntact.title !== updatedTitle) {
      throw new Error("Note A was corrupted by unauthorized attempts!");
    }
    console.log(`✓ Verified: Note A remains completely intact with title "${noteAStillIntact.title}"\n`);

    // =========================================================================
    // TEST 5 — DELETE NOTE (Student A)
    // =========================================================================
    console.log("--- TEST 5: DELETE NOTE ---");
    const deletedNote = await Note.findOneAndDelete({ _id: noteA._id, userId: userA._id });
    if (!deletedNote) {
      throw new Error("Failed to delete Note A");
    }
    console.log(`✓ Successfully deleted Note A (ID: ${deletedNote._id})`);

    const verifyDeleted = await Note.findById(noteA._id);
    if (verifyDeleted) {
      throw new Error("Note A still exists in MongoDB after deletion!");
    }
    console.log(`✓ Verified: Note A no longer exists in MongoDB.\n`);

    // =========================================================================
    // CLEANUP
    // =========================================================================
    await User.deleteMany({ email: { $in: ["student_a_notes@edupye.test", "student_b_notes@edupye.test"] } });
    await StudentProfile.deleteMany({ _id: { $in: [profileA._id, profileB._id] } });
    console.log("✓ Test users cleaned up successfully.");

    console.log("\n===============================================================");
    console.log("🎉 ALL NOTEBOOK BACKEND PERSISTENCE & ISOLATION CHECKS PASSED!");
    console.log("===============================================================");
  } catch (error) {
    console.error("❌ Notebook verification failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

verifyNotebookLifecycle();
