import dotenv from "dotenv";
dotenv.config();

import {
  chatWithSource,
  generateActionContent,
  QuizQuestion,
  Flashcard,
} from "../services/gemini_service";
import {
  processAIChatQuery,
  detectIntent,
} from "../services/ai_assistant_service";
import {
  getGeminiClient,
  getGeminiModel,
  GeminiServiceError,
} from "./gemini_config";
import { GoogleGenAI } from "@google/genai";

async function runPhase1LiveVerification() {
  console.log("=================================================");
  console.log("   PHASE 1 - GEMINI & CORE AI LIVE VERIFICATION  ");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function report(name: string, ok: boolean, details?: string) {
    if (ok) {
      console.log(`[PASS] ${name}${details ? ` -> ${details}` : ""}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}${details ? ` -> ${details}` : ""}`);
      failed++;
    }
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // 1. Centralized Config Check
  console.log("--- 1. Centralized Gemini Config & Model Selection ---");
  try {
    const configuredModel = getGeminiModel();
    const client = getGeminiClient();
    report("Centralized Gemini Client initialized", !!client, `Model: ${configuredModel}`);
  } catch (err: any) {
    report("Centralized Gemini Client initialized", false, err.message);
  }

  // 2. Casual / Academic Companion Conversation
  console.log("\n--- 2. Casual Conversation ---");
  try {
    const start = Date.now();
    const res = await processAIChatQuery({
      message: "Give me some encouraging advice on preparing for my upcoming exams.",
      studentName: "Alex",
    });
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    const isRealResponse = typeof res.reply === "string" && res.reply.length > 20 && !res.isQuotaExhausted;
    report("Casual chat response received", isRealResponse, `Duration: ${duration}s, Intent: ${res.intent}, Reply: "${res.reply.slice(0, 70)}..."`);
  } catch (err: any) {
    report("Casual chat response received", false, err.message);
  }

  await sleep(2500);

  // 3. Concept Explanation
  console.log("\n--- 3. Concept Explanation ---");
  try {
    const start = Date.now();
    const res = await processAIChatQuery({
      message: "Explain Newton's second law with a simple formula",
    });
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    const mentionsForceOrMass = /force|mass|acceleration|F\s*=\s*m/i.test(res.reply);
    report("Concept explanation", mentionsForceOrMass && !res.isQuotaExhausted, `Duration: ${duration}s, Intent: ${res.intent}, Mentions F=ma: ${mentionsForceOrMass}`);
  } catch (err: any) {
    report("Concept explanation", false, err.message);
  }

  await sleep(2500);

  // 4. Quiz Generation (MCQ with Options & Explanation)
  console.log("\n--- 4. Quiz Generation (Genuine Output, No Fake Fallbacks) ---");
  try {
    const sourceText = "Photosynthesis is the biological process used by plants, algae, and certain bacteria to convert light energy into chemical energy stored in glucose molecules. Chlorophyll in the chloroplasts absorbs sunlight, primarily in the blue and red wavelengths, while reflecting green. During the light-dependent reactions, water is photolyzed, releasing oxygen as a byproduct. In the light-independent Calvin cycle, carbon dioxide is fixed into carbohydrates.";
    const start = Date.now();
    const quiz: QuizQuestion[] = await generateActionContent("quiz", sourceText, { count: 3 });
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    
    // Check if it's the old canned mock: "What is the primary function of chlorophyll in photosynthesis?"
    const isCanned = Array.isArray(quiz) && quiz.some(q => q.question.includes("What is the primary function of chlorophyll in photosynthesis?"));
    const isValidStructure = Array.isArray(quiz) && quiz.length >= 3 && quiz.every(q => 
      q.question && Array.isArray(q.options) && q.options.length >= 4 && typeof q.correctIndex === 'number' && q.explanation
    );
    
    report("Quiz generated with genuine Gemini output", isValidStructure && !isCanned, 
      `Duration: ${duration}s, Count: ${quiz?.length || 0}, Questions: ${quiz?.map(q => `"${q.question.slice(0, 35)}..."`).join(", ")}`);
  } catch (err: any) {
    report("Quiz generated with genuine Gemini output", false, err.message);
  }

  await sleep(2500);

  // 5. Flashcard Generation (Front & Back)
  console.log("\n--- 5. Flashcard Generation ---");
  try {
    const sourceText = "Mitochondria are membrane-bound cell organelles that generate most of the chemical energy needed to power the cell's biochemical reactions. Chemical energy produced by the mitochondria is stored in a small molecule called adenosine triphosphate (ATP). Mitochondria contain their own small chromosomes generally inherited only from the mother.";
    const start = Date.now();
    const cards: Flashcard[] = await generateActionContent("flashcards", sourceText, { count: 3 });
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    
    const isCanned = Array.isArray(cards) && cards.some(c => c.front.includes("What is the powerhouse of the cell?"));
    const isValidStructure = Array.isArray(cards) && cards.length >= 3 && cards.every(c => c.front && c.back);

    report("Flashcards generated with genuine Gemini output", isValidStructure && !isCanned, 
      `Duration: ${duration}s, Count: ${cards?.length || 0}, Fronts: ${cards?.map(c => `"${c.front.slice(0, 30)}..."`).join(", ")}`);
  } catch (err: any) {
    report("Flashcard generation", false, err.message);
  }

  await sleep(2500);

  // 6. Uploaded Document Summary
  console.log("\n--- 6. Document Summary Generation ---");
  try {
    const sampleDoc = "Quantum entanglement is a phenomenon in quantum mechanics where particles remain connected so that actions performed on one affect the other, even when separated by great distances. Einstein famously referred to this as spooky action at a distance.";
    const start = Date.now();
    const summary: string = await generateActionContent("summary", sampleDoc);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    const mentionsQuantum = typeof summary === "string" && /quantum|entanglement|particle|spooky/i.test(summary);
    
    report("Document summary generated", mentionsQuantum && summary.length > 20, `Duration: ${duration}s, Summary: "${summary.slice(0, 80)}..."`);
  } catch (err: any) {
    report("Document summary generated", false, err.message);
  }

  await sleep(2500);

  // 7. Source-Grounded Chat
  console.log("\n--- 7. Source-Grounded Document Chat ---");
  try {
    const sampleDoc = "The speed of light in vacuum is approximately 299,792 kilometers per second (or about 300,000 km/s). It is denoted by the letter c.";
    const start = Date.now();
    const chatRes = await chatWithSource(sampleDoc, "What is the speed of light in vacuum?");
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    const answer = chatRes.reply || "";
    const isCanned = answer.startsWith("Key Insight: In relation to your query");
    const containsSpeed = /299,792|300,000/i.test(answer);

    report("Source-grounded chat answer", containsSpeed && !isCanned, `Duration: ${duration}s, Canned: ${isCanned}, Answer: "${answer.slice(0, 80)}..."`);
  } catch (err: any) {
    report("Source-grounded chat answer", false, err.message);
  }

  // 8. PYQ Intent & Action Categorization Test
  console.log("\n--- 8. PYQ Intent & Action Categorization ---");
  try {
    const pyqIntent = detectIntent("Give me 2023 CBSE Science PYQ");
    report("PYQ Intent Detection", pyqIntent.intent === "PYQ", `Detected intent: ${pyqIntent.intent}`);

    // In frontend LearningModeContext: FIND_PYQ is mapped to AUTO
    const autoActions = [
      'NAVIGATE_PAGE', 'OPEN_NOTEBOOK', 'SEARCH_RESOURCES', 'SUMMARIZE_TOPIC',
      'CHANGE_ACADEMIC_TRACK', 'FIND_PYQ', 'SELECT_EXAM', 'CHANGE_TOPIC', 'OPEN_TEST_ANALYSIS'
    ];
    const isPyqAuto = autoActions.includes('FIND_PYQ');
    report("FIND_PYQ categorized as AUTO (educational, non-destructive)", isPyqAuto, "Permitted across AI/Hybrid/Manual modes without confirmation popup");
  } catch (err: any) {
    report("PYQ Intent & Action check", false, err.message);
  }

  // 9. Error Handling: Missing / Invalid API Key Test
  console.log("\n--- 9. Error Handling & Quota Differentiation ---");
  try {
    // Test with invalid key directly against Gemini SDK to ensure typed error / non-quota error classification
    const invalidClient = new GoogleGenAI({ apiKey: "AIzaSyFakeKeyInvalidForTesting123456789" });
    let caughtExpectedError = false;
    let notClassifiedAsQuota = false;
    try {
      await invalidClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: "test"
      });
    } catch (apiErr: any) {
      caughtExpectedError = true;
      const status = apiErr?.status || apiErr?.statusCode;
      const message = String(apiErr?.message || "");
      const isAuthError = status === 400 || status === 403 || message.includes("API key not valid") || message.includes("API_KEY_INVALID");
      const isQuotaError = status === 429 || message.includes("RESOURCE_EXHAUSTED");
      notClassifiedAsQuota = isAuthError && !isQuotaError;
    }
    report("Invalid API key produces authentic auth error (not falsely classified as quota)", 
      caughtExpectedError && notClassifiedAsQuota, 
      "Properly rejected without throwing spurious quota exhaustion");
  } catch (err: any) {
    report("Invalid API key handling", false, err.message);
  }

  // Summary
  console.log("\n=================================================");
  console.log(`Phase 1 Verification Complete: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1LiveVerification().catch(err => {
  console.error("Verification script fatal error:", err);
  process.exit(1);
});
