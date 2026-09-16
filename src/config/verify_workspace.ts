import mongoose from "mongoose";
import dotenv from "dotenv";
import Note from "../models/Note";
import Folder from "../models/Folder";
import CalendarEvent from "../models/CalendarEvent";
import StudentProject from "../models/StudentProject";
import User from "../models/User";

dotenv.config();

async function runTest() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/edupye";
  console.log("Connecting to MongoDB for Workspace Model verification...");
  await mongoose.connect(mongoUri);

  try {
    // 1. Get or create test user
    let user = await User.findOne({ email: "test_workspace@edupye.com" });
    if (!user) {
      user = await User.create({
        email: "test_workspace@edupye.com",
        name: "Workspace Tester",
        userType: "student",
      });
    }

    // 2. Test Folder
    const folder = await Folder.create({
      userId: user._id,
      name: "Science Notes",
      title: "Science Notes",
      desc: "Physics and Chemistry notes folder",
      color: "#2563eb",
      category: "notes",
    });
    console.log("✓ Folder created:", folder.name, folder._id);

    // 3. Test Note
    const note = await Note.create({
      userId: user._id,
      folderId: folder._id,
      title: "Newton's Laws of Motion",
      content: "First Law: Inertia. Second Law: F=ma. Third Law: Action-Reaction.",
      preview: "First Law: Inertia. Second Law: F=ma.",
      tags: ["physics", "laws", "mechanics"],
      isPinned: true,
    });
    console.log("✓ Note created:", note.title, note._id);

    // 4. Test Calendar Event
    const event = await CalendarEvent.create({
      userId: user._id,
      title: "Physics Midterm Exam",
      description: "Chapters 1 to 5",
      eventType: "exam",
      date: new Date().toISOString().split("T")[0],
      startTime: "10:00",
      endTime: "12:00",
      color: "#ef4444",
      isCompleted: false,
    });
    console.log("✓ CalendarEvent created:", event.title, event._id);

    // 5. Test Student Project
    const project = await StudentProject.create({
      userId: user._id,
      name: "Solar Energy Demonstration",
      title: "Clean Energy Project",
      content: "Designing a miniature solar water heater model.",
      status: "in_progress",
      tags: ["solar", "renewable", "experiment"],
    });
    console.log("✓ StudentProject created:", project.name, project._id);

    // Clean up test items
    await Note.findByIdAndDelete(note._id);
    await Folder.findByIdAndDelete(folder._id);
    await CalendarEvent.findByIdAndDelete(event._id);
    await StudentProject.findByIdAndDelete(project._id);
    console.log("✓ Cleaned up test items successfully.");

    console.log("\nALL WORKSPACE MODEL CHECKS PASSED!");
  } finally {
    await mongoose.disconnect();
  }
}

runTest().catch((err) => {
  console.error("Workspace verification failed:", err);
  process.exit(1);
});
