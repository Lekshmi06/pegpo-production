import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import url from "url";
import { verifySessionToken } from "../utils/token";
import {
  verifySessionAccess,
  registerParticipantJoin,
  registerParticipantLeave,
  updateParticipantMedia,
  endLiveSession,
  checkSessionIdleAutoLogout,
} from "../services/live_class_service";
import LiveClassSession from "../models/LiveClassSession";
import TuitionLiveAssessment from "../models/TuitionLiveAssessment";

interface AuthenticatedPeer {
  userId: string;
  name: string;
  role: "host" | "student";
  sessionId: string;
  socket: WebSocket;
  isMicMuted: boolean;
  isVideoMuted: boolean;
}

// In-memory room manager: sessionId -> Map<userId, AuthenticatedPeer>
const rooms = new Map<string, Map<string, AuthenticatedPeer>>();

// In-memory real-time SmartBoard whiteboard state: sessionId -> CanvasElement[]
const roomWhiteboards = new Map<string, any[]>();

export function setupClassroomSignallingServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // 25-second WebSocket ping/pong heartbeat interval for Render reverse proxy & NAT keepalive
  const HEARTBEAT_INTERVAL_MS = 25000;
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((wsClient: any) => {
      if (wsClient.readyState !== WebSocket.OPEN) return;
      if (wsClient.isAlive === false) {
        wsClient.terminate();
        return;
      }
      wsClient.isAlive = false;
      try {
        wsClient.ping();
        wsClient.send(JSON.stringify({ type: "heartbeat", timestamp: Date.now() }));
      } catch (err) {
        wsClient.terminate();
      }
    });
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  server.on("upgrade", async (request, socket, head) => {
    try {
      const parsedUrl = url.parse(request.url || "", true);
      const pathname = parsedUrl.pathname;

      if (pathname !== "/ws/classroom") {
        return; // Allow other upgrade listeners if any
      }

      const token = parsedUrl.query.token as string;
      const sessionId = parsedUrl.query.sessionId as string;

      if (!token || !sessionId) {
        socket.write("HTTP/1.1 401 Unauthorized: Missing Token or Session ID\r\n\r\n");
        socket.destroy();
        return;
      }

      const sessionPayload = verifySessionToken(token);
      if (!sessionPayload || !sessionPayload.userId) {
        socket.write("HTTP/1.1 401 Unauthorized: Invalid or Expired Token\r\n\r\n");
        socket.destroy();
        return;
      }

      const userId = sessionPayload.userId;

      // Verify room authorization
      const access = await verifySessionAccess(sessionId, userId);
      if (!access.authorized || !access.session) {
        socket.write("HTTP/1.1 403 Forbidden: Access Denied to Classroom\r\n\r\n");
        socket.destroy();
        return;
      }

      // Canonicalize room ID so program code and direct session ID resolve to the exact same room
      const canonicalSessionId = access.session._id.toString();

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request, {
          userId,
          name: (sessionPayload as any).name || (access.isHost ? "Teacher" : "Student"),
          role: access.isHost ? "host" : "student",
          sessionId: canonicalSessionId,
        });
      });
    } catch (err: any) {
      console.error("[WebSocket Upgrade Error]", err);
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
    }
  });

  wss.on("connection", async (ws: WebSocket, request: any, clientData: {
    userId: string;
    name: string;
    role: "host" | "student";
    sessionId: string;
  }) => {
    const { userId, name, role, sessionId } = clientData;

    (ws as any).isAlive = true;
    ws.on("pong", () => {
      (ws as any).isAlive = true;
    });

    if (!rooms.has(sessionId)) {
      rooms.set(sessionId, new Map());
    }
    const room = rooms.get(sessionId)!;

    // Disconnect any stale or previous socket for the same user
    const existingPeer = room.get(userId);
    if (existingPeer && existingPeer.socket !== ws && existingPeer.socket.readyState === WebSocket.OPEN) {
      existingPeer.socket.close(1000, "Replaced by new connection");
    }

    const peer: AuthenticatedPeer = {
      userId,
      name,
      role,
      sessionId,
      socket: ws,
      isMicMuted: false,
      isVideoMuted: false,
    };

    room.set(userId, peer);
    await registerParticipantJoin(sessionId, userId, name, role);

    // 1. Send room-state to the newly joined peer with existing peers info
    const existingPeers = Array.from(room.values())
      .filter((p) => p.userId !== userId)
      .map((p) => ({
        peerId: p.userId,
        name: p.name,
        role: p.role,
        isMicMuted: p.isMicMuted,
        isVideoMuted: p.isVideoMuted,
      }));

    const currentBoard = roomWhiteboards.get(sessionId) || [];

    // Fetch persistent chat history (last 50 messages) and active assessments for late joiners
    let recentChatMessages: any[] = [];
    let activeAssessments: any[] = [];
    try {
      const sessionDoc = await LiveClassSession.findById(sessionId).select("chatMessages").lean();
      if (sessionDoc?.chatMessages) {
        recentChatMessages = sessionDoc.chatMessages.slice(-50);
      }
      const rawAssessments = await TuitionLiveAssessment.find({
        sessionId,
        status: "active",
      }).sort({ createdAt: -1 }).lean();

      activeAssessments = rawAssessments.map((a: any) => {
        if (role !== "host") {
          const mySub = a.submissions?.find((s: any) => s.studentId === userId);
          if (!mySub) {
            a.questions = (a.questions || []).map(({ correctOptionIndex, ...rest }: any) => rest);
          }
        }
        return a;
      });
    } catch (histErr) {
      console.warn("[Signalling] Error loading room chat history or assessments:", histErr);
    }

    ws.send(
      JSON.stringify({
        type: "room-state",
        sessionId,
        self: { peerId: userId, name, role },
        peers: existingPeers,
        whiteboardState: currentBoard,
        chatHistory: recentChatMessages,
        activeAssessments,
      })
    );

    // 2. Broadcast peer-joined to all existing peers in the room
    broadcastToRoom(
      sessionId,
      {
        type: "peer-joined",
        peer: {
          peerId: userId,
          name,
          role,
          isMicMuted: peer.isMicMuted,
          isVideoMuted: peer.isVideoMuted,
        },
      },
      userId
    );

    ws.on("message", async (data: string) => {
      try {
        (ws as any).isAlive = true;
        const raw = data.toString();
        if (raw.length > 65536) {
          ws.send(JSON.stringify({ type: "error", message: "Signalling payload exceeds size limit" }));
          return;
        }
        const message = JSON.parse(raw);
        if (!message || typeof message !== "object") return;
        const { type } = message;

        // 15-minute post-session idle check on any client activity / heartbeat
        const idleCheck = await checkSessionIdleAutoLogout(sessionId);
        if (idleCheck.expired) {
          await enforceClassroomIdleAutoLogout(sessionId, idleCheck.reason);
          return;
        }

        if (type === "heartbeat" || type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          return;
        }

        switch (type) {
          case "offer": {
            // Forward WebRTC offer to target peer
            const targetPeer = room.get(message.to);
            if (targetPeer && targetPeer.socket.readyState === WebSocket.OPEN) {
              targetPeer.socket.send(
                JSON.stringify({
                  type: "offer",
                  from: userId,
                  fromName: name,
                  offer: message.offer,
                })
              );
            }
            break;
          }

          case "answer": {
            // Forward WebRTC answer to target peer
            const targetPeer = room.get(message.to);
            if (targetPeer && targetPeer.socket.readyState === WebSocket.OPEN) {
              targetPeer.socket.send(
                JSON.stringify({
                  type: "answer",
                  from: userId,
                  answer: message.answer,
                })
              );
            }
            break;
          }

          case "ice-candidate": {
            // Forward ICE candidate to target peer
            const targetPeer = room.get(message.to);
            if (targetPeer && targetPeer.socket.readyState === WebSocket.OPEN) {
              targetPeer.socket.send(
                JSON.stringify({
                  type: "ice-candidate",
                  from: userId,
                  candidate: message.candidate,
                })
              );
            }
            break;
          }

          case "media-state": {
            // Update and broadcast mic/video mute status
            peer.isMicMuted = Boolean(message.isMicMuted);
            peer.isVideoMuted = Boolean(message.isVideoMuted);
            await updateParticipantMedia(
              sessionId,
              userId,
              peer.isMicMuted,
              peer.isVideoMuted
            );
            broadcastToRoom(sessionId, {
              type: "media-state-change",
              peerId: userId,
              isMicMuted: peer.isMicMuted,
              isVideoMuted: peer.isVideoMuted,
            });
            break;
          }

          case "chat-message": {
            const hasText = typeof message.text === "string" && Boolean(message.text.trim());
            const hasVoice = Boolean(message.voiceUrl || message.audioUrl);
            const hasAttachment = Boolean(message.attachment && (message.attachment.url || message.attachment.name));

            if (hasText || hasVoice || hasAttachment) {
              const cleanText = hasText
                ? message.text.trim().slice(0, 2000)
                : hasVoice
                ? "🎙️ Voice Note"
                : "📎 Attachment";
              const msgId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
              const now = new Date();
              const messageType = message.messageType || (hasVoice ? "voice" : hasAttachment ? "attachment" : "text");
              const voiceUrl = message.voiceUrl || message.audioUrl || undefined;
              const voiceDuration = typeof message.voiceDuration === "number" ? message.voiceDuration : undefined;
              const attachment = message.attachment || undefined;

              broadcastToRoom(sessionId, {
                type: "chat-message",
                id: msgId,
                senderId: userId,
                senderName: name,
                senderRole: role,
                text: cleanText,
                messageType,
                voiceUrl,
                voiceDuration,
                attachment,
                timestamp: now.toISOString(),
              });

              // Persist chat message to MongoDB LiveClassSession for 1-year compliance audit
              await LiveClassSession.findByIdAndUpdate(sessionId, {
                $push: {
                  chatMessages: {
                    id: msgId,
                    senderId: userId,
                    senderName: name,
                    senderRole: role,
                    text: cleanText,
                    messageType,
                    voiceUrl,
                    voiceDuration,
                    attachment,
                    timestamp: now,
                  },
                },
              }).catch((e) => console.warn("[Signalling] Failed persisting chat message:", e));
            }
            break;
          }

          case "assessment:publish": {
            if (role === "host") {
              try {
                let assessment = message.assessment;
                if (!assessment?._id) {
                  assessment = await TuitionLiveAssessment.create({
                    sessionId,
                    type:
                      assessment?.type ||
                      message.assessmentType ||
                      "quiz",
                    title: assessment?.title || message.title || "Live Session Assessment",
                    instructions: assessment?.instructions || message.instructions,
                    timeLimitMinutes: assessment?.timeLimitMinutes ?? message.timeLimitMinutes ?? 0,
                    totalPoints: assessment?.totalPoints ?? message.totalPoints ?? 100,
                    status: "active",
                    questions: assessment?.questions || message.questions || [],
                    submissions: [],
                    publishedBy: userId,
                    publishedByName: name,
                  });
                }

                // Broadcast to students with questions sanitized (correctOptionIndex hidden)
                // and to host with full assessment
                const assessmentObj = assessment.toObject ? assessment.toObject() : assessment;
                const sanitizedAssessment = {
                  ...assessmentObj,
                  questions: (assessmentObj.questions || []).map(
                    ({ correctOptionIndex, ...rest }: any) => rest
                  ),
                };

                for (const [peerId, peer] of room.entries()) {
                  if (peer.socket.readyState === WebSocket.OPEN) {
                    peer.socket.send(
                      JSON.stringify({
                        type: "assessment:published",
                        assessment: peer.role === "host" ? assessmentObj : sanitizedAssessment,
                      })
                    );
                  }
                }
              } catch (pubErr) {
                console.error("[Signalling] assessment:publish error:", pubErr);
              }
            }
            break;
          }

          case "assessment:submit": {
            try {
              const { assessmentId, answers } = message;
              if (assessmentId) {
                const assessment = await TuitionLiveAssessment.findById(assessmentId);
                if (assessment && assessment.status === "active") {
                  let calculatedScore = 0;
                  let totalPossible = 0;
                  const formattedAnswers: any[] = [];

                  for (const q of assessment.questions) {
                    const qPoints = q.points > 0 ? q.points : 1;
                    totalPossible += qPoints;
                    const ans = (answers || []).find((a: any) => a.questionId === q.id);
                    const selIdx = ans?.selectedOptionIndex;
                    if (typeof q.correctOptionIndex === "number" && q.correctOptionIndex >= 0) {
                      if (selIdx === q.correctOptionIndex) {
                        calculatedScore += qPoints;
                      }
                    } else if (assessment.type === "assignment" && (ans?.textAnswer || selIdx !== undefined)) {
                      calculatedScore += qPoints;
                    }
                    formattedAnswers.push({
                      questionId: q.id,
                      selectedOptionIndex: selIdx,
                      textAnswer: ans?.textAnswer,
                    });
                  }

                  const percentage = totalPossible > 0 ? Math.round((calculatedScore / totalPossible) * 100) : 100;
                  const subRecord = {
                    studentId: userId,
                    studentName: name,
                    studentRole: role,
                    answers: formattedAnswers,
                    score: calculatedScore,
                    totalPossible,
                    percentage,
                    submittedAt: new Date(),
                  };

                  const existingIdx = assessment.submissions.findIndex((s: any) => s.studentId === userId);
                  if (existingIdx >= 0) {
                    assessment.submissions[existingIdx] = subRecord as any;
                  } else {
                    assessment.submissions.push(subRecord as any);
                  }
                  await assessment.save();

                  // 1. Reply to submitting student with their score
                  ws.send(
                    JSON.stringify({
                      type: "assessment:graded",
                      assessmentId,
                      submission: subRecord,
                    })
                  );

                  // 2. Broadcast updated submission count / leaderboard to room
                  broadcastToRoom(sessionId, {
                    type: "assessment:results",
                    assessmentId,
                    totalSubmissions: assessment.submissions.length,
                    submissions: assessment.submissions.map((s: any) => ({
                      studentId: s.studentId,
                      studentName: s.studentName,
                      score: s.score,
                      totalPossible: s.totalPossible,
                      percentage: s.percentage,
                      submittedAt: s.submittedAt,
                    })),
                  });
                }
              }
            } catch (subErr) {
              console.error("[Signalling] assessment:submit error:", subErr);
            }
            break;
          }

          case "assessment:close": {
            if (role === "host") {
              try {
                const { assessmentId } = message;
                if (assessmentId) {
                  await TuitionLiveAssessment.findByIdAndUpdate(assessmentId, { status: "closed" });
                  broadcastToRoom(sessionId, {
                    type: "assessment:closed",
                    assessmentId,
                  });
                }
              } catch (closeErr) {
                console.error("[Signalling] assessment:close error:", closeErr);
              }
            }
            break;
          }

          case "whiteboard:draw":
          case "whiteboard-draw": {
            if (message.element) {
              const board = roomWhiteboards.get(sessionId) || [];
              board.push(message.element);
              if (board.length > 2000) board.shift();
              roomWhiteboards.set(sessionId, board);

              broadcastToRoom(
                sessionId,
                {
                  type: "whiteboard:draw",
                  senderId: userId,
                  element: message.element,
                },
                userId
              );
            }
            break;
          }

          case "whiteboard:clear":
          case "whiteboard-clear": {
            roomWhiteboards.set(sessionId, []);
            broadcastToRoom(
              sessionId,
              {
                type: "whiteboard:clear",
                senderId: userId,
              },
              userId
            );
            break;
          }

          case "whiteboard:undo":
          case "whiteboard-undo": {
            if (Array.isArray(message.elements)) {
              roomWhiteboards.set(sessionId, message.elements.slice(0, 2000));
            } else {
              const board = roomWhiteboards.get(sessionId) || [];
              board.pop();
              roomWhiteboards.set(sessionId, board);
            }
            broadcastToRoom(
              sessionId,
              {
                type: "whiteboard:undo",
                senderId: userId,
                elements: roomWhiteboards.get(sessionId) || [],
              },
              userId
            );
            break;
          }

          case "whiteboard:sync-state":
          case "whiteboard-sync": {
            if (Array.isArray(message.elements)) {
              // Store and relay SmartBoard drawing state to all participants in session
              const safeElements = message.elements.slice(0, 2000);
              roomWhiteboards.set(sessionId, safeElements);

              broadcastToRoom(
                sessionId,
                {
                  type: "whiteboard:sync-state",
                  senderId: userId,
                  elements: safeElements,
                },
                userId
              );
              // Backwards-compatible event
              broadcastToRoom(
                sessionId,
                {
                  type: "whiteboard-sync",
                  senderId: userId,
                  elements: safeElements,
                },
                userId
              );
            }
            break;
          }

          case "end-session": {
            // Only host can terminate the live session
            if (role === "host") {
              await endLiveSession(sessionId, userId);
              broadcastToRoom(sessionId, {
                type: "session-ended",
                reason: "Host ended the live classroom",
              });
              // Close all sockets in the room
              for (const p of room.values()) {
                p.socket.close(1000, "Classroom ended by host");
              }
              rooms.delete(sessionId);
              roomWhiteboards.delete(sessionId);
            } else {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Unauthorized: Only the host can terminate the session",
                })
              );
            }
            break;
          }

          case "leave-room": {
            handlePeerDisconnect(sessionId, userId);
            break;
          }
        }
      } catch (err: any) {
        console.error("[WebSocket Message Parse Error]", err);
      }
    });

    ws.on("close", () => {
      handlePeerDisconnect(sessionId, userId);
    });

    ws.on("error", (err) => {
      console.warn(`[WebSocket Client Error] Peer ${userId}:`, err.message);
      handlePeerDisconnect(sessionId, userId);
    });
  });

  return wss;
}

function broadcastToRoom(sessionId: string, payload: any, excludeUserId?: string) {
  const room = rooms.get(sessionId);
  if (!room) return;

  const data = JSON.stringify(payload);
  for (const [peerId, peer] of room.entries()) {
    if (peerId !== excludeUserId && peer.socket.readyState === WebSocket.OPEN) {
      peer.socket.send(data);
    }
  }
}

async function handlePeerDisconnect(sessionId: string, userId: string) {
  const room = rooms.get(sessionId);
  if (!room) return;

  if (room.has(userId)) {
    room.delete(userId);
    await registerParticipantLeave(sessionId, userId);

    broadcastToRoom(sessionId, {
      type: "peer-left",
      peerId: userId,
    });

    if (room.size === 0) {
      rooms.delete(sessionId);
      roomWhiteboards.delete(sessionId);
    }
  }
}

export function getActiveRoomPeersCount(sessionId: string): number {
  return rooms.get(sessionId)?.size || 0;
}

/**
 * Enforces immediate 15-minute post-session idle auto-logout:
 * Updates database to ended, emits 'force-logout' event to all connected sockets in room,
 * closes sockets, and clears the room.
 */
export async function enforceClassroomIdleAutoLogout(
  sessionId: string,
  customReason?: string
): Promise<{ forcedCount: number }> {
  const reason =
    customReason ||
    "Session automatically terminated: 15-minute post-session idle limit exceeded";

  // Ensure DB reflects ended state
  await checkSessionIdleAutoLogout(sessionId);

  const room = rooms.get(sessionId);
  let forcedCount = 0;

  if (room) {
    const payload = JSON.stringify({
      type: "force-logout",
      sessionId,
      reason,
      code: "SESSION_IDLE_TIMEOUT",
    });

    for (const [, peer] of room.entries()) {
      if (peer.socket.readyState === WebSocket.OPEN) {
        try {
          peer.socket.send(payload);
          peer.socket.close(4001, "Session idle timeout (15 mins)");
          forcedCount++;
        } catch (e) {
          // ignore already closed
        }
      }
    }
    rooms.delete(sessionId);
  }

  return { forcedCount };
}

