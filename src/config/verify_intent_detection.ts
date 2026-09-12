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
    expectedCount: 5,
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
    expectedCount: 5,
  },
  {
    query: "Give me 2023 CBSE Science PYQ",
    expectedIntent: "PYQ",
  },
  // Additional natural variations
  {
    query: "give me some questions",
    expectedIntent: "QUESTION_GENERATION",
    expectedCount: 5,
  },
  {
    query: "practice questions for chemical reactions",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "chemical reactions",
  },
  {
    query: "can you ask me photosynthesis questions",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "photosynthesis",
  },
  {
    query: "I want to practice quadratic equations",
    expectedIntent: "QUESTION_GENERATION",
    expectedTopic: "quadratic equations",
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
console.log(`Results: ${passed} Passed, ${failed} Failed`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("ALL INTENT DETECTION TESTS PASSED SUCCESSFULLY! ✨");
  process.exit(0);
}
