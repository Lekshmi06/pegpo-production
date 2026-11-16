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

export function setupClassroomSignallingServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

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

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request, {
          userId,
          name: (sessionPayload as any).name || (access.isHost ? "Teacher" : "Student"),
          role: access.isHost ? "host" : "student",
          sessionId,
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

    ws.send(
      JSON.stringify({
        type: "room-state",
        sessionId,
        self: { peerId: userId, name, role },
        peers: existingPeers,
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
            if (typeof message.text === "string" && message.text.trim()) {
              const cleanText = message.text.trim().slice(0, 1000);
              broadcastToRoom(sessionId, {
                type: "chat-message",
                id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                senderId: userId,
                senderName: name,
                senderRole: role,
                text: cleanText,
                timestamp: new Date().toISOString(),
              });
            }
            break;
          }

          case "whiteboard-sync": {
            if (Array.isArray(message.elements)) {
              // Relay real-time SmartBoard drawing payload to all participants (capped at 500 strokes per sync)
              broadcastToRoom(
                sessionId,
                {
                  type: "whiteboard-sync",
                  senderId: userId,
                  elements: message.elements.slice(0, 500),
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

