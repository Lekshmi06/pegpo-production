import mongoose from "mongoose";
import Source, { ISource } from "../models/source_model";
import SourceContent, { ISourceContent } from "../models/source_content_model";

export interface StudentMaterialQuery {
  studentProfileId: string;
  subject?: string;
  textbookFileName?: string;
  topic?: string;
  maxChars?: number;
}

export interface StudentMaterialResult {
  hasMaterial: boolean;
  sourceId?: mongoose.Types.ObjectId;
  originalName?: string;
  textSample: string;
  totalLength: number;
  matchedTopic?: string;
}

const DEFAULT_MAX_CHARS = 24000;

/**
 * Retrieves relevant learning material belonging strictly to the authenticated student.
 * Guarantees student data isolation and applies intelligent content extraction.
 */
export async function getRelevantStudentMaterial(
  query: StudentMaterialQuery
): Promise<StudentMaterialResult> {
  const {
    studentProfileId,
    subject,
    textbookFileName,
    topic,
    maxChars = DEFAULT_MAX_CHARS,
  } = query;

  if (!mongoose.Types.ObjectId.isValid(studentProfileId)) {
    return {
      hasMaterial: false,
      textSample: "",
      totalLength: 0,
    };
  }

  // 1. Query sources strictly belonging to this student
  const studentObjectId = new mongoose.Types.ObjectId(studentProfileId);
  const studentSources = await Source.find({
    studentId: studentObjectId,
    status: "ready",
  }).sort({ updatedAt: -1 });

  if (!studentSources || studentSources.length === 0) {
    return {
      hasMaterial: false,
      textSample: "",
      totalLength: 0,
    };
  }

  // 2. Select the most relevant source for this academic request
  let selectedSource: ISource | undefined;

  // 2a. Match specific textbookFileName if configured on StudentProfile
  if (textbookFileName) {
    const cleanFileName = textbookFileName.toLowerCase();
    selectedSource = studentSources.find((s) =>
      s.originalName.toLowerCase().includes(cleanFileName)
    );
  }

  // 2b. Match by requested or profile subject (e.g. "Physics")
  if (!selectedSource && subject) {
    const cleanSubject = subject.toLowerCase();
    selectedSource = studentSources.find((s) =>
      s.originalName.toLowerCase().includes(cleanSubject)
    );
  }

  // 2c. Fallback to the student's most recently active source
  if (!selectedSource) {
    selectedSource = studentSources[0];
  }

  // 3. Fetch extracted text from sourcecontents
  const sourceContent = await SourceContent.findOne({
    sourceId: selectedSource._id,
  });

  if (!sourceContent || !sourceContent.text || sourceContent.text.trim().length === 0) {
    return {
      hasMaterial: false,
      sourceId: selectedSource._id as mongoose.Types.ObjectId,
      originalName: selectedSource.originalName,
      textSample: "",
      totalLength: 0,
    };
  }

  const fullText = sourceContent.text;
  const totalLength = fullText.length;

  // 4. Intelligent content selection / chunking
  let textSample: string;

  if (topic && topic.trim().length > 0) {
    // Locate the topic keyword in the document
    const cleanTopic = topic.trim().toLowerCase();
    const matchIndex = fullText.toLowerCase().indexOf(cleanTopic);

    if (matchIndex !== -1) {
      // Extract a window around the matched topic
      const start = Math.max(0, matchIndex - 2000);
      const end = Math.min(fullText.length, start + maxChars);
      textSample = fullText.slice(start, end);
    } else {
      // If topic not literally found, take beginning section up to limit
      textSample = fullText.slice(0, maxChars);
    }
  } else {
    // General sample: take representative text within safe context limit
    textSample = fullText.slice(0, maxChars);
  }

  return {
    hasMaterial: true,
    sourceId: selectedSource._id as mongoose.Types.ObjectId,
    originalName: selectedSource.originalName,
    textSample,
    totalLength,
    matchedTopic: topic,
  };
}
