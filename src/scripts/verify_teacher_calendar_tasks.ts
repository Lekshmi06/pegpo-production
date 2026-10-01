import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db";
import User from "../models/User";
import TeacherProfile from "../models/TeacherProfile";
import StudentProfile from "../models/StudentProfile";
import TeachingContext from "../models/TeachingContext";
import ClassSection from "../models/ClassSection";
import TeacherTask from "../models/TeacherTask";
import CalendarEvent from "../models/CalendarEvent";
import * as teacherTaskService from "../services/teacher_task_service";

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
  console.log("STARTING TEACHER CALENDAR + TASK FOUNDATION VERIFICATION");
  console.log("=======================================================\n");

  await connectDB();
  console.log("MongoDB connected successfully");

  const cleanupTasks: Array<() => Promise<void>> = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Test Fixtures: Two distinct teachers and class section
    // -------------------------------------------------------------------------
    const teacherUserA = await User.create({
      name: "Prof. Alan Turing",
      email: `alan.turing.${Date.now()}@edupye.com`,
      userType: "teacher",
    });
    const teacherProfileA = await TeacherProfile.create({
      userId: teacherUserA._id,
      name: "Prof. Alan Turing",
      teacherType: "institution",
      goal: "Mathematics & AI",
    });

    const teacherUserB = await User.create({
      name: "Dr. Ada Lovelace",
      email: `ada.lovelace.${Date.now()}@edupye.com`,
      userType: "teacher",
    });
    const teacherProfileB = await TeacherProfile.create({
      userId: teacherUserB._id,
      name: "Dr. Ada Lovelace",
      teacherType: "institution",
      goal: "Computer Science",
    });

    const classSectionA = await ClassSection.create({
      name: "Class 10 - A",
      classLevel: "Class 10",
      section: "A",
      board: "CBSE",
      academicYear: "2026-2027",
      type: "institution",
    });

    const contextA = await TeachingContext.create({
      teacherId: teacherProfileA._id,
      contextType: "institution",
      subject: "Mathematics",
      curriculumBoard: "CBSE",
      classLevel: "Class 10",
      section: "A",
      academicYear: "2026-2027",
      classSectionId: classSectionA._id,
    });

    const teacherProfileAId = teacherProfileA._id;
    const teacherProfileBId = teacherProfileB._id;
    const contextAId = contextA._id;
    const classSectionAId = classSectionA._id;
    const teacherUserAId = teacherUserA._id;
    const teacherUserBId = teacherUserB._id;

    cleanupTasks.push(async () => {
      await TeacherTask.deleteMany({ teacherId: { $in: [teacherProfileAId, teacherProfileBId] } });
      await TeachingContext.findByIdAndDelete(contextAId);
      await ClassSection.findByIdAndDelete(classSectionAId);
      await TeacherProfile.deleteMany({ _id: { $in: [teacherProfileAId, teacherProfileBId] } });
      await User.deleteMany({ _id: { $in: [teacherUserAId, teacherUserBId] } });
    });

    // -------------------------------------------------------------------------
    // 1. Task Creation & Persistence in DB
    // -------------------------------------------------------------------------
    const task1 = await teacherTaskService.createTask(teacherProfileA._id, {
      title: "Complete Chapter 3 Lesson Plan",
      description: "Prepare diagrams and practice exercises for coordinate geometry",
      date: "2026-09-28",
      startTime: "10:00 AM",
      endTime: "11:30 AM",
      taskType: "Lecture",
      priority: "High",
      status: "pending",
      teachingContextId: contextA._id as any,
      classSectionId: classSectionA._id as any,
    });

    const foundTask1 = await TeacherTask.findById(task1._id);
    record(
      1,
      "Task is saved persistently in the database",
      Boolean(foundTask1 && foundTask1.title === "Complete Chapter 3 Lesson Plan"),
      `Task ID: ${task1._id}, Title: ${foundTask1?.title}`
    );

    // -------------------------------------------------------------------------
    // 2. Task appears in teacher's task list (same source of truth)
    // -------------------------------------------------------------------------
    const allTasksA = await teacherTaskService.listTasks(teacherProfileA._id);
    const inTaskList = allTasksA.some((t) => t._id.toString() === task1._id.toString());
    record(
      2,
      "Task appears in Task List via listTasks query",
      inTaskList,
      `Total tasks for Teacher A: ${allTasksA.length}`
    );

    // -------------------------------------------------------------------------
    // 3. Task appears on the correct calendar date (2026-09-28)
    // -------------------------------------------------------------------------
    const tasksOnSep28 = await teacherTaskService.listTasks(teacherProfileA._id, { date: "2026-09-28" });
    const hasSep28Task = tasksOnSep28.some((t) => t.title === "Complete Chapter 3 Lesson Plan");
    record(
      3,
      "Task appears on its assigned calendar date (2026-09-28)",
      hasSep28Task,
      `Tasks on Sep 28: ${tasksOnSep28.length}`
    );

    // -------------------------------------------------------------------------
    // 4. Multiple tasks on the same date (Compact multi-task support)
    // -------------------------------------------------------------------------
    const task2 = await teacherTaskService.createTask(teacherProfileA._id, {
      title: "Department Faculty Sync",
      description: "Discuss quarterly syllabus coverage",
      date: "2026-09-28",
      startTime: "02:00 PM",
      endTime: "03:00 PM",
      taskType: "Meeting",
      priority: "Normal",
      status: "pending",
    });

    const task3 = await teacherTaskService.createTask(teacherProfileA._id, {
      title: "Grade 10-A Homework Submissions",
      description: "Check trigonometry problem sets",
      date: "2026-09-28",
      startTime: "04:00 PM",
      endTime: "05:00 PM",
      taskType: "Deadline",
      priority: "Urgent",
      status: "pending",
    });

    const updatedTasksOnSep28 = await teacherTaskService.listTasks(teacherProfileA._id, { date: "2026-09-28" });
    const countOnSep28 = updatedTasksOnSep28.length;
    record(
      4,
      "Multiple tasks exist on the same date without conflicts",
      countOnSep28 === 3,
      `Tasks on Sep 28: ${countOnSep28} (Titles: ${updatedTasksOnSep28.map((t) => t.title).join(", ")})`
    );

    // -------------------------------------------------------------------------
    // 5. Chronological Upcoming Tasks (limit ~3-4)
    // -------------------------------------------------------------------------
    // Add a fourth task in future
    const task4 = await teacherTaskService.createTask(teacherProfileA._id, {
      title: "Mid-term Exam Question Paper Review",
      date: "2026-09-30",
      startTime: "11:00 AM",
      taskType: "Operational",
      priority: "High",
    });

    // Add a fifth task further out
    const task5 = await teacherTaskService.createTask(teacherProfileA._id, {
      title: "Submit Term Grades to Office",
      date: "2026-10-05",
      taskType: "Deadline",
    });

    const upcomingTasks = await teacherTaskService.getUpcomingTasks(teacherProfileA._id, 4);
    const isSortedChronologically = upcomingTasks.every((item, idx) => {
      if (idx === 0) return true;
      const prev = upcomingTasks[idx - 1];
      return item.date >= prev.date;
    });

    record(
      5,
      "Upcoming tasks are limited to 4 and sorted chronologically",
      Boolean(upcomingTasks.length === 4 && isSortedChronologically),
      `Count: ${upcomingTasks.length}, First: ${upcomingTasks[0]?.title} (${upcomingTasks[0]?.date}), Last: ${upcomingTasks[3]?.title} (${upcomingTasks[3]?.date})`
    );

    // -------------------------------------------------------------------------
    // 6. Task Editing: updates both Task section & Calendar view
    // -------------------------------------------------------------------------
    const updatedTask1 = await teacherTaskService.updateTask(teacherProfileA._id, task1._id.toString(), {
      title: "Complete Chapter 3 Lesson Plan (Revised)",
      status: "completed",
      priority: "Urgent",
    });

    const verifiedUpdate = await TeacherTask.findById(task1._id);
    const updateSuccess =
      verifiedUpdate?.title === "Complete Chapter 3 Lesson Plan (Revised)" &&
      verifiedUpdate?.status === "completed" &&
      verifiedUpdate?.priority === "Urgent";

    record(
      6,
      "Edit task updates database and reflects in shared queries",
      Boolean(updateSuccess),
      `New Title: ${verifiedUpdate?.title}, Status: ${verifiedUpdate?.status}`
    );

    // -------------------------------------------------------------------------
    // 7. Task Deletion: removes from database, Task List, and Calendar
    // -------------------------------------------------------------------------
    const deleteSuccess = await teacherTaskService.deleteTask(teacherProfileA._id, task2._id.toString());
    const afterDelete = await TeacherTask.findById(task2._id);
    const tasksAfterDelete = await teacherTaskService.listTasks(teacherProfileA._id, { date: "2026-09-28" });

    record(
      7,
      "Delete task removes it from database and calendar date",
      Boolean(deleteSuccess && !afterDelete && tasksAfterDelete.length === 2),
      `Deleted ID: ${task2._id}, Remaining on Sep 28: ${tasksAfterDelete.length}`
    );

    // -------------------------------------------------------------------------
    // 8. Teacher Isolation: Teacher B cannot see or modify Teacher A's tasks
    // -------------------------------------------------------------------------
    // Teacher B creates their own task
    const taskB1 = await teacherTaskService.createTask(teacherProfileB._id, {
      title: "CS Lab Practical Exam Prep",
      date: "2026-09-28",
      taskType: "Lecture",
    });

    const teacherBTasks = await teacherTaskService.listTasks(teacherProfileB._id);
    const teacherASeesB = allTasksA.some((t) => t.title === "CS Lab Practical Exam Prep");
    const teacherBSeesA = teacherBTasks.some((t) => t.title.includes("Complete Chapter 3"));

    // Attempt unauthorized update by Teacher B on Teacher A's task
    const unauthorizedUpdate = await teacherTaskService.updateTask(
      teacherProfileB._id,
      task1._id.toString(),
      { title: "Hacked Title" }
    );

    // Attempt unauthorized delete by Teacher B on Teacher A's task
    const unauthorizedDelete = await teacherTaskService.deleteTask(
      teacherProfileB._id,
      task1._id.toString()
    );

    const task1Unchanged = await TeacherTask.findById(task1._id);

    record(
      8,
      "Teacher isolation: Tasks of Teacher A are private and protected from Teacher B",
      Boolean(!teacherASeesB && !teacherBSeesA && !unauthorizedUpdate && !unauthorizedDelete && task1Unchanged?.title.includes("Revised")),
      `Teacher A sees B: ${teacherASeesB}, Teacher B sees A: ${teacherBSeesA}, Unauthorized edit rejected: ${!unauthorizedUpdate}`
    );

    // -------------------------------------------------------------------------
    // 9. Association with ClassSection and TeachingContext
    // -------------------------------------------------------------------------
    const populatedTask = await teacherTaskService.getTaskById(teacherProfileA._id, task1._id.toString());
    const hasClassSectionPopulated =
      populatedTask &&
      typeof populatedTask.classSectionId === "object" &&
      (populatedTask.classSectionId as any)?.name === "Class 10 - A";

    record(
      9,
      "Optional association with ClassSection / TeachingContext populates correctly",
      Boolean(hasClassSectionPopulated),
      `ClassSection Name: ${(populatedTask?.classSectionId as any)?.name}`
    );

    // -------------------------------------------------------------------------
    // 10. Non-regression: Existing Student CalendarEvents and Student Profiles unaffected
    // -------------------------------------------------------------------------
    const studentUser = await User.create({
      name: "Student Tester",
      email: `student.test.${Date.now()}@edupye.com`,
      userType: "student",
    });
    const studentProfile = await StudentProfile.create({
      userId: studentUser._id,
      name: "Student Tester",
      studentType: "external",
    });

    const studentEvent = await CalendarEvent.create({
      userId: studentUser._id,
      studentProfileId: studentProfile._id,
      title: "Student Revision Session",
      date: "2026-09-28",
      eventType: "task",
    });

    const foundStudentEvent = await CalendarEvent.findById(studentEvent._id);
    const teacherTasksDoNotContainStudentEvents = (await teacherTaskService.listTasks(teacherProfileA._id)).every(
      (t) => t.title !== "Student Revision Session"
    );

    await CalendarEvent.findByIdAndDelete(studentEvent._id);
    await StudentProfile.findByIdAndDelete(studentProfile._id);
    await User.findByIdAndDelete(studentUser._id);

    record(
      10,
      "Non-regression: Student Module CalendarEvents and Profiles are unaffected",
      Boolean(foundStudentEvent && teacherTasksDoNotContainStudentEvents),
      `Student event title: ${foundStudentEvent?.title}, Isolated from teacher tasks: true`
    );

  } catch (err: any) {
    console.error("Verification failed with unhandled error:", err);
  } finally {
    console.log("\nCleaning up test artifacts...");
    for (const cleanup of cleanupTasks) {
      try {
        await cleanup();
      } catch (e) {
        // ignore
      }
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  console.log("\n=======================================================");
  console.log(`VERIFICATION COMPLETED: ${passedCount} / ${totalCount} PASSED`);
  console.log("=======================================================\n");

  if (passedCount === totalCount && totalCount > 0) {
    console.log("ALL TEACHER CALENDAR + TASK FOUNDATION TESTS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    console.error("SOME TESTS FAILED!\n");
    process.exit(1);
  }
}

runVerification();
