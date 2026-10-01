import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import User from "../models/User";
import ResearcherProfile from "../models/ResearcherProfile";
import ResearchProject from "../models/ResearchProject";
import ResearchTask from "../models/ResearchTask";
import ResearchPaper from "../models/ResearchPaper";
import ResearchNote from "../models/ResearchNote";
import Manuscript from "../models/Manuscript";
import { researchTaskService } from "../services/research_task_service";

async function runKanbanVerification() {
  console.log("=== STARTING RESEARCH KANBAN BOARD SYSTEM VERIFICATION ===");
  await mongoose.connect(process.env.MONGODB_URI!);

  const timestamp = Date.now();

  // Helper to create test user & researcher profile
  const makeResearcher = async (prefix: string) => {
    const user = await User.create({
      email: `${prefix}.${timestamp}@edupye.test`,
      name: `${prefix.toUpperCase()} Researcher`,
      userType: "researcher",
      password: "TestPassword123!",
    });
    const profile = await ResearcherProfile.create({
      userId: user._id,
      fullName: `${prefix.toUpperCase()} Researcher`,
      contact: { email: user.email },
      onboardingCompleted: true,
    });
    return { user, profile };
  };

  console.log("\n[Setup] Provisioning test researchers with collaborative roles...");
  const owner = await makeResearcher("owner");
  const coAuthor = await makeResearcher("coauthor");
  const contributor = await makeResearcher("contrib");
  const reviewer = await makeResearcher("reviewer");
  const viewer = await makeResearcher("viewer");
  const outsider = await makeResearcher("outsider");

  console.log("✓ All 6 test researchers initialized.");

  // Create Project A
  const projectA = await ResearchProject.create({
    title: "Iris Biometrics & Segmentation Study",
    ownerId: owner.profile._id,
    researchQuestion: "How robust is dynamic iris segmentation under noisy illumination?",
    status: "Active",
    currentStage: "Methodology",
    collaborators: [
      { researcherId: coAuthor.profile._id, role: "co_author", joinedAt: new Date() },
      { researcherId: contributor.profile._id, role: "contributor", joinedAt: new Date() },
      { researcherId: reviewer.profile._id, role: "reviewer", joinedAt: new Date() },
      { researcherId: viewer.profile._id, role: "viewer", joinedAt: new Date() },
    ],
  });

  // Create Project B (Private project for isolation test)
  const projectB = await ResearchProject.create({
    title: "Private Quantum Cryptography Project",
    ownerId: outsider.profile._id,
    researchQuestion: "Can post-quantum lattice keys withstand side-channel attacks?",
    status: "Active",
    collaborators: [],
  });

  // Create sample research artifacts to test linkages
  const testPaper = await ResearchPaper.create({
    title: "Deep Daugman Iris Segmentation Benchmark",
    authors: ["J. Daugman", "A. Researcher"],
    year: 2024,
    venue: "IEEE Trans Pattern Anal",
  });

  const testNote = await ResearchNote.create({
    ownerId: owner.profile._id,
    projectId: projectA._id,
    title: "Contrast normalization observation in iris pupil boundary",
    content: "Specular reflection must be masked before Hough circular transform.",
    noteType: "finding",
  });

  const testManuscript = await Manuscript.create({
    ownerId: owner.profile._id,
    projectId: projectA._id,
    title: "Iris Authentication Manuscript",
    status: "in_progress",
    citationStyle: "IEEE",
  });

  try {
    // ------------------------------------------------------------------------
    // CASE 1: Owner can create a task
    // ------------------------------------------------------------------------
    console.log("\n[Case 1] Verifying Owner can create a task with research linkages...");
    const ownerTask = await researchTaskService.createTask(
      projectA._id.toString(),
      owner.profile._id.toString(),
      {
        title: "Compare iris segmentation methodologies",
        description: "Benchmark Daugman integro-differential vs deep U-Net.",
        status: "todo",
        researchStage: "methodology",
        priority: "high",
        dueDate: new Date(Date.now() + 86400000 * 5),
        assigneeId: coAuthor.profile._id.toString(),
        paperIds: [testPaper._id.toString()],
        noteIds: [testNote._id.toString()],
        manuscriptId: testManuscript._id.toString(),
      }
    );

    if (!ownerTask || ownerTask.title !== "Compare iris segmentation methodologies") {
      throw new Error("Case 1 Failed: Task creation failed");
    }
    console.log("✓ PASS: Owner successfully created task with linked paper, note, and manuscript.");

    // ------------------------------------------------------------------------
    // CASE 2: Co-author can create, edit, and move a task
    // ------------------------------------------------------------------------
    console.log("\n[Case 2] Verifying Co-author can create/edit/move a task...");
    const coAuthorTask = await researchTaskService.createTask(
      projectA._id.toString(),
      coAuthor.profile._id.toString(),
      {
        title: "Dataset Acquisition: CASIA Iris V4",
        status: "backlog",
        researchStage: "data_collection",
        priority: "medium",
        assigneeId: contributor.profile._id.toString(),
      }
    );

    // Co-author edits task
    const editedByCoAuthor = await researchTaskService.updateTask(
      coAuthorTask._id.toString(),
      coAuthor.profile._id.toString(),
      { priority: "urgent", description: "Download and calibrate high-resolution NIR scans." }
    );
    if (editedByCoAuthor.priority !== "urgent") {
      throw new Error("Case 2 Failed: Co-author edit failed");
    }

    // Co-author moves task to in_progress
    const movedByCoAuthor = await researchTaskService.updateTaskStatus(
      coAuthorTask._id.toString(),
      coAuthor.profile._id.toString(),
      "in_progress"
    );
    if (movedByCoAuthor.status !== "in_progress") {
      throw new Error("Case 2 Failed: Co-author move failed");
    }
    console.log("✓ PASS: Co-author created, edited, and moved task between workflow stages.");

    // ------------------------------------------------------------------------
    // CASE 3: Contributor can create tasks and edit tasks they created or are assigned to
    // ------------------------------------------------------------------------
    console.log("\n[Case 3] Verifying Contributor can create/edit permitted tasks...");
    const contribTask = await researchTaskService.createTask(
      projectA._id.toString(),
      contributor.profile._id.toString(),
      {
        title: "Data augmentation pipeline script",
        status: "todo",
        researchStage: "experiment",
        priority: "medium",
      }
    );

    // Contributor edits task they created
    await researchTaskService.updateTask(
      contribTask._id.toString(),
      contributor.profile._id.toString(),
      { description: "Added rotational jitter and specular mask synthesis." }
    );

    // Contributor moves task assigned to them (coAuthorTask was assigned to contributor)
    await researchTaskService.updateTaskStatus(
      coAuthorTask._id.toString(),
      contributor.profile._id.toString(),
      "review"
    );

    // Contributor attempts to edit task created by and assigned to others (ownerTask)
    let contribUnauthorizedBlocked = false;
    try {
      await researchTaskService.updateTask(
        ownerTask._id.toString(),
        contributor.profile._id.toString(),
        { title: "Hijacked Title" }
      );
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) {
        contribUnauthorizedBlocked = true;
      }
    }
    if (!contribUnauthorizedBlocked) {
      throw new Error("Case 3 Failed: Contributor was able to edit an unassigned task created by another member!");
    }
    console.log("✓ PASS: Contributor permitted for own/assigned tasks; correctly blocked from modifying other tasks.");

    // ------------------------------------------------------------------------
    // CASE 4: Reviewer cannot modify tasks (read-only)
    // ------------------------------------------------------------------------
    console.log("\n[Case 4] Verifying Reviewer cannot modify tasks (read-only)...");
    let reviewerBlockedCreate = false;
    try {
      await researchTaskService.createTask(
        projectA._id.toString(),
        reviewer.profile._id.toString(),
        { title: "Reviewer Illegal Task" }
      );
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) reviewerBlockedCreate = true;
    }

    let reviewerBlockedMove = false;
    try {
      await researchTaskService.updateTaskStatus(
        ownerTask._id.toString(),
        reviewer.profile._id.toString(),
        "done"
      );
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) reviewerBlockedMove = true;
    }

    if (!reviewerBlockedCreate || !reviewerBlockedMove) {
      throw new Error("Case 4 Failed: Reviewer was able to modify tasks!");
    }
    console.log("✓ PASS: Reviewer strictly enforced as read-only.");

    // ------------------------------------------------------------------------
    // CASE 5: Viewer cannot modify tasks (read-only)
    // ------------------------------------------------------------------------
    console.log("\n[Case 5] Verifying Viewer cannot modify tasks (read-only)...");
    let viewerBlockedCreate = false;
    try {
      await researchTaskService.createTask(
        projectA._id.toString(),
        viewer.profile._id.toString(),
        { title: "Viewer Illegal Task" }
      );
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) viewerBlockedCreate = true;
    }

    let viewerBlockedStatus = false;
    try {
      await researchTaskService.updateTaskStatus(
        ownerTask._id.toString(),
        viewer.profile._id.toString(),
        "done"
      );
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) viewerBlockedStatus = true;
    }

    if (!viewerBlockedCreate || !viewerBlockedStatus) {
      throw new Error("Case 5 Failed: Viewer was able to modify tasks!");
    }
    console.log("✓ PASS: Viewer strictly enforced as read-only.");

    // ------------------------------------------------------------------------
    // CASE 6: Non-member cannot access project tasks
    // ------------------------------------------------------------------------
    console.log("\n[Case 6] Verifying Non-member cannot access project tasks...");
    let outsiderBlockedList = false;
    try {
      await researchTaskService.listProjectTasks(
        projectA._id.toString(),
        outsider.profile._id.toString()
      );
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) outsiderBlockedList = true;
    }

    let outsiderBlockedGet = false;
    try {
      await researchTaskService.getTaskById(
        ownerTask._id.toString(),
        outsider.profile._id.toString()
      );
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) outsiderBlockedGet = true;
    }

    if (!outsiderBlockedList || !outsiderBlockedGet) {
      throw new Error("Case 6 Failed: Outsider could access project tasks!");
    }
    console.log("✓ PASS: Non-members completely blocked from reading or listing project tasks.");

    // ------------------------------------------------------------------------
    // CASE 7: Changing projectId cannot expose another project's tasks
    // ------------------------------------------------------------------------
    console.log("\n[Case 7] Verifying project boundary isolation against ID manipulation...");
    // Create task in Project B
    const taskB = await researchTaskService.createTask(
      projectB._id.toString(),
      outsider.profile._id.toString(),
      { title: "Quantum Lattice Task" }
    );

    let ownerBlockedFromProjectB = false;
    try {
      await researchTaskService.getTaskById(
        taskB._id.toString(),
        owner.profile._id.toString()
      );
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) ownerBlockedFromProjectB = true;
    }

    if (!ownerBlockedFromProjectB) {
      throw new Error("Case 7 Failed: Member of Project A accessed task in Project B!");
    }
    console.log("✓ PASS: Project boundaries strictly enforced against cross-project access.");

    // ------------------------------------------------------------------------
    // CASE 8: User cannot assign task to a researcher who is not a project collaborator
    // ------------------------------------------------------------------------
    console.log("\n[Case 8] Verifying task assignment rejects non-members...");
    let assignOutsiderBlocked = false;
    try {
      await researchTaskService.createTask(
        projectA._id.toString(),
        owner.profile._id.toString(),
        {
          title: "Illegal Assignment Task",
          assigneeId: outsider.profile._id.toString(), // Outsider is not a member of Project A!
        }
      );
    } catch (err: any) {
      if (err.message.includes("Invalid assignee") || err.message.includes("must be a")) {
        assignOutsiderBlocked = true;
      }
    }

    if (!assignOutsiderBlocked) {
      throw new Error("Case 8 Failed: Was able to assign task to non-member outsider!");
    }
    console.log("✓ PASS: Assignee validation rejected non-member researcher.");

    // ------------------------------------------------------------------------
    // CASE 9: Unauthorized users cannot delete tasks
    // ------------------------------------------------------------------------
    console.log("\n[Case 9] Verifying deletion authorization...");
    // Contributor tries to delete owner's task
    let contribDeleteBlocked = false;
    try {
      await researchTaskService.deleteTask(
        ownerTask._id.toString(),
        contributor.profile._id.toString()
      );
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) contribDeleteBlocked = true;
    }

    // Reviewer tries to delete task
    let reviewerDeleteBlocked = false;
    try {
      await researchTaskService.deleteTask(
        contribTask._id.toString(),
        reviewer.profile._id.toString()
      );
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) reviewerDeleteBlocked = true;
    }

    if (!contribDeleteBlocked || !reviewerDeleteBlocked) {
      throw new Error("Case 9 Failed: Unauthorized deletion succeeded!");
    }

    // Owner can delete task
    const ownerDeleted = await researchTaskService.deleteTask(
      contribTask._id.toString(),
      owner.profile._id.toString()
    );
    if (!ownerDeleted) throw new Error("Case 9 Failed: Owner could not delete task");

    console.log("✓ PASS: Deletion restrictions enforced; owner successfully removed task.");

    // ------------------------------------------------------------------------
    // CASE 10 & 11: Moving to Done sets completedAt; moving out clears completedAt
    // ------------------------------------------------------------------------
    console.log("\n[Case 10 & 11] Verifying completedAt lifecycle on status transitions...");
    // Move to Done
    const completedTask = await researchTaskService.updateTaskStatus(
      ownerTask._id.toString(),
      owner.profile._id.toString(),
      "done"
    );
    if (!completedTask.completedAt) {
      throw new Error("Case 10 Failed: Moving to done did not set completedAt timestamp!");
    }
    console.log(`✓ PASS: Moving to Done correctly set completedAt: ${completedTask.completedAt.toISOString()}`);

    // Move out of Done back to In Progress
    const reopenedTask = await researchTaskService.updateTaskStatus(
      ownerTask._id.toString(),
      owner.profile._id.toString(),
      "in_progress"
    );
    if (reopenedTask.completedAt !== null && reopenedTask.completedAt !== undefined) {
      throw new Error("Case 11 Failed: Moving out of done did not clear completedAt timestamp!");
    }
    console.log("✓ PASS: Moving out of Done correctly cleared completedAt.");

    // ------------------------------------------------------------------------
    // CASE 12: Overdue calculation works correctly
    // ------------------------------------------------------------------------
    console.log("\n[Case 12] Verifying overdue calculation logic...");
    // Create task with past due date
    const overdueTask = await researchTaskService.createTask(
      projectA._id.toString(),
      owner.profile._id.toString(),
      {
        title: "Overdue Literature Review Synthesis",
        status: "in_progress",
        dueDate: new Date(Date.now() - 86400000 * 2), // 2 days ago
      }
    );

    const fetchedOverdue = await researchTaskService.getTaskById(
      overdueTask._id.toString(),
      owner.profile._id.toString()
    );
    if (!fetchedOverdue.isOverdue) {
      throw new Error("Case 12 Failed: Past due task was not flagged as overdue!");
    }

    // Now move overdue task to Done - overdue should clear
    const resolvedOverdue = await researchTaskService.updateTaskStatus(
      overdueTask._id.toString(),
      owner.profile._id.toString(),
      "done"
    );
    const fetchedResolved = await researchTaskService.getTaskById(
      overdueTask._id.toString(),
      owner.profile._id.toString()
    );
    if (fetchedResolved.isOverdue) {
      throw new Error("Case 12 Failed: Completed task should not be flagged as overdue!");
    }
    console.log("✓ PASS: Overdue correctly calculated for active past-due tasks and dismissed when marked done.");

    // ------------------------------------------------------------------------
    // CASE 13: Project-specific filtering prevents cross-project leakage
    // ------------------------------------------------------------------------
    console.log("\n[Case 13] Verifying project filtering and task summary...");
    const projectATasks = await researchTaskService.listProjectTasks(
      projectA._id.toString(),
      owner.profile._id.toString()
    );

    const hasAnyTaskB = projectATasks.some(
      (t) => t.projectId.toString() === projectB._id.toString()
    );
    if (hasAnyTaskB) {
      throw new Error("Case 13 Failed: Tasks from Project B leaked into Project A listing!");
    }

    const summary = await researchTaskService.getProjectTaskSummary(
      projectA._id.toString(),
      owner.profile._id.toString()
    );
    if (typeof summary.total !== "number" || summary.total <= 0) {
      throw new Error("Case 13 Failed: Summary counts invalid");
    }
    console.log("✓ PASS: Task listing and summary verified with strict project isolation:", summary);

    console.log("\n==========================================================================");
    console.log("🎉 ALL 13 RESEARCH KANBAN SECURITY & WORKFLOW TESTS PASSED CLEANLY!");
    console.log("==========================================================================");
  } finally {
    console.log("\n[Cleanup] Removing temporary test records...");
    await ResearchTask.deleteMany({ projectId: { $in: [projectA._id, projectB._id] } });
    await ResearchPaper.findByIdAndDelete(testPaper._id);
    await ResearchNote.findByIdAndDelete(testNote._id);
    await Manuscript.findByIdAndDelete(testManuscript._id);
    await ResearchProject.deleteMany({ _id: { $in: [projectA._id, projectB._id] } });
    await ResearcherProfile.deleteMany({
      _id: {
        $in: [
          owner.profile._id,
          coAuthor.profile._id,
          contributor.profile._id,
          reviewer.profile._id,
          viewer.profile._id,
          outsider.profile._id,
        ],
      },
    });
    await User.deleteMany({
      _id: {
        $in: [
          owner.user._id,
          coAuthor.user._id,
          contributor.user._id,
          reviewer.user._id,
          viewer.user._id,
          outsider.user._id,
        ],
      },
    });
    await mongoose.disconnect();
    console.log("✓ Cleanup complete. Database disconnected.");
  }
}

runKanbanVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
