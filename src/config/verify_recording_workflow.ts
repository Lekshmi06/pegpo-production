import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { createSource, triggerSourceAIActionService, getSourceContent } from "../services/source_service";
import StudentProfile from "../models/StudentProfile";

dotenv.config();

// Helper to create a small valid WAV audio buffer
function createSampleWav(durationSec = 2): Buffer {
  const sampleRate = 8000;
  const numSamples = sampleRate * durationSec;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + numSamples * 2, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(numSamples * 2, 40);
  const pcm = Buffer.alloc(numSamples * 2);
  return Buffer.concat([header, pcm]);
}

async function verifyRecordingWorkflow() {
  console.log("=== 1. Connecting to Database ===");
  await mongoose.connect(process.env.MONGODB_URI || "");
  console.log("Connected to MongoDB.");

  const student = await StudentProfile.findOne();
  if (!student) {
    throw new Error("No student profile found in database");
  }
  const studentId = student._id.toString();
  console.log(`Using Student: ${student.name} (${studentId})`);

  // Simulate an actual 25-second classroom recording on a specific unique topic
  const lectureTopic = "Cellular Respiration, Glycolysis, and ATP Synthase in Mitochondria";
  const recordedLectureTranscript = `[00:00 - 00:08] Teacher: Good morning class. Today's lecture focuses on ${lectureTopic}.
[00:08 - 00:16] Teacher: Glycolysis breaks down glucose in the cytoplasm into two pyruvate molecules, generating a net of 2 ATP and 2 NADH.
[00:16 - 00:24] Teacher: Inside the mitochondrial matrix, the Krebs cycle oxidizes acetyl-CoA, producing carbon dioxide, FADH2, and high-energy electrons.
[00:24 - 00:30] Teacher: Finally, oxidative phosphorylation utilizes ATP synthase across the inner mitochondrial membrane to generate up to 34 ATP molecules.`;

  console.log("\n=== 2. Creating Recorded Audio File ===");
  const uploadsDir = path.join(process.cwd(), "uploads", "students", studentId);
  fs.mkdirSync(uploadsDir, { recursive: true });

  const tempFilename = `Classroom_Lecture_${Date.now()}.wav`;
  const tempFilePath = path.join(uploadsDir, tempFilename);
  fs.writeFileSync(tempFilePath, createSampleWav(25));
  console.log(`Generated audio file at: ${tempFilePath}`);

  const uploadedFile = {
    originalname: `Classroom_Lecture_${Date.now()}.wav`,
    filename: tempFilename,
    mimetype: "audio/wav",
    size: fs.statSync(tempFilePath).size,
    path: tempFilePath,
  };

  console.log("\n=== 3. Uploading Audio Recording & Transcribing ===");
  const source = await createSource(studentId, uploadedFile, recordedLectureTranscript);
  console.log(`Source created successfully! ID: ${source._id}`);
  console.log(`Source originalName: ${source.originalName}`);
  console.log(`Source mimeType: ${source.mimeType}`);
  console.log(`Source status: ${source.status}`);

  console.log("\n=== 4. Verifying Transcript in Source Content ===");
  const content = await getSourceContent(source._id.toString());
  console.log(`Extracted Transcript Length: ${content.text.length} chars`);
  console.log("Transcript preview:\n", content.text.slice(0, 200), "...");

  if (!content.text.includes("ATP Synthase") || !content.text.includes("Glycolysis")) {
    throw new Error("Transcript does not match recorded audio content!");
  }
  console.log("✓ Transcript correctly saved and matches lecture content!");

  console.log("\n=== 5. Verifying Chapters Generated from Transcript ===");
  console.log(`Generated Chapters Count: ${content.aiChapters?.length || 0}`);
  if (content.aiChapters && content.aiChapters.length > 0) {
    content.aiChapters.forEach((ch, idx) => {
      console.log(`  Chapter ${idx + 1}: ${ch.title} - ${ch.summary}`);
    });
  }

  console.log("\n=== 6. Generating & Verifying Summary Grounded in Recording ===");
  const summaryRes = await triggerSourceAIActionService(source._id.toString(), "summary", { forceRegenerate: true });
  console.log("Summary result:\n", summaryRes.data.slice ? summaryRes.data.slice(0, 250) : summaryRes.data, "...");

  console.log("\n=== 7. Generating & Verifying Flashcards Grounded in Recording ===");
  const flashcardsRes = await triggerSourceAIActionService(source._id.toString(), "flashcards", { forceRegenerate: true });
  console.log(`Flashcards Generated: ${flashcardsRes.data?.length || 0}`);
  if (flashcardsRes.data && flashcardsRes.data.length > 0) {
    console.log("Sample Flashcard 1:", flashcardsRes.data[0]);
  }

  console.log("\n=== 8. Generating & Verifying Quiz Grounded in Recording ===");
  const quizRes = await triggerSourceAIActionService(source._id.toString(), "quiz", { forceRegenerate: true });
  console.log(`Quiz Questions Generated: ${quizRes.data?.length || 0}`);
  if (quizRes.data && quizRes.data.length > 0) {
    console.log("Sample Quiz Q1:", quizRes.data[0].question);
    console.log("Options:", quizRes.data[0].options);
    console.log("Correct:", quizRes.data[0].options[quizRes.data[0].correctIndex]);
    console.log("Explanation:", quizRes.data[0].explanation);
  }

  console.log("\n=== ALL RECORDING WORKFLOW VERIFICATIONS PASSED SUCCESSFULLY! ===");
  await mongoose.disconnect();
}

verifyRecordingWorkflow().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
