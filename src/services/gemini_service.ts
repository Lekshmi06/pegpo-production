import {
  getGeminiClient,
  getGeminiModel,
  callGeminiWithFallback,
  safeExtractJsonFromModel,
  classifyGeminiError,
  GeminiServiceError,
} from "../config/gemini_config";

export interface DocumentUnderstandingResult {
  summary: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  readingTimeMinutes: number;
  wordCount: number;
  keyConcepts: string[];
  suggestedQuestions: string[];
  chapters: Array<{
    title: string;
    summary: string;
    keyPoints: string[];
  }>;
  mindMap: {
    id: string;
    label: string;
    children?: Array<{
      id: string;
      label: string;
      children?: Array<{ id: string; label: string }>;
    }>;
  };
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Flashcard {
  front: string;
  back: string;
  hint?: string;
}

export interface ChapterItem {
  title: string;
  summary: string;
  keyPoints: string[];
}

export interface TimelineEvent {
  title: string;
  description: string;
  tag?: string;
}

export interface AudioScriptTurn {
  speaker: string;
  text: string;
}

export interface VideoSlide {
  slideNumber: number;
  title: string;
  bullets: string[];
  notes: string;
}

/**
 * Truncates document text safely to avoid exceeding token limits for long textbooks
 */
function getDocumentSample(text: string, maxChars = 24000): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return (
    text.slice(0, maxChars) +
    "\n\n[... Remaining document text omitted for processing brevity ...]"
  );
}

/**
 * Initial Document Understanding Pipeline (Triggered upon file upload & text extraction)
 */
export async function processDocumentWithGemini(
  text: string,
  filename: string
): Promise<DocumentUnderstandingResult> {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  const client = getGeminiClient();
  if (!client) {
    console.warn(
      "[processDocumentWithGemini] Gemini API key not configured. Generating structural document analysis for:",
      filename
    );
    return generateStructuralDocumentAnalysis(text, filename, wordCount, readingTimeMinutes);
  }

  try {
    const prompt = `You are an expert AI tutor and document intelligence analyzer.
Analyze the following student study material from file: "${filename}".

Document Text:
"""
${getDocumentSample(text)}
"""

Return a strictly valid JSON object (no markdown formatting, no code block backticks) with the following structure:
{
  "summary": "Detailed 4-5 sentence academic overview of what this document covers.",
  "difficulty": "Beginner" | "Intermediate" | "Advanced",
  "keyConcepts": ["Concept 1", "Concept 2", "Concept 3", "Concept 4", "Concept 5"],
  "suggestedQuestions": [
    "Suggested question 1 that tests comprehension?",
    "Suggested question 2 exploring key mechanisms?",
    "Suggested question 3 linking concepts?"
  ],
  "chapters": [
    {
      "title": "Section or Chapter Title",
      "summary": "Detailed overview of this section grounded in the text",
      "keyPoints": ["Key takeaway 1", "Key takeaway 2", "Key takeaway 3"]
    }
  ],
  "mindMap": {
    "id": "root",
    "label": "Core Topic",
    "children": [
      {
        "id": "branch-1",
        "label": "Sub-Topic 1",
        "children": [
          { "id": "sub-1-1", "label": "Key Detail 1" },
          { "id": "sub-1-2", "label": "Key Detail 2" }
        ]
      },
      {
        "id": "branch-2",
        "label": "Sub-Topic 2",
        "children": [
          { "id": "sub-2-1", "label": "Key Detail 3" },
          { "id": "sub-2-2", "label": "Key Detail 4" }
        ]
      }
    ]
  }
}`;

    const response = await callGeminiWithFallback(prompt);
    const outputText = response.text || "";
    const parsed = safeExtractJsonFromModel<any>(outputText, "document understanding");

    return {
      summary: parsed.summary || "Summary of uploaded study material.",
      difficulty: parsed.difficulty || (wordCount > 2000 ? "Advanced" : wordCount > 800 ? "Intermediate" : "Beginner"),
      readingTimeMinutes,
      wordCount,
      keyConcepts: Array.isArray(parsed.keyConcepts) ? parsed.keyConcepts : [],
      suggestedQuestions: Array.isArray(parsed.suggestedQuestions)
        ? parsed.suggestedQuestions
        : [],
      chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
      mindMap: parsed.mindMap || { id: "root", label: filename },
    };
  } catch (error) {
    const classified = classifyGeminiError(error);
    console.warn(
      `[processDocumentWithGemini] Gemini analysis error (${classified.kind}: ${classified.safeMessage}), providing local structural analysis:`
    );
    return generateStructuralDocumentAnalysis(text, filename, wordCount, readingTimeMinutes);
  }
}

/**
 * Chat with Source Document
 */
export async function chatWithSource(
  sourceText: string,
  query: string,
  history: Array<{ role: string; text: string }> = []
): Promise<{ reply: string; citations?: string[] }> {
  const client = getGeminiClient();
  if (!client) {
    return {
      reply: "The AI tutor is currently offline because the Gemini API key is not configured in the backend environment. Please configure GEMINI_API_KEY to enable interactive document chat.",
    };
  }

  try {
    const historyContext = history
      .slice(-6)
      .map((m) => `${m.role === "user" ? "Student" : "Gemini"}: ${m.text}`)
      .join("\n");

    const prompt = `You are a supportive, knowledgeable AI tutor helping a student learn from their uploaded textbook or notes.
Always ground your answers in the provided document content. If the answer is in the document, explain it clearly with simple analogies and key points. If it is partially covered or not in the document, state what the document says and provide educational guidance.

Document Content:
"""
${getDocumentSample(sourceText)}
"""

Conversation History:
${historyContext}

Student's Question: "${query}"

Provide an engaging, clear, pedagogical answer with bullet points where appropriate. Also list 1-2 key excerpt quotes or topic references from the document.`;

    const response = await callGeminiWithFallback(prompt);
    const reply = response.text || "I was unable to process an answer at this moment.";
    return { reply };
  } catch (error) {
    const classified = classifyGeminiError(error);
    console.warn(`[chatWithSource] Gemini chat error (${classified.kind}):`, classified.safeMessage);
    return {
      reply: `I could not generate an answer from this document at this moment (${classified.safeMessage}). Please verify your query or try again shortly.`,
    };
  }
}

/**
 * On-demand action generators
 */
export async function generateActionContent(
  action: string,
  sourceText: string,
  options?: any
): Promise<any> {
  const sample = getDocumentSample(sourceText);

  switch (action.toLowerCase()) {
    case "summary":
    case "summery":
      return generateSummary(sample);
    case "chapter":
    case "chapters":
      return generateChapters(sample);
    case "quiz":
      return generateQuiz(sample, options?.count || 5);
    case "flashcard":
    case "flashcards":
    case "flash card":
      return generateFlashcards(sample, options?.count || 6);
    case "notes":
      return generateNotes(sample);
    case "mindmap":
    case "mind map":
      return generateMindMap(sample);
    case "analyse":
    case "analyze":
      return generateAnalysis(sample);
    case "timeline":
    case "time line":
      return generateTimeline(sample);
    case "audio":
      return generateAudioScript(sample);
    case "video":
    case "slide":
      return generateVideoOutline(sample);
    default:
      throw new Error(`Unsupported AI action: "${action}"`);
  }
}

async function generateSummary(sample: string): Promise<string> {
  const client = getGeminiClient();
  if (!client) {
    throw new GeminiServiceError(
      "AI summary generation is unavailable: Gemini API key is not configured in the backend environment.",
      "CONFIG_ERROR",
      500
    );
  }

  const prompt = `Based on the following study document, create a thorough, structured, multi-section study summary.
Include:
1. # Executive Overview (comprehensive 4-5 sentence summary of scope, core subjects, and learning objectives)
2. ## Core Themes & Fundamental Definitions (breakdown of all major topics with bolded key terms)
3. ## Step-by-Step Mechanisms & Formulas (detailed analytical points and rules)
4. ## High-Yield Exam Takeaways & Common Pitfalls (bulleted tips for tests)

Document:
"""
${sample}
"""`;

  try {
    const res = await callGeminiWithFallback(prompt);
    const text = (res.text || "").trim();
    if (!text) {
      throw new GeminiServiceError("AI returned an empty summary.", "MALFORMED_OUTPUT");
    }
    return text;
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    console.warn(`[generateSummary] Failed (${classified.kind}):`, classified.safeMessage);
    throw new GeminiServiceError(
      `Unable to generate document summary: ${classified.safeMessage}`,
      classified.kind,
      classified.statusCode
    );
  }
}

async function generateChapters(sample: string): Promise<ChapterItem[]> {
  const client = getGeminiClient();
  if (!client) {
    throw new GeminiServiceError(
      "AI chapter generation is unavailable: Gemini API key is not configured.",
      "CONFIG_ERROR",
      500
    );
  }

  const prompt = `Analyze this document and break it down into logical Chapters or Study Modules.
Return a valid JSON array of objects with structure:
[
  {
    "title": "Chapter 1: ...",
    "summary": "Detailed overview of this section grounded in the document",
    "keyPoints": ["Point 1", "Point 2", "Point 3"]
  }
]
Do not include markdown code block formatting.

Document:
"""
${sample}
"""`;

  try {
    const res = await callGeminiWithFallback(prompt);
    return safeExtractJsonFromModel<ChapterItem[]>(res.text || "[]", "chapters");
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    console.warn(`[generateChapters] Failed (${classified.kind}):`, classified.safeMessage);
    throw new GeminiServiceError(
      `Unable to generate chapter breakdown: ${classified.safeMessage}`,
      classified.kind,
      classified.statusCode
    );
  }
}

async function generateQuiz(sample: string, count = 5): Promise<QuizQuestion[]> {
  const client = getGeminiClient();
  if (!client) {
    throw new GeminiServiceError(
      "AI quiz generation is unavailable: Gemini API key is not configured in the backend environment.",
      "CONFIG_ERROR",
      500
    );
  }

  const prompt = `Generate ${count} multiple choice quiz questions (MCQs) grounded strictly in this student study material.
Each question must test real comprehension of the text.
Each question must have:
- "question": clear question string
- "options": exactly 4 distinct options (strings)
- "correctIndex": integer (0 for A, 1 for B, 2 for C, 3 for D)
- "explanation": clear educational rationale explaining why the correct option is right based on the text.

Return a valid JSON array:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Explanation here."
  }
]
No markdown code block backticks.

Document:
"""
${sample}
"""`;

  try {
    const res = await callGeminiWithFallback(prompt);
    return safeExtractJsonFromModel<QuizQuestion[]>(res.text || "[]", "quiz questions");
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    console.warn(`[generateQuiz] Failed (${classified.kind}):`, classified.safeMessage);
    throw new GeminiServiceError(
      `Unable to generate quiz questions: ${classified.safeMessage}`,
      classified.kind,
      classified.statusCode
    );
  }
}

export async function generateFlashcards(sample: string, count = 6): Promise<Flashcard[]> {
  const client = getGeminiClient();
  if (!client) {
    throw new GeminiServiceError(
      "AI flashcard generation is unavailable: Gemini API key is not configured in the backend environment.",
      "CONFIG_ERROR",
      500
    );
  }

  const prompt = `Generate ${count} high-yield study flashcards grounded in this student study material.
Each flashcard must test a specific definition, core concept, formula, or mechanism from the text.
Return a valid JSON array:
[
  {
    "front": "Concept, term, or prompt",
    "back": "Clear, concise definition or explanation",
    "hint": "Helpful mnemonic or memory clue"
  }
]
No markdown wrapping.

Document:
"""
${sample}
"""`;

  try {
    const res = await callGeminiWithFallback(prompt);
    return safeExtractJsonFromModel<Flashcard[]>(res.text || "[]", "flashcards");
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    console.warn(`[generateFlashcards] Failed (${classified.kind}):`, classified.safeMessage);
    throw new GeminiServiceError(
      `Unable to generate flashcards: ${classified.safeMessage}`,
      classified.kind,
      classified.statusCode
    );
  }
}

async function generateNotes(sample: string): Promise<string> {
  const client = getGeminiClient();
  if (!client) {
    throw new GeminiServiceError(
      "AI notes generation is unavailable: Gemini API key is not configured.",
      "CONFIG_ERROR",
      500
    );
  }

  const prompt = `Create comprehensive, clean revision notes from this study document.
Format using clean Markdown with:
- # Title & Key Objective
- ## 1. Core Principles & Definitions
- ## 2. Important Formulas / Mechanisms
- ## 3. Common Pitfalls & Mistakes
- ## 4. Quick Review Checklist

Document:
"""
${sample}
"""`;

  try {
    const res = await callGeminiWithFallback(prompt);
    return res.text || "";
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    console.warn(`[generateNotes] Failed (${classified.kind}):`, classified.safeMessage);
    throw new GeminiServiceError(
      `Unable to generate revision notes: ${classified.safeMessage}`,
      classified.kind,
      classified.statusCode
    );
  }
}

export async function generateNotesDetailed(
  sample: string
): Promise<{ notes: string; provider: "gemini" | "fallback" }> {
  try {
    const notes = await generateNotes(sample);
    return { notes, provider: "gemini" };
  } catch (err) {
    const concepts = extractKeyPhrases(sample, 4);
    const fallbackNotes = `# ${concepts[0] || "Study Notes"}\n\n## 1. Core Principles\n${sample.slice(0, 600)}...`;
    return { notes: fallbackNotes, provider: "fallback" };
  }
}

async function generateMindMap(sample: string): Promise<any> {
  const client = getGeminiClient();
  if (!client) {
    throw new GeminiServiceError(
      "AI mind map generation is unavailable: Gemini API key is not configured.",
      "CONFIG_ERROR",
      500
    );
  }

  const prompt = `Construct a detailed, hierarchical mind map tree from this student study document.
Break down the subject into 3-4 major branches, each with 2-3 specific sub-branches or key details grounded in the text.
Return a valid JSON tree structure:
{
  "id": "root",
  "label": "Central Subject",
  "children": [
    {
      "id": "b1",
      "label": "Major Topic 1",
      "children": [
        { "id": "sub-1-1", "label": "Key Detail 1A" },
        { "id": "sub-1-2", "label": "Key Detail 1B" }
      ]
    },
    {
      "id": "b2",
      "label": "Major Topic 2",
      "children": [
        { "id": "sub-2-1", "label": "Key Detail 2A" },
        { "id": "sub-2-2", "label": "Key Detail 2B" }
      ]
    }
  ]
}
No markdown code block backticks.

Document:
"""
${sample}
"""`;

  try {
    const res = await callGeminiWithFallback(prompt);
    return safeExtractJsonFromModel(res.text || "{}", "mind map tree");
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    console.warn(`[generateMindMap] Failed (${classified.kind}):`, classified.safeMessage);
    throw new GeminiServiceError(
      `Unable to generate mind map: ${classified.safeMessage}`,
      classified.kind,
      classified.statusCode
    );
  }
}

async function generateAnalysis(sample: string): Promise<any> {
  const client = getGeminiClient();
  if (!client) {
    throw new GeminiServiceError(
      "AI document analysis is unavailable: Gemini API key is not configured.",
      "CONFIG_ERROR",
      500
    );
  }

  const prompt = `Perform a deep educational document analysis on this study material.
Return a valid JSON object:
{
  "academicLevel": "School / High School / Undergraduate",
  "bloomLevel": "Understanding / Application / Analysis",
  "estimatedStudyHours": 2.5,
  "prerequisites": ["Prerequisite 1", "Prerequisite 2"],
  "learningOutcomes": ["Outcome 1", "Outcome 2", "Outcome 3"],
  "vocabularyTerms": [
    { "term": "Term 1", "definition": "Brief definition" },
    { "term": "Term 2", "definition": "Brief definition" }
  ],
  "contentDensityScore": 78
}
No markdown wrapping.

Document:
"""
${sample}
"""`;

  try {
    const res = await callGeminiWithFallback(prompt);
    return safeExtractJsonFromModel(res.text || "{}", "analysis");
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    console.warn(`[generateAnalysis] Failed (${classified.kind}):`, classified.safeMessage);
    throw new GeminiServiceError(
      `Unable to perform document analysis: ${classified.safeMessage}`,
      classified.kind,
      classified.statusCode
    );
  }
}

async function generateTimeline(sample: string): Promise<TimelineEvent[]> {
  const client = getGeminiClient();
  if (!client) {
    throw new GeminiServiceError(
      "AI timeline generation is unavailable: Gemini API key is not configured.",
      "CONFIG_ERROR",
      500
    );
  }

  const prompt = `Extract or arrange the key chronological progression, experimental steps, or thematic milestones from this study document into a timeline.
Return a valid JSON array:
[
  {
    "title": "Phase 1 / Step 1 / Event 1",
    "description": "What happens here",
    "tag": "Milestone / Background / Result"
  }
]
No markdown wrapping.

Document:
"""
${sample}
"""`;

  try {
    const res = await callGeminiWithFallback(prompt);
    return safeExtractJsonFromModel<TimelineEvent[]>(res.text || "[]", "timeline");
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    console.warn(`[generateTimeline] Failed (${classified.kind}):`, classified.safeMessage);
    throw new GeminiServiceError(
      `Unable to generate timeline: ${classified.safeMessage}`,
      classified.kind,
      classified.statusCode
    );
  }
}

async function generateAudioScript(sample: string): Promise<AudioScriptTurn[]> {
  const client = getGeminiClient();
  if (!client) {
    throw new GeminiServiceError(
      "AI audio script generation is unavailable: Gemini API key is not configured.",
      "CONFIG_ERROR",
      500
    );
  }

  const prompt = `Create an engaging, 2-person tutor podcast dialogue ("Alex" the curious student and "Dr. Taylor" the enthusiastic mentor) discussing the key concepts in this document.
Return a valid JSON array:
[
  { "speaker": "Dr. Taylor", "text": "Welcome to our study breakdown! Today we're diving into..." },
  { "speaker": "Alex", "text": "I've been looking over the notes, and I'm really curious about..." }
]
Keep it to 6-8 lively turns grounded in the document. No markdown wrapping.

Document:
"""
${sample}
"""`;

  try {
    const res = await callGeminiWithFallback(prompt);
    return safeExtractJsonFromModel<AudioScriptTurn[]>(res.text || "[]", "audio script");
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    console.warn(`[generateAudioScript] Failed (${classified.kind}):`, classified.safeMessage);
    throw new GeminiServiceError(
      `Unable to generate audio study script: ${classified.safeMessage}`,
      classified.kind,
      classified.statusCode
    );
  }
}

async function generateVideoOutline(sample: string): Promise<VideoSlide[]> {
  const client = getGeminiClient();
  if (!client) {
    throw new GeminiServiceError(
      "AI presentation outline generation is unavailable: Gemini API key is not configured.",
      "CONFIG_ERROR",
      500
    );
  }

  const prompt = `Generate a 4-5 slide presentation deck outline for teaching this document.
Return a valid JSON array:
[
  {
    "slideNumber": 1,
    "title": "Introduction to...",
    "bullets": ["Point 1", "Point 2", "Point 3"],
    "notes": "Speaker notes explaining this slide."
  }
]
No markdown wrapping.

Document:
"""
${sample}
"""`;

  try {
    const res = await callGeminiWithFallback(prompt);
    return safeExtractJsonFromModel<VideoSlide[]>(res.text || "[]", "video outline");
  } catch (err: any) {
    const classified = classifyGeminiError(err);
    console.warn(`[generateVideoOutline] Failed (${classified.kind}):`, classified.safeMessage);
    throw new GeminiServiceError(
      `Unable to generate presentation outline: ${classified.safeMessage}`,
      classified.kind,
      classified.statusCode
    );
  }
}

/**
 * Deterministic local text analysis for offline/fallback document understanding.
 * Transparently extracts structural metrics without pretending to be generative AI output.
 */
function extractKeyPhrases(text: string, count = 5): string[] {
  const words = text
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 5);

  const freq: Record<string, number> = {};
  for (const w of words) {
    const lower = w.toLowerCase();
    if (!["because", "through", "between", "should", "without", "before"].includes(lower)) {
      freq[lower] = (freq[lower] || 0) + 1;
    }
  }

  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

  return sorted.slice(0, count).length > 0
    ? sorted.slice(0, count)
    : ["Core Principles", "Fundamental Theory", "Practical Applications", "Exam Objectives"];
}

function generateStructuralDocumentAnalysis(
  text: string,
  filename: string,
  wordCount: number,
  readingTimeMinutes: number
): DocumentUnderstandingResult {
  const keyConcepts = extractKeyPhrases(text, 5);
  const cleanTitle = filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

  return {
    summary: `[Structural Analysis] "${cleanTitle}" contains approximately ${wordCount} words (estimated ${readingTimeMinutes} min reading time). Extracted key thematic terms include: ${keyConcepts.slice(0, 3).join(", ")}. Full AI generative understanding is currently operating in offline mode.`,
    difficulty: wordCount > 2000 ? "Advanced" : wordCount > 800 ? "Intermediate" : "Beginner",
    readingTimeMinutes,
    wordCount,
    keyConcepts,
    suggestedQuestions: [
      `What are the core concepts associated with ${keyConcepts[0] || "this topic"}?`,
      `How does ${keyConcepts[1] || "this principle"} connect to related syllabus chapters?`,
    ],
    chapters: [
      {
        title: `1. Section Analysis: ${cleanTitle}`,
        summary: `Document section containing ${wordCount} words.`,
        keyPoints: keyConcepts.slice(0, 3),
      },
    ],
    mindMap: {
      id: "root",
      label: cleanTitle,
      children: keyConcepts.slice(0, 3).map((concept, idx) => ({
        id: `branch-${idx + 1}`,
        label: concept,
      })),
    },
  };
}
