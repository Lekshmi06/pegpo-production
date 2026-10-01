import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import User from "../models/User";
import ResearcherProfile from "../models/ResearcherProfile";
import ResearchProject from "../models/ResearchProject";
import ResearchTask from "../models/ResearchTask";
import ResearchCalendarEvent from "../models/ResearchCalendarEvent";
import ResearchPaper from "../models/ResearchPaper";
import ResearchNote from "../models/ResearchNote";
import Manuscript from "../models/Manuscript";
import { researchCalendarService } from "../services/research_calendar_service";
import { researchTaskService } from "../services/research_task_service";

async function runCalendarVerification() {
  console.log("=== STARTING RESEARCH CALENDAR & TIMELINE SYSTEM VERIFICATION ===");
  await mongoose.connect(process.env.MONGODB_URI!);

  const timestamp = Date.now();

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
  const owner = await makeResearcher("cal_owner");
  const coAuthor = await makeResearcher("cal_coauthor");
  const contributor = await makeResearcher("cal_contrib");
  const reviewer = await makeResearcher("cal_reviewer");
  const viewer = await makeResearcher("cal_viewer");
  const outsider = await makeResearcher("cal_outsider");

  console.log("✓ All 6 test researchers initialized.");

  // Project A
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

  // Project B (Private project for boundary isolation)
  const projectB = await ResearchProject.create({
    title: "Quantum Key Distribution Laboratory",
    ownerId: outsider.profile._id,
    researchQuestion: "Can side-channel leakage bypass BB84 QKD protocol?",
    status: "Active",
    collaborators: [],
  });

  // Sample research artifacts
  const testPaper = await ResearchPaper.create({
    title: "Robust Deep Iris Feature Extraction",
    authors: ["A. Lekshmi", "V. Kumar"],
    year: 2025,
    venue: "IEEE Transactions on Biometrics",
  });

  const testNote = await ResearchNote.create({
    ownerId: owner.profile._id,
    projectId: projectA._id,
    title: "Gabor filter wavelets frequency response notes",
    content: "Parameters need tuning for lower resolution images.",
    noteType: "methodology",
  });

  const testManuscript = await Manuscript.create({
    ownerId: owner.profile._id,
    projectId: projectA._id,
    title: "Iris Biometrics Comprehensive Analysis",
    status: "in_progress",
    citationStyle: "IEEE",
  });

  try {
    // ------------------------------------------------------------------------
    // CASE 1: Owner can create a calendar event (milestone/meeting with linkages)
    // ------------------------------------------------------------------------
    console.log("\n[Case 1] Verifying Owner can create a calendar event...");
    const ownerEvent = await researchCalendarService.createEvent(
      projectA._id.toString(),
      owner.profile._id.toString(),
      {
        title: "Methodology Defense & Review",
        description: "Presenting experimental validation framework to advisory committee",
        type: "milestone",
        startDate: new Date("2026-10-15T10:00:00Z"),
        endDate: new Date("2026-10-15T12:00:00Z"),
        allDay: false,
        location: "Research Lab Conference Room 4B",
        assigneeId: owner.profile._id.toString(),
        relatedPaperIds: [testPaper._id.toString()],
        relatedNoteIds: [testNote._id.toString()],
        relatedManuscriptId: testManuscript._id.toString(),
      }
    );
    if (!ownerEvent || ownerEvent.title !== "Methodology Defense & Review") {
      throw new Error("Case 1 Failed: Owner event was not properly created");
    }
    console.log("✓ PASS: Owner created milestone event with research linkages.");

    // ------------------------------------------------------------------------
    // CASE 2: Co-author can create and edit permitted events
    // ------------------------------------------------------------------------
    console.log("\n[Case 2] Verifying Co-author can create/edit events...");
    const coAuthorEvent = await researchCalendarService.createEvent(
      projectA._id.toString(),
      coAuthor.profile._id.toString(),
      {
        title: "Weekly Lab Synchronization Meeting",
        type: "meeting",
        startDate: new Date("2026-10-18T14:00:00Z"),
        endDate: new Date("2026-10-18T15:00:00Z"),
        assigneeId: coAuthor.profile._id.toString(),
      }
    );
    const updatedCoAuthorEvent = await researchCalendarService.updateEvent(
      coAuthorEvent._id.toString(),
      coAuthor.profile._id.toString(),
      {
        location: "Virtual Meeting Link / Room 102",
      }
    );
    if (updatedCoAuthorEvent.location !== "Virtual Meeting Link / Room 102") {
      throw new Error("Case 2 Failed: Co-author could not update event");
    }
    console.log("✓ PASS: Co-author created and edited research event.");

    // ------------------------------------------------------------------------
    // CASE 3: Contributor permissions are enforced
    // ------------------------------------------------------------------------
    console.log("\n[Case 3] Verifying Contributor permissions...");
    const contribEvent = await researchCalendarService.createEvent(
      projectA._id.toString(),
      contributor.profile._id.toString(),
      {
        title: "Dataset Collection Phase 1",
        type: "milestone",
        startDate: new Date("2026-10-20T09:00:00Z"),
        assigneeId: contributor.profile._id.toString(),
      }
    );
    // Contributor editing own event -> Should succeed
    const editedByContrib = await researchCalendarService.updateEvent(
      contribEvent._id.toString(),
      contributor.profile._id.toString(),
      {
        description: "Collected 500 high-res ocular captures",
      }
    );
    if (editedByContrib.description !== "Collected 500 high-res ocular captures") {
      throw new Error("Case 3 Failed: Contributor could not edit their own event");
    }

    // Contributor editing owner's event -> Should fail
    let contribBlocked = false;
    try {
      await researchCalendarService.updateEvent(
        ownerEvent._id.toString(),
        contributor.profile._id.toString(),
        { title: "Hacked by contributor" }
      );
    } catch (e: any) {
      contribBlocked = true;
    }
    if (!contribBlocked) {
      throw new Error("Case 3 Failed: Contributor was allowed to edit an event created by another researcher");
    }
    console.log("✓ PASS: Contributor permissions strictly enforced (can edit own, blocked from other member's events).");

    // ------------------------------------------------------------------------
    // CASE 4 & 5: Reviewer and Viewer cannot create or modify events (read-only)
    // ------------------------------------------------------------------------
    console.log("\n[Case 4 & 5] Verifying Reviewer & Viewer are strictly read-only...");
    let reviewerBlocked = false;
    try {
      await researchCalendarService.createEvent(
        projectA._id.toString(),
        reviewer.profile._id.toString(),
        {
          title: "Unauthorized Reviewer Event",
          startDate: new Date(),
        }
      );
    } catch {
      reviewerBlocked = true;
    }

    let viewerBlocked = false;
    try {
      await researchCalendarService.updateEvent(
        ownerEvent._id.toString(),
        viewer.profile._id.toString(),
        { title: "Viewer Tampering" }
      );
    } catch {
      viewerBlocked = true;
    }

    if (!reviewerBlocked || !viewerBlocked) {
      throw new Error("Case 4/5 Failed: Reviewer or viewer was able to mutate calendar events");
    }
    console.log("✓ PASS: Reviewer and Viewer strictly restricted to read-only access.");

    // ------------------------------------------------------------------------
    // CASE 6: Non-member cannot access project calendar
    // ------------------------------------------------------------------------
    console.log("\n[Case 6] Verifying Non-member cannot access project calendar...");
    let nonMemberBlocked = false;
    try {
      await researchCalendarService.getProjectCalendarData(
        projectA._id.toString(),
        outsider.profile._id.toString()
      );
    } catch {
      nonMemberBlocked = true;
    }
    if (!nonMemberBlocked) {
      throw new Error("Case 6 Failed: Outsider accessed project calendar data");
    }
    console.log("✓ PASS: Non-members completely blocked from accessing project calendar.");

    // ------------------------------------------------------------------------
    // CASE 7: Cross-project access is blocked
    // ------------------------------------------------------------------------
    console.log("\n[Case 7] Verifying cross-project boundary isolation...");
    let crossProjectBlocked = false;
    try {
      await researchCalendarService.getProjectCalendarData(
        projectB._id.toString(),
        owner.profile._id.toString()
      );
    } catch {
      crossProjectBlocked = true;
    }
    if (!crossProjectBlocked) {
      throw new Error("Case 7 Failed: Owner was able to view Project B calendar");
    }
    console.log("✓ PASS: Cross-project calendar access prevented.");

    // ------------------------------------------------------------------------
    // CASE 8: Event assignment rejects non-project members
    // ------------------------------------------------------------------------
    console.log("\n[Case 8] Verifying event assignment rejects non-project members...");
    let invalidAssigneeBlocked = false;
    try {
      await researchCalendarService.createEvent(
        projectA._id.toString(),
        owner.profile._id.toString(),
        {
          title: "Invalid Assignment Event",
          startDate: new Date(),
          assigneeId: outsider.profile._id.toString(),
        }
      );
    } catch (e: any) {
      invalidAssigneeBlocked = true;
    }
    if (!invalidAssigneeBlocked) {
      throw new Error("Case 8 Failed: Allowed assigning event to a non-project collaborator");
    }
    console.log("✓ PASS: Event assignment rejects non-project members.");

    // ------------------------------------------------------------------------
    // CASE 9: Task with dueDate appears in calendar data
    // ------------------------------------------------------------------------
    console.log("\n[Case 9] Verifying ResearchTask with dueDate appears in calendar...");
    const sampleTask = await researchTaskService.createTask(
      projectA._id.toString(),
      owner.profile._id.toString(),
      {
        title: "Benchmark segmentation loss functions",
        status: "in_progress",
        researchStage: "methodology",
        priority: "high",
        dueDate: new Date("2026-10-25T17:00:00Z"),
        assigneeId: coAuthor.profile._id.toString(),
      }
    );

    const initialCalData = await researchCalendarService.getProjectCalendarData(
      projectA._id.toString(),
      owner.profile._id.toString()
    );

    const taskInCal = initialCalData.tasks.find(
      (t) => t._id.toString() === sampleTask._id.toString()
    );
    if (!taskInCal) {
      throw new Error("Case 9 Failed: Task with dueDate was not returned in calendar tasks");
    }
    console.log(`✓ PASS: Task '${taskInCal.title}' with due date Oct 25 dynamically appears in calendar.`);

    // ------------------------------------------------------------------------
    // CASE 10: Changing task dueDate changes its calendar representation
    // ------------------------------------------------------------------------
    console.log("\n[Case 10] Verifying task dueDate synchronization (ONE source of truth)...");
    await researchTaskService.updateTask(
      sampleTask._id.toString(),
      owner.profile._id.toString(),
      {
        dueDate: new Date("2026-10-28T17:00:00Z"),
      }
    );

    const updatedCalData = await researchCalendarService.getProjectCalendarData(
      projectA._id.toString(),
      owner.profile._id.toString()
    );
    const updatedTaskInCal = updatedCalData.tasks.find(
      (t) => t._id.toString() === sampleTask._id.toString()
    );
    if (
      !updatedTaskInCal ||
      new Date(updatedTaskInCal.dueDate!).toISOString() !==
        new Date("2026-10-28T17:00:00Z").toISOString()
    ) {
      throw new Error("Case 10 Failed: Updated task due date did not reflect in calendar data");
    }
    console.log("✓ PASS: Task due date edit immediately synchronized to calendar (Oct 28).");

    // ------------------------------------------------------------------------
    // CASE 11: Deleting a task removes it from calendar data
    // ------------------------------------------------------------------------
    console.log("\n[Case 11] Verifying task deletion removes it from calendar...");
    const temporaryTask = await researchTaskService.createTask(
      projectA._id.toString(),
      owner.profile._id.toString(),
      {
        title: "Temporary Task to Delete",
        status: "todo",
        dueDate: new Date("2026-10-22T12:00:00Z"),
      }
    );
    // Delete task
    await researchTaskService.deleteTask(
      temporaryTask._id.toString(),
      owner.profile._id.toString()
    );

    const afterDeleteCalData = await researchCalendarService.getProjectCalendarData(
      projectA._id.toString(),
      owner.profile._id.toString()
    );
    const deletedTaskFound = afterDeleteCalData.tasks.some(
      (t) => t._id.toString() === temporaryTask._id.toString()
    );
    if (deletedTaskFound) {
      throw new Error("Case 11 Failed: Deleted task is still appearing in calendar");
    }
    console.log("✓ PASS: Deleted task cleanly removed from calendar data.");

    // ------------------------------------------------------------------------
    // CASE 12: Completed tasks retain historical calendar visibility
    // ------------------------------------------------------------------------
    console.log("\n[Case 12] Verifying completed tasks retain historical calendar visibility...");
    await researchTaskService.updateTaskStatus(
      sampleTask._id.toString(),
      owner.profile._id.toString(),
      "done"
    );

    const completedCalData = await researchCalendarService.getProjectCalendarData(
      projectA._id.toString(),
      owner.profile._id.toString()
    );
    const completedTaskInCal = completedCalData.tasks.find(
      (t) => t._id.toString() === sampleTask._id.toString()
    );
    if (!completedTaskInCal || completedTaskInCal.status !== "done" || !completedTaskInCal.completedAt) {
      throw new Error("Case 12 Failed: Completed task lost historical visibility or completedAt flag");
    }
    console.log("✓ PASS: Completed task visible on calendar with completedAt timestamp.");

    // ------------------------------------------------------------------------
    // CASE 13: Calendar cannot modify a task beyond user's existing permissions
    // ------------------------------------------------------------------------
    console.log("\n[Case 13] Verifying calendar respects task permission boundaries...");
    // Contributor cannot change due date of owner's task (not created by or assigned to contributor)
    let contribTaskTamperBlocked = false;
    try {
      await researchTaskService.updateTask(
        sampleTask._id.toString(),
        contributor.profile._id.toString(),
        {
          dueDate: new Date("2026-11-01T00:00:00Z"),
        }
      );
    } catch {
      contribTaskTamperBlocked = true;
    }
    if (!contribTaskTamperBlocked) {
      throw new Error("Case 13 Failed: Contributor modified task due date without task permission");
    }
    console.log("✓ PASS: Task permission boundaries strictly preserved; unauthorized due date change blocked.");

    // ------------------------------------------------------------------------
    // CASE 14: Project filtering prevents cross-project leakage
    // ------------------------------------------------------------------------
    console.log("\n[Case 14] Verifying project filtering prevents cross-project leakage...");
    // Create an event and task in Project B
    const bEvent = await researchCalendarService.createEvent(
      projectB._id.toString(),
      outsider.profile._id.toString(),
      {
        title: "Quantum Entanglement Test",
        type: "milestone",
        startDate: new Date("2026-10-16T10:00:00Z"),
      }
    );

    const aCalData = await researchCalendarService.getProjectCalendarData(
      projectA._id.toString(),
      owner.profile._id.toString()
    );
    const leakedEvent = aCalData.events.find((e) => e._id.toString() === bEvent._id.toString());
    if (leakedEvent) {
      throw new Error("Case 14 Failed: Event from Project B leaked into Project A calendar");
    }
    console.log("✓ PASS: Strict project isolation verified, zero cross-project leakage.");

    // ------------------------------------------------------------------------
    // CASE 15: Event deletion respects authorization
    // ------------------------------------------------------------------------
    console.log("\n[Case 15] Verifying event deletion authorization...");
    // Contributor cannot delete owner's event
    let contribDeleteOwnerBlocked = false;
    try {
      await researchCalendarService.deleteEvent(
        ownerEvent._id.toString(),
        contributor.profile._id.toString()
      );
    } catch {
      contribDeleteOwnerBlocked = true;
    }
    if (!contribDeleteOwnerBlocked) {
      throw new Error("Case 15 Failed: Contributor was allowed to delete owner's event");
    }

    // Contributor can delete their own event
    const contribDeleteResult = await researchCalendarService.deleteEvent(
      contribEvent._id.toString(),
      contributor.profile._id.toString()
    );
    if (!contribDeleteResult.success) {
      throw new Error("Case 15 Failed: Contributor could not delete own event");
    }

    // Owner can delete co-author's event
    const ownerDeleteResult = await researchCalendarService.deleteEvent(
      coAuthorEvent._id.toString(),
      owner.profile._id.toString()
    );
    if (!ownerDeleteResult.success) {
      throw new Error("Case 15 Failed: Owner could not delete project event");
    }
    console.log("✓ PASS: Event deletion authorizations strictly validated.");

    // ------------------------------------------------------------------------
    // ADDITIONAL CHECKS: Date boundaries, all-day, multi-day, overdue
    // ------------------------------------------------------------------------
    console.log("\n[Additional Tests] Verifying date boundaries, all-day, multi-day, and overdue...");
    
    // All-day multi-day event
    const multiDayEvent = await researchCalendarService.createEvent(
      projectA._id.toString(),
      owner.profile._id.toString(),
      {
        title: "International Biometrics Conference (CVPR Workshop)",
        type: "deadline",
        startDate: new Date("2026-10-21T00:00:00Z"),
        endDate: new Date("2026-10-24T23:59:59Z"),
        allDay: true,
      }
    );
    if (!multiDayEvent.allDay) {
      throw new Error("Additional Test Failed: allDay flag was not persisted");
    }

    // Date range filter
    const rangeData = await researchCalendarService.getProjectCalendarData(
      projectA._id.toString(),
      owner.profile._id.toString(),
      {
        startDate: "2026-10-20T00:00:00Z",
        endDate: "2026-10-25T00:00:00Z",
      }
    );
    const foundMultiDay = rangeData.events.some(
      (e) => e._id.toString() === multiDayEvent._id.toString()
    );
    if (!foundMultiDay) {
      throw new Error("Additional Test Failed: Multi-day event within range was not returned");
    }

    // Overdue task check
    const overdueTask = await researchTaskService.createTask(
      projectA._id.toString(),
      owner.profile._id.toString(),
      {
        title: "Overdue Literature Survey",
        status: "todo",
        dueDate: new Date(Date.now() - 3600 * 1000 * 24 * 3), // 3 days ago
      }
    );
    const overdueCalData = await researchCalendarService.getProjectCalendarData(
      projectA._id.toString(),
      owner.profile._id.toString()
    );
    const returnedOverdue = overdueCalData.tasks.find(
      (t) => t._id.toString() === overdueTask._id.toString()
    );
    const isOverdue =
      returnedOverdue &&
      new Date(returnedOverdue.dueDate!).getTime() < Date.now() &&
      returnedOverdue.status !== "done";
    if (!isOverdue) {
      throw new Error("Additional Test Failed: Overdue calculation mismatch");
    }
    console.log("✓ PASS: Date boundary filters, all-day multi-day events, and overdue logic verified.");

    console.log("\n==========================================================================");
    console.log("🎉 ALL 15+ RESEARCH CALENDAR SECURITY & INTEGRATION TESTS PASSED CLEANLY!");
    console.log("==========================================================================");
  } finally {
    console.log("\n[Cleanup] Removing temporary test records...");
    await ResearchCalendarEvent.deleteMany({
      title: {
        $in: [
          "Methodology Defense & Review",
          "Weekly Lab Synchronization Meeting",
          "Dataset Collection Phase 1",
          "Quantum Entanglement Test",
          "International Biometrics Conference (CVPR Workshop)",
        ],
      },
    });
    await ResearchTask.deleteMany({
      title: {
        $in: [
          "Benchmark segmentation loss functions",
          "Temporary Task to Delete",
          "Overdue Literature Survey",
        ],
      },
    });
    await ResearchPaper.deleteOne({ title: "Robust Deep Iris Feature Extraction" });
    await ResearchNote.deleteOne({ title: "Gabor filter wavelets frequency response notes" });
    await Manuscript.deleteOne({ title: "Iris Biometrics Comprehensive Analysis" });
    await ResearchProject.deleteMany({
      _id: { $in: [projectA._id, projectB._id] },
    });
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
    console.log("✓ Cleanup complete. Database disconnected.");
    await mongoose.disconnect();
  }
}

runCalendarVerification().catch((err) => {
  console.error("FATAL VERIFICATION ERROR:", err);
  process.exit(1);
});
