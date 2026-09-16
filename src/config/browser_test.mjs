import { spawn } from "child_process";

async function runTest() {
  console.log("Launching headless Chrome...");
  const tempDir = "C:\\Users\\leksh\\AppData\\Local\\Temp\\chrome_quiz_test_" + Date.now();
  const chromeProcess = spawn(
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    [
      "--headless=new",
      "--remote-debugging-port=9222",
      `--user-data-dir=${tempDir}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const listRes = await fetch("http://127.0.0.1:9222/json");
    const targets = await listRes.json();
    console.log("Chrome targets found:", targets.length);

    const pageTarget = targets.find((t) => t.type === "page") || targets[0];
    const wsUrl = pageTarget.webSocketDebuggerUrl;
    console.log("Connecting to WebSocket:", wsUrl);

    const ws = new WebSocket(wsUrl);
    let idCounter = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data.toString());
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data.result);
        pending.delete(data.id);
      }
    };

    await new Promise((resolve) => ws.onopen = resolve);
    console.log("Connected to Chrome DevTools Protocol.");

    const send = (method, params = {}) => {
      return new Promise((resolve) => {
        const id = idCounter++;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    await send("Page.enable");
    await send("Runtime.enable");

    // 1. Navigate to login
    console.log("Navigating to http://localhost:5173/login...");
    await send("Page.navigate", { url: "http://localhost:5173/login" });
    await new Promise((r) => setTimeout(r, 2500));

    // 2. Perform login via script in page
    console.log("Logging in as jaya@mail.com...");
    const loginResult = await send("Runtime.evaluate", {
      expression: `(async () => {
        const emailInput = document.querySelector('input[type="email"]') || document.querySelector('input[placeholder*="email" i]') || document.querySelectorAll('input')[0];
        const passInput = document.querySelector('input[type="password"]') || document.querySelectorAll('input')[1];
        if (emailInput && passInput) {
          emailInput.value = 'jaya@mail.com';
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          emailInput.dispatchEvent(new Event('change', { bubbles: true }));
          passInput.value = 'jaya@123';
          passInput.dispatchEvent(new Event('input', { bubbles: true }));
          passInput.dispatchEvent(new Event('change', { bubbles: true }));
          const btn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('sign in') || b.textContent.toLowerCase().includes('login'));
          if (btn) btn.click();
          return 'LOGIN_SUBMITTED';
        }
        return 'INPUTS_NOT_FOUND';
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log("Login script result:", loginResult?.result?.value);

    // Wait for redirect after login
    await new Promise((r) => setTimeout(r, 3000));

    // 3. Navigate to /student/quiz
    console.log("Navigating to http://localhost:5173/student/quiz...");
    await send("Page.navigate", { url: "http://localhost:5173/student/quiz" });
    await new Promise((r) => setTimeout(r, 3000));

    // 4. Check Quiz Cards
    console.log("Inspecting QuizHub page cards...");
    const cardsResult = await send("Runtime.evaluate", {
      expression: `(() => {
        const pageText = document.body.innerText;
        const headings = Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim());
        const cards = Array.from(document.querySelectorAll('.group, [class*="rounded-3xl"]'))
          .map(c => c.textContent.trim())
          .filter(t => t.includes('Drill'));
        return { headings, cardsCount: cards.length, sampleCard: cards[0] || '', pageTextPreview: pageText.slice(0, 300) };
      })()`,
      returnByValue: true,
    });
    console.log("Cards on QuizHub:\n", JSON.stringify(cardsResult?.result?.value, null, 2));

    // 5. Click "Start Quiz" on "Respiration in Organisms Drill"
    console.log("\nClicking 'Start Quiz' on Respiration in Organisms Drill...");
    const startQuizResult = await send("Runtime.evaluate", {
      expression: `(() => {
        const allCards = Array.from(document.querySelectorAll('div')).filter(d => 
          d.textContent && d.textContent.includes('Respiration in Organisms Drill') && d.textContent.includes('Start Quiz')
        );
        if (allCards.length > 0) {
          // Click the outer card container
          allCards[0].click();
          return 'CLICKED_CARD_CONTAINER';
        }
        const spans = Array.from(document.querySelectorAll('span, button')).filter(s => s.textContent && s.textContent.includes('Start Quiz'));
        if (spans.length >= 2) {
          spans[1].click();
          return 'CLICKED_SPAN_1';
        }
        return 'ELEMENT_NOT_FOUND';
      })()`,
      returnByValue: true,
    });
    console.log("Start Quiz Click Result:", startQuizResult?.result?.value);

    await new Promise((r) => setTimeout(r, 2000));

    // 6. Inspect Active Quiz Runner
    console.log("\nInspecting Active Quiz Runner questions...");
    const activeQuizState = await send("Runtime.evaluate", {
      expression: `(() => {
        const h3 = document.querySelector('h3');
        const questionText = h3 ? h3.textContent.trim() : 'NO_H3_FOUND';
        const options = Array.from(document.querySelectorAll('[class*="cursor-pointer"]'))
          .filter(el => el.textContent && (el.textContent.startsWith('A') || el.textContent.startsWith('B') || el.textContent.startsWith('C') || el.textContent.startsWith('D')))
          .map(el => el.textContent.trim());
        const bodyText = document.body.innerText;
        return {
          questionText,
          optionsCount: options.length,
          optionsPreview: options.slice(0, 4),
          isInQuizRunner: bodyText.includes('Question 1 of') || bodyText.includes('Exit Quiz'),
          progressIndicator: bodyText.includes('Question 1 of') ? 'Question 1 of 5' : 'None',
        };
      })()`,
      returnByValue: true,
    });
    console.log("Active Quiz Runner State:\n", JSON.stringify(activeQuizState?.result?.value, null, 2));

    // Click Option A or B
    console.log("\nInteracting: Clicking an answer option...");
    await send("Runtime.evaluate", {
      expression: `(() => {
        const opt = Array.from(document.querySelectorAll('div')).find(d => 
          d.textContent && (d.textContent.startsWith('A') || d.textContent.startsWith('B')) && d.classList.contains('cursor-pointer')
        );
        if (opt) opt.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Check explanation
    const explanationState = await send("Runtime.evaluate", {
      expression: `(() => {
        const expEl = Array.from(document.querySelectorAll('div')).find(d => d.textContent && d.textContent.includes('Instant Explanation:'));
        return expEl ? expEl.textContent.trim() : 'NO_EXPLANATION_FOUND';
      })()`,
      returnByValue: true,
    });
    console.log("Explanation displayed:\n", explanationState?.result?.value);

    // Click Next Question
    console.log("\nClicking Next Question...");
    await send("Runtime.evaluate", {
      expression: `(() => {
        const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Next Question'));
        if (nextBtn) nextBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Inspect Question 2
    const q2State = await send("Runtime.evaluate", {
      expression: `(() => {
        const h3 = document.querySelector('h3');
        return {
          q2Text: h3 ? h3.textContent.trim() : '',
          progress: document.body.innerText.includes('Question 2 of') ? 'Question 2 of 5' : 'Unknown',
        };
      })()`,
      returnByValue: true,
    });
    console.log("Question 2 State:\n", JSON.stringify(q2State?.result?.value, null, 2));

    ws.close();
  } finally {
    chromeProcess.kill();
    console.log("\nClosed headless Chrome.");
  }
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
