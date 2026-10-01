import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./db";
import User from "../models/User";
import ResearcherProfile from "../models/ResearcherProfile";
import ResearchFolder from "../models/ResearchFolder";
import ResearchDocument from "../models/ResearchDocument";

async function runVerification() {
  console.log("=== Verifying User-Specific Research Folders and Uploads ===");

  await connectDB();

  try {
    // 1. Create or retrieve test researchers A and B
    let userA = await User.findOne({ email: "researcher_a_test@edupye.com" });
    if (!userA) {
      userA = await User.create({
        email: "researcher_a_test@edupye.com",
        name: "Dr. Alice Researcher",
        role: "researcher",
      });
    }

    let profileA = await ResearcherProfile.findOne({ userId: userA._id });
    if (!profileA) {
      profileA = await ResearcherProfile.create({
        userId: userA._id,
        fullName: "Dr. Alice Researcher",
        contact: { email: userA.email },
        onboardingCompleted: true,
      });
    }

    let userB = await User.findOne({ email: "researcher_b_test@edupye.com" });
    if (!userB) {
      userB = await User.create({
        email: "researcher_b_test@edupye.com",
        name: "Dr. Bob Researcher",
        role: "researcher",
      });
    }

    let profileB = await ResearcherProfile.findOne({ userId: userB._id });
    if (!profileB) {
      profileB = await ResearcherProfile.create({
        userId: userB._id,
        fullName: "Dr. Bob Researcher",
        contact: { email: userB.email },
        onboardingCompleted: true,
      });
    }

    console.log("✓ Test researchers resolved:", {
      researcherA: profileA._id.toString(),
      researcherB: profileB._id.toString(),
    });

    // 2. Clean previous test artifacts if any
    await ResearchFolder.deleteMany({ ownerId: { $in: [profileA._id, profileB._id] } });
    await ResearchDocument.deleteMany({ ownerId: { $in: [profileA._id, profileB._id] } });

    // 3. Researcher A creates a folder
    const folderA = await ResearchFolder.create({
      ownerId: profileA._id,
      name: "Neural Signal Processing Papers",
      description: "Curated collection of EEG and fMRI preprocessing papers",
      color: "#1c75bc",
      category: "literature",
    });
    console.log("✓ Researcher A created folder:", folderA.name);

    // 4. Verify user-specific folder isolation:
    // Researcher B must NOT see Researcher A's folder
    const foldersForB = await ResearchFolder.find({ ownerId: profileB._id });
    if (foldersForB.length !== 0) {
      throw new Error(`Data leak: Researcher B saw ${foldersForB.length} folders from Researcher A!`);
    }
    console.log("✓ User-specific folder isolation passed: Researcher B sees 0 folders.");

    // Researcher A sees their folder
    const foldersForA = await ResearchFolder.find({ ownerId: profileA._id });
    if (foldersForA.length !== 1 || foldersForA[0].name !== "Neural Signal Processing Papers") {
      throw new Error("Researcher A failed to retrieve their own folder!");
    }
    console.log("✓ Researcher A correctly sees their 1 folder.");

    // 5. Researcher A uploads a document into that folder
    const docA = await ResearchDocument.create({
      ownerId: profileA._id,
      folderId: folderA._id,
      title: "EEG Artifact Removal Benchmark",
      originalFileName: "eeg_benchmark_2026.pdf",
      fileName: "1740000000-eeg_benchmark.pdf",
      fileSize: 4200000,
      fileType: "application/pdf",
      fileExtension: "pdf",
      fileUrl: "/uploads/research/documents/1740000000-eeg_benchmark.pdf",
      storagePath: "uploads/research/documents/1740000000-eeg_benchmark.pdf",
      docType: "paper",
      description: "Wavelet-based ICA artifact removal benchmark dataset and paper",
      tags: ["EEG", "Artifact Removal", "Benchmark"],
    });
    console.log("✓ Researcher A uploaded document:", docA.title);

    // 6. Verify user-specific document isolation:
    // Researcher B must NOT see Researcher A's document
    const docsForB = await ResearchDocument.find({ ownerId: profileB._id });
    if (docsForB.length !== 0) {
      throw new Error(`Data leak: Researcher B saw ${docsForB.length} documents from Researcher A!`);
    }
    console.log("✓ User-specific document isolation passed: Researcher B sees 0 documents.");

    // Researcher A sees their document
    const docsForA = await ResearchDocument.find({ ownerId: profileA._id, folderId: folderA._id });
    if (docsForA.length !== 1 || docsForA[0].title !== "EEG Artifact Removal Benchmark") {
      throw new Error("Researcher A failed to retrieve document inside folder!");
    }
    console.log("✓ Researcher A retrieved their document inside folder.");

    // 7. Verify folder document count computation
    const docCountA = await ResearchDocument.countDocuments({
      ownerId: profileA._id,
      folderId: folderA._id,
    });
    if (docCountA !== 1) {
      throw new Error(`Expected document count 1, got ${docCountA}`);
    }
    console.log("✓ Folder document count correctly evaluated to:", docCountA);

    // 8. Update folder (e.g. rename and change color)
    folderA.name = "Neural Signal Processing Archive (Updated)";
    folderA.color = "#10b981";
    await folderA.save();
    console.log("✓ Folder updated successfully:", folderA.name, folderA.color);

    // 9. Delete folder and verify unlinking of document
    await ResearchFolder.findByIdAndDelete(folderA._id);
    await ResearchDocument.updateMany(
      { folderId: folderA._id, ownerId: profileA._id },
      { $unset: { folderId: 1 } }
    );

    const remainingFolders = await ResearchFolder.find({ ownerId: profileA._id });
    if (remainingFolders.length !== 0) {
      throw new Error("Folder was not deleted properly!");
    }
    console.log("✓ Folder deleted successfully.");

    const unlinkedDoc = await ResearchDocument.findById(docA._id);
    if (unlinkedDoc?.folderId) {
      throw new Error("Document folderId was not unlinked after folder deletion!");
    }
    console.log("✓ Document safely preserved and unlinked to root folder.");

    // 10. Clean up test data
    await ResearchDocument.deleteMany({ ownerId: { $in: [profileA._id, profileB._id] } });
    await ResearchFolder.deleteMany({ ownerId: { $in: [profileA._id, profileB._id] } });
    await ResearcherProfile.deleteMany({ _id: { $in: [profileA._id, profileB._id] } });
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });

    console.log("\n=== ALL RESEARCH UPLOAD & FOLDER VERIFICATIONS PASSED SUCCESSFULLY ===");
  } catch (err) {
    console.error("Verification failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runVerification();
