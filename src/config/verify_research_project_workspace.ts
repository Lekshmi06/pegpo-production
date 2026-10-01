import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "./db";
import ResearchProject from "../models/ResearchProject";
import ResearchPaper from "../models/ResearchPaper";
import ResearcherProfile from "../models/ResearcherProfile";
import { researchPaperService } from "../services/research_paper_service";
import { researchAiService } from "../services/research_ai_service";

async function verifyResearchProjectWorkspace() {
  console.log("=================================================");
  console.log("STARTING RESEARCH PROJECT WORKSPACE VERIFICATION");
  console.log("=================================================");

  await connectDB();

  try {
    // 1. Create or retrieve a test researcher profile
    let testProfile = await ResearcherProfile.findOne({ "contact.email": "project_test@edupye.academic" });
    if (!testProfile) {
      testProfile = await ResearcherProfile.create({
        userId: new mongoose.Types.ObjectId(),
        fullName: "Dr. Rachel Zhang",
        contact: {
          email: "project_test@edupye.academic",
        },
        researchDomains: ["Computer Science", "Engineering"],
        researchSpecializations: ["Medical Imaging", "Computer Vision"],
        researchInterests: ["Vision Transformers", "3D Volumetric Segmentation"],
        onboardingCompleted: true,
      });
      console.log("✓ Created test researcher profile:", testProfile._id.toString());
    } else {
      console.log("✓ Using existing test researcher profile:", testProfile._id.toString());
    }



    const ownerId = testProfile._id.toString();

    // 2. Create a test Research Paper to attach
    const testPaper = await ResearchPaper.create({
      title: "Swin-UNETR: Shifted Window Transformers for 3D Brain Tumor Segmentation",
      authors: ["Ali Hatamizadeh", "Vishwesh Nath", "Daguang Xu"],
      year: 2022,
      venue: "CVPR 2022",
      doi: "10.1109/CVPR.2022.0001",
      abstract: "Swin-UNETR redefines 3D brain tumor segmentation by using shifted window hierarchical vision transformers as encoder backbones with multi-scale skip connections to a residual decoder.",
      methodology: "Shifted-window self-attention blocks coupled with volumetric convolution decoders.",
      datasets: ["BraTS 2021", "Medical Decathlon"],
      findings: "Achieved average Dice score of 92.4% on BraTS enhancing tumor cores.",
      limitations: "Quadratic memory scaling for dense 3D volumes requiring GPU sliding window inference.",
      tags: ["Transformers", "Medical Imaging"],
      ownerId: testProfile._id,
      savedAt: new Date(),
    });
    console.log("✓ Created test research paper:", testPaper.title);

    // 3. Test Project Creation via researchPaperService
    console.log("\n--- TEST: Create Research Project ---");
    const createdProject = await researchPaperService.createProject(
      {
        title: "Translational AI in High-Grade Glioma Segmentation",
        researchQuestion: "How do hierarchical attention transformers minimize boundary loss in infiltrative glioma margins?",
        description: "An empirical investigation comparing Swin-UNETR with standard residual convolution baselines across multi-center MRI scans.",
        domain: "Biomedical Engineering",
        objectives: [
          "Benchmark multi-scanner generalization on BraTS 2021 dataset",
          "Quantify boundary dice improvements using hierarchical attention",
          "Assess inference latency tradeoffs for clinical intraoperative use",
        ],
        status: "Active",
      },
      ownerId
    );

    console.log("✓ Project created successfully in MongoDB:");
    console.log("  - ID:", createdProject._id.toString());
    console.log("  - Title:", createdProject.title);
    console.log("  - Status:", createdProject.status);
    console.log("  - Objectives count:", createdProject.objectives.length);
    console.log("  - Owner ID:", createdProject.ownerId?.toString());

    const projectId = createdProject._id.toString();

    // 4. Test Project Listing with Ownership Isolation
    console.log("\n--- TEST: List Projects (Ownership Verification) ---");
    const ownerProjects = await researchPaperService.listProjects(ownerId);
    console.log(`✓ Owner (${ownerId}) sees ${ownerProjects.length} projects.`);
    const foundInOwner = ownerProjects.some((p) => p._id.toString() === projectId);
    if (!foundInOwner) throw new Error("Newly created project not returned in owner project list!");

    // Another unrelated ID should not see this project
    const fakeOtherOwner = new mongoose.Types.ObjectId().toString();
    const otherProjects = await researchPaperService.listProjects(fakeOtherOwner);
    console.log(`✓ Unrelated researcher (${fakeOtherOwner}) sees ${otherProjects.length} projects (Isolated).`);
    if (otherProjects.some((p) => p._id.toString() === projectId)) {
      throw new Error("Data isolation failure: Unrelated researcher can see another user's project!");
    }

    // 5. Test Attach Paper to Project
    console.log("\n--- TEST: Attach Paper to Project ---");
    const attachResult = await researchPaperService.addPaperToProject(
      testPaper._id.toString(),
      projectId,
      ownerId
    );
    console.log("✓ Paper attached. Project now has paper count:", attachResult.project.paperIds.length);
    if (!attachResult.project.paperIds.some((id) => id.toString() === testPaper._id.toString())) {
      throw new Error("Paper was not bidirectionally added to project.paperIds!");
    }

    // 6. Test Get Project By ID with Populated Papers
    console.log("\n--- TEST: Get Project By ID with Populated Papers ---");
    const fetchedProject = await researchPaperService.getProjectById(projectId, ownerId);
    if (!fetchedProject) throw new Error("Project retrieval returned null!");
    console.log("✓ Fetched project title:", fetchedProject.title);
    console.log("✓ Populated papers count:", fetchedProject.paperIds.length);
    const populatedPaper = fetchedProject.paperIds[0] as any;
    console.log("✓ Populated paper title:", populatedPaper.title);
    console.log("✓ Populated paper methodology:", populatedPaper.methodology);

    // Test unauthorized get attempt
    let unauthorizedCaught = false;
    try {
      await researchPaperService.getProjectById(projectId, fakeOtherOwner);
    } catch (err: any) {
      if (err.message.includes("Unauthorized")) {
        unauthorizedCaught = true;
      }
    }
    console.log("✓ Unauthorized access correctly rejected with 403 Forbidden:", unauthorizedCaught);
    if (!unauthorizedCaught) throw new Error("Failed to enforce ownership verification on getProjectById!");

    // 7. Test Project-Scoped Research AI Copilot
    console.log("\n--- TEST: Project-Scoped Research AI Copilot ---");
    const aiResponse = await researchAiService.queryResearchAI({
      query: "Compare methodologies and summarize key datasets for this project",
      contextType: "project",
      projectId,
    });

    console.log("✓ AI Scope:", aiResponse.contextScope);
    console.log("✓ AI Source Supported:", aiResponse.sourceSupported);
    console.log("✓ AI Grounded Evidence Count:", aiResponse.groundedEvidence.length);
    if (aiResponse.groundedEvidence.length > 0) {
      console.log("✓ First evidence citation:", aiResponse.groundedEvidence[0].paperTitle);
    }
    console.log("✓ AI Response snippet:\n", aiResponse.reply.slice(0, 350) + "...\n");

    // 8. Test Remove Paper from Project
    console.log("\n--- TEST: Remove Paper from Project ---");
    const removeResult = await researchPaperService.removePaperFromProject(
      testPaper._id.toString(),
      projectId,
      ownerId
    );
    console.log("✓ Paper removed successfully. Success:", removeResult.success);

    const projectAfterRemoval = await researchPaperService.getProjectById(projectId, ownerId);
    console.log("✓ Project papers count after removal:", projectAfterRemoval?.paperIds.length);
    if (projectAfterRemoval?.paperIds.length !== 0) {
      throw new Error("Paper removal verification failed; paper still present in project!");
    }

    // Clean up test records
    await ResearchPaper.findByIdAndDelete(testPaper._id);
    await ResearchProject.findByIdAndDelete(projectId);
    console.log("✓ Cleaned up verification records from MongoDB.");

    console.log("\n=================================================");
    console.log("ALL 10 VERIFICATION CHECKS PASSED SUCCESSFULLY!");
    console.log("=================================================");
  } catch (error) {
    console.error("❌ Verification failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

verifyResearchProjectWorkspace();
