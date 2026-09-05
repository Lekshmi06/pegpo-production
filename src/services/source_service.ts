import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";

import Source from "../models/source_model";
import StudentProfile from "../models/StudentProfile";
import SourceContent from "../models/source_content_model";
import { extractDocumentText } from "./document_extraction_service";
import {
  processDocumentWithGemini,
  chatWithSource,
  generateActionContent,
} from "./gemini_service";

interface UploadedFile {
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
  path: string;
}

export const createSource = async (
  studentId: string,
  file: UploadedFile
) => {
  if (!mongoose.isValidObjectId(studentId)) {
    await removeUploadedFile(file.path);
    throw new Error("Invalid student ID");
  }

  const student = await StudentProfile.findById(studentId);

  if (!student) {
    await removeUploadedFile(file.path);
    throw new Error("Student not found");
  }

  const storagePath = path
    .relative(process.cwd(), file.path)
    .replace(/\\/g, "/");

  let source;

  try {
    source = await Source.create({
      studentId,
      originalName: file.originalname,
      storedName: file.filename,
      type: "file",
      mimeType: file.mimetype,
      size: file.size,
      storagePath,
      status: "processing",
      aiReady: false,
      aiStatus: "processing",
    });

    // Step 1: Text extraction (PDF / DOCX / TXT)
    const extractedDocument = await extractDocumentText(
      file.path,
      file.mimetype
    );

    // Step 2: Gemini Document Understanding Pipeline
    const aiResult = await processDocumentWithGemini(
      extractedDocument.text,
      file.originalname
    );

    // Step 3: Store extracted text and initial AI understanding artifacts
    await SourceContent.create({
      sourceId: source._id,
      text: extractedDocument.text,
      aiSummary: aiResult.summary,
      aiChapters: aiResult.chapters,
      aiMindMap: aiResult.mindMap,
    });

    // Step 4: Mark source as ready with AI overview
    source.status = "ready";
    source.aiReady = true;
    source.aiStatus = "ready";
    source.aiOverview = {
      summary: aiResult.summary,
      difficulty: aiResult.difficulty,
      readingTimeMinutes: aiResult.readingTimeMinutes,
      wordCount: aiResult.wordCount,
      keyConcepts: aiResult.keyConcepts,
      suggestedQuestions: aiResult.suggestedQuestions,
    };
    await source.save();

    return source;
  } catch (error) {
    if (source) {
      source.status = "failed";
      source.aiStatus = "failed";
      await source.save();
    }

    throw error;
  }
};

export const getSourcesByStudent = async (studentId: string) => {
  if (!mongoose.isValidObjectId(studentId)) {
    throw new Error("Invalid student ID");
  }

  const student = await StudentProfile.exists({
    _id: studentId,
  });

  if (!student) {
    throw new Error("Student not found");
  }

  return Source.find({
    studentId,
  })
    .sort({ createdAt: -1 })
    .lean();
};

export const getSourceById = async (sourceId: string) => {
  if (!mongoose.isValidObjectId(sourceId)) {
    throw new Error("Invalid source ID");
  }

  const source = await Source.findById(sourceId).lean();

  if (!source) {
    throw new Error("Source not found");
  }

  return source;
};

export const getSourceFilePath = async (sourceId: string) => {
  const source = await getSourceById(sourceId);

  const filePath = path.resolve(process.cwd(), source.storagePath);

  return {
    source,
    filePath,
  };
};

export const deleteSource = async (sourceId: string) => {
  if (!mongoose.isValidObjectId(sourceId)) {
    throw new Error("Invalid source ID");
  }

  const source = await Source.findById(sourceId);

  if (!source) {
    throw new Error("Source not found");
  }

  const filePath = path.resolve(process.cwd(), source.storagePath);

  await SourceContent.findOneAndDelete({
    sourceId,
  });

  await Source.findByIdAndDelete(sourceId);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;

    if (fileError.code !== "ENOENT") {
      console.error("Failed to delete source file:", error);
    }
  }

  return source;
};

const removeUploadedFile = async (filePath: string) => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;

    if (fileError.code !== "ENOENT") {
      console.error("Failed to remove uploaded file:", error);
    }
  }
};

export const getSourceContent = async (sourceId: string) => {
  if (!mongoose.isValidObjectId(sourceId)) {
    throw new Error("Invalid source ID");
  }

  const source = await Source.findById(sourceId);

  if (!source) {
    throw new Error("Source not found");
  }

  const content = await SourceContent.findOne({
    sourceId,
  }).lean();

  if (!content) {
    throw new Error("Source content not found");
  }

  return content;
};

/**
 * Chat with source using Gemini
 */
export const chatWithSourceService = async (
  sourceId: string,
  query: string,
  history: Array<{ role: string; text: string }> = []
) => {
  if (!mongoose.isValidObjectId(sourceId)) {
    throw new Error("Invalid source ID");
  }

  const content = await SourceContent.findOne({ sourceId }).lean();
  if (!content || !content.text) {
    throw new Error("Source document text not found");
  }

  return chatWithSource(content.text, query, history);
};

/**
 * Execute or fetch on-demand AI action (Quiz, Flashcards, Summary, MindMap, etc.)
 */
export const triggerSourceAIActionService = async (
  sourceId: string,
  action: string,
  options?: any
) => {
  if (!mongoose.isValidObjectId(sourceId)) {
    throw new Error("Invalid source ID");
  }

  const contentDoc = await SourceContent.findOne({ sourceId });
  if (!contentDoc || !contentDoc.text) {
    throw new Error("Source document text not found");
  }

  const act = action.toLowerCase();

  // If forceRegenerate is not requested, check existing cached artifact
  if (!options?.forceRegenerate) {
    if ((act === "quiz") && contentDoc.aiQuiz && contentDoc.aiQuiz.length > 0) {
      return { action, data: contentDoc.aiQuiz, cached: true };
    }
    if ((act === "flashcard" || act === "flashcards") && contentDoc.aiFlashcards && contentDoc.aiFlashcards.length > 0) {
      return { action, data: contentDoc.aiFlashcards, cached: true };
    }
    if ((act === "mindmap" || act === "mind map") && contentDoc.aiMindMap) {
      return { action, data: contentDoc.aiMindMap, cached: true };
    }
    if ((act === "chapter" || act === "chapters") && contentDoc.aiChapters && contentDoc.aiChapters.length > 0) {
      return { action, data: contentDoc.aiChapters, cached: true };
    }
    if ((act === "summary" || act === "summery") && contentDoc.aiSummary) {
      return { action, data: contentDoc.aiSummary, cached: true };
    }
    if (act === "notes" && contentDoc.aiNotes) {
      return { action, data: contentDoc.aiNotes, cached: true };
    }
    if ((act === "analyse" || act === "analyze") && contentDoc.aiAnalysis) {
      return { action, data: contentDoc.aiAnalysis, cached: true };
    }
    if ((act === "timeline" || act === "time line") && contentDoc.aiTimeline && contentDoc.aiTimeline.length > 0) {
      return { action, data: contentDoc.aiTimeline, cached: true };
    }
    if (act === "audio" && contentDoc.aiAudioScript && contentDoc.aiAudioScript.length > 0) {
      return { action, data: contentDoc.aiAudioScript, cached: true };
    }
    if ((act === "video" || act === "slide") && contentDoc.aiVideoOutline && contentDoc.aiVideoOutline.length > 0) {
      return { action, data: contentDoc.aiVideoOutline, cached: true };
    }
  }

  // Generate with Gemini
  const generatedData = await generateActionContent(act, contentDoc.text, options);

  // Cache back to Mongo
  if (act === "quiz") contentDoc.aiQuiz = generatedData;
  else if (act === "flashcard" || act === "flashcards") contentDoc.aiFlashcards = generatedData;
  else if (act === "mindmap" || act === "mind map") contentDoc.aiMindMap = generatedData;
  else if (act === "chapter" || act === "chapters") contentDoc.aiChapters = generatedData;
  else if (act === "summary" || act === "summery") contentDoc.aiSummary = generatedData;
  else if (act === "notes") contentDoc.aiNotes = generatedData;
  else if (act === "analyse" || act === "analyze") contentDoc.aiAnalysis = generatedData;
  else if (act === "timeline" || act === "time line") contentDoc.aiTimeline = generatedData;
  else if (act === "audio") contentDoc.aiAudioScript = generatedData;
  else if (act === "video" || act === "slide") contentDoc.aiVideoOutline = generatedData;

  await contentDoc.save();

  return {
    action,
    data: generatedData,
    cached: false,
  };
};

export const saveSourceNotesService = async (sourceId: string, notes: string) => {
  if (!mongoose.isValidObjectId(sourceId)) {
    throw new Error("Invalid source ID");
  }

  const contentDoc = await SourceContent.findOne({ sourceId });
  if (!contentDoc) {
    throw new Error("Source content not found");
  }

  contentDoc.aiNotes = notes;
  await contentDoc.save();

  return { success: true, notes };
};
