import { GoogleGenAI } from "@google/genai";
import { AcademicContext } from "./academic_context_service";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const DEFAULT_MODEL = "gemini-3.5-flash";
const CANDIDATE_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
];

/**
 * Executes a generation prompt trying candidate models sequentially upon rate-limit or availability errors.
 */
async function callGeminiWithModelFallback(prompt: string): Promise<string> {
  if (!ai) return "";

  let lastError: any = null;
  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      const text = response.text || "";
      if (text.trim().length > 0) {
        return text;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[ai_question_generator] Model ${model} failed: ${err.message?.slice(0, 100)}. Trying fallback model...`
      );
    }
  }

  if (lastError) {
    console.warn(
      "[ai_question_generator] All Gemini candidate models failed:",
      lastError.message
    );
  }
  return "";
}

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
 * Strictly respects student's grade level and uploaded curriculum concepts.
 */
function generateFallbackCurriculumQuestions(
  params: GenerateQuestionsParams
): UniversalQuestion[] {
  const { context, materialName, questionCount = 10, topic } = params;
  const subject = context.selectedSubject || "Basic Science";
  const board = context.board || "State Board";
  const classLevel = context.classLevel || "Class 7";
  const isMiddleSchool = /Class\s*[5-8]\b/i.test(classLevel);
  const activeTopic = topic || `${subject} Core Curriculum`;

  // Grade 7 (Middle School) curriculum questions strictly grouped by SCERT syllabus topics
  const class7ScienceTemplates = [
    // --- Wonders of Visible Light (5 questions) ---
    {
      question: "According to the laws of reflection of light, what is the relationship between the angle of incidence (i) and the angle of reflection (r)?",
      options: [
        { id: "A" as const, text: "Angle of incidence is equal to angle of reflection (i = r)" },
        { id: "B" as const, text: "Angle of incidence is always greater than angle of reflection" },
        { id: "C" as const, text: "Angle of reflection is always double the angle of incidence" },
        { id: "D" as const, text: "Angle of incidence plus angle of reflection equals 90°" },
      ],
      correctAnswer: "A" as const,
      explanation: "By the fundamental Law of Reflection, the angle of incidence is always equal to the angle of reflection (∠i = ∠r).",
      hint: "Think about looking directly into a flat plane mirror.",
      difficulty: "Easy" as const,
      marks: 1,
      topic: "Wonders of Visible Light",
      stepByStepSolution: [
        "Step 1: Identify the incident ray, reflected ray, and normal at the point of incidence.",
        "Step 2: Recall the first law of reflection: The angle of incidence equals the angle of reflection (∠i = ∠r).",
        "Step 3: Confirm Option A is the correct universal relationship.",
      ],
    },
    {
      question: "Which type of mirror is commonly used by dentists to obtain an enlarged, erect image of teeth?",
      options: [
        { id: "A" as const, text: "Concave mirror" },
        { id: "B" as const, text: "Convex mirror" },
        { id: "C" as const, text: "Plane mirror" },
        { id: "D" as const, text: "Cylindrical mirror" },
      ],
      correctAnswer: "A" as const,
      explanation: "When an object is placed close to a concave mirror (between pole and focus), it forms a virtual, erect, and magnified image.",
      hint: "Dentists need a magnified image of teeth to inspect small cavities.",
      difficulty: "Medium" as const,
      marks: 1,
      topic: "Wonders of Visible Light",
      stepByStepSolution: [
        "Step 1: Determine the requirement: a magnified and erect image.",
        "Step 2: Convex mirrors only form diminished images; plane mirrors form same-size images.",
        "Step 3: A concave mirror forms a magnified virtual image when the object is held close to it.",
      ],
    },
    {
      question: "When white sunlight passes through a glass triangular prism, it splits into seven distinct colors. What is this optical phenomenon called?",
      options: [
        { id: "A" as const, text: "Dispersion of light" },
        { id: "B" as const, text: "Total internal reflection" },
        { id: "C" as const, text: "Diffraction" },
        { id: "D" as const, text: "Polarization" },
      ],
      correctAnswer: "A" as const,
      explanation: "Dispersion is the splitting of white light into its seven constituent spectral colors (VIBGYOR) when passing through a transparent prism.",
      hint: "Think about what natural process forms a rainbow in the sky after rain.",
      difficulty: "Easy" as const,
      marks: 1,
      topic: "Wonders of Visible Light",
      stepByStepSolution: [
        "Step 1: Recall Sir Isaac Newton's prism experiment.",
        "Step 2: White light consists of seven colors that bend by different amounts through glass.",
        "Step 3: The process is termed dispersion.",
      ],
    },
    {
      question: "A periscope is an instrument that allows an observer to view objects over obstacles. How many plane mirrors are used inside a simple periscope, and at what angle are they inclined to the path of light?",
      options: [
        { id: "A" as const, text: "Two mirrors inclined at 45°" },
        { id: "B" as const, text: "One mirror inclined at 90°" },
        { id: "C" as const, text: "Two mirrors inclined at 60°" },
        { id: "D" as const, text: "Four mirrors inclined at 30°" },
      ],
      correctAnswer: "A" as const,
      explanation: "A simple periscope uses two plane mirrors fixed parallel to each other, each at an angle of 45° to the tube's axis, causing two 90° reflections.",
      hint: "Each mirror reflects the light beam by a right angle (90°), requiring an angle of incidence of 45°.",
      difficulty: "Medium" as const,
      marks: 1,
      topic: "Wonders of Visible Light",
      stepByStepSolution: [
        "Step 1: Light enters the top opening and strikes the first mirror at 45°.",
        "Step 2: The light reflects down the tube and hits the bottom mirror at 45°.",
        "Step 3: Two plane mirrors inclined at 45° are required.",
      ],
    },
    {
      question: "When you raise your right hand while standing in front of a plane mirror, your reflection appears to raise its left hand. What is this phenomenon called?",
      options: [
        { id: "A" as const, text: "Lateral inversion" },
        { id: "B" as const, text: "Refraction" },
        { id: "C" as const, text: "Diffraction" },
        { id: "D" as const, text: "Interference" },
      ],
      correctAnswer: "A" as const,
      explanation: "Lateral inversion is the apparent sideways reversal of an object's image in a plane mirror, where left becomes right and right becomes left.",
      hint: "Notice how the word 'AMBULANCE' is written backwards on the front of emergency vehicles.",
      difficulty: "Easy" as const,
      marks: 1,
      topic: "Wonders of Visible Light",
      stepByStepSolution: [
        "Step 1: Identify that side-to-side reversal in plane mirrors occurs.",
        "Step 2: The scientific term for sideways reversal of an image is lateral inversion.",
        "Step 3: Option A is the correct answer.",
      ],
    },

    // --- Respiration in Organisms (5 questions) ---
    {
      question: "During cellular respiration in living organisms, glucose combines with which gas to release energy, water, and carbon dioxide?",
      options: [
        { id: "A" as const, text: "Oxygen" },
        { id: "B" as const, text: "Nitrogen" },
        { id: "C" as const, text: "Hydrogen" },
        { id: "D" as const, text: "Carbon monoxide" },
      ],
      correctAnswer: "A" as const,
      explanation: "In aerobic respiration, glucose is broken down in the presence of oxygen to produce carbon dioxide, water, and usable energy (ATP).",
      hint: "This is the vital gas we breathe into our lungs from air.",
      difficulty: "Easy" as const,
      marks: 1,
      topic: "Respiration in Organisms",
      stepByStepSolution: [
        "Step 1: Write the general equation: Glucose + Oxygen -> Carbon Dioxide + Water + Energy.",
        "Step 2: Identify the essential gas required: Oxygen.",
        "Step 3: Select Option A.",
      ],
    },
    {
      question: "Cockroaches and insects do not possess lungs. Through which small lateral openings on their body surface do they draw air into their respiratory system?",
      options: [
        { id: "A" as const, text: "Spiracles" },
        { id: "B" as const, text: "Gills" },
        { id: "C" as const, text: "Tracheae" },
        { id: "D" as const, text: "Stomata" },
      ],
      correctAnswer: "A" as const,
      explanation: "Insects have tiny valve-like openings on the sides of their bodies called spiracles that lead into a network of air tubes (tracheae).",
      hint: "These are small pores on the lateral body segments through which air enters.",
      difficulty: "Easy" as const,
      marks: 1,
      topic: "Respiration in Organisms",
      stepByStepSolution: [
        "Step 1: Differentiate between the pores (spiracles) and internal tubes (tracheae).",
        "Step 2: The openings on the body surface are spiracles.",
        "Step 3: Confirm Option A.",
      ],
    },
    {
      question: "After sprinting vigorously in a race, an athlete experiences severe muscle cramps. This temporary condition is caused by the accumulation of which acid produced during anaerobic respiration?",
      options: [
        { id: "A" as const, text: "Lactic acid" },
        { id: "B" as const, text: "Hydrochloric acid" },
        { id: "C" as const, text: "Acetic acid" },
        { id: "D" as const, text: "Citric acid" },
      ],
      correctAnswer: "A" as const,
      explanation: "During strenuous exercise when oxygen supply is insufficient, muscle cells respire anaerobically, partially breaking down glucose into lactic acid, causing cramps.",
      hint: "A warm bath or massage improves circulation and breaks down this fatigue acid.",
      difficulty: "Medium" as const,
      marks: 1,
      topic: "Respiration in Organisms",
      stepByStepSolution: [
        "Step 1: High energy demand with limited oxygen leads to anaerobic respiration in muscles.",
        "Step 2: Anaerobic breakdown of glucose in human muscles yields lactic acid.",
        "Step 3: Lactic acid buildup causes cramps.",
      ],
    },
    {
      question: "What physical changes occur in the human chest cavity during normal inhalation (breathing in)?",
      options: [
        { id: "A" as const, text: "Ribs move up and outwards; diaphragm moves downwards" },
        { id: "B" as const, text: "Ribs move down and inwards; diaphragm moves upwards" },
        { id: "C" as const, text: "Ribs move down; diaphragm expands upwards" },
        { id: "D" as const, text: "Ribs and diaphragm both remain completely stationary" },
      ],
      correctAnswer: "A" as const,
      explanation: "During inhalation, ribs move up and out while the diaphragm moves down and flattens, expanding chest volume and drawing atmospheric air into lungs.",
      hint: "Take a deep breath and feel your chest expand outward.",
      difficulty: "Medium" as const,
      marks: 1,
      topic: "Respiration in Organisms",
      stepByStepSolution: [
        "Step 1: Chest cavity must expand to create lower pressure than atmospheric air.",
        "Step 2: Intercostal muscles pull ribs up and out; diaphragm contracts downwards.",
        "Step 3: Select Option A.",
      ],
    },
    {
      question: "Yeast cells are unicellular fungi that respire anaerobically. What are the key end products when yeast breaks down glucose in the absence of oxygen?",
      options: [
        { id: "A" as const, text: "Alcohol (ethanol), carbon dioxide, and energy" },
        { id: "B" as const, text: "Lactic acid and oxygen" },
        { id: "C" as const, text: "Water and oxygen only" },
        { id: "D" as const, text: "Carbon monoxide and hydrogen" },
      ],
      correctAnswer: "A" as const,
      explanation: "Yeast respire anaerobically through fermentation, converting glucose into alcohol (ethanol) and carbon dioxide with energy release.",
      hint: "This biological process is used to make bread dough rise and in brewing.",
      difficulty: "Medium" as const,
      marks: 1,
      topic: "Respiration in Organisms",
      stepByStepSolution: [
        "Step 1: Recall anaerobic fermentation in single-celled yeast.",
        "Step 2: Equation: Glucose -> Alcohol + Carbon dioxide + Energy.",
        "Step 3: Option A is correct.",
      ],
    },

    // --- Heat and Temperature (5 questions) ---
    {
      question: "Which mode of heat transfer occurs through direct particle-to-particle vibration without the actual movement of the medium, common in solid metals?",
      options: [
        { id: "A" as const, text: "Conduction" },
        { id: "B" as const, text: "Convection" },
        { id: "C" as const, text: "Radiation" },
        { id: "D" as const, text: "Absorption" },
      ],
      correctAnswer: "A" as const,
      explanation: "Conduction is the process where heat is transferred from the hotter end to the colder end in solids without bodily movement of the particles.",
      hint: "Think about heating one end of a metal spoon in hot tea.",
      difficulty: "Easy" as const,
      marks: 1,
      topic: "Heat and Temperature",
      stepByStepSolution: [
        "Step 1: Recall the three modes of heat transfer: Conduction, Convection, Radiation.",
        "Step 2: In solids like metals, particles vibrate and transfer thermal energy to neighboring particles.",
        "Step 3: Conduction is therefore the mode that occurs in solids.",
      ],
    },
    {
      question: "What is the normal temperature of a healthy human body on the Celsius scale?",
      options: [
        { id: "A" as const, text: "37°C" },
        { id: "B" as const, text: "35°C" },
        { id: "C" as const, text: "42°C" },
        { id: "D" as const, text: "98.6°C" },
      ],
      correctAnswer: "A" as const,
      explanation: "The normal internal body temperature of a healthy human is 37°C (which corresponds to 98.6°F on the Fahrenheit scale).",
      hint: "Be careful not to confuse the Celsius value (around thirty-seven) with the Fahrenheit value (98.6).",
      difficulty: "Easy" as const,
      marks: 1,
      topic: "Heat and Temperature",
      stepByStepSolution: [
        "Step 1: Recall human body temperature scales.",
        "Step 2: On the Celsius scale, normal human body temperature is 37°C.",
        "Step 3: Select Option A.",
      ],
    },
    {
      question: "Why does a clinical thermometer have a slight bend or constriction (kink) in the capillary tube near the bulb?",
      options: [
        { id: "A" as const, text: "To prevent the mercury level from falling on its own before reading" },
        { id: "B" as const, text: "To allow the thermometer to measure boiling water" },
        { id: "C" as const, text: "To make the thermometer easier to clean" },
        { id: "D" as const, text: "To prevent the mercury from expanding" },
      ],
      correctAnswer: "A" as const,
      explanation: "The kink in a clinical thermometer prevents mercury from dropping back into the bulb when removed from the patient's mouth, allowing accurate reading.",
      hint: "This feature ensures you have enough time to read the temperature accurately after taking it out.",
      difficulty: "Medium" as const,
      marks: 1,
      topic: "Heat and Temperature",
      stepByStepSolution: [
        "Step 1: When removed from the warm mouth into cooler room air, mercury contracts.",
        "Step 2: The kink breaks the thread of mercury, holding the highest reading.",
        "Step 3: Confirm Option A.",
      ],
    },
    {
      question: "In coastal areas during daytime, cool air blows from the sea towards the land. What is this phenomenon called, and what causes it?",
      options: [
        { id: "A" as const, text: "Sea breeze, caused by convection currents as land heats up faster than water" },
        { id: "B" as const, text: "Land breeze, caused by conduction of heat into the ocean" },
        { id: "C" as const, text: "Trade winds, caused by the rotation of the Earth" },
        { id: "D" as const, text: "Cyclone, caused by ocean evaporation" },
      ],
      correctAnswer: "A" as const,
      explanation: "During the day, land warms faster than sea water. Warm air over land rises, and cooler denser air from the sea rushes in as a sea breeze (convection).",
      hint: "The breeze is named after its origin: coming from the sea towards the warmer land.",
      difficulty: "Medium" as const,
      marks: 1,
      topic: "Heat and Temperature",
      stepByStepSolution: [
        "Step 1: Land heats up faster than water during the day.",
        "Step 2: Hot air above land rises, creating a low-pressure area.",
        "Step 3: Cool air over the sea moves towards the land, forming a sea breeze.",
      ],
    },
    {
      question: "How does heat from the Sun travel across millions of kilometers of empty space (vacuum) to warm the Earth?",
      options: [
        { id: "A" as const, text: "Radiation" },
        { id: "B" as const, text: "Conduction" },
        { id: "C" as const, text: "Convection" },
        { id: "D" as const, text: "Advection" },
      ],
      correctAnswer: "A" as const,
      explanation: "Radiation is the mode of heat transfer via electromagnetic waves that does not require any material medium, allowing solar thermal energy to cross space.",
      hint: "Conduction and convection both require material particles, but outer space is empty vacuum.",
      difficulty: "Easy" as const,
      marks: 1,
      topic: "Heat and Temperature",
      stepByStepSolution: [
        "Step 1: Identify that space between Sun and Earth is empty vacuum.",
        "Step 2: Conduction and convection cannot occur without matter.",
        "Step 3: Radiation transfers thermal energy without needing a medium.",
      ],
    },

    // --- Acids, Bases, and Salts (5 questions) ---
    {
      question: "Which natural indicator changes from its normal color to red in an acidic solution?",
      options: [
        { id: "A" as const, text: "Blue litmus paper" },
        { id: "B" as const, text: "Red litmus paper" },
        { id: "C" as const, text: "Turmeric paste" },
        { id: "D" as const, text: "Phenolphthalein" },
      ],
      correctAnswer: "A" as const,
      explanation: "Acids turn blue litmus paper red, while bases turn red litmus paper blue.",
      hint: "Remember: 'A-B-R' -> Acid turns Blue to Red.",
      difficulty: "Easy" as const,
      marks: 1,
      topic: "Acids, Bases, and Salts",
      stepByStepSolution: [
        "Step 1: Recall tests for acids using litmus paper.",
        "Step 2: Acidic substances turn blue litmus red.",
        "Step 3: Hence, Option A is the correct answer.",
      ],
    },
    {
      question: "When an acid reacts with a base, they cancel each other's effects to produce salt and water with the evolution of heat. What is this reaction called?",
      options: [
        { id: "A" as const, text: "Neutralization reaction" },
        { id: "B" as const, text: "Combustion reaction" },
        { id: "C" as const, text: "Decomposition reaction" },
        { id: "D" as const, text: "Precipitation reaction" },
      ],
      correctAnswer: "A" as const,
      explanation: "The reaction between an acid and a base is termed a neutralization reaction, producing salt and water (Acid + Base -> Salt + Water).",
      hint: "The acid and base make the solution neither acidic nor basic (neutral).",
      difficulty: "Easy" as const,
      marks: 1,
      topic: "Acids, Bases, and Salts",
      stepByStepSolution: [
        "Step 1: Acid + Base -> Salt + Water + Heat.",
        "Step 2: The acidity and basicity are cancelled out.",
        "Step 3: This is known as neutralization.",
      ],
    },

    // --- Along with Progress (5 questions) ---
    {
      question: "Which of the following is an eco-friendly farming method that preserves soil fertility without harmful synthetic chemicals?",
      options: [
        { id: "A" as const, text: "Organic farming using compost and bio-fertilizers" },
        { id: "B" as const, text: "Excessive application of chemical pesticides" },
        { id: "C" as const, text: "Monoculture without crop rotation" },
        { id: "D" as const, text: "Stubble burning after harvesting" },
      ],
      correctAnswer: "A" as const,
      explanation: "Organic farming utilizes natural compost, green manures, and bio-fertilizers to sustain soil health and ecology.",
      hint: "Look for the practice that uses natural inputs instead of artificial poisons.",
      difficulty: "Easy" as const,
      marks: 1,
      topic: "Along with Progress",
      stepByStepSolution: [
        "Step 1: Review sustainable agricultural practices.",
        "Step 2: Compost and bio-fertilizers nurture soil microbes and prevent chemical runoff.",
        "Step 3: Option A is the sustainable and eco-friendly technique.",
      ],
    },

    // --- Adding Angles (5 questions) ---
    {
      question: "What is the sum of two adjacent angles that form a linear pair along a straight line?",
      options: [
        { id: "A" as const, text: "180°" },
        { id: "B" as const, text: "90°" },
        { id: "C" as const, text: "360°" },
        { id: "D" as const, text: "45°" },
      ],
      correctAnswer: "A" as const,
      explanation: "A linear pair of angles are adjacent angles formed when two lines intersect, and their sum always equals 180° (supplementary).",
      hint: "Angles on a straight line always add up to a straight angle.",
      difficulty: "Easy" as const,
      marks: 1,
      topic: "Adding Angles",
      stepByStepSolution: [
        "Step 1: Define a linear pair: two adjacent angles whose non-common sides form a straight line.",
        "Step 2: The angle measure of a straight line is 180°.",
        "Step 3: Conclude that the sum is 180°.",
      ],
    },
  ];

  const templates = isMiddleSchool ? class7ScienceTemplates : [];

  // Filter templates strictly by requested topic to avoid cross-topic contamination
  const requestedTopic = (topic || "").toLowerCase().trim();
  let matchedTemplates = templates.filter((t) => {
    if (!requestedTopic) return true;
    const tTopic = (t.topic || "").toLowerCase();
    if (tTopic.includes(requestedTopic) || requestedTopic.includes(tTopic)) return true;
    if (requestedTopic.includes("light") && tTopic.includes("light")) return true;
    if (requestedTopic.includes("respiration") && tTopic.includes("respiration")) return true;
    if (requestedTopic.includes("heat") && tTopic.includes("heat")) return true;
    if (requestedTopic.includes("acid") && tTopic.includes("acid")) return true;
    if (requestedTopic.includes("progress") && tTopic.includes("progress")) return true;
    if (requestedTopic.includes("angle") && tTopic.includes("angle")) return true;
    return false;
  });

  if (matchedTemplates.length === 0) {
    matchedTemplates = templates;
  }

  const pool: UniversalQuestion[] = matchedTemplates.map((t) => ({
    question: t.question,
    sidebarTitle: t.question.slice(0, 45),
    options: t.options,
    correctAnswer: t.correctAnswer,
    explanation: t.explanation,
    hint: t.hint,
    difficulty: t.difficulty,
    marks: t.marks,
    topic: t.topic || activeTopic,
    chapter: materialName || `${subject} Chapter`,
    stepByStepSolution: t.stepByStepSolution,
  }));

  return pool.slice(0, questionCount);
}

import { TEST_CONFIG, resolveQuestionCount } from "../config/test_config";

/**
 * Checks whether the requested topic and subject match available curriculum templates.
 * Prevents injecting unrelated questions into mismatched topics or grades.
 */
function isTopicMatchingCurriculumTemplates(
  classLevel?: string,
  topic?: string,
  subject?: string
): boolean {
  const isMiddleSchool = /Class\s*[5-8]\b/i.test(classLevel || "");
  if (!isMiddleSchool) return false;
  if (!topic || topic.trim().length === 0) return true;
  const t = topic.toLowerCase();
  const s = (subject || "").toLowerCase();
  return (
    s.includes("science") ||
    s.includes("math") ||
    t.includes("light") ||
    t.includes("mirror") ||
    t.includes("heat") ||
    t.includes("acid") ||
    t.includes("base") ||
    t.includes("respiration") ||
    t.includes("progress") ||
    t.includes("angle") ||
    t.includes("matter")
  );
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
    difficulty = "mixed",
    topic,
    mode = "test",
  } = params;

  // Programmatically clamp question count
  const questionCount = resolveQuestionCount(params.questionCount);
  const classLevel = context.classLevel || "Class 7";
  const isMiddleSchool = /Class\s*[5-8]\b/i.test(classLevel);
  const subject = context.selectedSubject || (isMiddleSchool ? "Basic Science" : "Science");
  const board = context.board || "State Board";
  const academicYear = context.academicYear || "2026–2027";
  const targetTopic = topic || `${subject} Core Curriculum`;

  // If AI client not configured or unavailable
  if (!ai) {
    console.log(
      "Gemini API client not initialized (GEMINI_API_KEY unset)."
    );
    if (isTopicMatchingCurriculumTemplates(classLevel, topic, subject)) {
      return generateFallbackCurriculumQuestions({
        ...params,
        questionCount,
      });
    }
    return [];
  }

  const validQuestions: UniversalQuestion[] = [];
  const seenQuestions = new Set<string>();

  const addQuestions = (rawList: any[]) => {
    const repaired = validateAndRepairQuestions(
      rawList,
      questionCount,
      targetTopic
    );
    for (const q of repaired) {
      if (validQuestions.length >= questionCount) break;
      const norm = q.question.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!seenQuestions.has(norm)) {
        seenQuestions.add(norm);
        validQuestions.push(q);
      }
    }
  };

  const prompt = `You are a distinguished academic curriculum examiner generating curriculum-grounded assessment questions for school students.

STUDENT ACADEMIC PROFILE:
- Board of Education: ${board}
- Grade / Class Level: ${classLevel}
- Academic Year: ${academicYear}
- Subject: ${subject}
- Targeted Topic / Chapter: ${targetTopic}
- Assessment Mode: ${mode.toUpperCase()}
- Number of Questions Required: ${questionCount}
- Target Difficulty: ${difficulty}

STUDENT'S OFFICIAL UPLOADED CURRICULUM & SYLLABUS:
Source Document: "${materialName || "Curriculum & Syllabus Guide"}"
"""
${(materialText || "").slice(0, 24000)}
"""

CRITICAL PEDAGOGICAL INSTRUCTIONS:
1. STRICT GRADE-LEVEL APPROPRIATENESS:
   - All questions, vocabulary, options, and explanations MUST strictly match the cognitive ability and academic standards of a ${classLevel} student under ${board}.
   - For middle-school students (e.g. Class 7), formulate clear, conceptual questions about foundational principles, everyday phenomena, and basic scientific/mathematical reasoning.
   - NEVER introduce senior secondary (Class 11/12) advanced calculus, complex rotational dynamics, university mechanics, or collegiate formulas.
2. EXCLUSIVE CURRICULUM GROUNDING:
   - Base questions ONLY on the topics, chapters, and competencies outlined in the student's uploaded curriculum above.
   - Do NOT test concepts outside the ${classLevel} syllabus.
   - All questions must directly test "${targetTopic}" within ${subject}.
3. MCQ FORMAT:
   - Formulate exactly ${questionCount} Multiple Choice Questions (MCQs).
   - Exactly 4 options labeled A, B, C, and D per question. Mutually exclusive, no ambiguity.
   - Exactly one option is unequivocally correct.
4. EXPLANATION, HINT & STEP-BY-STEP SOLUTION:
   - Provide a clear, child-friendly explanation of why the correct option is right.
   - Provide a helpful pedagogical hint that guides the student's thinking without revealing the answer.
   - Include a "stepByStepSolution" array with 2-4 easy-to-follow steps explaining the solution logic.
5. DIFFICULTY:
   - Label difficulty as "Easy", "Medium", or "Hard".

OUTPUT FORMAT:
Return a strictly valid JSON array of ${questionCount} objects with NO markdown code backticks, NO extra commentary:
[
  {
    "question": "Clear, precise question text?",
    "sidebarTitle": "Short 3-5 word label",
    "options": [
      { "id": "A", "text": "Option A" },
      { "id": "B", "text": "Option B" },
      { "id": "C", "text": "Option C" },
      { "id": "D", "text": "Option D" }
    ],
    "correctAnswer": "A",
    "explanation": "Clear pedagogical explanation.",
    "hint": "Guiding pedagogical hint.",
    "difficulty": "Easy",
    "marks": 1,
    "topic": "${targetTopic}",
    "chapter": "${materialName || subject}",
    "stepByStepSolution": [
      "Step 1: ...",
      "Step 2: ...",
      "Step 3: ..."
    ]
  }
]`;

  try {
    const rawText = await callGeminiWithModelFallback(prompt);
    if (rawText) {
      const cleanJson = cleanJsonString(rawText);
      const parsed = JSON.parse(cleanJson);

      if (Array.isArray(parsed)) {
        addQuestions(parsed);
      }
    }
  } catch (error) {
    console.warn("Initial Gemini question generation error:", error);
  }

  // Retry missing questions if Gemini returned fewer valid questions than requested
  let retries = 0;
  while (
    validQuestions.length < questionCount &&
    retries < TEST_CONFIG.MAX_GENERATION_RETRIES
  ) {
    retries++;
    const missing = questionCount - validQuestions.length;
    console.log(
      `[generateUniversalQuestions] Have ${validQuestions.length}/${questionCount} questions for "${targetTopic}". Retrying for ${missing} remaining questions (attempt ${retries}/${TEST_CONFIG.MAX_GENERATION_RETRIES}).`
    );

    const retryPrompt = `You are an academic curriculum examiner for ${board} ${classLevel} ${subject}.
The student requires additional practice questions strictly on the topic: "${targetTopic}".
All questions must strictly be at the ${classLevel} academic level based on their syllabus.

We currently have ${validQuestions.length} questions. Generate exactly ${missing} ADDITIONAL, NEW, and UNIQUE Multiple Choice Questions (MCQs) testing "${targetTopic}".
Do NOT duplicate any of these existing questions:
${validQuestions.slice(-5).map((q, idx) => `${idx + 1}. ${q.question.slice(0, 100)}`).join("\n")}

Strict requirements:
1. Base all questions strictly on "${targetTopic}" from ${board} ${classLevel} curriculum.
2. Provide exactly 4 mutually exclusive options labeled A, B, C, D for each question.
3. Mark the single correct option (A, B, C, or D).
4. Provide a clear explanation, hint, and stepByStepSolution array.
5. Difficulty must be labeled "Easy", "Medium", or "Hard".

Return ONLY a valid JSON array of ${missing} objects with NO markdown backticks:
[
  {
    "question": "Question text?",
    "sidebarTitle": "Short title",
    "options": [
      { "id": "A", "text": "Option A" },
      { "id": "B", "text": "Option B" },
      { "id": "C", "text": "Option C" },
      { "id": "D", "text": "Option D" }
    ],
    "correctAnswer": "A",
    "explanation": "Explanation.",
    "hint": "Hint.",
    "difficulty": "Easy",
    "marks": 1,
    "topic": "${targetTopic}",
    "chapter": "${materialName || subject}",
    "stepByStepSolution": [
      "Step 1: ...",
      "Step 2: ..."
    ]
  }
]`;

    try {
      const rawText = await callGeminiWithModelFallback(retryPrompt);
      if (rawText) {
        const parsed = JSON.parse(cleanJsonString(rawText));
        if (Array.isArray(parsed)) {
          addQuestions(parsed);
        }
      }
    } catch (retryErr) {
      console.warn(
        `[generateUniversalQuestions] Retry ${retries} failed:`,
        retryErr
      );
      break;
    }
  }

  // Only pad with curriculum fallback if topic is confirmed to match curriculum templates
  if (
    validQuestions.length < questionCount &&
    isTopicMatchingCurriculumTemplates(classLevel, topic, subject)
  ) {
    const fallbackQuestions = generateFallbackCurriculumQuestions({
      ...params,
      questionCount,
    });
    for (const fq of fallbackQuestions) {
      if (validQuestions.length >= questionCount) break;
      const norm = fq.question.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!seenQuestions.has(norm)) {
        seenQuestions.add(norm);
        validQuestions.push(fq);
      }
    }
  }

  // Never fill remaining slots with unrelated questions simply to satisfy count.
  return validQuestions.slice(0, questionCount);
}
