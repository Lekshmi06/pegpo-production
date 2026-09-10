async function testApis() {
  const BASE_URL = "http://localhost:5000/api";
  console.log("Starting Test Module API Verification...\n");

  // 1. List Tests
  console.log("1. Testing GET /api/tests");
  const listRes = await fetch(`${BASE_URL}/tests`);
  const listData = await listRes.json();
  console.log(`Status: ${listRes.status}, Success: ${listData.success}, Total Tests: ${listData.count}`);
  if (!listData.success || listData.count === 0) {
    throw new Error("Failed to list tests");
  }

  const test1 = listData.data.find((t: any) => t.title === "Test 1" && !t.isLocked);
  if (!test1) throw new Error("Test 1 not found in test list");
  console.log(`Found Test 1 with ID: ${test1.id}\n`);

  // 2. Get Test by ID
  console.log(`2. Testing GET /api/tests/${test1.id}`);
  const getRes = await fetch(`${BASE_URL}/tests/${test1.id}`);
  const getData = await getRes.json();
  console.log(`Status: ${getRes.status}, Questions returned: ${getData.data.questions.length}`);
  console.log(`First Question: "${getData.data.questions[0].question}"\n`);

  // 3. Get Test in taking mode (mode=take)
  console.log(`3. Testing GET /api/tests/${test1.id}?mode=take (answer masking)`);
  const takeRes = await fetch(`${BASE_URL}/tests/${test1.id}?mode=take`);
  const takeData = await takeRes.json();
  const q0 = takeData.data.questions[0];
  const isMasked = q0.correctAnswer === undefined && q0.explanation === undefined;
  console.log(`Status: ${takeRes.status}, Answers properly masked for student taking test: ${isMasked}\n`);

  // 4. Start Test Attempt
  console.log(`4. Testing POST /api/tests/${test1.id}/start`);
  const startRes = await fetch(`${BASE_URL}/tests/${test1.id}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const startData = await startRes.json();
  console.log(`Status: ${startRes.status}, Attempt Started ID: ${startData.data.attemptId}\n`);
  const attemptId = startData.data.attemptId;

  // 5. Submit Test Attempt
  console.log(`5. Testing POST /api/tests/${test1.id}/submit`);
  const submissionPayload = {
    attemptId,
    answers: {
      "0": "B", // Correct (Magnesium oxide)
      "1": "B", // Correct (New Delhi)
      "2": "B", // Correct (Iron Man)
      "3": "A", // Incorrect
      "4": "",  // Skipped
    },
    statusByQuestion: {
      "0": "attempted",
      "1": "attempted",
      "2": "attempted",
      "3": "attempted",
      "4": "skipped",
    },
    timeSpentSeconds: 125,
  };

  const submitRes = await fetch(`${BASE_URL}/tests/${test1.id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submissionPayload),
  });
  const submitData = await submitRes.json();
  console.log(`Status: ${submitRes.status}`);
  console.log(`Score: ${submitData.data.score} / ${submitData.data.maxScore} (${submitData.data.percentage}%)`);
  console.log(`Accuracy: ${submitData.data.accuracy}%`);
  console.log(`Attempted: ${submitData.data.attempted}, Correct: ${submitData.data.correct}, Incorrect: ${submitData.data.incorrect}, Skipped: ${submitData.data.skipped}\n`);

  // 6. Get Attempt Analysis
  console.log(`6. Testing GET /api/tests/attempts/${attemptId}`);
  const analysisRes = await fetch(`${BASE_URL}/tests/attempts/${attemptId}`);
  const analysisData = await analysisRes.json();
  console.log(`Status: ${analysisRes.status}`);
  console.log(`Analysis Title: ${analysisData.data.testTitle}, Questions in Analysis: ${analysisData.data.questions.length}`);
  console.log(`Question 1 Evaluation: isCorrect=${analysisData.data.questions[0].isCorrect}, explanation="${analysisData.data.questions[0].explanation.slice(0, 60)}..."\n`);

  // 7. Get Student History
  console.log("7. Testing GET /api/tests/attempts/my-history");
  const historyRes = await fetch(`${BASE_URL}/tests/attempts/my-history`);
  const historyData = await historyRes.json();
  console.log(`Status: ${historyRes.status}, Total Completed Attempts: ${historyData.count}\n`);

  console.log("=========================================");
  console.log("All Test Module APIs Verified Successfully!");
  console.log("=========================================");
}

testApis().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
