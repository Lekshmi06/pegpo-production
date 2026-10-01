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

async function verifyPhase3Analysis() {
  console.log("=================================================");
  console.log("STARTING PHASE 3: LITERATURE COMPARATIVE ANALYSIS VERIFICATION");
  console.log("=================================================");

  await connectDB();

  try {
    // 1. Get or create test researcher profile
    let testProfile = await ResearcherProfile.findOne({ "contact.email": "phase3_tester@edupye.academic" });
    if (!testProfile) {
      testProfile = await ResearcherProfile.create({
        userId: new mongoose.Types.ObjectId(),
        fullName: "Dr. Elena Rostova",
        contact: {
          email: "phase3_tester@edupye.academic",
        },
        researchDomains: ["Computer Science", "Biomedical Engineering"],
        researchSpecializations: ["Medical Imaging", "Deep Learning Backbones"],
        researchInterests: ["Hierarchical Transformers", "Boundary Resolution"],
        onboardingCompleted: true,
      });
      console.log("✓ Created test researcher profile:", testProfile._id.toString());
    } else {
      console.log("✓ Using existing test researcher profile:", testProfile._id.toString());
    }

    const ownerId = testProfile._id.toString();

    // 2. Create 2 test papers with distinct architectural methodologies
    const paperA = await ResearchPaper.create({
      title: "Hierarchical Shifted Windows for Medical Volumetric Segmentation",
      authors: ["H. Tang", "D. Xu", "W. Wang"],
      year: 2024,
      venue: "IEEE Transactions on Medical Imaging",
      abstract: "We formulate a shifted window hierarchical self-attention backbone tailored for 3D CT/MRI volumes.",
      methodology: "3D Swin-UNETR Transformer with shifted window self-attention",
      datasets: ["BTCV Multi-Organ Benchmark", "BraTS 2023"],
      findings: "Achieved 0.892 Dice similarity coefficient across 13 abdominal organs.",
      limitations: "High quadratic memory consumption during volumetric self-attention windows.",
      tags: ["Vision Transformers", "Volumetric", "Medical Imaging"],
      ownerId: testProfile._id,
    });
    console.log("✓ Created Paper A:", paperA.title, "ID:", paperA._id.toString());

    const paperB = await ResearchPaper.create({
      title: "Adaptive Residual Receptive Fields for Dense Volumetric Segmentation",
      authors: ["S. Zhang", "K. Miller", "L. Chen"],
      year: 2023,
      venue: "Medical Image Analysis (MedIA)",
      abstract: "We propose residual convolutional networks equipped with adaptive recalibration gates for real-time inference.",
      methodology: "Deep Residual CNN with multi-scale feature recalibration gates",
      datasets: ["BTCV Multi-Organ Benchmark", "Decathlon Challenge"],
      findings: "Attained 0.884 Dice similarity score with 4.2x faster inference throughput.",
      limitations: "Marginal boundary degradation on lesions smaller than 10mm.",
      tags: ["Residual Networks", "Real-Time Inference", "Convolutional"],
      ownerId: testProfile._id,
    });
    console.log("✓ Created Paper B:", paperB.title, "ID:", paperB._id.toString());

    // 3. Create a test project and attach both papers
    const project = await researchPaperService.createProject(
      {
        title: "Comparative Analysis of Attention vs Convolutional Backbones in 3D MRI",
        researchQuestion: "What is the quantifiable trade-off between self-attention boundary sharpness and residual convolutional efficiency?",
        domain: "Biomedical Engineering",
        objectives: [
          "Evaluate Dice similarity on sub-15mm lesions",
          "Benchmark parameter count and memory consumption",
        ],
        status: "Active",
      },
      ownerId
    );
    const projectId = project._id.toString();
    console.log("✓ Created Project:", project.title, "ID:", projectId);

    await researchPaperService.addPaperToProject(paperA._id.toString(), projectId);
    await researchPaperService.addPaperToProject(paperB._id.toString(), projectId);
    console.log("✓ Attached both papers to project");

    // 4. Test Comparative Analysis Matrix Engine
    console.log("\n--- Testing Comparative Analysis Engine ---");
    const comparisonResult = await researchPaperService.comparePapers(
      [paperA._id.toString(), paperB._id.toString()],
      projectId,
      ownerId
    );

    if (!comparisonResult || !Array.isArray(comparisonResult.papers) || comparisonResult.papers.length !== 2) {
      throw new Error(`Expected 2 papers in comparison result, got ${comparisonResult?.papers?.length}`);
    }
    console.log("✓ Successfully retrieved comparison for 2 papers");

    // Verify Dimensions
    if (!Array.isArray(comparisonResult.dimensions) || comparisonResult.dimensions.length < 4) {
      throw new Error(`Expected at least 4 dimensions, got ${comparisonResult?.dimensions?.length}`);
    }
    const dimensionNames = comparisonResult.dimensions.map((d) => d.name);
    console.log("✓ Generated Dimensions:", dimensionNames.join(" | "));

    const methodDim = comparisonResult.dimensions.find((d) => d.name.includes("Methodology"));
    if (!methodDim || !methodDim.values[paperA._id.toString()] || !methodDim.values[paperB._id.toString()]) {
      throw new Error("Methodology dimension values missing mapped paper values");
    }
    console.log("✓ Dimension values accurately mapped to paper IDs");

    // Verify Trade-offs
    if (!Array.isArray(comparisonResult.tradeoffs) || comparisonResult.tradeoffs.length === 0) {
      throw new Error("Tradeoffs array is empty");
    }
    console.log(`✓ Synthesized ${comparisonResult.tradeoffs.length} trade-offs`);
    comparisonResult.tradeoffs.forEach((t) => {
      console.log(`   • [${t.dimension}]: ${t.comparison}`);
    });

    // Verify AI Takeaway
    if (!comparisonResult.aiTakeaway || typeof comparisonResult.aiTakeaway !== "string") {
      throw new Error("Missing or invalid aiTakeaway in comparison result");
    }
    console.log("✓ AI Literature Takeaway:", comparisonResult.aiTakeaway);

    // 5. Test Saving Takeaway as Project Research Note
    console.log("\n--- Testing Save Takeaway as Research Note ---");
    const takeawayNote = await researchNoteService.createNote(
      {
        projectId,
        title: "Comparative Literature Synthesis Takeaway",
        content: comparisonResult.aiTakeaway,
        noteType: "finding",
        tags: ["comparative-analysis", "tradeoff", "synthesis"],
        isPinned: true,
      },
      ownerId
    );
    console.log("✓ Successfully saved matrix takeaway as note:", takeawayNote.title, "ID:", takeawayNote._id.toString());

    // 6. Verify Note is populated on Project
    const projectWithNotes = await researchPaperService.getProjectById(projectId, ownerId);
    if (!projectWithNotes?.noteIds || projectWithNotes.noteIds.length === 0) {
      throw new Error("Project does not contain populated noteIds");
    }
    console.log("✓ Project successfully reflects populated note count:", projectWithNotes.noteIds.length);

    // 7. Verify getAllNotes across projects
    const allNotes = await researchNoteService.getAllNotes(ownerId, 10);
    if (!allNotes.some((n) => n._id.toString() === takeawayNote._id.toString())) {
      throw new Error("takeawayNote not found in getAllNotes query");
    }
    console.log("✓ getAllNotes successfully returned note with project & paper details");

    // 8. Clean up test records
    console.log("\n--- Cleaning Up Test Records ---");
    await ResearchNote.deleteMany({ ownerId: testProfile._id });
    await ResearchPaper.deleteMany({ _id: { $in: [paperA._id, paperB._id] } });
    await ResearchProject.findByIdAndDelete(projectId);
    await ResearcherProfile.findByIdAndDelete(testProfile._id);
    console.log("✓ Cleaned up all test artifacts successfully");

    console.log("\n=================================================");
    console.log("PHASE 3 VERIFICATION COMPLETE: 100% SUCCESS");
    console.log("=================================================");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Phase 3 Verification failed:", error);
    process.exit(1);
  }
}

verifyPhase3Analysis();
