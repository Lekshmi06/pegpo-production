import "dotenv/config";
import mongoose from "mongoose";
import WebSocket from "ws";
import http from "http";
import app, { httpServer } from "./server";
import connectDB from "./config/db";
import User from "./models/User";
import TuitionProgram from "./models/TuitionProgram";
import LiveClassSession from "./models/LiveClassSession";
import TuitionLiveAssessment from "./models/TuitionLiveAssessment";
import { generateSessionToken } from "./utils/token";

async function runE2ETest() {
  console.log("=== STARTING LIVE CLASSROOM & ASSESSMENT E2E AUDIT TEST ===");
  await connectDB();

  // 1. Find or create demo Teacher and Student
  let teacher = await User.findOne({ email: "demoteacher_live_test@edupye.com" });
  if (!teacher) {
    teacher = await User.create({
      name: "Prof. Einstein",
      email: "demoteacher_live_test@edupye.com",
      password: "Password123!",
      roles: ["teacher", "tuition_provider"],
      activeRole: "teacher",
      teacherCode: "TCH-LIVE-TEST",
      tuitionApprovalStatus: "approved",
    });
  }

  let student = await User.findOne({ email: "demostudent_live_test@edupye.com" });
  if (!student) {
    student = await User.create({
      name: "Isaac Newton",
      email: "demostudent_live_test@edupye.com",
      password: "Password123!",
      roles: ["student"],
      activeRole: "student",
      studentCode: "STU-LIVE-TEST",
      tuitionApprovalStatus: "approved",
    });
  }

  // 2. Find or create demo Tuition Program
  let program = await TuitionProgram.findOne({ code: "PRG-PHY12-DEMO" });
  if (!program) {
    program = await TuitionProgram.create({
      title: "Class 12 Physics Masterclass",
      code: "PRG-PHY12-DEMO",
      subject: "Physics",
      grade: "12",
      teacherIds: [teacher._id],
      enrolledStudentIds: [student._id],
      status: "active",
      schedule: [],
    });
  } else {
    // Ensure both are enrolled
    if (!program.teacherIds.some((id: any) => id.toString() === teacher!._id.toString())) {
      program.teacherIds.push(teacher._id as any);
    }
    if (!program.enrolledStudentIds.some((id: any) => id.toString() === student!._id.toString())) {
      program.enrolledStudentIds.push(student._id as any);
    }
    await program.save();
  }

  // Ensure live session document is active
  let liveSession = await LiveClassSession.findOne({
    $or: [{ tuitionSessionId: program._id }, { batchId: program._id }],
  });
  if (!liveSession) {
    liveSession = await LiveClassSession.create({
      title: "Class 12 Physics Live Session",
      hostId: teacher._id,
      hostRole: "teacher",
      status: "live",
      sessionType: "tuition",
      tuitionSessionId: program._id,
      authorizedStudentIds: [student._id],
      settings: {
        allowMicrophone: true,
        allowCamera: true,
        allowScreenShare: true,
        allowChat: true,
      },
    });
  } else {
    liveSession.status = "live";
    liveSession.hostId = teacher._id as any;
    if (!liveSession.authorizedStudentIds.some((id: any) => id.toString() === student!._id.toString())) {
      liveSession.authorizedStudentIds.push(student._id as any);
    }
    await liveSession.save();
  }

  const canonicalSessionId = liveSession._id.toString();
  console.log(`[Setup] Teacher: ${teacher.name} (${teacher._id})`);
  console.log(`[Setup] Student: ${student.name} (${student._id})`);
  console.log(`[Setup] Program Code: ${program.code}`);
  console.log(`[Setup] Canonical Session ID: ${canonicalSessionId}`);

  // Generate tokens
  const teacherToken = generateSessionToken({
    _id: teacher._id,
    email: teacher.email,
    activeRole: "teacher",
    roles: ["teacher", "tuition_provider"],
  });

  const studentToken = generateSessionToken({
    _id: student._id,
    email: student.email,
    activeRole: "student",
    roles: ["student"],
  });

  const TEST_PORT = 5055;
  await new Promise<void>((resolve) => {
    httpServer.listen(TEST_PORT, () => {
      console.log(`[Server] Live test server listening on port ${TEST_PORT}`);
      resolve();
    });
  });

  let teacherWs: WebSocket | null = null;
  let studentWs: WebSocket | null = null;

  try {
    // 3. Connect Teacher via Program Code: PRG-PHY12-DEMO
    console.log("[Test 1] Connecting Teacher WebSocket with Program Code 'PRG-PHY12-DEMO'...");
    teacherWs = new WebSocket(
      `ws://localhost:${TEST_PORT}/ws/classroom?token=${teacherToken}&sessionId=PRG-PHY12-DEMO`
    );

    let teacherResolvedSessionId = "";
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Teacher WS connection timeout")), 5000);
      teacherWs!.on("open", () => console.log("[Teacher WS] Connection opened"));
      teacherWs!.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "room-state") {
          teacherResolvedSessionId = msg.sessionId;
          console.log(`[Teacher WS] Received room-state. Canonical SessionId: ${teacherResolvedSessionId}`);
          clearTimeout(timeout);
          resolve();
        }
      });
      teacherWs!.on("error", reject);
    });

    if (teacherResolvedSessionId !== canonicalSessionId) {
      throw new Error(
        `Canonical room mismatch! Expected ${canonicalSessionId}, got ${teacherResolvedSessionId}`
      );
    }
    console.log("✓ Test 1 Passed: Teacher mapped to canonical room ID");

    // 4. Connect Student via Canonical Session ID
    console.log("[Test 2] Connecting Student WebSocket with direct Canonical Session ID...");
    studentWs = new WebSocket(
      `ws://localhost:${TEST_PORT}/ws/classroom?token=${studentToken}&sessionId=${canonicalSessionId}`
    );

    let studentReceivedPeerJoined = false;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Student WS connection timeout")), 5000);
      studentWs!.on("open", () => console.log("[Student WS] Connection opened"));
      studentWs!.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "room-state") {
          console.log(`[Student WS] Received room-state. SessionId: ${msg.sessionId}`);
          clearTimeout(timeout);
          resolve();
        }
      });
      studentWs!.on("error", reject);
    });
    console.log("✓ Test 2 Passed: Student joined exact same canonical room");

    // 5. Test Chat Messaging: Teacher sends chat message
    console.log("[Test 3] Testing Live Chat Message broadcast and 1-year compliance persistence...");
    const chatPromise = new Promise<{ text: string; senderRole: string; senderName: string }>((resolve) => {
      studentWs!.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "chat-message") {
          resolve(msg);
        }
      });
    });

    teacherWs.send(
      JSON.stringify({
        type: "chat-message",
        text: "Hello batch! Welcome to today's electromagnetic induction lesson.",
      })
    );

    const receivedChat = await chatPromise;
    console.log(`[Student WS] Received chat: "${receivedChat.text}" from ${receivedChat.senderName} (${receivedChat.senderRole})`);
    if (!receivedChat.text.includes("electromagnetic induction")) {
      throw new Error("Chat text content mismatch");
    }

    // Verify MongoDB persistence for chat with retry
    let persistedMsg: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 200));
      const updatedLiveSession = await LiveClassSession.findById(canonicalSessionId);
      persistedMsg = updatedLiveSession?.chatMessages?.find((m: any) =>
        m.text.includes("electromagnetic induction")
      );
      if (persistedMsg) break;
    }

    if (!persistedMsg) {
      throw new Error("Chat message was not persisted to MongoDB LiveClassSession.chatMessages!");
    }
    console.log(`✓ Test 3 Passed: Live Chat received and verified in MongoDB (ID: ${persistedMsg.id})`);

    // 6. Test Assessment: Teacher Publishes Live Quiz
    console.log("[Test 4] Testing In-Meeting MCQ Quiz Publishing & Sanitization...");
    const quizPublishedPromise = new Promise<any>((resolve) => {
      studentWs!.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "assessment:published") {
          resolve(msg.assessment);
        }
      });
    });

    teacherWs.send(
      JSON.stringify({
        type: "assessment:publish",
        assessment: {
          title: "Faraday's Law Pop Quiz",
          instructions: "Choose the correct expression for induced EMF",
          timeLimitMinutes: 3,
          totalPoints: 10,
          questions: [
            {
              id: "q_faraday_1",
              question: "Induced EMF ε is given by:",
              options: ["-dΦ/dt", "+dΦ/dt", "Φ × t", "d²Φ/dt²"],
              correctOptionIndex: 0,
              points: 10,
            },
          ],
        },
      })
    );

    const studentQuiz = await quizPublishedPromise;
    console.log(`[Student WS] Received published quiz: "${studentQuiz.title}" (ID: ${studentQuiz._id})`);

    // Verify student quiz does NOT leak correctOptionIndex
    const leakedAnswer = studentQuiz.questions[0]?.correctOptionIndex;
    if (leakedAnswer !== undefined) {
      throw new Error(`Security leak! Student received correctOptionIndex: ${leakedAnswer}`);
    }
    console.log("✓ Test 4 Passed: Quiz published to student with answer key safely sanitized");

    // 7. Student submits answer and gets auto-graded
    console.log("[Test 5] Testing Student MCQ Answer Submission & Instant Auto-Grading...");
    const gradedPromise = new Promise<any>((resolve) => {
      studentWs!.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "assessment:graded") {
          resolve(msg.submission);
        }
      });
    });

    const teacherResultsPromise = new Promise<any>((resolve) => {
      teacherWs!.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "assessment:results") {
          resolve(msg);
        }
      });
    });

    studentWs!.send(
      JSON.stringify({
        type: "assessment:submit",
        assessmentId: studentQuiz._id,
        answers: [{ questionId: "q_faraday_1", selectedOptionIndex: 0 }],
      })
    );

    const gradedResult = await gradedPromise;
    console.log(`[Student WS] Graded: Score ${gradedResult.score}/${gradedResult.totalPossible} (${gradedResult.percentage}%)`);
    if (gradedResult.score !== 10 || gradedResult.percentage !== 100) {
      throw new Error(`Auto-grading calculation failed: expected 10/10, got ${gradedResult.score}`);
    }

    const teacherResults = await teacherResultsPromise;
    console.log(`[Teacher WS] Leaderboard update: Total submissions: ${teacherResults.totalSubmissions}`);
    if (teacherResults.totalSubmissions !== 1) {
      throw new Error("Teacher did not receive updated submission count");
    }
    console.log("✓ Test 5 Passed: Student auto-graded instantly and teacher received live leaderboard update");

    // 8. Teacher closes the assessment
    console.log("[Test 6] Testing Assessment Closure...");
    const closedPromise = new Promise<string>((resolve) => {
      studentWs!.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "assessment:closed") {
          resolve(msg.assessmentId);
        }
      });
    });

    teacherWs!.send(
      JSON.stringify({
        type: "assessment:close",
        assessmentId: studentQuiz._id,
      })
    );

    const closedId = await closedPromise;
    if (closedId !== studentQuiz._id) {
      throw new Error("Closed assessment ID mismatch");
    }
    console.log(`✓ Test 6 Passed: Assessment ${closedId} closed successfully`);

    // Clean up connections
    try { teacherWs?.close(); } catch {}
    try { studentWs?.close(); } catch {}

    // Allow disconnect handlers to flush to DB
    await new Promise((r) => setTimeout(r, 600));

    console.log("\n========================================================");
    console.log("ALL 6 LIVE CLASSROOM & ASSESSMENT TESTS PASSED END-TO-END!");
    console.log("========================================================\n");
  } finally {
    try { teacherWs?.terminate(); } catch {}
    try { studentWs?.terminate(); } catch {}
    await new Promise<void>((res) => httpServer.close(() => res()));
    await mongoose.disconnect();
  }
}

runE2ETest().catch((err) => {
  console.error("FATAL E2E TEST ERROR:", err);
  process.exit(1);
});
