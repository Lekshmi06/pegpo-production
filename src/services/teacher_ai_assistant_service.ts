import { GoogleGenAI } from "@google/genai";
import { ITeacherProfile } from "../models/TeacherProfile";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const CANDIDATE_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.6-flash",
];

export interface TeacherPageContext {
  pageTitle?: string;
  pathname?: string;
  subject?: string;
  classLevel?: string;
  board?: string;
  topic?: string;
}

export interface ChatHistoryMessage {
  sender: "user" | "assistant";
  text: string;
}

export interface TeacherAIChatQueryOptions {
  message: string;
  pageContext?: TeacherPageContext;
  teacherProfile?: ITeacherProfile;
  history?: ChatHistoryMessage[];
}

export interface TeacherAIChatResult {
  reply: string;
  suggestions: string[];
  isQuotaExhausted?: boolean;
}

/**
 * Executes a Gemini prompt through candidate models sequentially.
 */
async function callGemini(prompt: string): Promise<{ text: string; isQuotaExhausted: boolean }> {
  if (!ai) {
    return { text: "", isQuotaExhausted: true };
  }

  let quotaExhausted = false;

  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      const text = response.text || "";
      if (text.trim().length > 0) {
        return { text: text.trim(), isQuotaExhausted: false };
      }
    } catch (err: any) {
      const errStr = String(err?.message || "") + " " + String(err?.status || "");
      if (
        err?.status === 429 ||
        errStr.includes("429") ||
        errStr.includes("Quota exceeded") ||
        errStr.includes("RESOURCE_EXHAUSTED") ||
        errStr.includes("rate limit")
      ) {
        quotaExhausted = true;
      }
      console.warn(`[TeacherAI] Model ${model} failed, trying next candidate...`);
      continue;
    }
  }

  return { text: "", isQuotaExhausted: quotaExhausted };
}

/**
 * Generates offline pedagogical response if AI quota is exhausted or API is unavailable.
 */
function generateOfflineTeacherResponse(query: string, context?: TeacherPageContext): TeacherAIChatResult {
  const q = query.toLowerCase();

  // Concept: Wave motion / Physics
  if (q.includes("wave") || q.includes("transverse") || q.includes("longitudinal")) {
    return {
      reply: `### 🌊 Concept Breakdown: Transverse vs. Longitudinal Waves

#### 1. Core Distinction for Classroom Teaching:
- **Transverse Waves**: Particles oscillate **perpendicular** (at $90^\\circ$) to the direction of wave propagation. Example: Light waves, ripples on a water surface, vibrating guitar string.
- **Longitudinal Waves**: Particles oscillate **parallel** (back and forth) along the direction of wave propagation through periodic *compressions* and *rarefactions*. Example: Sound waves in air, ultrasound, ultrasound pulses.

---

#### 💡 Classroom Analogy for Students:
- **Transverse Analogy**: *"The Stadium Wave"*. When sports fans stand up and sit down, people move vertically, but the wave travels horizontally around the stadium!
- **Longitudinal Analogy**: *"A Slinky Spring or Traffic Jam"*. Push one end of a stretched slinky back and forth; coils squeeze together (compression) and spread apart (rarefaction) along the line of motion.

---

#### ⚠️ Common Student Misconception:
> **Misconception**: Students often believe sound waves carry air molecules all the way from the speaker's mouth to the listener's ear.  
> **Clarification**: Air molecules only vibrate in place and transfer momentum to neighboring particles—they do not travel with the wave.

---

#### 📝 Formative Quick-Check Question:
*"If you pluck a guitar string in a vacuum bell jar, why can you see the string vibrating but cannot hear any sound?"*  
*(Tests the distinction between mechanical longitudinal sound requiring a medium vs. electromagnetic light).*`,
      suggestions: [
        "Give me a 5-minute hands-on slinky activity",
        "How do I explain wave speed formula v = fλ?",
        "Provide 3 multiple-choice questions on waves",
      ],
      isQuotaExhausted: true,
    };
  }

  // Concept: Photosynthesis / Biology
  if (q.includes("photosynthesis") || q.includes("chlorophyll") || q.includes("light reaction")) {
    return {
      reply: `### 🌿 Concept Breakdown: Photosynthesis & Energy Conversion

#### 1. Chemical Equation:
$$6\\text{CO}_2 + 6\\text{H}_2\\text{O} \\xrightarrow[\\text{Chlorophyll}]{\\text{Sunlight}} \\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\text{O}_2$$

#### 2. Key Stages to Differentiate for Students:
1. **Light-Dependent Phase (Thylakoids)**: Sunlight splits water molecules (photolysis) to release oxygen and generate ATP + NADPH.
2. **Light-Independent Phase / Calvin Cycle (Stroma)**: Uses ATP and NADPH to fix atmospheric $\\text{CO}_2$ into glucose.

---

#### 💡 Classroom Analogy:
Think of the plant cell as a **Solar Bakery**:
- The **Thylakoids** are the solar panels charging the battery (generating ATP/NADPH).
- The **Stroma** is the baking kitchen where carbon dioxide (flour) is shaped into glucose (loaves of bread) using stored battery power.

---

#### ⚠️ Student Trap:
Students frequently forget that plants perform **cellular respiration constantly (day & night)**, whereas photosynthesis only occurs in the presence of light.`,
      suggestions: [
        "Suggest a quick classroom demonstration of oxygen bubbles",
        "Design a 2-mark board exam question on photolysis",
        "How to explain difference between stomata transpiration and photosynthesis?",
      ],
      isQuotaExhausted: true,
    };
  }

  // Generic Academic Response
  return {
    reply: `### 📚 Pedagogical Insights for: "${query}"

Here are structured teaching guidelines and clear conceptual anchors for your classroom:

1. **Foundational Framing**:
   - Begin by anchoring this concept to something tangible that students observe in everyday life before introducing formal equations or definitions.
   - Clarify the core governing principles and verify standard terminology and units.

2. **Scaffolded Explanation**:
   - **Step 1 (Intuition)**: What is the underlying physical, chemical, or mathematical phenomenon?
   - **Step 2 (Formal Rule)**: State the law, theorem, or mechanism clearly.
   - **Step 3 (Worked Application)**: Walk through a standard problem or scenario step-by-step.

3. **Active Student Engagement**:
   - Ask a predictive question: *"What do you think happens if we double variable X?"*
   - Have students turn to a partner and explain the concept in their own words for 60 seconds (Think-Pair-Share).

---

*Tip: You can ask me for a classroom analogy, formative assessment questions, or a 45-minute lesson plan breakdown!*`,
    suggestions: [
      "Explain this using a real-world analogy",
      "Suggest 3 check-for-understanding questions",
      "What are the most common student misconceptions here?",
    ],
    isQuotaExhausted: true,
  };
}

/**
 * Main function to process teacher doubt-clearing AI queries.
 */
export async function processTeacherAIChatQuery(
  options: TeacherAIChatQueryOptions
): Promise<TeacherAIChatResult> {
  const { message, pageContext, teacherProfile, history = [] } = options;

  // Gather teacher context
  let teacherName = teacherProfile?.name || "Teacher";
  let activeSubject = pageContext?.subject || teacherProfile?.preferences?.activeSubject || teacherProfile?.subjects?.[0] || "General Science & Mathematics";
  let activeClass = pageContext?.classLevel || "Class 9-10";
  let activeBoard = pageContext?.board || "CBSE / NCERT";

  // Build conversation history transcript
  const historyText = history
    .slice(-6)
    .map((m) => `${m.sender === "user" ? "Teacher" : "AI Copilot"}: ${m.text}`)
    .join("\n");

  const prompt = `You are EduPye Teacher Copilot, an elite AI Teaching Assistant, Academic Mentor, and Pedagogical Advisor built specifically for school teachers and educators.
You are assisting ${teacherName}, who teaches ${activeSubject} (${activeClass}, ${activeBoard}).
Current Workspace Screen: ${pageContext?.pageTitle || pageContext?.pathname || "Teacher Classroom Hub"}.

MISSION & RESPONSIBILITIES:
1. CLEAR ACADEMIC DOUBTS WITH CRYSTAL CLARITY: Provide deep, rigorous, and scientifically/mathematically accurate explanations for any doubt, theorem, formula, concept, or curriculum query the teacher asks.
2. CLASSROOM-READY ANALOGIES: When explaining concepts, provide intuitive analogies, visual mental models, and real-world examples that teachers can directly tell their students to make abstract ideas click.
3. MISCONCEPTION ALERTS: Always alert the teacher to the #1 or #2 most common traps, confusion points, or misconceptions that students fall into on this topic.
4. QUESTION & RUBRIC DESIGN: When relevant, offer quick formative check questions or marking rubrics to test students.
5. PEDAGOGY & ENGAGEMENT: Provide actionable active-learning ideas, 5-minute classroom warm-ups, or whiteboard tips.
6. TONE: Professional, encouraging, deeply knowledgeable, articulate, concise yet comprehensive, and pedagogical.

FORMATTING RULES:
- Use clean GitHub-flavored Markdown with clear headings (###), bullet points, bold keywords, and formatted math (LaTeX e.g. $F = ma$ or $$\\text{formula}$$).
- Keep sections well-spaced and easy to read quickly during class or lesson prep.
- At the very end of your response, output a JSON block delimited by \`\`\`json ... \`\`\` containing exactly 3 short follow-up suggestion prompts that the teacher might want to ask next.

Example JSON format at end:
\`\`\`json
{
  "suggestions": [
    "Give me an everyday analogy for this",
    "What are common student mistakes on this topic?",
    "Create 3 quick practice questions with solutions"
  ]
}
\`\`\`

RECENT CONVERSATION HISTORY:
${historyText ? historyText : "No previous conversation."}

TEACHER'S QUERY:
"${message}"

Provide your expert pedagogical response now:`;

  const { text, isQuotaExhausted } = await callGemini(prompt);

  if (!text || text.trim().length === 0) {
    return generateOfflineTeacherResponse(message, pageContext);
  }

  // Extract suggestions from JSON block if present
  let cleanReply = text;
  let suggestions: string[] = [
    "Give me an everyday analogy for this",
    "What are common student mistakes on this topic?",
    "Suggest a 5-minute classroom activity",
  ];

  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
        suggestions = parsed.suggestions.slice(0, 3).map((s: any) => String(s));
      }
      cleanReply = text.replace(/```json\s*[\s\S]*?\s*```/, "").trim();
    } catch {
      // Ignore JSON parse errors
    }
  }

  return {
    reply: cleanReply,
    suggestions,
    isQuotaExhausted,
  };
}
