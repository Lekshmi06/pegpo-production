import { detectIntent, AIIntent } from "../services/ai_assistant_service";

interface IntentTestCase {
  query: string;
  expectedIntent: AIIntent;
  expectedTopic?: string;
  expectedCount?: number;
}

const TEST_CASES: IntentTestCase[] = [
  {
    query: "What's your name?",
    expectedIntent: "CASUAL",
  },
  {
    query: "Hello",
    expectedIntent: "CASUAL",
  },
  {
    query: "Explain double displacement reaction",
    expectedIntent: "CONCEPT_EXPLANATION",
  },
  {
    query: "provide me questions about double displacement reaction",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "double displacement reaction",
    expectedCount: 10, // Default when unspecified
  },
  {
    query: "give me 5 questions on Newton's laws",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "Newton's laws",
    expectedCount: 5,
  },
  {
    query: "quiz me on photosynthesis",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "photosynthesis",
    expectedCount: 10, // Default when unspecified
  },
  {
    query: "Give me 2023 CBSE Science PYQ",
    expectedIntent: "PYQ",
  },
  // User examples
  {
    query: "Give me 10 questions on Thermodynamics",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "Thermodynamics",
    expectedCount: 10,
  },
  {
    query: "Create a test with 15 questions on Thermodynamics",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "Thermodynamics",
    expectedCount: 15,
  },
  {
    query: "Give me 20 questions on Thermodynamics",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "Thermodynamics",
    expectedCount: 20,
  },
  {
    query: "Give me questions on Thermodynamics, maximum 10",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "Thermodynamics",
    expectedCount: 10,
  },
  {
    query: "Give me 30 questions on Thermodynamics",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "Thermodynamics",
    expectedCount: 20, // Programmatically capped at MAX_QUESTION_COUNT (20)
  },
  {
    query: "Give me 100 questions on Thermodynamics",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "Thermodynamics",
    expectedCount: 20, // Programmatically capped at MAX_QUESTION_COUNT (20)
  },
  // Additional natural variations
  {
    query: "give me some questions",
    expectedIntent: "QUESTION_GENERATION",
    expectedCount: 10, // Default when unspecified
  },
  {
    query: "practice questions for chemical reactions",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "chemical reactions",
    expectedCount: 10,
  },
  {
    query: "can you ask me photosynthesis questions",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "photosynthesis",
    expectedCount: 10,
  },
  {
    query: "I want to practice quadratic equations",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "quadratic equations",
    expectedCount: 10,
  },
  {
    query: "What is photosynthesis?",
    expectedIntent: "CONCEPT_EXPLANATION",
  },
  {
    query: "How are you doing today?",
    expectedIntent: "CASUAL",
  },
];

console.log("=================================================");
console.log("    EDUPYE AI INTENT DETECTION VERIFICATION      ");
console.log("=================================================\n");

let passed = 0;
let failed = 0;

for (let i = 0; i < TEST_CASES.length; i++) {
  const tc = TEST_CASES[i];
  const result = detectIntent(tc.query);

  const intentMatch = result.intent === tc.expectedIntent;
  let topicMatch = true;
  if (tc.expectedTopic && result.questionGen) {
    topicMatch =
      result.questionGen.topic.toLowerCase() === tc.expectedTopic.toLowerCase();
  }
  let countMatch = true;
  if (tc.expectedCount && result.questionGen) {
    countMatch = result.questionGen.count === tc.expectedCount;
  }

  const isSuccess = intentMatch && topicMatch && countMatch;

  if (isSuccess) {
    passed++;
    console.log(`[PASS] Case ${i + 1}: "${tc.query}" -> ${result.intent}`);
    if (result.questionGen) {
      console.log(
        `       Topic: "${result.questionGen.topic}", Count: ${result.questionGen.count}, Subject: ${result.questionGen.subject}`
      );
    }
  } else {
    failed++;
    console.error(
      `[FAIL] Case ${i + 1}: "${tc.query}"`
    );
    console.error(
      `       Expected Intent: ${tc.expectedIntent}, Got: ${result.intent}`
    );
    if (tc.expectedTopic && result.questionGen) {
      console.error(
        `       Expected Topic: "${tc.expectedTopic}", Got: "${result.questionGen.topic}"`
      );
    }
    if (tc.expectedCount && result.questionGen) {
      console.error(
        `       Expected Count: ${tc.expectedCount}, Got: ${result.questionGen.count}`
      );
    }
  }
}

console.log("\n=================================================");
console.log("    ADDITIONAL CONFIG & ISOLATION CHECKS         ");
console.log("=================================================\n");

import { resolveQuestionCount, TEST_CONFIG } from "./test_config";

// 1. Check default count
if (resolveQuestionCount() === 10) {
  passed++;
  console.log("[PASS] resolveQuestionCount() defaults to 10");
} else {
  failed++;
  console.error(`[FAIL] resolveQuestionCount() expected 10, got ${resolveQuestionCount()}`);
}

// 2. Check within-limit counts
if (resolveQuestionCount(15) === 15 && resolveQuestionCount(20) === 20 && resolveQuestionCount(5) === 5) {
  passed++;
  console.log("[PASS] resolveQuestionCount(5, 15, 20) preserves valid counts <= 20");
} else {
  failed++;
  console.error("[FAIL] resolveQuestionCount() did not preserve count <= 20");
}

// 3. Check upper limit cap
if (resolveQuestionCount(30) === 20 && resolveQuestionCount(100) === 20) {
  passed++;
  console.log("[PASS] resolveQuestionCount(30, 100) programmatically caps at 20");
} else {
  failed++;
  console.error("[FAIL] resolveQuestionCount() failed to cap at 20");
}

// 4. Check negative or invalid values
if (resolveQuestionCount(-5) === 10 && resolveQuestionCount(0) === 10 && resolveQuestionCount(NaN) === 10) {
  passed++;
  console.log("[PASS] resolveQuestionCount(<=0, NaN) safely falls back to default 10");
} else {
  failed++;
  console.error("[FAIL] resolveQuestionCount(invalid) fallback failed");
}

console.log("\n=================================================");
console.log(`Results: ${passed} Passed, ${failed} Failed`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("ALL INTENT DETECTION & CONFIG TESTS PASSED SUCCESSFULLY! ✨");
  process.exit(0);
}
