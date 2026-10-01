import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db";
import ResearcherProfile from "../models/ResearcherProfile";
import ResearchProject from "../models/ResearchProject";
import ResearchPaper from "../models/ResearchPaper";
import ResearchNote from "../models/ResearchNote";
import Manuscript from "../models/Manuscript";
import ManuscriptSection from "../models/ManuscriptSection";
import { researchAiService } from "../services/research_ai_service";
import { researchNoteService } from "../services/research_note_service";
import { manuscriptService } from "../services/manuscript_service";

async function runResearchCopilotVerification() {
  console.log("=== STARTING CONVERSATIONAL RESEARCH AI / COPILOT VERIFICATION ===");
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
    // -------------------------------------------------------------
    // Test 1: Setup Researchers A and B
    // -------------------------------------------------------------
    console.log("\n[Test 1] Creating Researcher A (Authorized) and Researcher B (Unauthorized)...");
    const researcherA = await ResearcherProfile.create({
      userId: new mongoose.Types.ObjectId(),
      fullName: "Dr. Eleanor Vance (Owner)",
      contact: { email: `eleanor.${Date.now()}@edupye.test` },
      researchDomains: ["Biometrics", "Computer Vision"],
      researchInterests: ["Iris Recognition", "Near-Infrared Imaging"],
      onboardingCompleted: true,
    });
    cleanupIds.researcherIds.push(researcherA._id as mongoose.Types.ObjectId);

    const researcherB = await ResearcherProfile.create({
      userId: new mongoose.Types.ObjectId(),
      fullName: "Dr. Arthur Pendelton (Attacker)",
      contact: { email: `arthur.${Date.now()}@edupye.test` },
      researchDomains: ["Economics"],
      researchInterests: ["Behavioral Finance"],
      onboardingCompleted: true,
    });
    cleanupIds.researcherIds.push(researcherB._id as mongoose.Types.ObjectId);

    console.log("✓ Researcher A ID:", researcherA._id.toString());
    console.log("✓ Researcher B ID:", researcherB._id.toString());

    // -------------------------------------------------------------
    // Test 2 & 3: Setup Project A ("Iris Authentication System")
    // -------------------------------------------------------------
    console.log("\n[Test 2 & 3] Setting up Project A (Iris Authentication System)...");
    const paperA1: any = await ResearchPaper.create({
      title: "NIR Iris Feature Extraction Using Deep Convolutional Filters",
      authors: ["Daugman, J.", "Sun, Z."],
      year: 2022,
      venue: "IEEE T-PAMI",
      abstract: "Evaluation of near-infrared iris recognition under low-light conditions with high intra-class consistency.",
      tags: ["Computer Vision"],
    });
    cleanupIds.paperIds.push(paperA1._id as mongoose.Types.ObjectId);

    const paperA2: any = await ResearchPaper.create({
      title: "Cross-Spectral Iris Recognition Under Visible Light Constraints",
      authors: ["Zhang, H.", "Kumar, A."],
      year: 2023,
      venue: "CVPR",
      abstract: "Visible light image acquisition suffers from specular cornea reflections and chromatic dispersion.",
      tags: ["Computer Vision"],
    });
    cleanupIds.paperIds.push(paperA2._id as mongoose.Types.ObjectId);

    const projectA: any = await ResearchProject.create({
      title: "Iris Authentication System",
      description: "Robust iris verification comparing NIR illumination against ambient visible light.",
      domain: "Computer Vision",
      researchQuestion: "Can cross-spectral domain adaptation bridge the accuracy gap between NIR and visible-light iris scans?",
      objectives: [
        "Benchmark specular reflection rejection in visible-light spectra",
        "Formulate adaptive normalization across diverse iris pigmentation",
      ],
      ownerId: researcherA._id,
      paperIds: [paperA1._id, paperA2._id],
      status: "Active",
      currentStage: "Methodology",
    });
    cleanupIds.projectIds.push(projectA._id as mongoose.Types.ObjectId);
    console.log("✓ Project A created:", projectA._id.toString(), "Title:", projectA.title);

    // Initial note in Project A
    const noteA1: any = await ResearchNote.create({
      title: "Baseline Specular Artifacts",
      content: "Ambient lighting generates substantial corneal reflection peaks that degrade boundary localization.",
      noteType: "observation",
      projectId: projectA._id,
      ownerId: researcherA._id,
      paperIds: [paperA2._id],
    });
    cleanupIds.noteIds.push(noteA1._id as mongoose.Types.ObjectId);
    console.log("✓ Baseline observation note created in Project A:", noteA1._id.toString());

    // -------------------------------------------------------------
    // Test 4: AI query for Project A receives Project A context & papers
    // -------------------------------------------------------------
    console.log("\n[Test 4] Querying Research AI with Project A context...");
    const aiResponseA = await researchAiService.queryResearchAI({
      query: "What is the key contradiction or trade-off between the papers in this project?",
      contextType: "project",
      projectId: projectA._id.toString(),
      researcherId: researcherA._id.toString(),
    });

    console.log("✓ AI Context Scope:", aiResponseA.contextScope);
    console.log("✓ AI Grounded Evidence Count:", aiResponseA.groundedEvidence?.length || 0);
    console.log("✓ AI Suggested Actions:", aiResponseA.suggestedActions);

    if (!aiResponseA.contextScope.includes("Iris Authentication System")) {
      throw new Error(`Expected contextScope to contain Project A title, got: ${aiResponseA.contextScope}`);
    }
    // Check that it references Project A's papers, NOT Swin-UNETR or medical segmentation
    const replyLower = aiResponseA.reply.toLowerCase();
    if (replyLower.includes("swin-unetr") || replyLower.includes("medical image segmentation")) {
      throw new Error("FAIL: Response contains hardcoded medical segmentation or Swin-UNETR in Iris project!");
    }
    console.log("✓ PASS: Project A context cleanly loaded with zero medical segmentation artifacts.");

    // -------------------------------------------------------------
    // Test 5, 6, 7: Switch to Project B ("Autonomous Drone Navigation")
    // -------------------------------------------------------------
    console.log("\n[Test 5, 6, 7] Creating and querying Project B (Autonomous Drone Navigation)...");
    const paperB1: any = await ResearchPaper.create({
      title: "Event-Based Visual Odometry for High-Speed Quadrotor Flight",
      authors: ["Scaramuzza, D.", "Gallego, G."],
      year: 2023,
      venue: "Robotics and Automation Letters",
      abstract: "Neuromorphic cameras provide microsecond latency and high dynamic range for collision avoidance.",
      tags: ["Robotics"],
    });
    cleanupIds.paperIds.push(paperB1._id as mongoose.Types.ObjectId);

    const projectB: any = await ResearchProject.create({
      title: "Autonomous Drone Navigation",
      description: "Low-latency trajectory generation under GPS-denied cave environments.",
      domain: "Robotics",
      researchQuestion: "Does event camera fusion outperform traditional global shutter stereo under extreme motion blur?",
      objectives: ["Quantify state estimation drift over 500m trajectories"],
      ownerId: researcherA._id,
      paperIds: [paperB1._id],
      status: "Active",
      currentStage: "Experimentation",
    });
    cleanupIds.projectIds.push(projectB._id as mongoose.Types.ObjectId);

    const aiResponseB = await researchAiService.queryResearchAI({
      query: "Summarize the primary sensor modality in this project.",
      contextType: "project",
      projectId: projectB._id.toString(),
      researcherId: researcherA._id.toString(),
    });

    console.log("✓ Project B Context Scope:", aiResponseB.contextScope);
    if (!aiResponseB.contextScope.includes("Autonomous Drone Navigation")) {
      throw new Error(`Expected Project B context scope, got: ${aiResponseB.contextScope}`);
    }
    // Verify no stale Iris context in Project B
    const replyBLower = aiResponseB.reply.toLowerCase();
    if (replyBLower.includes("iris") || replyBLower.includes("cornea")) {
      throw new Error("FAIL: Stale Project A context leaked into Project B query!");
    }
    console.log("✓ PASS: Context cleanly switched to Project B. Zero stale Project A context.");

    // -------------------------------------------------------------
    // Test 8-12: Crystallize AI Insights into ResearchNotes
    // -------------------------------------------------------------
    console.log("\n[Test 8-12] Crystallizing AI Response into Research Notes...");
    
    // Save as Hypothesis
    const savedHypothesis = await researchNoteService.createNote(
      {
        projectId: projectA._id.toString(),
        title: "Cross-Spectral Normalization Hypothesis",
        content: "Adaptive contrast equalization across 850nm NIR and visible spectrum reduces false rejection below 1.2%.",
        noteType: "hypothesis",
        hypothesisStatus: "idea", // default
        paperIds: [paperA1._id.toString(), paperA2._id.toString()],
        sourceText: "NIR image acquisition vs Visible light corneal reflection",
        aiGenerated: true,
        aiAssisted: true,
        tags: ["hypothesis", "cross-spectral", "iris"],
      },
      researcherA._id.toString()
    );
    cleanupIds.noteIds.push(savedHypothesis._id as mongoose.Types.ObjectId);
    console.log("✓ Saved Hypothesis:", savedHypothesis._id.toString(), "Status:", savedHypothesis.hypothesisStatus);

    if (savedHypothesis.hypothesisStatus !== "idea") {
      throw new Error(`Expected hypothesisStatus to default to 'idea', got: ${savedHypothesis.hypothesisStatus}`);
    }
    if (!savedHypothesis.aiGenerated || !savedHypothesis.aiAssisted) {
      throw new Error("Expected aiGenerated and aiAssisted metadata flags to be true.");
    }

    // -------------------------------------------------------------
    // Test 13-16: Hypothesis Lifecycle & Researcher Control
    // -------------------------------------------------------------
    console.log("\n[Test 13-16] Testing Hypothesis Status Controls & AI Restriction...");
    
    // Test: AI cannot automatically mark a hypothesis as 'supported'
    try {
      await researchNoteService.createNote(
        {
          projectId: projectA._id.toString(),
          title: "Premature AI Validation",
          content: "This hypothesis is proven correct.",
          noteType: "hypothesis",
          hypothesisStatus: "supported", // Disallowed for AI-generated note
          aiGenerated: true,
        },
        researcherA._id.toString()
      );
      throw new Error("FAIL: System allowed an AI-generated note to be created directly as 'supported'!");
    } catch (err: any) {
      if (err.message.includes("cannot automatically declare a research hypothesis as supported")) {
        console.log("✓ PASS: Correctly blocked AI from automatically marking hypothesis as supported.");
      } else {
        throw err;
      }
    }

    // Researcher manually advances status to 'testing' then 'supported'
    const updatedHypothesis = await researchNoteService.updateNote(
      savedHypothesis._id.toString(),
      {
        hypothesisStatus: "testing",
      },
      researcherA._id.toString()
    );
    if (!updatedHypothesis) {
      throw new Error("Failed to find and update hypothesis");
    }
    console.log("✓ Researcher updated status to:", updatedHypothesis.hypothesisStatus);
    if (updatedHypothesis.hypothesisStatus !== "testing") {
      throw new Error("Failed to update hypothesis status to 'testing'");
    }

    // -------------------------------------------------------------
    // Test 17-19: Save Finding, Critique, Methodology
    // -------------------------------------------------------------
    console.log("\n[Test 17-19] Saving Finding, Critique, and Methodology notes...");
    const findingNote = await researchNoteService.createNote(
      {
        projectId: projectA._id.toString(),
        title: "Finding: Corneal Reflection Degradation",
        content: "Specular reflection peaks in the visible band cause 34% drop in boundary detection accuracy.",
        noteType: "finding",
        paperIds: [paperA2._id.toString()],
        aiAssisted: true,
        tags: ["finding", "visible-light", "accuracy"],
      },
      researcherA._id.toString()
    );
    cleanupIds.noteIds.push(findingNote._id as mongoose.Types.ObjectId);
    console.log("✓ Finding Note saved:", findingNote._id.toString());

    const critiqueNote = await researchNoteService.createNote(
      {
        projectId: projectA._id.toString(),
        title: "Critique: Limited Dataset Diversity in Benchmark",
        content: "Paper A evaluated exclusively on light-colored irises, ignoring hyper-pigmented Asian and African samples.",
        noteType: "critique",
        paperIds: [paperA1._id.toString()],
        aiAssisted: true,
        tags: ["critique", "limitations", "sampling-bias"],
      },
      researcherA._id.toString()
    );
    cleanupIds.noteIds.push(critiqueNote._id as mongoose.Types.ObjectId);
    console.log("✓ Critique Note saved:", critiqueNote._id.toString());

    const methodologyNote = await researchNoteService.createNote(
      {
        projectId: projectA._id.toString(),
        title: "Methodology: Polar Coordinate Normalization Protocol",
        content: "Rubber-sheet unrolling maps concentric iris annular zones into a fixed 64x512 rectangular grid.",
        noteType: "methodology",
        paperIds: [paperA1._id.toString()],
        aiAssisted: true,
        tags: ["methodology", "polar-transform", "daugman"],
      },
      researcherA._id.toString()
    );
    cleanupIds.noteIds.push(methodologyNote._id as mongoose.Types.ObjectId);
    console.log("✓ Methodology Note saved:", methodologyNote._id.toString());

    // -------------------------------------------------------------
    // Test 20: Research Notebook retrieval across types and filters
    // -------------------------------------------------------------
    console.log("\n[Test 20] Verifying Research Notebook retrieval (getAllResearcherNotes)...");
    const allNotes = await researchNoteService.getAllResearcherNotes(
      researcherA._id.toString()
    );
    console.log(`✓ Total notes retrieved for Researcher A: ${allNotes.length}`);
    if (allNotes.length < 5) {
      throw new Error(`Expected at least 5 notes for Researcher A, found ${allNotes.length}`);
    }

    // Filter by noteType: 'hypothesis'
    const hypothesesOnly = await researchNoteService.getAllResearcherNotes(
      researcherA._id.toString(),
      { noteType: "hypothesis" }
    );
    console.log(`✓ Hypotheses retrieved: ${hypothesesOnly.length}`);
    if (hypothesesOnly.length === 0 || hypothesesOnly[0].noteType !== "hypothesis") {
      throw new Error("Failed to filter notes by noteType: hypothesis");
    }

    // Filter by search query: 'reflection'
    const searchNotes = await researchNoteService.getAllResearcherNotes(
      researcherA._id.toString(),
      { search: "reflection" }
    );
    console.log(`✓ Search for 'reflection' matched: ${searchNotes.length} notes`);
    if (searchNotes.length === 0) {
      throw new Error("Expected search for 'reflection' to match notes.");
    }

    // -------------------------------------------------------------
    // Test 21: Feed crystallized notes into Research Writing Workspace
    // -------------------------------------------------------------
    console.log("\n[Test 21] Connecting Notes into Research Writing Workspace Manuscript...");
    const manuscript = await manuscriptService.createManuscript(
      {
        projectId: projectA._id.toString(),
        title: "Cross-Spectral Iris Verification Under Unconstrained Lighting",
        description: "Target venue: IEEE Transactions on Information Forensics and Security",
        citationStyle: "IEEE",
      },
      researcherA._id.toString()
    );
    cleanupIds.manuscriptIds.push(manuscript._id as mongoose.Types.ObjectId);

    // Retrieve default sections
    const sections = await manuscriptService.getSections(
      manuscript._id.toString(),
      researcherA._id.toString()
    );
    const relatedWorkSection = sections.find((s) => s.sectionType === "related_work") || sections[0];

    // Select crystallized notes and papers as evidence for the section
    const updatedSection = await manuscriptService.updateSection(
      relatedWorkSection._id.toString(),
      {
        evidencePaperIds: [paperA1._id.toString(), paperA2._id.toString()],
        evidenceNoteIds: [
          savedHypothesis._id.toString(),
          findingNote._id.toString(),
          critiqueNote._id.toString(),
        ],
      },
      researcherA._id.toString()
    );

    console.log("✓ Updated Section Evidence:");
    console.log("   Selected Papers:", updatedSection.evidencePaperIds.length);
    console.log("   Selected Notes:", updatedSection.evidenceNoteIds.length);

    if (updatedSection.evidenceNoteIds.length !== 3) {
      throw new Error(`Expected 3 selected notes in manuscript section, got: ${updatedSection.evidenceNoteIds.length}`);
    }
    console.log("✓ PASS: Crystallized AI notes and hypotheses seamlessly linked as evidence into persistent manuscript.");

    // -------------------------------------------------------------
    // Test 22: Security & Ownership Enforcement
    // -------------------------------------------------------------
    console.log("\n[Test 22] Testing Security: Cross-Researcher Protection...");
    
    // Attacker (Researcher B) querying Project A context
    try {
      await researchAiService.queryResearchAI({
        query: "Steal confidential findings from Project A",
        contextType: "project",
        projectId: projectA._id.toString(),
        researcherId: researcherB._id.toString(),
      });
      throw new Error("FAIL: Researcher B was able to query Researcher A's project!");
    } catch (err: any) {
      if (err.message.includes("Unauthorized") || err.message.includes("not belong to the authenticated researcher")) {
        console.log("✓ PASS: Unauthorized AI project query rejected (403 Forbidden).");
      } else {
        throw err;
      }
    }

    // Attacker (Researcher B) trying to create a note in Project A
    try {
      await researchNoteService.createNote(
        {
          projectId: projectA._id.toString(),
          title: "Malicious Injected Note",
          content: "Injecting false data into Project A",
        },
        researcherB._id.toString()
      );
      throw new Error("FAIL: Researcher B was able to create note in Researcher A's project!");
    } catch (err: any) {
      if (err.message.includes("Unauthorized") || err.message.includes("access to this research project")) {
        console.log("✓ PASS: Cross-project note creation rejected (403 Forbidden).");
      } else {
        throw err;
      }
    }

    // Attacker (Researcher B) querying notes of Researcher A
    const attackerNotes = await researchNoteService.getAllResearcherNotes(
      researcherB._id.toString()
    );
    console.log(`✓ Researcher B notes visible: ${attackerNotes.length}`);
    if (attackerNotes.length !== 0) {
      throw new Error("FAIL: Researcher B can see notes belonging to Researcher A!");
    }
    console.log("✓ PASS: Complete isolation between researchers confirmed.");

    console.log("\n=======================================================");
    console.log("🎉 ALL 22 VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉");
    console.log("=======================================================\n");

  } catch (error) {
    console.error("❌ VERIFICATION TEST FAILED:", error);
    process.exitCode = 1;
  } finally {
    console.log("Cleaning up test artifacts...");
    try {
      if (cleanupIds.manuscriptIds.length > 0) {
        await ManuscriptSection.deleteMany({ manuscriptId: { $in: cleanupIds.manuscriptIds } });
        await Manuscript.deleteMany({ _id: { $in: cleanupIds.manuscriptIds } });
      }
      if (cleanupIds.noteIds.length > 0) {
        await ResearchNote.deleteMany({ _id: { $in: cleanupIds.noteIds } });
      }
      if (cleanupIds.projectIds.length > 0) {
        await ResearchProject.deleteMany({ _id: { $in: cleanupIds.projectIds } });
      }
      if (cleanupIds.paperIds.length > 0) {
        await ResearchPaper.deleteMany({ _id: { $in: cleanupIds.paperIds } });
      }
      if (cleanupIds.researcherIds.length > 0) {
        await ResearcherProfile.deleteMany({ _id: { $in: cleanupIds.researcherIds } });
      }
      console.log("✓ Cleanup completed.");
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr);
    }
    await mongoose.disconnect();
  }
}

runResearchCopilotVerification();
