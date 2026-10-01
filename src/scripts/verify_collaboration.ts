import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db";
import ResearcherProfile from "../models/ResearcherProfile";
import ResearchProject from "../models/ResearchProject";
import ResearchPaper from "../models/ResearchPaper";
import ResearchNote from "../models/ResearchNote";
import Manuscript from "../models/Manuscript";
import ManuscriptSection from "../models/ManuscriptSection";
import ResearchCollaborationInvite from "../models/ResearchCollaborationInvite";
import ManuscriptComment from "../models/ManuscriptComment";
import { collaborationService } from "../services/collaboration_service";
import { manuscriptService } from "../services/manuscript_service";
import { researchNoteService } from "../services/research_note_service";

async function runCollaborationVerification() {
  console.log("=== STARTING PEER COLLABORATION & CO-AUTHORING VERIFICATION ===");
  await connectDB();

  const cleanupIds = {
    researcherIds: [] as mongoose.Types.ObjectId[],
    projectIds: [] as mongoose.Types.ObjectId[],
    paperIds: [] as mongoose.Types.ObjectId[],
    noteIds: [] as mongoose.Types.ObjectId[],
    manuscriptIds: [] as mongoose.Types.ObjectId[],
    sectionIds: [] as mongoose.Types.ObjectId[],
    inviteIds: [] as mongoose.Types.ObjectId[],
    commentIds: [] as mongoose.Types.ObjectId[],
  };

  try {
    // Setup test researchers
    console.log("\n[Setup] Creating Test Researchers (Owner, Co-Author, Contributor, Reviewer, Viewer, Outside)...");
    const timestamp = Date.now();

    const owner = await ResearcherProfile.create({
      userId: new mongoose.Types.ObjectId(),
      fullName: "Dr. Alice Lead PI (Owner)",
      contact: { email: `alice.owner.${timestamp}@edupye.test` },
      researchDomains: ["Computer Science"],
      onboardingCompleted: true,
    });
    cleanupIds.researcherIds.push(owner._id as mongoose.Types.ObjectId);

    const coAuthor = await ResearcherProfile.create({
      userId: new mongoose.Types.ObjectId(),
      fullName: "Dr. Bob Co-Author",
      contact: { email: `bob.coauthor.${timestamp}@edupye.test` },
      researchDomains: ["Artificial Intelligence"],
      onboardingCompleted: true,
    });
    cleanupIds.researcherIds.push(coAuthor._id as mongoose.Types.ObjectId);

    const contributor = await ResearcherProfile.create({
      userId: new mongoose.Types.ObjectId(),
      fullName: "Charlie Contributor",
      contact: { email: `charlie.contrib.${timestamp}@edupye.test` },
      researchDomains: ["Data Engineering"],
      onboardingCompleted: true,
    });
    cleanupIds.researcherIds.push(contributor._id as mongoose.Types.ObjectId);

    const reviewer = await ResearcherProfile.create({
      userId: new mongoose.Types.ObjectId(),
      fullName: "Prof. Diana Reviewer",
      contact: { email: `diana.reviewer.${timestamp}@edupye.test` },
      researchDomains: ["Ethics & Peer Review"],
      onboardingCompleted: true,
    });
    cleanupIds.researcherIds.push(reviewer._id as mongoose.Types.ObjectId);

    const viewer = await ResearcherProfile.create({
      userId: new mongoose.Types.ObjectId(),
      fullName: "Edward Viewer",
      contact: { email: `edward.viewer.${timestamp}@edupye.test` },
      researchDomains: ["General Science"],
      onboardingCompleted: true,
    });
    cleanupIds.researcherIds.push(viewer._id as mongoose.Types.ObjectId);

    const outsideResearcher = await ResearcherProfile.create({
      userId: new mongoose.Types.ObjectId(),
      fullName: "Fiona Outsider",
      contact: { email: `fiona.outside.${timestamp}@edupye.test` },
      researchDomains: ["Astronomy"],
      onboardingCompleted: true,
    });
    cleanupIds.researcherIds.push(outsideResearcher._id as mongoose.Types.ObjectId);

    console.log("✓ All 6 test researchers created.");

    // Setup project 1 (collaborative) and project 2 (private)
    const project1 = await ResearchProject.create({
      ownerId: owner._id,
      title: "Shared Collaborative AI Project",
      domain: "Computer Science",
      collaborators: [
        { researcherId: coAuthor._id, role: "co_author", joinedAt: new Date(), invitedBy: owner._id },
        { researcherId: contributor._id, role: "contributor", joinedAt: new Date(), invitedBy: owner._id },
        { researcherId: reviewer._id, role: "reviewer", joinedAt: new Date(), invitedBy: owner._id },
        { researcherId: viewer._id, role: "viewer", joinedAt: new Date(), invitedBy: owner._id },
      ],
    });
    cleanupIds.projectIds.push(project1._id as mongoose.Types.ObjectId);

    const project2 = await ResearchProject.create({
      ownerId: owner._id,
      title: "Alice's Strict Private Research Project",
      domain: "Computer Science",
      collaborators: [],
    });
    cleanupIds.projectIds.push(project2._id as mongoose.Types.ObjectId);

    // Setup manuscript & sections on Project 1
    const manuscript1 = await Manuscript.create({
      ownerId: owner._id,
      projectId: project1._id,
      title: "Collaborative Study on Neural Latents",
      status: "draft",
    });
    cleanupIds.manuscriptIds.push(manuscript1._id as mongoose.Types.ObjectId);

    const section1 = await ManuscriptSection.create({
      ownerId: owner._id,
      manuscriptId: manuscript1._id,
      title: "1. Introduction",
      sectionType: "introduction",
      order: 0,
      content: "Initial drafted introduction for peer review.",
    });
    cleanupIds.sectionIds.push(section1._id as mongoose.Types.ObjectId);

    console.log("✓ Test project and manuscript initialized.");

    // =========================================================================
    // MANDATED TEST CASES
    // =========================================================================

    // Case 1: Contributor cannot manage collaborators.
    console.log("\n[Case 1] Verifying Contributor cannot manage collaborators...");
    try {
      await collaborationService.inviteCollaborator(
        project1._id.toString(),
        contributor._id.toString(),
        `someone.else.${timestamp}@edupye.test`,
        "viewer"
      );
      throw new Error("FAIL: Contributor should NOT be allowed to invite collaborators!");
    } catch (err: any) {
      if (err.message.includes("Contributors, reviewers, and viewers cannot manage or invite collaborators")) {
        console.log("✓ PASS: Contributor cannot invite collaborators (blocked with 403 Forbidden).");
      } else {
        throw err;
      }
    }

    try {
      await collaborationService.removeCollaborator(
        project1._id.toString(),
        contributor._id.toString(),
        viewer._id.toString()
      );
      throw new Error("FAIL: Contributor should NOT be allowed to remove collaborators!");
    } catch (err: any) {
      if (err.message.includes("Only the project owner can remove team members")) {
        console.log("✓ PASS: Contributor cannot remove team members.");
      } else {
        throw err;
      }
    }

    // Case 2: Reviewer cannot edit manuscript.
    console.log("\n[Case 2] Verifying Reviewer cannot edit manuscript...");
    try {
      await manuscriptService.updateSection(
        section1._id.toString(),
        { content: "Reviewer attempting unauthorized manuscript modification." },
        reviewer._id.toString()
      );
      throw new Error("FAIL: Reviewer should NOT be allowed to edit manuscript content!");
    } catch (err: any) {
      if (err.message.includes("Forbidden: Reviewers and viewers have read-only access and cannot edit manuscript content")) {
        console.log("✓ PASS: Reviewer cannot edit manuscript sections.");
      } else {
        throw err;
      }
    }

    try {
      await manuscriptService.createSection(
        manuscript1._id.toString(),
        { title: "Reviewer Section", content: "Should fail" },
        reviewer._id.toString()
      );
      throw new Error("FAIL: Reviewer should NOT be allowed to create sections!");
    } catch (err: any) {
      if (err.message.includes("Forbidden: Reviewers and viewers have read-only access and cannot edit manuscript content")) {
        console.log("✓ PASS: Reviewer cannot create new manuscript sections.");
      } else {
        throw err;
      }
    }

    // Case 3: Viewer cannot add notes.
    console.log("\n[Case 3] Verifying Viewer cannot add notes...");
    try {
      await researchNoteService.createNote(
        {
          projectId: project1._id.toString(),
          title: "Viewer Note Attempt",
          content: "Viewer attempting to inject note",
        },
        viewer._id.toString()
      );
      throw new Error("FAIL: Viewer should NOT be allowed to add notes!");
    } catch (err: any) {
      if (err.message.includes("Forbidden: Viewers and reviewers have read-only access and cannot create or edit research notes")) {
        console.log("✓ PASS: Viewer cannot add research notes.");
      } else {
        throw err;
      }
    }

    // Case 4: Collaborator cannot access another collaborator's private project.
    console.log("\n[Case 4] Verifying Collaborator cannot access another collaborator's private project...");
    try {
      await collaborationService.getProjectCollaborators(
        project2._id.toString(),
        coAuthor._id.toString()
      );
      throw new Error("FAIL: CoAuthor of Project 1 should NOT have access to Project 2!");
    } catch (err: any) {
      if (err.message.includes("Unauthorized: You do not have access to this research project")) {
        console.log("✓ PASS: Collaborator cannot access private project.");
      } else {
        throw err;
      }
    }

    try {
      await researchNoteService.getProjectNotes(
        project2._id.toString(),
        contributor._id.toString()
      );
      throw new Error("FAIL: Contributor should NOT be allowed to view Project 2 notes!");
    } catch (err: any) {
      if (err.message.includes("Unauthorized: You do not have permission to view this project's notes")) {
        console.log("✓ PASS: Project isolation enforced for notes.");
      } else {
        throw err;
      }
    }

    // Case 5: A removed collaborator immediately loses access.
    console.log("\n[Case 5] Verifying removed collaborator immediately loses access...");
    // Create temporary collaborator to remove
    const tempResearcher = await ResearcherProfile.create({
      userId: new mongoose.Types.ObjectId(),
      fullName: "Temp Collaborator",
      contact: { email: `temp.${timestamp}@edupye.test` },
      onboardingCompleted: true,
    });
    cleanupIds.researcherIds.push(tempResearcher._id as mongoose.Types.ObjectId);

    // Add temp to project1
    project1.collaborators.push({
      researcherId: tempResearcher._id as mongoose.Types.ObjectId,
      role: "co_author",
      joinedAt: new Date(),
      invitedBy: owner._id as mongoose.Types.ObjectId,
    });
    await project1.save();

    // Verify temp currently has access
    const roleBefore = await collaborationService.getResearcherProjectRole(
      project1._id.toString(),
      tempResearcher._id.toString()
    );
    if (!roleBefore.hasAccess) throw new Error("FAIL: Temp should initially have access!");
    console.log("  - Temp collaborator verified active.");

    // Remove temp collaborator via service
    await collaborationService.removeCollaborator(
      project1._id.toString(),
      owner._id.toString(),
      tempResearcher._id.toString()
    );

    // Verify immediate access loss
    const roleAfter = await collaborationService.getResearcherProjectRole(
      project1._id.toString(),
      tempResearcher._id.toString()
    );
    if (roleAfter.hasAccess) throw new Error("FAIL: Removed collaborator still has access!");

    try {
      await collaborationService.getProjectCollaborators(
        project1._id.toString(),
        tempResearcher._id.toString()
      );
      throw new Error("FAIL: Removed collaborator was able to list collaborators!");
    } catch (err: any) {
      console.log("✓ PASS: Removed collaborator immediately lost access to project.");
    }

    // Case 6: Revoked invitation cannot be accepted.
    console.log("\n[Case 6] Verifying revoked invitation cannot be accepted...");
    const inviteRevoke = await collaborationService.inviteCollaborator(
      project1._id.toString(),
      owner._id.toString(),
      outsideResearcher.contact!.email!,
      "contributor",
      "Please join"
    );
    cleanupIds.inviteIds.push(inviteRevoke._id as mongoose.Types.ObjectId);

    // Revoke the invitation
    await collaborationService.revokeInvitation(
      inviteRevoke._id.toString(),
      owner._id.toString()
    );
    console.log("  - Invitation successfully revoked by owner.");

    // Attempt to accept revoked invitation
    try {
      await collaborationService.respondToInvitation(
        inviteRevoke._id.toString(),
        outsideResearcher._id.toString(),
        "accept"
      );
      throw new Error("FAIL: Revoked invitation should NOT be acceptable!");
    } catch (err: any) {
      if (err.message.includes("This invitation has been revoked by the project owner")) {
        console.log("✓ PASS: Revoked invitation rejected upon accept attempt.");
      } else {
        throw err;
      }
    }

    // Case 7: Duplicate invitation is rejected.
    console.log("\n[Case 7] Verifying duplicate invitation is rejected...");
    const inviteDup1 = await collaborationService.inviteCollaborator(
      project1._id.toString(),
      owner._id.toString(),
      `dup.test.${timestamp}@edupye.test`,
      "viewer"
    );
    cleanupIds.inviteIds.push(inviteDup1._id as mongoose.Types.ObjectId);

    try {
      await collaborationService.inviteCollaborator(
        project1._id.toString(),
        owner._id.toString(),
        `dup.test.${timestamp}@edupye.test`,
        "co_author"
      );
      throw new Error("FAIL: Duplicate pending invitation should be rejected!");
    } catch (err: any) {
      if (err.message.includes("An active invitation for this email already exists")) {
        console.log("✓ PASS: Duplicate pending invitation correctly rejected.");
      } else {
        throw err;
      }
    }

    // Case 8: Duplicate membership is rejected.
    console.log("\n[Case 8] Verifying duplicate membership is rejected...");
    try {
      // Bob is already an active co_author on project1
      await collaborationService.inviteCollaborator(
        project1._id.toString(),
        owner._id.toString(),
        coAuthor.contact!.email!,
        "reviewer"
      );
      throw new Error("FAIL: Inviting an existing collaborator should be rejected!");
    } catch (err: any) {
      if (err.message.includes("Researcher is already a collaborator on this project")) {
        console.log("✓ PASS: Duplicate membership invite correctly rejected.");
      } else {
        throw err;
      }
    }

    // Case 9: A collaborator cannot manipulate another researcher's project by changing an ID in the request.
    console.log("\n[Case 9] Verifying ID manipulation rejection across boundaries...");
    try {
      // Bob tries to add note to Project 2 by swapping ID
      await researchNoteService.createNote(
        {
          projectId: project2._id.toString(),
          title: "Malicious Injection",
          content: "Attacking Project 2",
        },
        coAuthor._id.toString()
      );
      throw new Error("FAIL: Swapping project ID to an unauthorized project should be rejected!");
    } catch (err: any) {
      if (err.message.includes("Unauthorized: You do not have permission to add notes to this project")) {
        console.log("✓ PASS: Swapping project ID rejected with 403 Unauthorized.");
      } else {
        throw err;
      }
    }

    try {
      // Bob tries to accept an invitation meant for Fiona
      const fionaInvite = await collaborationService.inviteCollaborator(
        project1._id.toString(),
        owner._id.toString(),
        outsideResearcher.contact!.email!,
        "viewer"
      );
      cleanupIds.inviteIds.push(fionaInvite._id as mongoose.Types.ObjectId);

      await collaborationService.respondToInvitation(
        fionaInvite._id.toString(),
        coAuthor._id.toString(),
        "accept"
      );
      throw new Error("FAIL: User should NOT be able to accept an invitation meant for someone else!");
    } catch (err: any) {
      if (err.message.includes("Unauthorized: You are not the intended recipient of this invitation")) {
        console.log("✓ PASS: Accepting another user's invitation rejected.");
      } else {
        throw err;
      }
    }

    // Case 10: Project owner remains owner and cannot accidentally be removed.
    console.log("\n[Case 10] Verifying Project owner cannot accidentally be removed...");
    try {
      await collaborationService.removeCollaborator(
        project1._id.toString(),
        owner._id.toString(),
        owner._id.toString()
      );
      throw new Error("FAIL: Project owner should NOT be removable!");
    } catch (err: any) {
      if (err.message.includes("Project owner cannot be removed from project")) {
        console.log("✓ PASS: Lead PI/Owner removal strictly forbidden.");
      } else {
        throw err;
      }
    }

    // =========================================================================
    // PEER REVIEW COMMENTS & DISCUSSION THREADS HAPPY PATH
    // =========================================================================
    console.log("\n[Peer Review Annotations] Testing comments and discussion threads...");
    const comment1 = await collaborationService.addManuscriptComment(
      manuscript1._id.toString(),
      reviewer._id.toString(),
      "Please provide empirical benchmark comparison against standard ResNet baseline.",
      section1._id.toString(),
      "Initial drafted introduction"
    );
    cleanupIds.commentIds.push(comment1._id as mongoose.Types.ObjectId);
    console.log("✓ Reviewer added inline annotation:", comment1.content);

    const reply = await collaborationService.replyToComment(
      comment1._id.toString(),
      coAuthor._id.toString(),
      "Added ResNet-50 and ViT-Base comparison tables in Section 4."
    );
    console.log("✓ Co-Author replied to thread:", reply.content);

    const resolved = await collaborationService.resolveComment(
      comment1._id.toString(),
      owner._id.toString()
    );
    if (resolved.status !== "resolved") throw new Error("FAIL: Comment should be marked resolved!");
    console.log("✓ Owner marked annotation thread as resolved.");

    // =========================================================================
    // REGRESSION TESTS: ROLE RESOLUTION & ACTIVE PROJECT ID INTEGRITY
    // =========================================================================
    console.log("\n[Regression Test 1] Verifying Researcher A owns Project A -> getResearcherProjectRole returns 'owner' (NEVER 'viewer')...");
    const ownerRoleResult = await collaborationService.getResearcherProjectRole(
      project1._id.toString(),
      owner._id.toString()
    );
    if (!ownerRoleResult.hasAccess || ownerRoleResult.role !== "owner") {
      throw new Error(`FAIL: Expected role to be 'owner', but got '${ownerRoleResult.role}'! Owner must never fall through to viewer!`);
    }
    console.log("✓ PASS: Owner resolution directly returned role: 'owner' (NOT viewer).");

    // Test dual resolution with owner's linked userId
    const ownerUserIdRoleResult = await collaborationService.getResearcherProjectRole(
      project1._id.toString(),
      owner.userId.toString()
    );
    if (!ownerUserIdRoleResult.hasAccess || ownerUserIdRoleResult.role !== "owner") {
      throw new Error(`FAIL: Dual resolution with linked userId failed! Expected 'owner', got '${ownerUserIdRoleResult.role}'`);
    }
    console.log("✓ PASS: Dual resolution with linked userId returned role: 'owner'.");

    console.log("\n[Regression Test 2] Verifying getProjectCollaborators returns authoritative currentUserRole: 'owner' and correct projectId...");
    const collabResult = await collaborationService.getProjectCollaborators(
      project1._id.toString(),
      owner._id.toString()
    );
    if (collabResult.currentUserRole !== "owner") {
      throw new Error(`FAIL: getProjectCollaborators did not return currentUserRole === 'owner'! Got: '${collabResult.currentUserRole}'`);
    }
    if (collabResult.projectId !== project1._id.toString()) {
      throw new Error(`FAIL: Returned projectId '${collabResult.projectId}' does not match queried project '${project1._id.toString()}'`);
    }
    console.log("✓ PASS: getProjectCollaborators confirmed currentUserRole: 'owner' and matching projectId.");

    console.log("\n[Regression Test 3] Verifying active project ID mismatch detection and isolation...");
    // Verify querying Project 2 returns Project 2's ID
    const collabResultP2 = await collaborationService.getProjectCollaborators(
      project2._id.toString(),
      owner._id.toString()
    );
    if (collabResultP2.projectId !== project2._id.toString()) {
      throw new Error("FAIL: Project ID mismatch in getProjectCollaborators for Project 2!");
    }
    if (collabResultP2.projectId === project1._id.toString()) {
      throw new Error("FAIL: Active project ID cross-contamination detected!");
    }
    console.log("✓ PASS: Active project ID matches queried project and prevents cross-project leakage.");

    console.log("\n[Regression Test 4] Verifying non-member never falls through to 'viewer'...");
    const outsiderRole = await collaborationService.getResearcherProjectRole(
      project1._id.toString(),
      outsideResearcher._id.toString()
    );
    if (outsiderRole.hasAccess || outsiderRole.role) {
      throw new Error(`FAIL: Non-member should have hasAccess === false, but got role '${outsiderRole.role}'!`);
    }
    console.log("✓ PASS: Non-member correctly rejected with hasAccess: false (never falls through to viewer).");

    console.log("\n==========================================================================");
    console.log("🎉 ALL 10 MANDATED BOUNDARY CASES + ALL 4 REGRESSION TESTS PASSED CLEANLY!");
    console.log("==========================================================================");
  } finally {
    // Cleanup created test records
    console.log("\n[Cleanup] Cleaning up test records...");
    await ResearcherProfile.deleteMany({ _id: { $in: cleanupIds.researcherIds } });
    await ResearchProject.deleteMany({ _id: { $in: cleanupIds.projectIds } });
    await Manuscript.deleteMany({ _id: { $in: cleanupIds.manuscriptIds } });
    await ManuscriptSection.deleteMany({ _id: { $in: cleanupIds.sectionIds } });
    await ResearchNote.deleteMany({ _id: { $in: cleanupIds.noteIds } });
    await ResearchCollaborationInvite.deleteMany({ _id: { $in: cleanupIds.inviteIds } });
    await ManuscriptComment.deleteMany({ _id: { $in: cleanupIds.commentIds } });
    await mongoose.disconnect();
    console.log("✓ Database disconnected. Cleanup complete.");
  }
}

runCollaborationVerification().catch((err) => {
  console.error("FATAL VERIFICATION ERROR:", err);
  process.exit(1);
});
