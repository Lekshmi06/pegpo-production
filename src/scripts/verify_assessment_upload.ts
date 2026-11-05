import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import {
  parseUploadedQuestionPaper,
  uploadAndExtractAssessment,
} from "../services/assessment_service";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
  }
}

async function runTests() {
  console.log("===============================================================");
  console.log("ASSESSMENT STUDIO QUESTION PAPER UPLOAD / EXTRACTION TEST SUITE");
  console.log("===============================================================\n");

  // Create temporary test question paper file
  const tempDir = path.resolve(__dirname, "../../uploads/temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const sampleFilePath = path.join(tempDir, `sample_exam_${Date.now()}.txt`);
  const sampleExamContent = `
HALF YEARLY EXAMINATION 2026
SUBJECT: SCIENCE
CLASS: 10
TIME: 45 MIN
TOTAL MARKS: 25

SECTION A (Multiple Choice Questions)
1. Which of the following is an amphoteric oxide?
A. Na2O
B. Al2O3
C. SO2
D. CaO
Answer: B
Marks: 1

2. The powerhouse of the cell is:
A. Ribosome
B. Golgi apparatus
C. Mitochondria
D. Nucleus
Answer: C
Marks: 1

SECTION B (Descriptive)
3. State Ohm's Law and write its mathematical formula.
Marks: 3
`;
  fs.writeFileSync(sampleFilePath, sampleExamContent, "utf-8");

  const mockMulterFile: Express.Multer.File = {
    fieldname: "file",
    originalname: "sample_exam.txt",
    encoding: "7bit",
    mimetype: "text/plain",
    size: Buffer.byteLength(sampleExamContent),
    destination: tempDir,
    filename: path.basename(sampleFilePath),
    path: sampleFilePath,
    buffer: Buffer.from(sampleExamContent),
    stream: null as any,
  };

  // -------------------------------------------------------------
  // Test 1: Export alias verification
  // -------------------------------------------------------------
  console.log("--- Test 1: Export Alias Verification ---");
  assert(
    typeof parseUploadedQuestionPaper === "function",
    "parseUploadedQuestionPaper is an exported function"
  );
  assert(
    typeof uploadAndExtractAssessment === "function",
    "uploadAndExtractAssessment alias is an exported function"
  );
  assert(
    uploadAndExtractAssessment === parseUploadedQuestionPaper,
    "uploadAndExtractAssessment strictly points to parseUploadedQuestionPaper"
  );

  // -------------------------------------------------------------
  // Test 2: Missing variable check without API key (Runtime safety)
  // -------------------------------------------------------------
  console.log("\n--- Test 2: Runtime Safety Without API Key (Mocked Environment) ---");
  const originalKey = process.env.GEMINI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  const originalGenAiKey = process.env.GOOGLE_GENAI_API_KEY;

  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GOOGLE_GENAI_API_KEY;

  let threwWithoutKey = false;
  let errorWithoutKeyMessage = "";
  try {
    await parseUploadedQuestionPaper(mockMulterFile, {
      subject: "Science",
      board: "CBSE",
      classLevel: "Class 10",
    });
  } catch (err: any) {
    threwWithoutKey = true;
    errorWithoutKeyMessage = err?.message || String(err);
  }

  assert(threwWithoutKey, "Function throws when API key is missing");
  assert(
    !errorWithoutKeyMessage.includes("ReferenceError") &&
      !errorWithoutKeyMessage.includes("ai is not defined") &&
      !errorWithoutKeyMessage.includes("DEFAULT_MODEL is not defined"),
    "No ReferenceError thrown for undeclared variables (ai / DEFAULT_MODEL)",
    `Error was: ${errorWithoutKeyMessage}`
  );
  assert(
    errorWithoutKeyMessage.includes("Gemini AI API key is not configured"),
    "Correct error thrown: 'Gemini AI API key is not configured'",
    `Received: ${errorWithoutKeyMessage}`
  );

  // -------------------------------------------------------------
  // Test 3: Mocked Gemini API Extraction Test
  // -------------------------------------------------------------
  console.log("\n--- Test 3: Mocked Gemini API Extraction Test ---");
  // Restore a dummy key so getAiClient() instantiates a client
  process.env.GEMINI_API_KEY = "mock-dummy-key-for-testing";

  let capturedModel = "";
  let capturedPrompt = "";

  // Mock GoogleGenAI models.generateContent
  const mockAiResponse = {
    text: JSON.stringify({
      title: "Science Half Yearly Examination 2026",
      subject: "Science",
      board: "CBSE",
      classLevel: "Class 10",
      durationMinutes: 45,
      totalMarks: 5,
      questions: [
        {
          questionNumber: 1,
          question: "Which of the following is an amphoteric oxide?",
          questionType: "mcq",
          options: [
            { id: "A", text: "Na2O" },
            { id: "B", text: "Al2O3" },
            { id: "C", text: "SO2" },
            { id: "D", text: "CaO" },
          ],
          correctAnswer: "B",
          marks: 1,
          section: "Section A",
          explanation: "Al2O3 reacts with both acids and bases.",
        },
        {
          questionNumber: 2,
          question: "The powerhouse of the cell is:",
          questionType: "mcq",
          options: [
            { id: "A", text: "Ribosome" },
            { id: "B", text: "Golgi apparatus" },
            { id: "C", text: "Mitochondria" },
            { id: "D", text: "Nucleus" },
          ],
          correctAnswer: "C",
          marks: 1,
          section: "Section A",
          explanation: "Mitochondria produces ATP.",
        },
        {
          questionNumber: 3,
          question: "State Ohm's Law and write its mathematical formula.",
          questionType: "descriptive",
          options: [],
          correctAnswer: "",
          marks: 3,
          section: "Section B",
          explanation: "V = IR",
        },
      ],
    }),
  };

  const dummyClient = new GoogleGenAI({ apiKey: "mock-dummy-key" });
  const modelsPrototype = Object.getPrototypeOf(dummyClient.models);
  const originalGenerateContentInternal = modelsPrototype.generateContentInternal;

  modelsPrototype.generateContentInternal = async function (params: any) {
    capturedModel = params.model;
    capturedPrompt = typeof params.contents === "string" ? params.contents : JSON.stringify(params.contents);
    return mockAiResponse as any;
  };

  try {
    const result = await parseUploadedQuestionPaper(mockMulterFile, {
      subject: "Science",
      board: "CBSE",
      classLevel: "Class 10",
    });

    assert(
      capturedModel === "gemini-3.5-flash",
      "DEFAULT_MODEL correctly resolved to 'gemini-3.5-flash' (CANDIDATE_MODELS[0])",
      `Captured model was: ${capturedModel}`
    );
    assert(
      capturedPrompt.includes("You are an expert curriculum examination parser"),
      "Extraction prompt correctly structured and passed to model"
    );
    assert(
      result.title === "Science Half Yearly Examination 2026",
      "Extracted exam title preserved in result",
      `Got title: ${result.title}`
    );
    assert(
      result.questions.length === 3,
      "Extracted 3 question items from mocked document",
      `Count: ${result.questions.length}`
    );
    assert(
      result.questions[0].questionType === "mcq" && result.questions[0].options.length === 4,
      "Question 1 parsed as MCQ with 4 options"
    );
    assert(
      result.questions[0].correctAnswer === "B",
      "Question 1 correctAnswer parsed as 'B'"
    );
    assert(
      result.questions[2].questionType === "descriptive" && result.questions[2].marks === 3,
      "Question 3 parsed as descriptive with 3 marks"
    );
    assert(
      result.originalDocument.fileName === "sample_exam.txt",
      "Original document reference preserved fileName"
    );
    assert(
      result.originalDocument.mimeType === "text/plain",
      "Original document reference preserved mimeType"
    );
  } finally {
    // Restore prototype
    modelsPrototype.generateContentInternal = originalGenerateContentInternal;
  }

  // -------------------------------------------------------------
  // Test 4: Live Real Gemini API Test (if real API key available)
  // -------------------------------------------------------------
  console.log("\n--- Test 4: Live Real Gemini API Test ---");
  if (originalKey && originalKey.trim().length > 10) {
    process.env.GEMINI_API_KEY = originalKey;
    try {
      console.log("  Attempting live call to Gemini API using configured GEMINI_API_KEY...");
      const realResult = await parseUploadedQuestionPaper(mockMulterFile, {
        subject: "Science",
        board: "CBSE",
        classLevel: "Class 10",
      });
      console.log(`  [LIVE API RESULT] Real Gemini responded! Title: "${realResult.title}", Questions: ${realResult.questions.length}`);
      assert(
        realResult.questions.length > 0,
        "Real Gemini API returned parsed questions from uploaded text file",
        `Questions extracted: ${realResult.questions.length}`
      );
    } catch (realErr: any) {
      console.warn(`  [LIVE API NOTICE] Live call returned: ${realErr?.message || realErr}`);
      console.log("  (Note: Real network API calls may be rate-limited, model-version restricted, or require specific permissions)");
    }
  } else {
    console.log("  Skipping live API test: no valid real GEMINI_API_KEY in environment.");
  }

  // Cleanup temporary file
  try {
    fs.unlinkSync(sampleFilePath);
  } catch {}

  console.log("\n===============================================================");
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("===============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner encountered uncaught error:", err);
  process.exit(1);
});
