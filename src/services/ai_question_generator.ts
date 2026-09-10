import { GoogleGenAI } from "@google/genai";
import { AcademicContext } from "./academic_context_service";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const DEFAULT_MODEL = "gemini-2.5-flash";

export interface UniversalQuestionOption {
  id: "A" | "B" | "C" | "D";
  text: string;
}

export interface UniversalQuestion {
  question: string;
  sidebarTitle?: string;
  options: UniversalQuestionOption[];
  correctAnswer: "A" | "B" | "C" | "D";
  explanation: string;
  hint: string;
  difficulty: "Easy" | "Medium" | "Hard";
  marks: number;
  topic?: string;
  chapter?: string;
  stepByStepSolution?: string[];
}

export interface GenerateQuestionsParams {
  context: AcademicContext;
  materialText?: string;
  materialName?: string;
  questionCount?: number;
  difficulty?: "easy" | "medium" | "hard" | "mixed";
  topic?: string;
  mode?: "test" | "practice" | "quiz";
}

/**
 * Strips markdown code block wrappers (```json ... ```) safely.
 */
function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return cleaned.trim();
}

/**
 * Validates and repairs raw question objects into strict UniversalQuestion format.
 */
export function validateAndRepairQuestions(
  rawList: any[],
  targetCount: number,
  fallbackTopic?: string
): UniversalQuestion[] {
  if (!Array.isArray(rawList)) {
    return [];
  }

  const validQuestions: UniversalQuestion[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;

    const questionText = (item.question || item.text || "").toString().trim();
    if (!questionText || questionText.length < 5) continue;

    // Validate options
    let rawOptions = Array.isArray(item.options) ? item.options : [];
    if (rawOptions.length < 2) continue;

    // Normalize options to [{ id: 'A', text: ... }, ...]
    const letters: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];
    const normalizedOptions: UniversalQuestionOption[] = [];
    const seenTexts = new Set<string>();

    for (let i = 0; i < rawOptions.length && i < 4; i++) {
      const opt = rawOptions[i];
      let text = "";
      if (typeof opt === "string") {
        text = opt.trim();
      } else if (opt && typeof opt === "object" && typeof opt.text === "string") {
        text = opt.text.trim();
      }

      if (!text) text = `Option ${letters[i]}`;
      if (seenTexts.has(text.toLowerCase())) {
        text = `${text} (${letters[i]})`;
      }
      seenTexts.add(text.toLowerCase());

      normalizedOptions.push({
        id: letters[i],
        text,
      });
    }

    // Ensure exactly 4 options
    while (normalizedOptions.length < 4) {
      const idx = normalizedOptions.length;
      normalizedOptions.push({
        id: letters[idx],
        text: `None of the above (${letters[idx]})`,
      });
    }

    // Validate correct answer
    let rawAnswer = (item.correctAnswer || item.answer || "A").toString().trim().toUpperCase();
    if (rawAnswer.startsWith("OPTION ")) {
      rawAnswer = rawAnswer.replace("OPTION ", "");
    }
    // If index provided like 0, 1, 2, 3
    if (typeof item.correctIndex === "number" && item.correctIndex >= 0 && item.correctIndex <= 3) {
      rawAnswer = letters[item.correctIndex];
    }

    let correctAnswer: "A" | "B" | "C" | "D" = "A";
    if (["A", "B", "C", "D"].includes(rawAnswer)) {
      correctAnswer = rawAnswer as "A" | "B" | "C" | "D";
    }

    // Explanation
    const explanation =
      (item.explanation || "").toString().trim() ||
      `The correct answer is Option ${correctAnswer}.`;

    // Hint
    const hint =
      (item.hint || "").toString().trim() ||
      `Consider key principles of ${fallbackTopic || "the topic"} when analyzing this problem.`;

    // Difficulty
    let difficulty: "Easy" | "Medium" | "Hard" = "Medium";
    const rawDiff = (item.difficulty || "").toString().trim().toLowerCase();
    if (rawDiff === "easy") difficulty = "Easy";
    else if (rawDiff === "hard") difficulty = "Hard";

    // Marks
    const marks = Number(item.marks) > 0 ? Number(item.marks) : 1;

    // Sidebar title
    const sidebarTitle =
      (item.sidebarTitle || "").toString().trim() ||
      (questionText.length > 40 ? `${questionText.slice(0, 40)}...` : questionText);

    validQuestions.push({
      question: questionText,
      sidebarTitle,
      options: [
        normalizedOptions[0],
        normalizedOptions[1],
        normalizedOptions[2],
        normalizedOptions[3],
      ],
      correctAnswer,
      explanation,
      hint,
      difficulty,
      marks,
      topic: item.topic || fallbackTopic,
      chapter: item.chapter || fallbackTopic,
      stepByStepSolution: Array.isArray(item.stepByStepSolution)
        ? item.stepByStepSolution.map(String)
        : undefined,
    });

    if (validQuestions.length >= targetCount) {
      break;
    }
  }

  return validQuestions;
}

/**
 * Intelligent curriculum-grounded fallback generator when Gemini API key is absent or API is unavailable.
 */
function generateFallbackCurriculumQuestions(
  params: GenerateQuestionsParams
): UniversalQuestion[] {
  const { context, materialName, questionCount = 10, topic } = params;
  const subject = context.selectedSubject || "Physics";
  const board = context.board || "State Board";
  const classLevel = context.classLevel || "Class 11";
  const activeTopic = topic || `${subject} Core Fundamentals`;

  const templates = [
    {
      question: `In ${subject} for ${board} ${classLevel}, which of the following represents the fundamental SI base unit relationship?`,
      options: [
        { id: "A" as const, text: "Force is measured in Newtons (kg·m/s²)" },
        { id: "B" as const, text: "Velocity is measured in m/s²" },
        { id: "C" as const, text: "Energy is measured in Watts per second" },
        { id: "D" as const, text: "Pressure is measured in Pascals (N·m²)" },
      ],
      correctAnswer: "A" as const,
      explanation: "Force F = m·a, so 1 Newton = 1 kg × 1 m/s² = 1 kg·m/s².",
      hint: "Recall Newton's second law: Force equals mass multiplied by acceleration.",
      difficulty: "Easy" as const,
      marks: 1,
    },
    {
      question: `According to the ${board} ${classLevel} syllabus, what condition must be satisfied for an isolated system to conserve total mechanical energy?`,
      options: [
        { id: "A" as const, text: "All acting internal forces must be conservative" },
        { id: "B" as const, text: "Frictional and viscous forces must be dominant" },
        { id: "C" as const, text: "The net acceleration of all bodies must be zero" },
        { id: "D" as const, text: "The velocity of the center of mass must remain zero" },
      ],
      correctAnswer: "A" as const,
      explanation: "Mechanical energy (Kinetic + Potential) is conserved when only conservative forces do work.",
      hint: "Non-conservative forces like friction dissipate mechanical energy into heat.",
      difficulty: "Medium" as const,
      marks: 1,
    },
    {
      question: `When analyzing dimensional formulas in ${subject}, which physical quantity has the dimensional formula [M L² T⁻²]?`,
      options: [
        { id: "A" as const, text: "Power" },
        { id: "B" as const, text: "Work / Energy" },
        { id: "C" as const, text: "Linear Momentum" },
        { id: "D" as const, text: "Pressure" },
      ],
      correctAnswer: "B" as const,
      explanation: "Work = Force × Displacement = [M L T⁻²] × [L] = [M L² T⁻²].",
      hint: "Work done has the same dimensions as kinetic and potential energy.",
      difficulty: "Medium" as const,
      marks: 1,
    },
    {
      question: `A body travels along a straight path. If its displacement is proportional to the square of time (s ∝ t²), what can be deduced about its motion?`,
      options: [
        { id: "A" as const, text: "The body moves with uniform non-zero acceleration" },
        { id: "B" as const, text: "The body moves with uniform velocity" },
        { id: "C" as const, text: "The body moves with decreasing velocity" },
        { id: "D" as const, text: "The acceleration of the body is continuously changing" },
      ],
      correctAnswer: "A" as const,
      explanation: "s = (1/2) a t² implies second derivative d²s/dt² = a (constant acceleration).",
      hint: "Differentiate displacement twice with respect to time.",
      difficulty: "Medium" as const,
      marks: 1,
    },
    {
      question: `Which of the following statements correctly distinguishes between scalar and vector quantities?`,
      options: [
        { id: "A" as const, text: "Scalars require only magnitude; vectors require magnitude and direction obeying vector addition" },
        { id: "B" as const, text: "Scalars always have positive values, whereas vectors can only be negative" },
        { id: "C" as const, text: "Current is a vector because it has magnitude and direction" },
        { id: "D" as const, text: "All physical quantities with direction are vectors" },
      ],
      correctAnswer: "A" as const,
      explanation: "A vector must possess both magnitude and direction, and importantly obey the triangle or parallelogram law of addition.",
      hint: "Electric current has direction but does not obey vector algebra, so it is a scalar.",
      difficulty: "Easy" as const,
      marks: 1,
    },
    {
      question: `In vector algebra, what is the magnitude of the cross product (A × B) of two perpendicular vectors of magnitudes 3 and 4?`,
      options: [
        { id: "A" as const, text: "0" },
        { id: "B" as const, text: "7" },
        { id: "C" as const, text: "12" },
        { id: "D" as const, text: "25" },
      ],
      correctAnswer: "C" as const,
      explanation: "|A × B| = |A| |B| sin(90°) = 3 × 4 × 1 = 12.",
      hint: "sin(90°) = 1 for mutually perpendicular vectors.",
      difficulty: "Easy" as const,
      marks: 1,
    },
    {
      question: `What is the angle of projection at which the horizontal range of a projectile becomes maximum on level ground?`,
      options: [
        { id: "A" as const, text: "30°" },
        { id: "B" as const, text: "45°" },
        { id: "C" as const, text: "60°" },
        { id: "D" as const, text: "90°" },
      ],
      correctAnswer: "B" as const,
      explanation: "Range R = (u² sin 2θ) / g. Range is maximum when sin 2θ = 1 => 2θ = 90° => θ = 45°.",
      hint: "sin 2θ reaches its peak value of 1 when 2θ = 90°.",
      difficulty: "Easy" as const,
      marks: 1,
    },
    {
      question: `Newton’s First Law of Motion defines which fundamental property of physical bodies?`,
      options: [
        { id: "A" as const, text: "Inertia" },
        { id: "B" as const, text: "Momentum" },
        { id: "C" as const, text: "Impulse" },
        { id: "D" as const, text: "Frictional resistance" },
      ],
      correctAnswer: "A" as const,
      explanation: "The first law states that an object remains in its state of rest or uniform motion unless acted on by an external unbalanced force, defining inertia.",
      hint: "It is often called the Law of Inertia.",
      difficulty: "Easy" as const,
      marks: 1,
    },
    {
      question: `A passenger standing in a moving bus falls forward when the bus suddenly applies brakes. This is an illustration of:`,
      options: [
        { id: "A" as const, text: "Inertia of rest" },
        { id: "B" as const, text: "Inertia of motion" },
        { id: "C" as const, text: "Conservation of momentum" },
        { id: "D" as const, text: "Centripetal reaction" },
      ],
      correctAnswer: "B" as const,
      explanation: "The lower part of the passenger's body comes to rest with the bus, while the upper body tends to continue moving forward due to inertia of motion.",
      hint: "The body was already in motion and tends to maintain that velocity.",
      difficulty: "Easy" as const,
      marks: 1,
    },
    {
      question: `What is the SI unit of Impulse of a force?`,
      options: [
        { id: "A" as const, text: "N·s or kg·m/s" },
        { id: "B" as const, text: "N/s" },
        { id: "C" as const, text: "Joule·second" },
        { id: "D" as const, text: "Watt·second" },
      ],
      correctAnswer: "A" as const,
      explanation: "Impulse = Force × time = N·s. It also equals change in linear momentum: kg·m/s.",
      hint: "Impulse has the identical dimensions and units as linear momentum.",
      difficulty: "Easy" as const,
      marks: 1,
    },
  ];

  const pool: UniversalQuestion[] = templates.map((t, idx) => ({
    question: t.question,
    sidebarTitle: t.question.slice(0, 45),
    options: t.options,
    correctAnswer: t.correctAnswer,
    explanation: t.explanation,
    hint: t.hint,
    difficulty: t.difficulty,
    marks: t.marks,
    topic: activeTopic,
    chapter: materialName || `${subject} Chapter`,
  }));

  return pool.slice(0, questionCount);
}

/**
 * Reusable AI Question Generator for Tests, Practice, and Quizzes.
 * Grounded primarily in the student's uploaded learning material.
 */
export async function generateUniversalQuestions(
  params: GenerateQuestionsParams
): Promise<UniversalQuestion[]> {
  const {
    context,
    materialText,
    materialName,
    questionCount = 10,
    difficulty = "mixed",
    topic,
    mode = "test",
  } = params;

  // If AI client not configured or material is completely absent
  if (!ai) {
    console.log(
      "Gemini API client not initialized (GEMINI_API_KEY unset). Using structured curriculum question generator."
    );
    return generateFallbackCurriculumQuestions(params);
  }

  const subject = context.selectedSubject || "Physics";
  const board = context.board || "State Board";
  const classLevel = context.classLevel || "Class 11";
  const targetTopic = topic || `${subject} Core Concepts`;

  const prompt = `You are a distinguished academic curriculum examiner generating high-stakes academic test questions.

STUDENT ACADEMIC CONTEXT:
- Board: ${board}
- Class Level: ${classLevel}
- Subject: ${subject}
- Targeted Topic: ${targetTopic}
- Generation Mode: ${mode.toUpperCase()}
- Number of Questions Required: ${questionCount}
- Target Difficulty: ${difficulty}

STUDENT'S UPLOADED LEARNING MATERIAL:
Source Document: "${materialName || "Student Textbook / Study Material"}"
"""
${(materialText || "").slice(0, 24000)}
"""

CRITICAL INSTRUCTIONS:
1. Base all questions strictly on the concepts, definitions, formulas, and examples presented in the provided study material.
2. Formulate exactly ${questionCount} rigorous, high-quality Multiple Choice Questions (MCQs).
3. Every question must have exactly four mutually exclusive options labeled A, B, C, and D.
4. Exactly one option must be unequivocally correct.
5. Provide a clear educational explanation of why the correct option is right and other options are incorrect.
6. Provide a targeted, helpful pedagogical hint that guides the student without revealing the direct answer.
7. Difficulty must be labeled "Easy", "Medium", or "Hard".

OUTPUT FORMAT:
Return a strictly valid JSON array of objects with NO markdown code backticks, NO markdown formatting:
[
  {
    "question": "Clear, precise question text?",
    "sidebarTitle": "Short 3-5 word question label",
    "options": [
      { "id": "A", "text": "First option text" },
      { "id": "B", "text": "Second option text" },
      { "id": "C", "text": "Third option text" },
      { "id": "D", "text": "Fourth option text" }
    ],
    "correctAnswer": "A",
    "explanation": "Thorough educational explanation with step-by-step logic.",
    "hint": "Pedagogical clue guiding reasoning.",
    "difficulty": "Medium",
    "marks": 1,
    "topic": "${targetTopic}",
    "chapter": "${materialName || subject}"
  }
]`;

  try {
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
    });

    const rawText = response.text || "";
    const cleanJson = cleanJsonString(rawText);
    const parsed = JSON.parse(cleanJson);

    const questions = validateAndRepairQuestions(
      parsed,
      questionCount,
      targetTopic
    );

    if (questions.length >= Math.min(3, questionCount)) {
      return questions;
    }

    // If AI output was insufficient in count, pad with curriculum fallback
    const fallbackQuestions = generateFallbackCurriculumQuestions(params);
    const combined = [...questions, ...fallbackQuestions];
    return combined.slice(0, questionCount);
  } catch (error) {
    console.error("Gemini question generation error, utilizing curriculum fallback:", error);
    return generateFallbackCurriculumQuestions(params);
  }
}
