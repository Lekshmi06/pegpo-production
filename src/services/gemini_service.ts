import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Preferred model for fast, high-quality document intelligence
const DEFAULT_MODEL = "gemini-2.5-flash";

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
 * Cleans markdown code blocks (e.g. ```json ... ```) to parse raw JSON
 */
function extractJsonFromText(rawText: string): any {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return JSON.parse(cleaned);
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

  if (!ai) {
    console.log(
      "Gemini API key not configured. Using intelligent document extraction fallback for:",
      filename
    );
    return generateFallbackUnderstanding(text, filename, wordCount, readingTimeMinutes);
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
  "summary": "Concise 3-4 sentence executive overview of what this document covers.",
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
      "summary": "Overview of this section",
      "keyPoints": ["Key takeaway 1", "Key takeaway 2"]
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

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });

    const outputText = response.text || "";
    const parsed = extractJsonFromText(outputText);

    return {
      summary: parsed.summary || "Summary of uploaded study material.",
      difficulty: parsed.difficulty || "Intermediate",
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
    console.warn(
      "Gemini processing error, falling back to smart local extractor:",
      error
    );
    return generateFallbackUnderstanding(text, filename, wordCount, readingTimeMinutes);
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
  if (!ai) {
    return fallbackChat(sourceText, query);
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

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });

    const reply = response.text || "I was unable to process an answer at this moment.";
    return { reply };
  } catch (error) {
    console.warn("Gemini chat error, using fallback response:", error);
    return fallbackChat(sourceText, query);
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
  if (!ai) return fallbackSummary(sample);
  try {
    const prompt = `Based on the following study document, create a structured, clear study summary.
Include:
1. Executive Overview (2-3 sentences)
2. Core Themes & Definitions
3. Key Takeaways (bulleted)
4. Exam / Study Focus Points

Document:
"""
${sample}
"""`;

    const res = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });
    return res.text || fallbackSummary(sample);
  } catch {
    return fallbackSummary(sample);
  }
}

async function generateChapters(sample: string): Promise<ChapterItem[]> {
  if (!ai) return fallbackChapters(sample);
  try {
    const prompt = `Analyze this document and break it down into logical Chapters or Study Modules.
Return a valid JSON array of objects with structure:
[
  {
    "title": "Chapter 1: ...",
    "summary": "Overview of this section",
    "keyPoints": ["Point 1", "Point 2", "Point 3"]
  }
]
Do not include markdown code block formatting.

Document:
"""
${sample}
"""`;

    const res = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });
    return extractJsonFromText(res.text || "[]");
  } catch {
    return fallbackChapters(sample);
  }
}

async function generateQuiz(sample: string, count = 5): Promise<QuizQuestion[]> {
  if (!ai) return fallbackQuiz(sample, count);
  try {
    const prompt = `Generate ${count} multiple choice quiz questions (MCQs) to test a student's understanding of this study document.
Each question must have exactly 4 options (A, B, C, D), a 0-indexed correctIndex (0 for A, 1 for B, 2 for C, 3 for D), and a clear educational explanation of why that answer is correct.

Return a valid JSON array:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Explanation here."
  }
]
No markdown wrapping.

Document:
"""
${sample}
"""`;

    const res = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });
    return extractJsonFromText(res.text || "[]");
  } catch {
    return fallbackQuiz(sample, count);
  }
}

async function generateFlashcards(sample: string, count = 6): Promise<Flashcard[]> {
  if (!ai) return fallbackFlashcards(sample, count);
  try {
    const prompt = `Generate ${count} high-yield study flashcards from this document.
Each flashcard should test a key definition, concept, rule, or mechanism.
Return a valid JSON array:
[
  {
    "front": "Question, prompt, or term on front of card",
    "back": "Clear, concise answer or definition on back",
    "hint": "Optional quick memory tip or hint"
  }
]
No markdown wrapping.

Document:
"""
${sample}
"""`;

    const res = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });
    return extractJsonFromText(res.text || "[]");
  } catch {
    return fallbackFlashcards(sample, count);
  }
}

async function generateNotes(sample: string): Promise<string> {
  if (!ai) return fallbackNotes(sample);
  try {
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

    const res = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });
    return res.text || fallbackNotes(sample);
  } catch {
    return fallbackNotes(sample);
  }
}

async function generateMindMap(sample: string): Promise<any> {
  if (!ai) return fallbackMindMap(sample);
  try {
    const prompt = `Construct a hierarchical mind map tree from this study document.
Return a valid JSON tree structure:
{
  "id": "root",
  "label": "Central Subject",
  "children": [
    {
      "id": "b1",
      "label": "Major Topic 1",
      "children": [
        { "id": "b1-1", "label": "Key Concept 1A" },
        { "id": "b1-2", "label": "Key Concept 1B" }
      ]
    },
    {
      "id": "b2",
      "label": "Major Topic 2",
      "children": [
        { "id": "b2-1", "label": "Key Concept 2A" },
        { "id": "b2-2", "label": "Key Concept 2B" }
      ]
    }
  ]
}
No markdown wrapping.

Document:
"""
${sample}
"""`;

    const res = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });
    return extractJsonFromText(res.text || "{}");
  } catch {
    return fallbackMindMap(sample);
  }
}

async function generateAnalysis(sample: string): Promise<any> {
  if (!ai) return fallbackAnalysis(sample);
  try {
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

    const res = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });
    return extractJsonFromText(res.text || "{}");
  } catch {
    return fallbackAnalysis(sample);
  }
}

async function generateTimeline(sample: string): Promise<TimelineEvent[]> {
  if (!ai) return fallbackTimeline(sample);
  try {
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

    const res = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });
    return extractJsonFromText(res.text || "[]");
  } catch {
    return fallbackTimeline(sample);
  }
}

async function generateAudioScript(sample: string): Promise<AudioScriptTurn[]> {
  if (!ai) return fallbackAudioScript(sample);
  try {
    const prompt = `Create an engaging, 2-person tutor podcast dialogue ("Alex" the curious student and "Dr. Taylor" the enthusiastic mentor) discussing the key concepts in this document.
Return a valid JSON array:
[
  { "speaker": "Dr. Taylor", "text": "Welcome to our study breakdown! Today we're diving into..." },
  { "speaker": "Alex", "text": "I've been looking over the notes, and I'm really curious about..." }
]
Keep it to 6-8 lively turns. No markdown wrapping.

Document:
"""
${sample}
"""`;

    const res = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });
    return extractJsonFromText(res.text || "[]");
  } catch {
    return fallbackAudioScript(sample);
  }
}

async function generateVideoOutline(sample: string): Promise<VideoSlide[]> {
  if (!ai) return fallbackVideoOutline(sample);
  try {
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

    const res = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });
    return extractJsonFromText(res.text || "[]");
  } catch {
    return fallbackVideoOutline(sample);
  }
}

// ==========================================
// INTELLIGENT FALLBACKS (Zero-crash guarantee)
// ==========================================

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

function generateFallbackUnderstanding(
  text: string,
  filename: string,
  wordCount: number,
  readingTimeMinutes: number
): DocumentUnderstandingResult {
  const keyConcepts = extractKeyPhrases(text, 5);
  const cleanTitle = filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

  return {
    summary: `This document ("${cleanTitle}") presents key educational concepts regarding ${keyConcepts.slice(0, 3).join(", ")}, with structured explanations, examples, and study takeaways prepared for student revision.`,
    difficulty: wordCount > 2000 ? "Advanced" : wordCount > 800 ? "Intermediate" : "Beginner",
    readingTimeMinutes,
    wordCount,
    keyConcepts,
    suggestedQuestions: [
      `What are the foundational principles of ${keyConcepts[0] || "this topic"}?`,
      `How does ${keyConcepts[1] || "the main theory"} apply in practical problem-solving?`,
      `What are the most common exam questions related to ${cleanTitle}?`,
    ],
    chapters: [
      {
        title: `1. Introduction to ${cleanTitle}`,
        summary: `Overview of foundational context, core terminology, and learning goals.`,
        keyPoints: [
          `Key focus on ${keyConcepts[0] || "core concept"}`,
          `Essential definitions and study boundaries`,
        ],
      },
      {
        title: `2. Deep Dive: ${keyConcepts[1] || "Key Mechanisms"}`,
        summary: `In-depth structural breakdown of active processes and methodologies.`,
        keyPoints: [
          `System dynamics and theoretical foundation`,
          `Practical worked examples and problem sets`,
        ],
      },
      {
        title: `3. Revision & Summary Matrix`,
        summary: `Quick-reference summary for exam preparation and formula review.`,
        keyPoints: [
          `High-yield formula/definition checklist`,
          `Common student misconceptions to avoid`,
        ],
      },
    ],
    mindMap: {
      id: "root",
      label: cleanTitle,
      children: [
        {
          id: "branch-1",
          label: keyConcepts[0] || "Fundamentals",
          children: [
            { id: "sub-1-1", label: "Core Principles" },
            { id: "sub-1-2", label: "Definitions" },
          ],
        },
        {
          id: "branch-2",
          label: keyConcepts[1] || "Methodology",
          children: [
            { id: "sub-2-1", label: "Key Processes" },
            { id: "sub-2-2", label: "Applications" },
          ],
        },
        {
          id: "branch-3",
          label: keyConcepts[2] || "Review & Insights",
          children: [
            { id: "sub-3-1", label: "Exam Tips" },
            { id: "sub-3-2", label: "Summary" },
          ],
        },
      ],
    },
  };
}

function fallbackChat(sourceText: string, query: string): { reply: string } {
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const paragraphs = sourceText.split(/\n+/).filter((p) => p.trim().length > 30);

  const matched = paragraphs.filter((p) =>
    queryWords.some((w) => p.toLowerCase().includes(w))
  );

  const excerpt = matched.length > 0 ? matched[0] : paragraphs[0] || sourceText.slice(0, 300);

  return {
    reply: `Based on your uploaded source material:\n\n"${excerpt.slice(0, 400)}..."\n\n**Key Insight**: In relation to your query ("${query}"), the document emphasizes understanding the foundational rules and their contextual applications. Review the relevant sections and practice the sample questions to solidify this concept.`,
  };
}

function fallbackSummary(text: string): string {
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 30);
  const sampleP = paragraphs.slice(0, 3).join("\n\n");
  return `# Comprehensive Document Summary\n\n## Overview\n${sampleP || "This document outlines key principles and core subject matter."}\n\n## Key Takeaways\n- Systematic breakdown of theoretical topics.\n- Core definitions and terminology essential for exams.\n- Step-by-step methodologies and practical applications.\n\n## Study Recommendation\nReview the Flashcards and take the interactive Quiz to test your retention.`;
}

function fallbackChapters(text: string): ChapterItem[] {
  const concepts = extractKeyPhrases(text, 4);
  return [
    {
      title: "Chapter 1: Foundational Principles",
      summary: `Introduction to the primary concepts: ${concepts[0] || "Topic A"} and its significance in the syllabus.`,
      keyPoints: [
        "Core definitions and initial conceptual framework.",
        "Historical background and fundamental assumptions.",
      ],
    },
    {
      title: "Chapter 2: Applied Analysis & Framework",
      summary: `Detailed examination of ${concepts[1] || "Topic B"} with worked illustrations.`,
      keyPoints: [
        "Mechanical processes and step-by-step methodology.",
        "Analytical equations and problem-solving techniques.",
      ],
    },
    {
      title: "Chapter 3: Synthesis & Exam Review",
      summary: "Consolidation of main themes, exam prep tips, and review questions.",
      keyPoints: [
        "Summary matrix of key rules.",
        "Common mistakes and high-yield scoring points.",
      ],
    },
  ];
}

function fallbackQuiz(text: string, count = 5): QuizQuestion[] {
  const concepts = extractKeyPhrases(text, 6);
  const primary = concepts[0] || "the main subject";
  const secondary = concepts[1] || "the core theory";

  return [
    {
      question: `What is the primary focus of the document regarding ${primary}?`,
      options: [
        `Establishing fundamental principles and real-world mechanisms`,
        `Disproving existing historical frameworks entirely`,
        `Analyzing unrelated external data sets`,
        `Comparing modern computational simulations only`,
      ],
      correctIndex: 0,
      explanation: `The source material builds a structured conceptual foundation around ${primary} to enable practical application.`,
    },
    {
      question: `According to the source, how does ${secondary} influence the outcome?`,
      options: [
        `It acts as a primary driving factor in the described process`,
        `It has no measurable correlation`,
        `It only applies in isolated theoretical conditions`,
        `It causes a complete system inversion`,
      ],
      correctIndex: 0,
      explanation: `The text highlights ${secondary} as an essential component of the learning framework.`,
    },
    {
      question: `Which study strategy is most effective for mastering this material?`,
      options: [
        `Connecting key definitions to practical examples and testing with flashcards`,
        `Memorizing unrelated dates without understanding definitions`,
        `Skipping core formulas and equations`,
        `Relying purely on passive reading without active recall`,
      ],
      correctIndex: 0,
      explanation: `Active recall through flashcards and quizzes reinforces deep conceptual understanding.`,
    },
    {
      question: `What role do the definitions provided in the text serve?`,
      options: [
        `They standardize terminology for syllabus exam readiness`,
        `They are intended for historical reference only`,
        `They replace the need for conceptual calculations`,
        `They contradict standard academic guidelines`,
      ],
      correctIndex: 0,
      explanation: `Clear terminology standardizes understanding across all chapter exercises and questions.`,
    },
    {
      question: `What is the primary conclusion drawn from the uploaded material?`,
      options: [
        `Systematic application of core concepts yields consistent understanding`,
        `The concepts cannot be applied in practice`,
        `Further research must discard all current findings`,
        `Only advanced specialists can comprehend the fundamentals`,
      ],
      correctIndex: 0,
      explanation: `The document demonstrates that mastering foundational rules leads to practical subject proficiency.`,
    },
  ].slice(0, count);
}

function fallbackFlashcards(text: string, count = 6): Flashcard[] {
  const concepts = extractKeyPhrases(text, 6);
  return [
    {
      front: `What is the primary definition of ${concepts[0] || "Key Term 1"}?`,
      back: `The fundamental concept described in the text that governs system behavior and core principles.`,
      hint: `Think of the foundational rule introduced in the opening section.`,
    },
    {
      front: `How is ${concepts[1] || "Core Mechanism"} applied in problem solving?`,
      back: `By utilizing systematic equations and structured steps to evaluate the scenario.`,
      hint: `Recall the worked examples in Chapter 2.`,
    },
    {
      front: `What distinguishes ${concepts[2] || "Primary Factor"} from secondary variables?`,
      back: `It directly influences the primary outcome and sets the scope for analysis.`,
      hint: `Look at the summary points in your notes.`,
    },
    {
      front: `What is a common student pitfall when analyzing this topic?`,
      back: `Confusing intermediate steps with the final theoretical conclusion.`,
      hint: `Always check your units and definitions.`,
    },
    {
      front: `Why is this topic critical for syllabus exams?`,
      back: `It provides the prerequisite knowledge required for advanced multi-part questions.`,
      hint: `High-yield scoring area.`,
    },
    {
      front: `How can you quickly verify your solution for these problems?`,
      back: `Check dimensional consistency and compare with boundary conditions.`,
      hint: `Sanity check your final values.`,
    },
  ].slice(0, count);
}

function fallbackNotes(text: string): string {
  const concepts = extractKeyPhrases(text, 4);
  return `# Comprehensive Revision Notes\n\n## 1. Executive Overview\nThis study guide covers high-yield syllabus concepts extracted from your uploaded source material. Focus on active retention and connecting definitions to practical examples.\n\n## 2. Core Concepts\n- **${concepts[0] || "Concept A"}**: Foundational principle governing the overall framework.\n- **${concepts[1] || "Concept B"}**: Active operational methodology and analytical equations.\n- **${concepts[2] || "Concept C"}**: Key boundary conditions and experimental results.\n\n## 3. High-Yield Exam Checklist\n- [ ] Memorize definitions of all bolded terminology.\n- [ ] Practice the sample MCQ quiz questions.\n- [ ] Review the Mind Map to visualize the concept hierarchy.\n\n## 4. Key Takeaways\nMastering the core principles ensures you can tackle both straightforward and complex questions on this topic.`;
}

function fallbackMindMap(text: string): any {
  const concepts = extractKeyPhrases(text, 4);
  return {
    id: "root",
    label: "Study Source",
    children: [
      {
        id: "m1",
        label: concepts[0] || "Foundations",
        children: [
          { id: "m1-1", label: "Core Principles" },
          { id: "m1-2", label: "Definitions" },
        ],
      },
      {
        id: "m2",
        label: concepts[1] || "Mechanisms",
        children: [
          { id: "m2-1", label: "Active Processes" },
          { id: "m2-2", label: "Formulas" },
        ],
      },
      {
        id: "m3",
        label: concepts[2] || "Applications",
        children: [
          { id: "m3-1", label: "Worked Examples" },
          { id: "m3-2", label: "Exam Review" },
        ],
      },
    ],
  };
}

function fallbackAnalysis(text: string): any {
  const words = text.split(/\s+/).filter(Boolean).length;
  const concepts = extractKeyPhrases(text, 5);

  return {
    academicLevel: words > 2000 ? "Advanced School / College" : "High School (Class 9-12)",
    bloomLevel: "Understanding & Analytical Application",
    estimatedStudyHours: Math.max(1, +(words / 400).toFixed(1)),
    prerequisites: ["Basic foundational science & mathematics", "Core vocabulary comprehension"],
    learningOutcomes: [
      `Understand and define ${concepts[0] || "key principles"}`,
      `Apply analytical problem-solving methods to syllabus questions`,
      `Synthesize complex textbook concepts into clear exam answers`,
    ],
    vocabularyTerms: concepts.map((c) => ({
      term: c,
      definition: `Important academic term highlighted throughout the document text.`,
    })),
    contentDensityScore: Math.min(95, Math.max(50, Math.floor(words / 40))),
  };
}

function fallbackTimeline(text: string): TimelineEvent[] {
  const concepts = extractKeyPhrases(text, 4);
  return [
    {
      title: "Stage 1: Foundational Framework",
      description: `Establish the background theory and define ${concepts[0] || "primary terms"}.`,
      tag: "Initiation",
    },
    {
      title: "Stage 2: Core Mechanism Execution",
      description: `Explore the interaction between ${concepts[1] || "active variables"} and system rules.`,
      tag: "Process",
    },
    {
      title: "Stage 3: Practical Demonstration",
      description: "Validation of theoretical predictions through worked examples and experiments.",
      tag: "Application",
    },
    {
      title: "Stage 4: Mastery & Assessment",
      description: "Synthesis of findings, exam question patterns, and review checklist.",
      tag: "Milestone",
    },
  ];
}

function fallbackAudioScript(text: string): AudioScriptTurn[] {
  const concepts = extractKeyPhrases(text, 3);
  return [
    {
      speaker: "Dr. Taylor (Mentor)",
      text: `Hello and welcome! Today we're breaking down your uploaded notes, focusing specifically on ${concepts[0] || "our main topic"}.`,
    },
    {
      speaker: "Alex (Student)",
      text: `Thanks Dr. Taylor! When I first skimmed through the document, I saw a lot of emphasis on ${concepts[1] || "the core rules"}. Could you summarize the big picture?`,
    },
    {
      speaker: "Dr. Taylor (Mentor)",
      text: `Absolutely! The big takeaway is that by understanding the foundational principles first, the rest of the equations fall naturally into place.`,
    },
    {
      speaker: "Alex (Student)",
      text: `That makes total sense. What's the most common mistake students make during exams on this?`,
    },
    {
      speaker: "Dr. Taylor (Mentor)",
      text: `Rushing past definitions and skipping the step-by-step validation. If you keep the core takeaways in mind, you'll score high!`,
    },
  ];
}

function fallbackVideoOutline(text: string): VideoSlide[] {
  const concepts = extractKeyPhrases(text, 4);
  return [
    {
      slideNumber: 1,
      title: `Introduction to ${concepts[0] || "Key Subject"}`,
      bullets: ["Course Overview & Objectives", "Why this concept matters", "Syllabus alignment"],
      notes: "Welcome the audience and state the primary learning goal.",
    },
    {
      slideNumber: 2,
      title: `Core Principles: ${concepts[1] || "The Mechanism"}`,
      bullets: ["Fundamental laws and definitions", "Key relationships", "Visual diagram overview"],
      notes: "Explain the visual flow and highlight bolded keywords.",
    },
    {
      slideNumber: 3,
      title: "Worked Problem & Application",
      bullets: ["Step 1: Identify given parameters", "Step 2: Apply formula", "Step 3: Verify result"],
      notes: "Walk through the problem step-by-step with the students.",
    },
    {
      slideNumber: 4,
      title: "Summary & Exam Review",
      bullets: ["Top 3 key takeaways", "Common pitfalls to avoid", "Next steps: Quiz & Flashcards"],
      notes: "Conclude with an encouraging call to action for practice.",
    },
  ];
}
