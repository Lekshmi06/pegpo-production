import mongoose from "mongoose";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import Curriculum, {
  ICurriculum,
  ICurriculumUnit,
  CurriculumStatus,
} from "../models/Curriculum";
import TeachingContext from "../models/TeachingContext";
import { extractDocumentText } from "./document_extraction_service";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const CANDIDATE_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.6-flash",
];

export interface CreateCurriculumInput {
  contextId: string;
  title?: string;
  subject?: string;
  board?: string;
  classLevel?: string;
  academicYear?: string;
  sourceType?: "uploaded_file" | "manual";
  manualText?: string;
}

export interface UpdateCurriculumInput {
  title?: string;
  units?: ICurriculumUnit[];
  status?: CurriculumStatus;
}

/**
 * Validate extracted JSON schema for curriculum
 */
export function validateCurriculumUnits(data: any): ICurriculumUnit[] {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid AI response: Expected a JSON object");
  }

  const units = data.units;
  if (!Array.isArray(units) || units.length === 0) {
    throw new Error("Invalid AI response: 'units' must be a non-empty array");
  }

  const validatedUnits: ICurriculumUnit[] = [];

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u || typeof u !== "object") {
      throw new Error(`Unit at index ${i} is invalid`);
    }

    const unitNumber = typeof u.unitNumber === "number" ? u.unitNumber : i + 1;
    const title = typeof u.title === "string" && u.title.trim() ? u.title.trim() : `Unit ${unitNumber}`;

    if (!Array.isArray(u.chapters)) {
      throw new Error(`Unit '${title}' must contain a 'chapters' array`);
    }

    const validatedChapters = u.chapters.map((ch: any, chIdx: number) => {
      if (!ch || typeof ch !== "object") {
        throw new Error(`Chapter at index ${chIdx} in '${title}' is invalid`);
      }
      const chTitle = typeof ch.title === "string" && ch.title.trim() ? ch.title.trim() : `Chapter ${chIdx + 1}`;
      const topics = Array.isArray(ch.topics)
        ? ch.topics.filter((t: any) => typeof t === "string" && t.trim().length > 0).map((t: string) => t.trim())
        : [];
      return {
        title: chTitle,
        topics,
      };
    });

    validatedUnits.push({
      unitNumber,
      title,
      chapters: validatedChapters,
    });
  }

  return validatedUnits;
}

/**
 * Fallback parser when text is provided but AI model fails or is offline
 */
function parseTextToUnitsHeuristically(text: string): ICurriculumUnit[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const units: ICurriculumUnit[] = [];
  let currentUnit: ICurriculumUnit | null = null;
  let currentChapter: { title: string; topics: string[] } | null = null;

  for (const line of lines) {
    const isUnitHeader = /^unit\s*\d+/i.test(line) || /^module\s*\d+/i.test(line);
    const isChapterHeader = /^chapter\s*\d+/i.test(line) || /^\d+\.\s+[A-Z]/i.test(line);

    if (isUnitHeader) {
      if (currentUnit) units.push(currentUnit);
      currentUnit = {
        unitNumber: units.length + 1,
        title: line.replace(/^[#*\s-]+/, "").trim(),
        chapters: [],
      };
      currentChapter = null;
    } else if (isChapterHeader) {
      if (!currentUnit) {
        currentUnit = {
          unitNumber: units.length + 1,
          title: "Unit 1: Core Syllabus",
          chapters: [],
        };
      }
      currentChapter = {
        title: line.replace(/^[#*\s-]+/, "").trim(),
        topics: [],
      };
      currentUnit.chapters.push(currentChapter);
    } else {
      if (!currentUnit) {
        currentUnit = {
          unitNumber: units.length + 1,
          title: "Unit 1: General Curriculum",
          chapters: [],
        };
      }
      if (!currentChapter) {
        currentChapter = {
          title: "Chapter 1: Foundational Topics",
          topics: [],
        };
        currentUnit.chapters.push(currentChapter);
      }
      const cleanTopic = line.replace(/^[-*•\d.)\s]+/, "").trim();
      if (cleanTopic.length > 2 && currentChapter.topics.length < 15) {
        currentChapter.topics.push(cleanTopic);
      }
    }
  }

  if (currentUnit && currentUnit.chapters.length > 0) {
    units.push(currentUnit);
  }

  return units.length > 0
    ? units
    : [
        {
          unitNumber: 1,
          title: "Unit 1: Core Curriculum",
          chapters: [
            {
              title: "Chapter 1: Key Concepts",
              topics: lines.slice(0, 5),
            },
          ],
        },
      ];
}

export const createCurriculum = async (
  teacherId: string | mongoose.Types.ObjectId,
  data: CreateCurriculumInput,
  file?: Express.Multer.File
): Promise<ICurriculum> => {
  if (!data.contextId || !mongoose.Types.ObjectId.isValid(data.contextId)) {
    if (file?.path) {
      await fs.unlink(file.path).catch(() => {});
    }
    throw new Error("Valid contextId is required");
  }

  const context = await TeachingContext.findById(data.contextId);
  if (!context) {
    if (file?.path) {
      await fs.unlink(file.path).catch(() => {});
    }
    throw new Error("Teaching context not found");
  }
  if (context.teacherId.toString() !== teacherId.toString()) {
    if (file?.path) {
      await fs.unlink(file.path).catch(() => {});
    }
    throw new Error("Unauthorized: you do not own this teaching context");
  }

  const sourceType = file ? "uploaded_file" : "manual";
  const title = data.title?.trim() || `${context.subject} Syllabus - ${context.classLevel}`;

  let originalFileName: string | undefined;
  let extractedText: string | undefined;

  if (file) {
    originalFileName = file.originalname;
    try {
      const ext = path.extname(file.path).toLowerCase();
      let mimeType = "text/plain";
      if (ext === ".pdf") mimeType = "application/pdf";
      else if (ext === ".docx") mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      const extractedDoc = await extractDocumentText(file.path, mimeType);
      extractedText = extractedDoc.text.trim();
    } catch (extractErr) {
      await fs.unlink(file.path).catch(() => {});
      throw extractErr;
    } finally {
      // Ephemeral storage rule: permanently delete temporary uploaded file after extraction
      await fs.unlink(file.path).catch(() => {});
    }
  } else if (data.manualText) {
    extractedText = data.manualText.trim();
  }

  const curriculum = await Curriculum.create({
    teacherId,
    contextId: context._id,
    title,
    subject: data.subject?.trim() || context.subject,
    board: data.board?.trim() || context.curriculumBoard,
    classLevel: data.classLevel?.trim() || context.classLevel,
    academicYear: data.academicYear?.trim() || context.academicYear,
    sourceType,
    fileUrl: undefined, // Ephemeral processing: file is deleted immediately after extraction
    originalFileName,
    extractedText,
    units: [],
    status: "uploaded",
  });

  return curriculum;
};

export const getCurriculumsByContext = async (
  contextId: string,
  teacherId: string | mongoose.Types.ObjectId
): Promise<ICurriculum[]> => {
  if (!mongoose.Types.ObjectId.isValid(contextId)) {
    throw new Error("Invalid contextId");
  }

  const context = await TeachingContext.findById(contextId);
  if (!context) {
    throw new Error("Teaching context not found");
  }
  if (context.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this teaching context");
  }

  return Curriculum.find({ contextId })
    .sort({ createdAt: -1 })
    .lean();
};

export const getCurriculumById = async (
  curriculumId: string,
  teacherId: string | mongoose.Types.ObjectId
): Promise<ICurriculum> => {
  if (!mongoose.Types.ObjectId.isValid(curriculumId)) {
    throw new Error("Invalid curriculumId");
  }

  const curriculum = await Curriculum.findById(curriculumId);
  if (!curriculum) {
    throw new Error("Curriculum not found");
  }
  if (curriculum.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this curriculum");
  }

  return curriculum;
};

export const updateCurriculum = async (
  curriculumId: string,
  teacherId: string | mongoose.Types.ObjectId,
  data: UpdateCurriculumInput
): Promise<ICurriculum> => {
  const curriculum = await getCurriculumById(curriculumId, teacherId);

  if (data.title !== undefined) curriculum.title = data.title.trim();
  if (data.status !== undefined) curriculum.status = data.status;
  if (data.units !== undefined) curriculum.units = data.units;

  await curriculum.save();
  return curriculum;
};

export const processCurriculum = async (
  curriculumId: string,
  teacherId: string | mongoose.Types.ObjectId
): Promise<ICurriculum> => {
  const curriculum = await getCurriculumById(curriculumId, teacherId);

  curriculum.status = "processing";
  curriculum.errorMessage = undefined;
  await curriculum.save();

  try {
    let rawText = curriculum.extractedText || "";

    // If a file was uploaded and not yet extracted to text
    if (curriculum.fileUrl && (!rawText || rawText.length < 20)) {
      const ext = path.extname(curriculum.fileUrl).toLowerCase();
      let mimeType = "text/plain";
      if (ext === ".pdf") mimeType = "application/pdf";
      else if (ext === ".docx") mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      const extractedDoc = await extractDocumentText(curriculum.fileUrl, mimeType);
      rawText = extractedDoc.text.trim();
      curriculum.extractedText = rawText;
    }

    if (!rawText || rawText.length === 0) {
      throw new Error("No syllabus text could be extracted from the document.");
    }

    // Limit text length to prevent context explosion while preserving syllabus scope (first ~25,000 characters)
    const textSlice = rawText.slice(0, 25000);

    const prompt = `You are an expert curriculum structuring assistant for educational institutions.
Analyze the following curriculum/syllabus text and organize it into a clean, structured hierarchical syllabus.

CRITICAL INSTRUCTIONS:
1. Extract ONLY the units, chapters, and topics directly present or supported in the source text.
2. DO NOT invent, hallucinate, or add syllabus topics that are NOT present in the source.
3. If the syllabus does not explicitly label units, group closely related chapters into coherent units (e.g. Unit 1, Unit 2).
4. Return strictly valid JSON with this exact schema without any markdown wrapping:
{
  "units": [
    {
      "unitNumber": 1,
      "title": "Unit Title",
      "chapters": [
        {
          "title": "Chapter Title",
          "topics": ["Topic 1", "Topic 2", "Topic 3"]
        }
      ]
    }
  ]
}

SOURCE SYLLABUS TEXT:
${textSlice}`;

    let parsedResult: any = null;

    if (ai) {
      for (const model of CANDIDATE_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
          });
          const text = (response.text || "").trim();
          if (text) {
            const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
            parsedResult = JSON.parse(cleaned);
            break;
          }
        } catch (err: any) {
          console.warn(`[processCurriculum] Model ${model} failed, trying next candidate...`);
        }
      }
    }

    let structuredUnits: ICurriculumUnit[];

    if (parsedResult) {
      // Validate schema strictly before saving
      structuredUnits = validateCurriculumUnits(parsedResult);
    } else {
      // Heuristic extraction fallback when AI is quota limited or offline
      structuredUnits = parseTextToUnitsHeuristically(rawText);
    }

    curriculum.units = structuredUnits;
    curriculum.status = "processed";
    curriculum.errorMessage = undefined;
    await curriculum.save();

    return curriculum;
  } catch (err: any) {
    curriculum.status = "failed";
    curriculum.errorMessage = err.message || "Failed to process and structure curriculum";
    await curriculum.save();
    throw err;
  } finally {
    // Ephemeral processing rule: ensure any temporary uploaded file is deleted
    if (curriculum.fileUrl) {
      try {
        if (fsSync.existsSync(curriculum.fileUrl)) {
          await fs.unlink(curriculum.fileUrl).catch(() => {});
        }
      } catch (cleanupErr) {
        console.warn("Cleanup error in processCurriculum:", cleanupErr);
      }
      curriculum.fileUrl = undefined;
      await curriculum.save().catch(() => {});
    }
  }
};
