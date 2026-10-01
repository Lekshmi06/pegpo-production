import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db";
import ResearcherProfile from "../models/ResearcherProfile";
import ResearchProject from "../models/ResearchProject";
import ResearchPaper from "../models/ResearchPaper";
import ResearchNote from "../models/ResearchNote";
import Manuscript from "../models/Manuscript";
import ManuscriptSection from "../models/ManuscriptSection";
import { manuscriptService } from "../services/manuscript_service";
import { researchAiService } from "../services/research_ai_service";

async function runResearchWritingVerification() {
  console.log("=== STARTING RESEARCH WRITING WORKSPACE VERIFICATION ===");
  await connectDB();

  const cleanupIds: {
    researcherIds: mongoose.Types.ObjectId[];
    projectIds: mongoose.Types.ObjectId[];
    paperIds: mongoose.Types.ObjectId[];
    noteIds: mongoose.Types.ObjectId[];
    manuscriptIds: mongoose.Types.ObjectId[];
  } = {
    researcherIds: [],
    projectIds: [],
    paperIds: [],
    noteIds: [],
    manuscriptIds: [],
  };

  try {
    // 1. Create Test Researcher A (Owner)
    console.log("\n[Test 1] Creating Primary Test Researcher...");
    const researcherA = await ResearcherProfile.create({
      userId: new mongoose.Types.ObjectId(),
      fullName: "Dr. Eleanor Vance (Test)",
      contact: { email: `eleanor.test.${Date.now()}@edupye.test` },
      researchDomains: ["Computer Science", "Medical AI"],
      researchInterests: ["Vision Transformers", "Volumetric Segmentation"],
      onboardingCompleted: true,
    });
    cleanupIds.researcherIds.push(researcherA._id as mongoose.Types.ObjectId);
    console.log("✓ Primary Researcher created:", researcherA._id.toString());

    // Create Test Researcher B (Unauthorized Attacker)
    const researcherB = await ResearcherProfile.create({
      userId: new mongoose.Types.ObjectId(),
      fullName: "Unauthorized Researcher (Test)",
      contact: { email: `unauthorized.${Date.now()}@edupye.test` },
      researchDomains: ["Economics"],
      onboardingCompleted: true,
    });
    cleanupIds.researcherIds.push(researcherB._id as mongoose.Types.ObjectId);
    console.log("✓ Unauthorized Researcher created:", researcherB._id.toString());

    // 2. Create Test Project
    console.log("\n[Test 2] Creating Test Research Project...");
    const project = await ResearchProject.create({
      ownerId: researcherA._id,
      title: "Vision Transformers for Volumetric Segmentation",
      description: "Investigation of hierarchical attention for low-shot CT scans",
      domain: "Computer Science",
      researchQuestion: "Can shifted windows reduce boundary blur in small lesion segmentation?",
      objectives: [
        "Benchmark Swin-UNETR against nnU-Net baselines",
        "Evaluate DSC and HD95 metrics on BraTS 2021",
      ],
      currentStage: "Writing",
      status: "Active",
    });
    cleanupIds.projectIds.push(project._id as mongoose.Types.ObjectId);
    console.log("✓ Project created:", project._id.toString());

    // 3. Create Test Papers
    console.log("\n[Test 3] Creating Test Research Papers...");
    const paperA = await ResearchPaper.create({
      ownerId: researcherA._id,
      title: "Swin-UNETR: Shifted Windows for Volumetric Medical Segmentation",
      authors: ["Hatamizadeh, A.", "Nath, V.", "Tang, Y."],
      year: 2022,
      venue: "MICCAI 2022",
      doi: "10.1007/978-3-031-16431-6",
      abstract: "We introduce Swin-UNETR, a hierarchical Vision Transformer for 3D medical image segmentation.",
      methodology: "Shifted window multi-head self-attention with multi-scale UNet decoders",
      datasets: ["BraTS 2021", "BTCV Multi-Organ"],
      findings: "Achieved state-of-the-art 0.884 average Dice score across brain tumors.",
      limitations: "High quadratic computational memory requirements in full 3D dense feature blocks.",
      tags: ["Vision Transformers", "Segmentation", "Medical AI"],
      projectIds: [project._id],
    });
    cleanupIds.paperIds.push(paperA._id as mongoose.Types.ObjectId);

    const paperB = await ResearchPaper.create({
      ownerId: researcherA._id,
      title: "nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation",
      authors: ["Isensee, F.", "Jaeger, P. F.", "Kohl, S. A."],
      year: 2021,
      venue: "Nature Methods",
      doi: "10.1038/s41592-020-01008-z",
      abstract: "nnU-Net is a self-configuring framework capable of adapting to any dataset automatically.",
      methodology: "Dynamic heuristics over 2D and 3D U-Net architectural ensembles",
      datasets: ["Medical Segmentation Decathlon"],
      findings: "Outperformed complex tailored architectures across 23 competitive benchmarks.",
      limitations: "Relies primarily on localized convolution receptive fields without long-range attention.",
      tags: ["nnU-Net", "Ensemble", "Segmentation"],
      projectIds: [project._id],
    });
    cleanupIds.paperIds.push(paperB._id as mongoose.Types.ObjectId);
    console.log("✓ 2 Test Papers created and linked to project");

    // Link papers to project.paperIds
    project.paperIds = [paperA._id as mongoose.Types.ObjectId, paperB._id as mongoose.Types.ObjectId];
    await project.save();

    // 4. Create Test Research Notes
    console.log("\n[Test 4] Creating Test Research Notes (Hypotheses & Critiques)...");
    const noteHypothesis = await ResearchNote.create({
      ownerId: researcherA._id,
      projectId: project._id,
      paperId: paperA._id,
      title: "Hypothesis: Depth-wise skip connections resolve Swin memory bottleneck",
      content: "Replacing full volumetric self-attention in the final decoder stage with localized depth-wise convolution will reduce GPU footprint by 35% without degrading Dice score.",
      noteType: "hypothesis",
      excerpt: "High quadratic computational memory requirements in full 3D dense feature blocks.",
      tags: ["hypothesis", "memory-optimization"],
      isPinned: true,
    });
    cleanupIds.noteIds.push(noteHypothesis._id as mongoose.Types.ObjectId);

    const noteCritique = await ResearchNote.create({
      ownerId: researcherA._id,
      projectId: project._id,
      paperId: paperB._id,
      title: "Critique: nnU-Net lack of global receptive fields",
      content: "Pure convolution kernels fail to capture long-range bilateral hemisphere context required for multi-focal glioblastoma lesions.",
      noteType: "critique",
      excerpt: "Relies primarily on localized convolution receptive fields.",
      tags: ["critique", "bilateral-context"],
    });
    cleanupIds.noteIds.push(noteCritique._id as mongoose.Types.ObjectId);
    console.log("✓ 2 Research Notes created (1 Hypothesis, 1 Critique)");

    // 5. Create Manuscript via manuscriptService
    console.log("\n[Test 5] Creating Manuscript with Default 9 Sections...");
    const manuscript = await manuscriptService.createManuscript(
      {
        projectId: project._id.toString(),
        title: "Hybrid Transformer Architectures for Low-Shot Volumetric CT",
        description: "Draft submission for IEEE Transactions on Medical Imaging",
        citationStyle: "IEEE",
      },
      researcherA._id.toString()
    );
    cleanupIds.manuscriptIds.push(manuscript._id as mongoose.Types.ObjectId);
    console.log("✓ Manuscript created successfully:", manuscript._id.toString());

    // 6. Verify Ownership
    console.log("\n[Test 6] Verifying Manuscript Ownership & Structure...");
    if (manuscript.ownerId.toString() !== researcherA._id.toString()) {
      throw new Error(`Owner ID mismatch: expected ${researcherA._id}, got ${manuscript.ownerId}`);
    }
    console.log("✓ Manuscript owner verified as Researcher A");

    // 7. Verify Default Sections & Ordering
    console.log("\n[Test 7] Verifying Default Section Generation...");
    const sections = await manuscriptService.getSections(
      manuscript._id.toString(),
      researcherA._id.toString()
    );
    console.log(`✓ Retrieved ${sections.length} sections for manuscript`);
    if (sections.length !== 9) {
      throw new Error(`Expected 9 default sections, got ${sections.length}`);
    }

    const expectedTitles = [
      "Abstract",
      "Introduction",
      "Literature Review",
      "Research Gap",
      "Methodology",
      "Results",
      "Discussion",
      "Conclusion",
      "References",
    ];
    sections.forEach((sec, idx) => {
      if (sec.order !== idx) {
        throw new Error(`Section order mismatch for "${sec.title}": expected ${idx}, got ${sec.order}`);
      }
      if (sec.title !== expectedTitles[idx]) {
        throw new Error(`Section title mismatch: expected "${expectedTitles[idx]}", got "${sec.title}"`);
      }
    });
    console.log("✓ Default section sequence and titles verified 0..8 (Abstract -> References)");

    // 8. Update Section Content & Attach Evidence
    console.log("\n[Test 8] Updating Section Content & Attaching Evidence Papers & Notes...");
    const litReviewSection = sections.find((s) => s.sectionType === "literature_review");
    if (!litReviewSection) throw new Error("Literature Review section not found");

    const updatedLitReview = await manuscriptService.updateSection(
      litReviewSection._id.toString(),
      {
        content: "Contemporary medical imaging architectures balance localized feature extraction with global attention.",
        evidencePaperIds: [paperA._id.toString(), paperB._id.toString()],
        evidenceNoteIds: [noteHypothesis._id.toString(), noteCritique._id.toString()],
      },
      researcherA._id.toString()
    );

    if (updatedLitReview.evidencePaperIds.length !== 2) {
      throw new Error(`Expected 2 evidence papers, got ${updatedLitReview.evidencePaperIds.length}`);
    }
    if (updatedLitReview.evidenceNoteIds.length !== 2) {
      throw new Error(`Expected 2 evidence notes, got ${updatedLitReview.evidenceNoteIds.length}`);
    }
    console.log("✓ Section content and 4 evidence links (2 papers, 2 notes) successfully saved and populated");

    // 9. Reorder Sections
    console.log("\n[Test 9] Reordering Manuscript Sections...");
    const reorderedInputs = sections.map((s, idx) => ({
      sectionId: s._id.toString(),
      order: sections.length - 1 - idx, // Reverse order for test
    }));

    await manuscriptService.reorderSections(
      manuscript._id.toString(),
      reorderedInputs,
      researcherA._id.toString()
    );

    const reorderedSections = await manuscriptService.getSections(
      manuscript._id.toString(),
      researcherA._id.toString()
    );
    if (reorderedSections[0]._id.toString() !== sections[sections.length - 1]._id.toString()) {
      throw new Error("Reorder failed: last section did not become first section");
    }
    console.log("✓ Section reordering verified");

    // Restore standard order
    await manuscriptService.reorderSections(
      manuscript._id.toString(),
      sections.map((s, idx) => ({ sectionId: s._id.toString(), order: idx })),
      researcherA._id.toString()
    );
    console.log("✓ Standard order restored");

    // 10. Security & Ownership Tests: Unauthorized Access Rejected
    console.log("\n[Test 10] Testing Security & Ownership Enforcement...");
    let unauthorizedGetBlocked = false;
    try {
      await manuscriptService.getManuscriptById(
        manuscript._id.toString(),
        researcherB._id.toString()
      );
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) {
        unauthorizedGetBlocked = true;
      }
    }
    if (!unauthorizedGetBlocked) {
      throw new Error("SECURITY FAILURE: Researcher B was able to view Researcher A's manuscript!");
    }
    console.log("✓ Unauthorized read access correctly rejected (403 Forbidden)");

    let unauthorizedUpdateBlocked = false;
    try {
      await manuscriptService.updateSection(
        litReviewSection._id.toString(),
        { content: "Hacked by Researcher B" },
        researcherB._id.toString()
      );
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) {
        unauthorizedUpdateBlocked = true;
      }
    }
    if (!unauthorizedUpdateBlocked) {
      throw new Error("SECURITY FAILURE: Researcher B was able to modify Researcher A's section!");
    }
    console.log("✓ Unauthorized write access correctly rejected (403 Forbidden)");

    // 11. Test AI Writing Assistance grounded in selected evidence
    console.log("\n[Test 11] Testing AI Writing Assistance with Grounded Evidence...");
    const aiDraftResult = await researchAiService.assistManuscriptWriting({
      manuscriptId: manuscript._id.toString(),
      sectionId: litReviewSection._id.toString(),
      action: "draft",
      sectionTitle: "Literature Review",
      sectionContent: "",
      paperIds: [paperA._id.toString(), paperB._id.toString()],
      noteIds: [noteHypothesis._id.toString()],
      researcherId: researcherA._id.toString(),
    });

    console.log("✓ AI Assist Response received:");
    console.log("  - Action:", aiDraftResult.action);
    console.log("  - Source Supported:", aiDraftResult.sourceSupported);
    console.log("  - Grounded Evidence Count:", aiDraftResult.groundedEvidence.length);
    console.log("  - Generated Text Length:", aiDraftResult.generatedText.length);

    if (!aiDraftResult.sourceSupported) {
      throw new Error("Expected sourceSupported to be true when papers and notes are provided");
    }
    if (aiDraftResult.groundedEvidence.length === 0) {
      throw new Error("Expected grounded evidence excerpts in AI response");
    }
    if (!aiDraftResult.generatedText.includes("Swin") && !aiDraftResult.generatedText.includes("Literature Review")) {
      throw new Error("AI draft did not incorporate paper title or section context");
    }
    console.log("✓ AI Writing Assistance correctly grounded in selected papers and hypotheses");

    // 12. Test Manuscript Persistence After Reload
    console.log("\n[Test 12] Testing Persistence After Fresh Reload...");
    const reloaded = await manuscriptService.getManuscriptById(
      manuscript._id.toString(),
      researcherA._id.toString()
    );
    if (!reloaded) throw new Error("Failed to reload manuscript");
    if (reloaded.title !== manuscript.title) {
      throw new Error(`Title mismatch on reload: expected ${manuscript.title}, got ${reloaded.title}`);
    }
    if (reloaded.sections.length !== 9) {
      throw new Error(`Section count mismatch on reload: expected 9, got ${reloaded.sections.length}`);
    }
    console.log("✓ Manuscript and sections persisted accurately in MongoDB");

    // 13. Test Deleting Manuscript and Sections Cleanup
    console.log("\n[Test 13] Deleting Manuscript and Verifying Cascade Cleanup...");
    const deleteResult = await manuscriptService.deleteManuscript(
      manuscript._id.toString(),
      researcherA._id.toString()
    );
    console.log("✓", deleteResult.message);

    const remainingSections = await ManuscriptSection.find({ manuscriptId: manuscript._id });
    if (remainingSections.length !== 0) {
      throw new Error(`Expected 0 remaining sections after manuscript deletion, found ${remainingSections.length}`);
    }
    console.log("✓ Cascade deletion verified: 0 orphaned sections remaining");

    console.log("\n=======================================================");
    console.log("🎉 ALL RESEARCH WRITING WORKSPACE TESTS PASSED (13/13)!");
    console.log("=======================================================");
  } catch (error: any) {
    console.error("\n❌ TEST SUITE FAILED:", error?.message || error);
    throw error;
  } finally {
    console.log("\nCleaning up test database records...");
    await ManuscriptSection.deleteMany({
      $or: [
        { ownerId: { $in: cleanupIds.researcherIds } },
        { manuscriptId: { $in: cleanupIds.manuscriptIds } },
      ],
    });
    await Manuscript.deleteMany({ _id: { $in: cleanupIds.manuscriptIds } });
    await ResearchNote.deleteMany({ _id: { $in: cleanupIds.noteIds } });
    await ResearchPaper.deleteMany({ _id: { $in: cleanupIds.paperIds } });
    await ResearchProject.deleteMany({ _id: { $in: cleanupIds.projectIds } });
    await ResearcherProfile.deleteMany({ _id: { $in: cleanupIds.researcherIds } });
    console.log("✓ Test database cleanup complete");
    await mongoose.disconnect();
  }
}

runResearchWritingVerification().catch((err) => {
  console.error("Verification script exited with error:", err);
  process.exit(1);
});
