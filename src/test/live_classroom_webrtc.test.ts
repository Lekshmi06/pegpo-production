import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import assert from "assert";
import http from "http";
import WebSocket from "ws";
import jwt from "jsonwebtoken";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import app from "../server";
import { setupClassroomSignallingServer } from "../websocket/classroom_signalling";
import LiveClassSession from "../models/LiveClassSession";
import User from "../models/User";
import * as liveClassService from "../services/live_class_service";
import { getWebRTCConfiguration } from "../config/webrtc_config";

async function runLiveClassroomWebRtcTestSuite() {
  console.log("==========================================================================");
  console.log("  EDUPYE PHASE 4: NATIVE LIVE CLASSROOM & WEBRTC SIGNALLING TEST SUITE    ");
  console.log("==========================================================================\n");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(mongoUri);
  console.log("✓ Connected to MongoDB.\n");

  // Spin up an ephemeral HTTP & WebSocket server for testing
  const server = http.createServer(app);
  setupClassroomSignallingServer(server);

  const port = await new Promise<number>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      const p = typeof addr === "object" && addr ? addr.port : 5055;
      resolve(p);
    });
  });
  console.log(`✓ Test Signalling Server listening on port ${port}.\n`);

  const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_for_testing";
  const timestamp = Date.now();
  let testsPassed = 0;
  let testsFailed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      testsPassed++;
    } catch (err: any) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(
          err.stack
            .split("\n")
            .slice(1, 4)
            .join("\n")
        );
      }
      testsFailed++;
    }
  }

  // Seed test users
  const teacherUser = await User.create({
    name: `Teacher Live_${timestamp}`,
    email: `teacher_live_${timestamp}@test.com`,
    password: "hashedPassword123",
    userType: "teacher",
    roles: ["teacher"],
    activeRole: "teacher",
  });

  const studentUser = await User.create({
    name: `Student Live_${timestamp}`,
    email: `student_live_${timestamp}@test.com`,
    password: "hashedPassword123",
    userType: "student",
    roles: ["student"],
    activeRole: "student",
  });

  const unauthorizedStudent = await User.create({
    name: `Unenrolled Student_${timestamp}`,
    email: `unenrolled_${timestamp}@test.com`,
    password: "hashedPassword123",
    userType: "student",
    roles: ["student"],
    activeRole: "student",
  });

  const teacherToken = jwt.sign(
    { userId: teacherUser._id.toString(), email: teacherUser.email, role: "teacher", name: teacherUser.name },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const studentToken = jwt.sign(
    { userId: studentUser._id.toString(), email: studentUser.email, role: "student", name: studentUser.name },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const unauthorizedToken = jwt.sign(
    { userId: unauthorizedStudent._id.toString(), email: unauthorizedStudent.email, role: "student", name: unauthorizedStudent.name },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  let createdSessionId = "";
  let teacherWs!: WebSocket;
  let studentWs!: WebSocket;

  try {
    // -------------------------------------------------------------
    // Test 1: STUN/TURN ICE configuration service
    // -------------------------------------------------------------
    await test("WebRTC ICE server configuration exposes valid STUN endpoints", async () => {
      const config = getWebRTCConfiguration();
      assert(Array.isArray(config.iceServers), "iceServers must be an array");
      assert(config.iceServers.length >= 1, "Must contain at least 1 ICE server");
      const urls = config.iceServers[0].urls;
      const urlStr = Array.isArray(urls) ? urls[0] : urls;
      assert(urlStr.includes("stun"), "Primary fallback should be STUN server");
    });

    // -------------------------------------------------------------
    // Test 2: Create Live Classroom Session via Service
    // -------------------------------------------------------------
    await test("Create Live Class Session with host ownership and default settings", async () => {
      const session = await liveClassService.createLiveSession(teacherUser._id.toString(), {
        title: "Advanced Quantum Mechanics Live",
        sessionType: "smartboard_ad_hoc",
        authorizedStudentIds: [studentUser._id.toString()],
        settings: {
          allowMicrophone: true,
          allowCamera: true,
          allowScreenShare: true,
          allowChat: true,
        },
      });

      assert(session._id, "Session ID should be generated");
      assert.strictEqual(session.title, "Advanced Quantum Mechanics Live");
      assert.strictEqual(session.status, "live");
      assert.strictEqual(session.hostId.toString(), teacherUser._id.toString());
      assert(session.authorizedStudentIds.includes(studentUser._id as any));
      createdSessionId = session._id.toString();
    });

    // -------------------------------------------------------------
    // Test 3: Session access control verification
    // -------------------------------------------------------------
    await test("Host and authorized student access verification succeeds; unauthorized fails", async () => {
      const hostAccess = await liveClassService.verifySessionAccess(createdSessionId, teacherUser._id.toString());
      assert.strictEqual(hostAccess.authorized, true);
      assert.strictEqual(hostAccess.isHost, true);

      const studentAccess = await liveClassService.verifySessionAccess(createdSessionId, studentUser._id.toString());
      assert.strictEqual(studentAccess.authorized, true);
      assert.strictEqual(studentAccess.isHost, false);

      const unauthorizedAccess = await liveClassService.verifySessionAccess(
        createdSessionId,
        unauthorizedStudent._id.toString()
      );
      assert.strictEqual(unauthorizedAccess.authorized, false);
    });

    // -------------------------------------------------------------
    // Test 4: REST API - Fetch Live Class Details
    // -------------------------------------------------------------
    await test("REST API GET /api/live-classes/:sessionId returns session and rtcConfig", async () => {
      const res = await fetch(`http://localhost:${port}/api/live-classes/${createdSessionId}`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.session._id, createdSessionId);
      assert(json.rtcConfig && json.rtcConfig.iceServers);
    });

    // -------------------------------------------------------------
    // Test 5: WebSocket upgrade rejection without token (401)
    // -------------------------------------------------------------
    await test("WebSocket handshake rejected with 401 when token is missing", async () => {
      const wsUrl = `ws://localhost:${port}/ws/classroom?sessionId=${createdSessionId}`;
      let rejected = false;

      await new Promise<void>((resolve) => {
        const ws = new WebSocket(wsUrl);
        ws.on("unexpected-response", (req, res) => {
          if (res.statusCode === 401) {
            rejected = true;
          }
          resolve();
        });
        ws.on("error", () => resolve());
        ws.on("open", () => {
          ws.close();
          resolve();
        });
      });

      assert.strictEqual(rejected, true, "Missing token must be rejected with 401");
    });

    // -------------------------------------------------------------
    // Test 6: WebSocket upgrade rejection for unauthorized user (403)
    // -------------------------------------------------------------
    await test("WebSocket handshake rejected with 403 for unauthorized student", async () => {
      const wsUrl = `ws://localhost:${port}/ws/classroom?token=${unauthorizedToken}&sessionId=${createdSessionId}`;
      let rejected = false;

      await new Promise<void>((resolve) => {
        const ws = new WebSocket(wsUrl);
        ws.on("unexpected-response", (req, res) => {
          if (res.statusCode === 403) {
            rejected = true;
          }
          resolve();
        });
        ws.on("error", () => resolve());
        ws.on("open", () => {
          ws.close();
          resolve();
        });
      });

      assert.strictEqual(rejected, true, "Unauthorized user must be rejected with 403");
    });

    // -------------------------------------------------------------
    // Test 7: Teacher and Student WebSocket Connection and Room State
    // -------------------------------------------------------------
    await test("Teacher connects via WebSocket and receives room-state", async () => {
      const wsUrl = `ws://localhost:${port}/ws/classroom?token=${teacherToken}&sessionId=${createdSessionId}`;
      teacherWs = new WebSocket(wsUrl);

      const message: any = await new Promise((resolve, reject) => {
        teacherWs.on("message", (data) => resolve(JSON.parse(data.toString())));
        teacherWs.on("error", reject);
      });

      assert.strictEqual(message.type, "room-state");
      assert.strictEqual(message.self.peerId, teacherUser._id.toString());
      assert.strictEqual(message.self.role, "host");
      assert.strictEqual(message.peers.length, 0);
    });

    await test("Student connects, receives room-state with teacher, and teacher receives peer-joined", async () => {
      const wsUrl = `ws://localhost:${port}/ws/classroom?token=${studentToken}&sessionId=${createdSessionId}`;
      studentWs = new WebSocket(wsUrl);

      const [studentMsg, teacherMsg]: [any, any] = await Promise.all([
        new Promise((resolve, reject) => {
          studentWs.on("message", (data) => resolve(JSON.parse(data.toString())));
          studentWs.on("error", reject);
        }),
        new Promise((resolve, reject) => {
          teacherWs.once("message", (data) => resolve(JSON.parse(data.toString())));
          teacherWs.on("error", reject);
        }),
      ]);

      assert.strictEqual(studentMsg.type, "room-state");
      assert.strictEqual(studentMsg.self.role, "student");
      assert.strictEqual(studentMsg.peers.length, 1);
      assert.strictEqual(studentMsg.peers[0].peerId, teacherUser._id.toString());

      assert.strictEqual(teacherMsg.type, "peer-joined");
      assert.strictEqual(teacherMsg.peer.peerId, studentUser._id.toString());
      assert.strictEqual(teacherMsg.peer.role, "student");
    });

    // -------------------------------------------------------------
    // Test 8: Peer-to-Peer Signalling: Offer, Answer, and ICE Candidate
    // -------------------------------------------------------------
    await test("Relays WebRTC Offer, Answer, and ICE candidate between peers", async () => {
      // 1. Student sends offer to Teacher
      const offerPayload = {
        type: "offer",
        to: teacherUser._id.toString(),
        offer: { type: "offer", sdp: "v=0\r\no=mockOfferSDP" },
      };

      const teacherReceivedOfferPromise = new Promise<any>((resolve) => {
        teacherWs.once("message", (data) => resolve(JSON.parse(data.toString())));
      });
      studentWs.send(JSON.stringify(offerPayload));

      const offerReceived = await teacherReceivedOfferPromise;
      assert.strictEqual(offerReceived.type, "offer");
      assert.strictEqual(offerReceived.from, studentUser._id.toString());
      assert.strictEqual(offerReceived.offer.sdp, "v=0\r\no=mockOfferSDP");

      // 2. Teacher sends answer back to Student
      const answerPayload = {
        type: "answer",
        to: studentUser._id.toString(),
        answer: { type: "answer", sdp: "v=0\r\no=mockAnswerSDP" },
      };

      const studentReceivedAnswerPromise = new Promise<any>((resolve) => {
        studentWs.once("message", (data) => resolve(JSON.parse(data.toString())));
      });
      teacherWs.send(JSON.stringify(answerPayload));

      const answerReceived = await studentReceivedAnswerPromise;
      assert.strictEqual(answerReceived.type, "answer");
      assert.strictEqual(answerReceived.from, teacherUser._id.toString());
      assert.strictEqual(answerReceived.answer.sdp, "v=0\r\no=mockAnswerSDP");

      // 3. Candidate relay
      const candidatePayload = {
        type: "ice-candidate",
        to: teacherUser._id.toString(),
        candidate: { candidate: "candidate:1 1 UDP 2122260223 ...", sdpMid: "0", sdpMLineIndex: 0 },
      };

      const teacherReceivedCandidatePromise = new Promise<any>((resolve) => {
        teacherWs.once("message", (data) => resolve(JSON.parse(data.toString())));
      });
      studentWs.send(JSON.stringify(candidatePayload));

      const candidateReceived = await teacherReceivedCandidatePromise;
      assert.strictEqual(candidateReceived.type, "ice-candidate");
      assert.strictEqual(candidateReceived.from, studentUser._id.toString());
      assert(candidateReceived.candidate.candidate.includes("2122260223"));
    });

    // -------------------------------------------------------------
    // Test 9: Media State Mute Tracking and Broadcasting
    // -------------------------------------------------------------
    await test("Participant mic/video mute updates in database and broadcasts to peers", async () => {
      const mediaChangePayload = {
        type: "media-state",
        isMicMuted: true,
        isVideoMuted: true,
      };

      const teacherReceivedMediaPromise = new Promise<any>((resolve) => {
        teacherWs.once("message", (data) => resolve(JSON.parse(data.toString())));
      });
      studentWs.send(JSON.stringify(mediaChangePayload));

      const mediaMsg = await teacherReceivedMediaPromise;
      assert.strictEqual(mediaMsg.type, "media-state-change");
      assert.strictEqual(mediaMsg.peerId, studentUser._id.toString());
      assert.strictEqual(mediaMsg.isMicMuted, true);
      assert.strictEqual(mediaMsg.isVideoMuted, true);

      // Verify persistence in Mongo
      const dbSession = await LiveClassSession.findById(createdSessionId);
      const studentParticipant = dbSession?.activeParticipants.find(
        (p: any) => p.userId.toString() === studentUser._id.toString()
      );
      assert(studentParticipant, "Participant record must exist in DB");
      assert.strictEqual(studentParticipant?.isMicMuted, true);
      assert.strictEqual(studentParticipant?.isVideoMuted, true);
    });

    // -------------------------------------------------------------
    // Test 10: Classroom Live Chat Broadcasting
    // -------------------------------------------------------------
    await test("Classroom live chat message broadcasts to all participants with sender info", async () => {
      const chatPayload = {
        type: "chat-message",
        text: "Can you explain the wave function collapse equation?",
      };

      const teacherChatPromise = new Promise((resolve) =>
        teacherWs.once("message", (d) => resolve(JSON.parse(d.toString())))
      );
      const studentChatPromise = new Promise((resolve) =>
        studentWs.once("message", (d) => resolve(JSON.parse(d.toString())))
      );
      studentWs.send(JSON.stringify(chatPayload));

      const [teacherChatMsg, studentChatMsg]: [any, any] = await Promise.all([
        teacherChatPromise,
        studentChatPromise,
      ]);

      assert.strictEqual(teacherChatMsg.type, "chat-message");
      assert.strictEqual(teacherChatMsg.text, "Can you explain the wave function collapse equation?");
      assert.strictEqual(teacherChatMsg.senderId, studentUser._id.toString());
      assert.strictEqual(studentChatMsg.type, "chat-message");
      assert.strictEqual(studentChatMsg.text, "Can you explain the wave function collapse equation?");
    });

    // -------------------------------------------------------------
    // Test 11: Real-Time Whiteboard Synchronization
    // -------------------------------------------------------------
    await test("Teacher broadcasts whiteboard drawing strokes to connected students", async () => {
      const whiteboardPayload = {
        type: "whiteboard-sync",
        elements: [
          { type: "stroke", points: [{ x: 10, y: 20 }, { x: 50, y: 80 }], color: "#0091ff" },
          { type: "text", text: "Schrodinger Equation", x: 100, y: 150 },
        ],
      };

      const studentWbPromise = new Promise<any>((resolve) => {
        studentWs.once("message", (d) => resolve(JSON.parse(d.toString())));
      });
      teacherWs.send(JSON.stringify(whiteboardPayload));

      const wbMsg = await studentWbPromise;
      assert.strictEqual(wbMsg.type, "whiteboard-sync");
      assert.strictEqual(wbMsg.senderId, teacherUser._id.toString());
      assert.strictEqual(wbMsg.elements.length, 2);
      assert.strictEqual(wbMsg.elements[1].text, "Schrodinger Equation");
    });

    // -------------------------------------------------------------
    // Test 12: Unauthorized Session Termination Rejection
    // -------------------------------------------------------------
    await test("Student cannot terminate the live classroom session", async () => {
      const studentEndMsgPromise = new Promise<any>((resolve) => {
        studentWs.once("message", (d) => resolve(JSON.parse(d.toString())));
      });
      studentWs.send(JSON.stringify({ type: "end-session" }));

      const errResponse = await studentEndMsgPromise;
      assert.strictEqual(errResponse.type, "error");
      assert(errResponse.message.includes("Unauthorized"));

      const dbSession = await LiveClassSession.findById(createdSessionId);
      assert.strictEqual(dbSession?.status, "live", "Session must remain live");
    });

    // -------------------------------------------------------------
    // Test 13: Host Session Termination and Room Cleanup
    // -------------------------------------------------------------
    await test("Host terminates session: broadcasts session-ended, closes sockets, updates DB", async () => {
      const studentSessionEndedPromise = new Promise<any>((resolve) => {
        studentWs.once("message", (d) => resolve(JSON.parse(d.toString())));
      });

      // Host triggers end-session
      teacherWs.send(JSON.stringify({ type: "end-session" }));

      const endedMsg = await studentSessionEndedPromise;
      assert.strictEqual(endedMsg.type, "session-ended");
      assert(endedMsg.reason.includes("Host ended"));

      // Verify DB status
      const dbSession = await LiveClassSession.findById(createdSessionId);
      assert.strictEqual(dbSession?.status, "ended");
      assert(dbSession?.endedAt, "endedAt timestamp must be recorded");

      // Verify REST API confirms ended status
      const res = await fetch(`http://localhost:${port}/api/live-classes/${createdSessionId}`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      const json: any = await res.json();
      assert.strictEqual(json.session.status, "ended");
    });
  } finally {
    // Cleanup sockets and server
    if (teacherWs! && teacherWs.readyState === WebSocket.OPEN) teacherWs.close();
    if (studentWs! && studentWs.readyState === WebSocket.OPEN) studentWs.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Cleanup test records
    await LiveClassSession.deleteMany({ _id: createdSessionId });
    await User.deleteMany({ _id: { $in: [teacherUser._id, studentUser._id, unauthorizedStudent._id] } });
    await mongoose.disconnect();
    console.log("\n✓ Disconnected from MongoDB.");
  }

  console.log("\n==========================================================================");
  console.log(`  PHASE 4 TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("==========================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runLiveClassroomWebRtcTestSuite().catch((err) => {
  console.error("Fatal test execution error:", err);
  process.exit(1);
});
