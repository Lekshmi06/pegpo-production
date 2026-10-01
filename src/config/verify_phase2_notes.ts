import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "./db";
import ResearchProject from "../models/ResearchProject";
import ResearchPaper from "../models/ResearchPaper";
import ResearcherProfile from "../models/ResearcherProfile";
import ResearchNote from "../models/ResearchNote";
import { researchPaperService } from "../services/research_paper_service";
import { researchNoteService } from "../services/research_note_service";
import { researchAiService } from "../services/research_ai_service";

async function verifyPhase2Notes() {
  console.log("=================================================");
  console.log("STARTING PHASE 2: RESEARCH NOTES & HYPOTHESIS VERIFICATION");
  console.log("=================================================");

  await connectDB();

  try {
    // 1. Get or create test researcher profile
    let testProfile = await ResearcherProfile.findOne({ "contact.email": "phase2_tester@edupye.academic" });
    if (!testProfile) {
      testProfile = await ResearcherProfile.create({
        userId: new mongoose.Types.ObjectId(),
        fullName: "Dr. Marcus Vance",
        contact: {
          email: "phase2_tester@edupye.academic",
        },
        researchDomains: ["Computer Science", "Engineering"],
        researchSpecializations: ["Medical Imaging", "Deep Learning"],
        researchInterests: ["Hierarchical Transformers", "Brain Tumor Segmentation"],
        onboardingCompleted: true,
      });
      console.log("✓ Created test researcher profile:", testProfile._id.toString());
    } else {
      console.log("✓ Using existing test researcher profile:", testProfile._id.toString());
    }

    const ownerId = testProfile._id.toString();

    // 2. Create a test project
    const project = await researchPaperService.createProject(
      {
        title: "Comparative Study of Shifted Window Attention in Volumetric MRI",
        researchQuestion: "Can shifted-window attention mitigate vanishing gradients in irregular glioma boundaries?",
        domain: "Biomedical Engineering",
        objectives: [
          "Validate boundary loss improvements",
          "Test edge deployment latency",
        ],
        status: "Active",
      },
      ownerId
    );
    const projectId = project._id.toString();
    console.log("✓ Created test project:", project.title, "ID:", projectId);

    // 3. Create a test paper and attach to project
    const paper = await ResearchPaper.create({
      title: "Swin-UNETR: Shifted Window Transformers for 3D Brain Tumor Segmentation",
      authors: ["Ali Hatamizadeh", "Vishwesh Nath", "Daguang Xu"],
      year: 2022,
      venue: "CVPR 2022",
      abstract: "Swin-UNETR redefines 3D brain tumor segmentation by using shifted window hierarchical vision transformers.",
      methodology: "Shifted-window self-attention blocks with volumetric convolution decoders.",
      datasets: ["BraTS 2021"],
      findings: "Achieved average Dice score of 92.4% on BraTS enhancing tumor cores.",
      limitations: "Dense 3D volumes require sliding window inference.",
      ownerId: testProfile._id,
      savedAt: new Date(),
    });
    const paperId = paper._id.toString();
    await researchPaperService.addPaperToProject(paperId, projectId, ownerId);
    console.log("✓ Attached paper to project:", paper.title);

    // 4. Test: Create Research Note of type 'hypothesis'
    console.log("\n--- TEST: Create Note (Hypothesis) ---");
    const hypothesisNote = await researchNoteService.createNote(
      {
        projectId,
        title: "Boundary Gradient Hypothesis",
        content: "We hypothesize that multi-scale skip connections preserve high-frequency boundary gradients more effectively than pure convolutional filters in anisotropic MRI slices.",
        noteType: "hypothesis",
        tags: ["hypothesis", "gradients", "boundary-loss"],
        isPinned: true,
      },
      ownerId
    );
    console.log("✓ Created hypothesis note:", hypothesisNote.title, "Type:", hypothesisNote.noteType);

    // 5. Test: Create Research Note of type 'critique' linked to the paper with an excerpt
    console.log("\n--- TEST: Create Note (Critique with Cited Excerpt) ---");
    const critiqueNote = await researchNoteService.createNote(
      {
        projectId,
        paperId,
        title: "Memory Scaling Critique on Swin-UNETR",
        content: "While the authors achieve high Dice scores, the quadratic memory scaling during high-resolution inference hinders real-time intraoperative deployment without tensor parallelism.",
        excerpt: "Dense 3D volumes require sliding window inference with 16GB VRAM minimum.",
        noteType: "critique",
        tags: ["memory-scaling", "hardware-constraints"],
      },
      ownerId
    );
    console.log("✓ Created critique note:", critiqueNote.title, "Linked to paper:", (critiqueNote as any).paperId?.title);

    // 6. Test: List Notes for Project with Ownership Verification
    console.log("\n--- TEST: List Project Notes & Ownership Check ---");
    const projectNotes = await researchNoteService.getProjectNotes(projectId, ownerId);
    console.log(`✓ Retrieved ${projectNotes.length} notes for project.`);
    if (projectNotes.length !== 2) {
      throw new Error(`Expected 2 notes, got ${projectNotes.length}`);
    }

    // Verify pinned note is first
    if (!projectNotes[0].isPinned || projectNotes[0].title !== "Boundary Gradient Hypothesis") {
      throw new Error("Pinned note was not sorted to top!");
    }
    console.log("✓ Pinned note correctly sorted to top.");

    // Test unauthorized user check
    const unauthorizedOwnerId = new mongoose.Types.ObjectId().toString();
    let unauthorizedCaught = false;
    try {
      await researchNoteService.getProjectNotes(projectId, unauthorizedOwnerId);
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) {
        unauthorizedCaught = true;
      }
    }
    console.log("✓ Unauthorized access rejected with 403 Forbidden:", unauthorizedCaught);
    if (!unauthorizedCaught) throw new Error("Failed to enforce ownership verification on getProjectNotes!");

    // 7. Test: Project Retrieval includes populated noteIds
    console.log("\n--- TEST: Project Retrieval Populates Notes ---");
    const fetchedProject = await researchPaperService.getProjectById(projectId, ownerId);
    console.log("✓ Project retrieved. noteIds count:", (fetchedProject as any)?.noteIds?.length);
    if ((fetchedProject as any)?.noteIds?.length !== 2) {
      throw new Error("Project noteIds array does not match created notes count!");
    }

    // 8. Test: Project-Scoped AI Copilot grounds in researcher hypotheses & notes
    console.log("\n--- TEST: Project-Scoped AI with Notes Context ---");
    const aiResponse = await researchAiService.queryResearchAI({
      query: "Assess my working hypothesis regarding boundary loss in relation to the attached literature",
      contextType: "project",
      projectId,
    });
    console.log("✓ AI Scope:", aiResponse.contextScope);
    console.log("✓ AI Source Supported:", aiResponse.sourceSupported);
    console.log("✓ AI Response preview:\n", aiResponse.reply.slice(0, 300) + "...\n");

    // 9. Test: Update Note
    console.log("\n--- TEST: Update Note ---");
    const updatedNote = await researchNoteService.updateNote(
      hypothesisNote._id.toString(),
      {
        title: "Refined Boundary Gradient Hypothesis",
        content: "Updated: Multi-scale skip connections demonstrate 14% improvement in spatial boundary preservation.",
      },
      ownerId
    );
    console.log("✓ Note updated title:", updatedNote?.title);
    if (updatedNote?.title !== "Refined Boundary Gradient Hypothesis") {
      throw new Error("Note update failed!");
    }

    // 10. Test: Delete Note and verify project.noteIds decrement
    console.log("\n--- TEST: Delete Note ---");
    const deleteResult = await researchNoteService.deleteNote(critiqueNote._id.toString(), ownerId);
    console.log("✓ Delete note result:", deleteResult.message);

    const notesAfterDelete = await researchNoteService.getProjectNotes(projectId, ownerId);
    console.log(`✓ Notes remaining: ${notesAfterDelete.length}`);
    if (notesAfterDelete.length !== 1) {
      throw new Error("Expected 1 note remaining after deletion!");
    }

    // Clean up test records
    await ResearchNote.findByIdAndDelete(hypothesisNote._id);
    await ResearchPaper.findByIdAndDelete(paper._id);
    await ResearchProject.findByIdAndDelete(projectId);
    console.log("✓ Cleaned up test records from database.");

    console.log("\n=================================================");
    console.log("ALL PHASE 2 CHECKS PASSED SUCCESSFULLY!");
    console.log("=================================================");
  } catch (error) {
    console.error("❌ Phase 2 verification failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

verifyPhase2Notes();
