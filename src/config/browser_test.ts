import { spawn } from "child_process";

async function runTest() {
  console.log("Launching headless Chrome...");
  const chromeProcess = spawn(
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    [
      "--headless=new",
      "--remote-debugging-port=9222",
      "--user-data-dir=C:\\Users\\leksh\\AppData\\Local\\Temp\\chrome_quiz_test_" + Date.now(),
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  // Wait 2s for chrome to initialize
  await new Promise((r) => setTimeout(r, 2000));

  try {
    const listRes = await fetch("http://127.0.0.1:9222/json");
    const targets = await listRes.json();
    console.log("Chrome targets found:", targets.length);

    const pageTarget = targets.find((t: any) => t.type === "page") || targets[0];
    const wsUrl = pageTarget.webSocketDebuggerUrl;
    console.log("Connecting to WebSocket:", wsUrl);

    const ws = new WebSocket(wsUrl);
    let idCounter = 1;
    const pending = new Map<number, (res: any) => void>();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data.toString());
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)!(data.result);
        pending.delete(data.id);
      }
    };

    await new Promise((resolve) => ws.onopen = resolve);
    console.log("Connected to Chrome DevTools Protocol.");

    const send = (method: string, params: any = {}): Promise<any> => {
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
    await new Promise((r) => setTimeout(r, 2000));

    // 2. Perform login via script in page
    console.log("Logging in as jaya@mail.com...");
    const loginResult = await send("Runtime.evaluate", {
      expression: `(async () => {
        const emailInput = document.querySelector('input[type="email"]') || document.querySelector('input[placeholder*="email" i]') || document.querySelectorAll('input')[0];
        const passInput = document.querySelector('input[type="password"]') || document.querySelectorAll('input')[1];
        if (emailInput && passInput) {
          emailInput.value = 'jaya@mail.com';
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          passInput.value = 'jaya@123';
          passInput.dispatchEvent(new Event('input', { bubbles: true }));
          const btn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('sign in') || b.textContent.toLowerCase().includes('login'));
          if (btn) btn.click();
          return 'LOGIN_CLICKED';
        }
        return 'INPUTS_NOT_FOUND';
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log("Login script result:", loginResult?.result?.value);

    await new Promise((r) => setTimeout(r, 2500));

    // 3. Navigate to /student/quiz
    console.log("Navigating to http://localhost:5173/student/quiz...");
    await send("Page.navigate", { url: "http://localhost:5173/student/quiz" });
    await new Promise((r) => setTimeout(r, 3000));

    // 4. Check Quiz Cards
    console.log("Inspecting QuizHub page cards...");
    const cardsResult = await send("Runtime.evaluate", {
      expression: `(() => {
        const headings = Array.from(document.querySelectorAll('h3, h2')).map(h => h.textContent.trim());
        const cards = Array.from(document.querySelectorAll('.group, [class*="rounded-3xl"]')).map(c => c.textContent.trim()).filter(t => t.includes('Drill'));
        return { headings, cardsCount: cards.length, sampleCard: cards[0] || '' };
      })()`,
      returnByValue: true,
    });
    console.log("Cards on QuizHub:", JSON.stringify(cardsResult?.result?.value, null, 2));

    // 5. Click "Start Quiz" on "Respiration in Organisms Drill"
    console.log("Clicking 'Start Quiz' on Respiration in Organisms Drill...");
    const startQuizResult = await send("Runtime.evaluate", {
      expression: `(() => {
        const allCards = Array.from(document.querySelectorAll('div')).filter(d => 
          d.textContent && d.textContent.includes('Respiration in Organisms Drill') && d.textContent.includes('Start Quiz')
        );
        // Click the innermost element or the card
        if (allCards.length > 0) {
          const card = allCards[allCards.length - 1];
          card.click();
          return 'CLICKED_RESPIRATION_DRILL';
        }
        // Fallback: try button or span with Start Quiz
        const startBtns = Array.from(document.querySelectorAll('span, button')).filter(b => b.textContent && b.textContent.includes('Start Quiz'));
        if (startBtns.length > 1) {
          startBtns[1].click(); // Second card is Respiration
          return 'CLICKED_START_BTN_1';
        }
        return 'CARD_NOT_FOUND';
      })()`,
      returnByValue: true,
    });
    console.log("Start Quiz Click Result:", startQuizResult?.result?.value);

    await new Promise((r) => setTimeout(r, 2000));

    // 6. Inspect Active Quiz Runner
    console.log("Inspecting Active Quiz Runner questions...");
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
        };
      })()`,
      returnByValue: true,
    });
    console.log("Active Quiz Runner State:\n", JSON.stringify(activeQuizState?.result?.value, null, 2));

    // Click option A
    console.log("Interacting: Clicking option A...");
    await send("Runtime.evaluate", {
      expression: `(() => {
        const optA = Array.from(document.querySelectorAll('div')).find(d => d.textContent && d.textContent.startsWith('A') && d.classList.contains('cursor-pointer'));
        if (optA) optA.click();
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
    console.log("Clicking Next Question...");
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
    console.log("Closed headless Chrome.");
  }
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
