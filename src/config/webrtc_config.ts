import dotenv from "dotenv";
dotenv.config();

export interface RTCIceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface WebRTCConfiguration {
  iceServers: RTCIceServerConfig[];
  iceTransportPolicy?: "all" | "relay";
}

/**
 * Returns dynamic WebRTC configuration with STUN and optional TURN servers.
 * TURN credentials can be configured via environment variables for NAT traversal.
 */
export function getWebRTCConfiguration(): WebRTCConfiguration {
  const iceServers: RTCIceServerConfig[] = [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
      ],
    },
  ];

  // Configurable TURN server for production network reliability across restrictive symmetric NATs
  const turnUrl = process.env.TURN_SERVER_URL;
  const turnUsername = process.env.TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL;

  if (turnUrl) {
    const turnServer: RTCIceServerConfig = {
      urls: turnUrl.split(/[,\s]+/).filter(Boolean),
    };
    if (turnUsername) turnServer.username = turnUsername;
    if (turnCredential) turnServer.credential = turnCredential;
    iceServers.push(turnServer);
  }

  return {
    iceServers,
    iceTransportPolicy: "all",
  };
}

